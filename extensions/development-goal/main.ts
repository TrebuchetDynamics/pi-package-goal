import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import {
  BUILT_IN_ADAPTERS,
  DEFAULT_CONFIG_RELATIVE,
  DEFAULT_LANGUAGE,
  ensureMandatorySkills,
  resolveProjectAdapter,
  type ResolvedProjectAdapter,
} from "./adapter.ts";
import { resolveCommitPush, type ProjectConfig } from "./config.ts";
import { DEVELOPMENT_GOAL_IDENTITY } from "./identity.ts";
import {
  absoluteLogPath,
  contextCwd,
  relativeToCwd,
  writeJsonFileAtomic,
} from "./files.ts";
import { likelyBlockerCause, nextSafeBlockerAction } from "./blocker.ts";
import {
  completeCommandArgs,
  parseArgs,
  parseSinceFilter,
  tokenizeArgs,
  type ParsedCommand,
} from "./command.ts";
import { publishLogAnalysis } from "./log-analysis.ts";
import {
  clampIterations,
  initConfigSummary,
  initDefaults,
  shouldPromptForInit,
  splitLinesOrDefault,
} from "./init-config.ts";
import {
  buildCompactionResumePrompt,
  buildDevelopmentGoalCompactionInstructions,
  buildEmptyResponseRetryPrompt,
  buildGrillGoalPrompt,
  buildIterationPrompt,
  buildMissingMarkerRecoveryPrompt,
  buildReportRepairPrompt,
  buildTransportErrorRetryPrompt,
  buildSteeringPrompt,
  PROMPT_OBJECTIVE_MAX,
} from "./prompts.ts";
import {
  compactionReason,
  contextUsageReason,
  shouldCompactBeforeNextIteration,
} from "./compaction.ts";
import {
  appendLoopLogRecord,
  buildLoopLogRecord,
  type LoopLogRecord,
} from "./logger.ts";
import {
  hasContextOverflowProviderError,
  hasTransportProviderError,
} from "./provider-error.ts";
import { parseLoopDeliveryEvidence, parseLoopReport } from "./report-parser.ts";
import { terminalAuditEvent } from "./terminal-audit.ts";
import { evaluateFinalReportGate } from "./final-report-gate.ts";
import { autoContinueLimitFromEnv, shouldPauseForAutoContinueLimit } from "./runaway.ts";
import { createRunId, lastAssistantText } from "./runtime.ts";
import { mergeSteeringTopic } from "./steering.ts";
import { evaluateActiveGoalToolCallSafety } from "./tool-safety.ts";
import {
  selectValue,
  singleLineText,
  stringOrUndefined,
} from "./values.ts";
import {
  readLastLoopRecord,
  readRecentReportRecords,
  statusLine,
  statusReport,
  statusWidgetLines,
} from "./status.ts";
import {
  CUSTOM_STATE_TYPE,
  DEFAULT_ITERATIONS,
  DEFAULT_LOG_RELATIVE,
  hasIterationCap,
  inactiveState,
  iterationProgress,
  restoreState,
  type LoopState,
} from "./state.ts";
type LoopDecision = "continue" | "stop" | "blocked" | "done";

type UiThemeLike = {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
};

type UiSelectResult = string | { value: string; label?: string; description?: string } | undefined;

type UiLikeContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    theme?: UiThemeLike;
    notify?: (message: string, level?: string) => void;
    setStatus?: (key: string, value: string | undefined) => void;
    setWidget?: (key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }) => void;
    confirm?: (title: string, message: string, options?: unknown) => Promise<boolean> | boolean;
    select?: (title: string, items: string[], options?: unknown) => Promise<UiSelectResult> | UiSelectResult;
    input?: (title: string, placeholder?: string) => Promise<string | undefined> | string | undefined;
    editor?: (title: string, text?: string) => Promise<string | undefined> | string | undefined;
  };
  sessionManager?: {
    getEntries?: () => Array<{ type?: string; customType?: string; data?: unknown }>;
    getCwd?: () => string;
  };
  isIdle?: () => boolean;
  hasPendingMessages?: () => boolean;
  getContextUsage?: () => { tokens?: number; contextWindow?: number; maxTokens?: number } | undefined;
  compact?: (options?: {
    customInstructions?: string;
    onComplete?: (result?: unknown) => void;
    onError?: (error: Error) => void;
  }) => void;
};

const LOG_TOPIC_MAX = 600;
const AUTO_CONTINUATION_RETRY_MS = 50;
const AUTO_CONTINUATION_MAX_ATTEMPTS = 20;
const EMPTY_RESPONSE_RETRY_MS = 50;
const EMPTY_RESPONSE_MAX_RETRIES = 2;
const MISSING_MARKER_RECOVERY_MAX_RETRIES = 1;
const GRILL_STATE_TYPE = "development-goal-grill-state";
const COMMON_LANGUAGE_CHOICES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
  "Bengali",
  "Turkish",
  "Vietnamese",
  "Indonesian",
  "Polish",
  "Ukrainian",
  "Swahili",
];

type GrillGoalState = {
  active: boolean;
  seedTopic: string;
  language: string;
  adapterName: string;
  startedAt: string;
};

let state: LoopState = inactiveState(DEFAULT_LOG_RELATIVE, DEFAULT_ITERATIONS);
let pendingGrillGoal: GrillGoalState | undefined;

export default function developmentLoopExtension(pi: ExtensionAPI) {
  async function onSessionStart(_event: unknown, ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getEntries();
    state = restoreState(entries) ?? inactiveState(DEFAULT_LOG_RELATIVE, DEFAULT_ITERATIONS);
    pendingGrillGoal = restoreGrillGoalState(entries);
    refreshUi(ctx);
    if (state.active && state.phase === "running" && state.lastReason === "empty_agent_response_waiting_for_compaction") {
      const retryNumber = Math.max(1, state.emptyResponseRetries ?? 0);
      if (retryNumber <= EMPTY_RESPONSE_MAX_RETRIES) {
        state = { ...state, emptyResponseRetries: retryNumber };
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        scheduleEmptyResponseRetry(pi, ctx, state.iteration, retryNumber);
      }
    }
    if (state.active && state.phase === "running" && state.lastReason === "provider_transport_error_waiting_for_retry") {
      const retryNumber = Math.max(1, state.emptyResponseRetries ?? 0);
      if (retryNumber <= EMPTY_RESPONSE_MAX_RETRIES) {
        state = { ...state, emptyResponseRetries: retryNumber };
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        scheduleTransportErrorRetry(pi, ctx, state.iteration, retryNumber);
      }
    }
  }

  async function onAgentEnd(event: { messages?: Array<{ role?: string; content?: unknown; stopReason?: string }> }, ctx: ExtensionContext) {
    const messages = event.messages ?? [];
    const assistantText = lastAssistantText(messages);

    if (pendingGrillGoal?.active && await handleGrillGoalAssistantText(pi, ctx, assistantText)) return;

    if (!state.active) return;
    if (state.phase !== "running") return;
    const finalReportGate = evaluateFinalReportGate(assistantText, { usedReportRepairRetry: state.usedReportRepairRetry });
    const finalReport = "report" in finalReportGate ? finalReportGate.report : undefined;
    const decision = finalReport?.decision;
    const validated = finalReport?.validated;
    const deliveryEvidence = finalReportGate.deliveryEvidence;

    if (!decision) {
      if (hasContextOverflowProviderError(messages)) {
        const alreadyWaitingForContextOverflowCompaction = state.lastReason === "context_overflow_waiting_for_compaction";
        state = { ...state, phase: "running", lastReason: "context_overflow_waiting_for_compaction", emptyResponseRetries: 0, markerRecoveryRetries: 0 };
        appendLoopLog("context_overflow_waiting_for_compaction", { reason: "provider_context_length_exceeded" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development goal is waiting for compaction after a provider context-overflow error.", "warning");
        if (!alreadyWaitingForContextOverflowCompaction) requestContextOverflowCompaction(pi, ctx);
        return;
      }
      if (hasTransportProviderError(messages)) {
        const transportRetries = (state.emptyResponseRetries ?? 0) + 1;
        if (transportRetries > EMPTY_RESPONSE_MAX_RETRIES) {
          blockLoop(pi, ctx, "provider transport error retry limit reached", "blocked", { blockerKind: "provider_transport_error", blockerState: "provider transport error retry limit reached" });
          return;
        }
        state = { ...state, phase: "running", lastReason: "provider_transport_error_waiting_for_retry", emptyResponseRetries: transportRetries, markerRecoveryRetries: 0 };
        appendLoopLog("provider_transport_error_waiting_for_retry", { reason: "provider_transport_error", providerError: "transport" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development goal is retrying the same iteration after a provider transport error.");
        scheduleTransportErrorRetry(pi, ctx, state.iteration, transportRetries);
        return;
      }
      if (!assistantText.trim()) {
        const emptyResponseRetries = (state.emptyResponseRetries ?? 0) + 1;
        if (emptyResponseRetries > EMPTY_RESPONSE_MAX_RETRIES) {
          blockLoop(pi, ctx, "empty provider response retry limit reached");
          return;
        }
        state = { ...state, phase: "running", lastReason: "empty_agent_response_waiting_for_compaction", emptyResponseRetries, markerRecoveryRetries: 0 };
        appendLoopLog("empty_agent_response_waiting_for_compaction", { reason: "missing_assistant_text" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development goal is waiting for compaction or retry after an empty provider response.", "warning");
        scheduleEmptyResponseRetry(pi, ctx, state.iteration, emptyResponseRetries);
        return;
      }
      if ((state.markerRecoveryRetries ?? 0) >= MISSING_MARKER_RECOVERY_MAX_RETRIES) {
        blockLoop(pi, ctx, "missing DEV_GOAL_DECISION final marker after recovery request");
        return;
      }
      requestMissingMarkerRecovery(pi, ctx);
      return;
    }

    if (state.emptyResponseRetries || state.markerRecoveryRetries) {
      state = { ...state, emptyResponseRetries: 0, markerRecoveryRetries: 0 };
    }

    if (finalReportGate.action === "repair") {
      requestReportRepair(pi, ctx, finalReportGate.report.quality.issues, finalReportGate.logEvent);
      return;
    }

    if (finalReportGate.action === "block") {
      blockLoop(pi, ctx, "malformed_final_report", "blocked", finalReportGate.logEvent);
      return;
    }

    if (state.usedReportRepairRetry) {
      state = { ...state, usedReportRepairRetry: false };
    }

    if (requiresValidation(decision) && validated !== true) {
      blockLoop(pi, ctx, "missing DEV_GOAL_VALIDATED: yes for continue/done decision", decision);
      return;
    }

    if (decision === "blocked" || decision === "stop" || decision === "done") {
      const audit = finalReport ? terminalAuditEvent({ report: finalReport }) : undefined;
      const finalStatus = audit?.finalStatus;
      state = {
        ...state,
        active: false,
        phase: decision === "done" ? "done" : decision === "blocked" ? "blocked" : "idle",
        lastDecision: decision,
        ...(finalStatus ? { lastReason: finalStatus } : {}),
      };
      const logExtra = { decision, reason: audit?.reason || decision, ...deliveryEvidence, ...(finalStatus ? { finalStatus } : {}) };
      appendLoopLog(audit?.event || "loop_finished", logExtra);
      if (audit?.event === "loop_blocked") {
        appendLoopLog("loop_postmortem", {
          decision,
          reason: audit.reason,
          blockerState: deliveryEvidence.blockerState,
          nextSteps: deliveryEvidence.nextSteps,
          likelyCause: likelyBlockerCause(audit.reason),
          nextSafeAction: nextSafeBlockerAction(audit.reason),
        });
      }
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Development goal ${decision}.`);
      return;
    }

    state = { ...state, phase: "reported", lastDecision: decision };
    appendLoopLog("iteration_result", { decision, ...deliveryEvidence });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);

    if (hasIterationCap(state) && state.iteration >= state.maxIterations) {
      state = { ...state, active: false, phase: "done", lastDecision: "done", lastReason: "max_iterations_reached" };
      appendLoopLog("loop_finished", { decision: "done", reason: "max_iterations_reached", ...deliveryEvidence });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Development goal stopped after ${state.iteration}/${state.maxIterations} iteration(s).`);
      return;
    }

    if (compactBeforeNextIteration(pi, ctx)) return;
    queueNextIteration(pi, ctx);
  }

  async function onSessionBeforeCompact(event: { preparation?: { tokensBefore?: number } }, ctx: ExtensionContext) {
    if (!state.active) return;
    state = { ...state, lastReason: "preparing_for_compaction" };
    appendLoopLog("compaction_started", { reason: compactionReason(event.preparation?.tokensBefore) });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);
    notify(ctx, "Development goal state saved before compaction.");
  }

  async function onSessionCompact(_event: unknown, ctx: ExtensionContext) {
    if (!state.active) return;
    if (state.phase === "running") {
      resumeCurrentIterationAfterCompaction(pi, ctx);
      return;
    }
    if (state.phase === "queued" || state.phase === "reported") {
      continueQueuedIterationAfterCompaction(pi, ctx);
    }
  }

  async function onInput(event: InputEvent, ctx: ExtensionContext): Promise<InputEventResult> {
    if (!state.active || state.phase === "paused") return { action: "continue" };
    if (event.source === "extension") return { action: "continue" };

    const steeringText = singleLineText(event.text);
    if (!steeringText || steeringText.startsWith("/")) return { action: "continue" };

    const cwd = contextCwd(ctx);
    const resolved = resolveProjectAdapter(cwd, state.adapterName);
    state = {
      ...state,
      topic: mergeSteeringTopic(state.topic, steeringText),
      lastReason: "user_steering",
    };
    appendLoopLog("user_steering", { reason: steeringText });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);
    notify(ctx, "Development goal steering accepted for the active task.");

    return {
      action: "transform",
      text: buildSteeringPrompt(state, resolved, cwd, steeringText),
      images: event.images,
    };
  }

  async function onToolCall(event: { toolName: string; input?: unknown }, ctx: ExtensionContext) {
    const decision = evaluateActiveGoalToolCallSafety({ active: state.active, push: state.push }, event.toolName, event.input);
    if (decision.action === "allow") return undefined;

    appendLoopLog("tool_call_blocked", { reason: decision.reason, blockerKind: decision.kind });
    notify(ctx, decision.reason, "warning");
    return { block: true, reason: decision.reason };
  }

  pi.on("session_start", onSessionStart);
  pi.on("agent_end", onAgentEnd);
  pi.on("session_before_compact", onSessionBeforeCompact);
  pi.on("session_compact", onSessionCompact);
  pi.on("input", onInput);
  pi.on("tool_call", onToolCall);

  const command = {
    description: "Run an adapter-aware project development goal",
    getArgumentCompletions: completeCommandArgs,
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };

  pi.registerCommand(DEVELOPMENT_GOAL_IDENTITY.command.name, command);
}

async function runCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) {
  const parsed = parseArgs(args, BUILT_IN_ADAPTERS.map((adapter) => adapter.name));
  switch (parsed.command) {
    case "status":
      publishStatus(pi, ctx);
      return;
    case "pause":
      pauseLoop(pi, ctx);
      return;
    case "resume":
      resumeLoop(pi, ctx);
      return;
    case "stop":
      state = { ...state, active: false, phase: "idle", lastDecision: "stopped_by_user" };
      appendLoopLog("loop_stopped", { reason: "stopped_by_user" });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, "Development goal stopped.");
      return;
    case "adapters":
      publishAdapters(pi, ctx);
      return;
    case "analyze-logs":
      publishLogAnalysis(pi, ctx, parsed, state.logPath || DEFAULT_LOG_RELATIVE);
      return;
    case "help":
      publishHelp(pi, ctx);
      return;
    case "init":
      await initConfig(parsed, ctx);
      return;
    case "improve-codebase-architecture":
      await startLoop(pi, ctx, improveCodebaseArchitectureCommand(parsed), false);
      return;
    case "git-commit-push":
      await startLoop(pi, ctx, gitCommitPushCommand(parsed), false);
      return;
    case "grill-me":
      await startGrillGoal(pi, ctx, parsed);
      return;
    case "restart":
      await startLoop(pi, ctx, parsed, true);
      return;
    case "start":
    default:
      await startLoop(pi, ctx, parsed, false);
      return;
  }
}

function improveCodebaseArchitectureCommand(parsed: ParsedCommand): ParsedCommand {
  const baseTopic = "Improve codebase architecture";
  return {
    ...parsed,
    command: "start",
    requiredSkill: "improve-codebase-architecture",
    skills: ["improve-codebase-architecture", ...parsed.skills.filter((skill) => skill !== "improve-codebase-architecture")],
    topic: parsed.topic ? `${baseTopic}: ${parsed.topic}` : baseTopic,
  };
}

function gitCommitPushCommand(parsed: ParsedCommand): ParsedCommand {
  const baseTopic = "Commit and push all current worktree changes";
  const intent = [
    "all current tracked, modified, deleted, and untracked worktree changes are in scope unless they are secrets, generated caches, vendored dependency folders, or otherwise unsafe to commit",
    "inspect git status and diffs before staging; group changes into coherent commits instead of one dump commit when there are separable concerns",
    "Make required local validation/CI green before each commit or push; if validation fails, fix code and rerun until green or blocked by an external prerequisite",
    "Push the current branch after validation is green; never force push, and block with fetch/rebase/merge next steps if the branch is behind or diverged",
  ].map((line) => `- ${line}`).join("\n");
  return {
    ...parsed,
    command: "start",
    commit: true,
    push: true,
    allWorktreeChangesInScope: true,
    commandIntent: intent,
    topic: parsed.topic ? `${baseTopic}: ${parsed.topic}` : baseTopic,
  };
}

async function startGrillGoal(pi: ExtensionAPI, ctx: UiLikeContext, parsed: ParsedCommand) {
  if (state.active) {
    notify(ctx, `${statusLine(state)}\nStop or finish the active development goal before starting /development-goal grill-me.`);
    return;
  }

  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, parsed.adapter);
  const seedTopic = parsed.topic || resolved.config.defaultTopic || resolved.adapter.defaultTopic;
  const language = resolved.config.language || DEFAULT_LANGUAGE;
  pendingGrillGoal = {
    active: true,
    seedTopic,
    language,
    adapterName: resolved.adapter.name,
    startedAt: new Date().toISOString(),
  };
  pi.appendEntry(GRILL_STATE_TYPE, pendingGrillGoal);
  notify(ctx, `Starting development-goal grill-me planning in ${language}.`);
  sendLoopPrompt(pi, ctx, buildGrillGoalPrompt(state, resolved, cwd, seedTopic));
}

async function handleGrillGoalAssistantText(pi: ExtensionAPI, ctx: UiLikeContext, assistantText: string): Promise<boolean> {
  const nextTopic = parseGrillGoalNextTopic(assistantText);
  if (nextTopic) {
    pendingGrillGoal = pendingGrillGoal ? { ...pendingGrillGoal, active: false } : undefined;
    if (pendingGrillGoal) pi.appendEntry(GRILL_STATE_TYPE, pendingGrillGoal);
    notify(ctx, `Development-goal grill-me selected next goal: ${nextTopic}`);
    await startLoop(pi, ctx, {
      command: "start",
      topic: nextTopic,
      validationCommands: [],
      preflightCommands: [],
      skills: [],
      stopConditions: [],
    }, false, { deferFirstPromptUntilIdle: true });
    return true;
  }

  const blocked = parseGrillGoalBlocked(assistantText);
  if (blocked) {
    pendingGrillGoal = pendingGrillGoal ? { ...pendingGrillGoal, active: false } : undefined;
    if (pendingGrillGoal) pi.appendEntry(GRILL_STATE_TYPE, pendingGrillGoal);
    notify(ctx, `Development-goal grill-me blocked: ${blocked}`, "warning");
    return true;
  }

  return false;
}

function parseGrillGoalNextTopic(text: string): string | undefined {
  return markerValue(text, "DEV_GOAL_NEXT_TOPIC");
}

function parseGrillGoalBlocked(text: string): string | undefined {
  return markerValue(text, "DEV_GOAL_NEXT_BLOCKED");
}

function markerValue(text: string, marker: string): string | undefined {
  const pattern = new RegExp(`^${marker}:\\s*(.+?)\\s*$`, "im");
  const value = text.match(pattern)?.[1]?.trim();
  if (!value || /^<.*>$/.test(value)) return undefined;
  return value;
}

function pauseLoop(pi: ExtensionAPI, ctx: UiLikeContext) {
  if (!state.active) {
    notify(ctx, "No active development goal to pause.");
    return;
  }
  if (state.phase === "paused") {
    notify(ctx, "Development goal already paused.");
    return;
  }
  state = { ...state, phase: "paused", lastReason: "paused_by_user" };
  appendLoopLog("loop_paused", { reason: "paused_by_user" });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, "Development goal paused. Use /development-goal resume to continue.");
}

function resumeLoop(pi: ExtensionAPI, ctx: UiLikeContext) {
  if (!state.active || state.phase !== "paused") {
    notify(ctx, "No paused development goal to resume.");
    return;
  }
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  state = { ...state, phase: "queued", lastReason: "resumed_by_user", emptyResponseRetries: 0, markerRecoveryRetries: 0, usedReportRepairRetry: false, autoContinueCount: 0 };
  appendLoopLog("loop_resumed", { reason: "resumed_by_user" });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Resuming development goal iteration ${iterationProgress(state)}.`);
  sendIterationPrompt(pi, ctx, resolved);
}

async function startLoop(pi: ExtensionAPI, ctx: UiLikeContext, parsed: ParsedCommand, replaceActive: boolean, options: { deferFirstPromptUntilIdle?: boolean } = {}) {
  if (state.active && !replaceActive) {
    notify(ctx, `${statusLine(state)}\nNo user input is needed; queued goal iterations start automatically. Use /development-goal restart to replace it or /development-goal stop to stop it.`);
    refreshUi(ctx);
    return;
  }

  if (state.active && replaceActive && ctx.hasUI) {
    const ok = await ctx.ui.confirm("Restart development goal", "Replace the current active goal state?");
    if (!ok) return;
  }

  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, parsed.adapter);
  const adapter = resolved.adapter;
  const topic = parsed.topic || resolved.config.defaultTopic || adapter.defaultTopic;
  const configuredIterationCap = parsed.iterations ?? (hasIterationCap(resolved.config) ? resolved.config.maxIterations : undefined);
  const maxIterations = configuredIterationCap ? clampIterations(configuredIterationCap) : DEFAULT_ITERATIONS;
  const { commit, push } = resolveCommitPush(parsed.commit, parsed.push, resolved.config.commit, resolved.config.push);
  const logPath = absoluteLogPath(cwd, resolved.config.logPath);
  const startedAt = new Date().toISOString();
  const runId = createRunId(startedAt);

  state = {
    active: true,
    adapterName: adapter.name,
    runId,
    topic,
    iteration: 1,
    maxIterations,
    startedAt,
    logPath,
    ...(parsed.tokenBudget ? { tokenBudget: parsed.tokenBudget } : {}),
    ...(parsed.requiredSkill ? { requiredSkill: parsed.requiredSkill } : {}),
    ...(parsed.commandIntent ? { commandIntent: parsed.commandIntent } : {}),
    ...(parsed.allWorktreeChangesInScope ? { allWorktreeChangesInScope: true } : {}),
    phase: "started",
    commit,
    push,
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
    autoContinueCount: 0,
  };

  appendLoopLog("loop_started", { reason: resolved.configLoaded ? "config_loaded" : "built_in_adapter" });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Starting development goal: ${adapter.name} ${iterationProgress(state)}; log: ${relativeToCwd(cwd, logPath)}`);
  if (options.deferFirstPromptUntilIdle) {
    state = { ...state, phase: "queued" };
    appendLoopLog("iteration_queued", { reason: "deferred_first_prompt_until_idle" });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);
    scheduleAutomaticIteration(pi, ctx, resolved, state.iteration);
    return;
  }
  sendIterationPrompt(pi, ctx, resolved);
}

function queueNextIteration(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (!state.active) return;
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  state = { ...state, iteration: state.iteration + 1, phase: "queued", emptyResponseRetries: 0, markerRecoveryRetries: 0, usedReportRepairRetry: false };
  appendLoopLog("iteration_queued");
  refreshUi(ctx);
  notify(ctx, `Queued development goal iteration ${iterationProgress(state)}; it will start automatically when the current turn is idle.`);
  scheduleAutomaticIteration(pi, ctx, resolved, state.iteration);
}

function compactBeforeNextIteration(pi: ExtensionAPI, ctx: ExtensionContext): boolean {
  if (!state.active || !shouldCompactBeforeNextIteration(ctx) || typeof ctx.compact !== "function") return false;
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  state = {
    ...state,
    iteration: state.iteration + 1,
    phase: "queued",
    lastReason: "compaction_before_next_iteration",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
  };
  appendLoopLog("compaction_before_next_iteration", { reason: contextUsageReason(ctx) });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Compacting before development goal iteration ${iterationProgress(state)}.`);
  ctx.compact({
    customInstructions: buildDevelopmentGoalCompactionInstructions(state, resolved, cwd),
    onComplete: () => notify(ctx, "Development goal compaction completed; continuing automatically."),
    onError: (error) => {
      state = { ...state, lastReason: "compaction_failed_before_next_iteration" };
      appendLoopLog("compaction_failed_before_next_iteration", { reason: error.message });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Compaction failed before next iteration: ${error.message}. Continuing without compaction.`, "warning");
      scheduleAutomaticIteration(pi, ctx, resolved, state.iteration);
    },
  });
  return true;
}

function requestContextOverflowCompaction(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (typeof ctx.compact !== "function") return;
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  ctx.compact({
    customInstructions: `The provider reported a context-overflow error before DEV_GOAL markers were emitted. Compact the conversation, preserve the current development-goal state, and continue the same iteration after compaction.\n\n${buildDevelopmentGoalCompactionInstructions(state, resolved, cwd)}`,
    onComplete: () => notify(ctx, "Development goal context-overflow compaction completed; continuing automatically."),
    onError: (error) => {
      state = { ...state, lastReason: "context_overflow_compaction_failed" };
      appendLoopLog("context_overflow_compaction_failed", { reason: error.message });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Compaction failed after provider context-overflow error: ${error.message}. Waiting for manual compaction or retry.`, "warning");
    },
  });
}

function resumeCurrentIterationAfterCompaction(pi: ExtensionAPI, ctx: ExtensionContext) {
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  const prompt = buildCompactionResumePrompt(state, resolved, cwd);
  state = { ...state, phase: "queued", lastReason: "resuming_after_compaction" };
  appendLoopLog("compaction_resume_queued");
  refreshUi(ctx);
  sendLoopPrompt(pi, ctx, prompt);
  state = { ...state, phase: "running", lastReason: "resumed_after_compaction", emptyResponseRetries: 0, markerRecoveryRetries: 0, usedReportRepairRetry: false };
  appendLoopLog("compaction_resume_sent");
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Resumed development goal iteration ${iterationProgress(state)} after compaction.`);
}

function continueQueuedIterationAfterCompaction(pi: ExtensionAPI, ctx: ExtensionContext) {
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  appendLoopLog("compaction_continue_queued_iteration");
  notify(ctx, `Continuing development goal iteration ${iterationProgress(state)} after compaction.`);
  sendIterationPrompt(pi, ctx, resolved);
}

function scheduleAutomaticIteration(pi: ExtensionAPI, ctx: UiLikeContext, resolved: ResolvedProjectAdapter, targetIteration: number, attempt = 0) {
  const delay = attempt === 0 ? 0 : AUTO_CONTINUATION_RETRY_MS;
  setTimeout(() => {
    if (!state.active || state.iteration !== targetIteration || state.phase !== "queued") return;

    const idle = typeof ctx.isIdle === "function" ? ctx.isIdle() : true;
    if (idle) {
      sendIterationPrompt(pi, ctx, resolved);
      return;
    }

    if (attempt >= AUTO_CONTINUATION_MAX_ATTEMPTS) {
      appendLoopLog("iteration_prompt_follow_up_fallback", { reason: "agent_not_idle_after_retry" });
      sendIterationPrompt(pi, ctx, resolved, true);
      return;
    }

    scheduleAutomaticIteration(pi, ctx, resolved, targetIteration, attempt + 1);
  }, delay);
}

function requestReportRepair(
  pi: ExtensionAPI,
  ctx: UiLikeContext,
  issues: Array<{ code: string; message: string; value?: string }>,
  logEvent: { event: string; reason: string; blockerKind: string; reportQualityIssueCodes: string[] },
) {
  state = {
    ...state,
    phase: "running",
    lastReason: "malformed_final_report_repair_requested",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: true,
  };
  const { event, ...logExtra } = logEvent;
  appendLoopLog(event, logExtra);
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Development goal sent a repair-only final-report prompt (${logEvent.reportQualityIssueCodes.join(", ") || "malformed_final_report"}).`);
  sendLoopPrompt(pi, ctx, buildReportRepairPrompt(state, issues), true);
}

function requestMissingMarkerRecovery(pi: ExtensionAPI, ctx: UiLikeContext) {
  const retryNumber = (state.markerRecoveryRetries ?? 0) + 1;
  state = {
    ...state,
    phase: "running",
    lastReason: "missing_final_marker_recovery_requested",
    emptyResponseRetries: 0,
    markerRecoveryRetries: retryNumber,
  };
  appendLoopLog("missing_final_marker_recovery_requested", { reason: "missing DEV_GOAL_DECISION final marker" });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, "Development goal sent a final-marker-only recovery prompt.");
  sendLoopPrompt(pi, ctx, buildMissingMarkerRecoveryPrompt(state), true);
}

function scheduleEmptyResponseRetry(pi: ExtensionAPI, ctx: UiLikeContext, targetIteration: number, retryNumber: number) {
  setTimeout(() => {
    if (!state.active || state.iteration !== targetIteration || state.phase !== "running") return;
    if (state.lastReason !== "empty_agent_response_waiting_for_compaction") return;
    if ((state.emptyResponseRetries ?? 0) !== retryNumber) return;

    const cwd = contextCwd(ctx);
    const resolved = resolveProjectAdapter(cwd, state.adapterName);
    const prompt = buildEmptyResponseRetryPrompt(state, resolved, cwd);
    state = { ...state, lastReason: "retrying_after_empty_provider_response" };
    appendLoopLog("empty_provider_response_retry_sent", { reason: `retry ${retryNumber}/${EMPTY_RESPONSE_MAX_RETRIES}` });
    refreshUi(ctx);
    sendLoopPrompt(pi, ctx, prompt);
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);
  }, EMPTY_RESPONSE_RETRY_MS);
}

function scheduleTransportErrorRetry(pi: ExtensionAPI, ctx: UiLikeContext, targetIteration: number, retryNumber: number) {
  setTimeout(() => {
    if (!state.active || state.iteration !== targetIteration || state.phase !== "running") return;
    if (state.lastReason !== "provider_transport_error_waiting_for_retry") return;
    if ((state.emptyResponseRetries ?? 0) !== retryNumber) return;

    const cwd = contextCwd(ctx);
    const resolved = resolveProjectAdapter(cwd, state.adapterName);
    const prompt = buildTransportErrorRetryPrompt(state, resolved, cwd);
    state = { ...state, lastReason: "retrying_after_provider_transport_error" };
    appendLoopLog("provider_transport_error_retry_sent", { reason: `retry ${retryNumber}/${EMPTY_RESPONSE_MAX_RETRIES}`, providerError: "transport" });
    refreshUi(ctx);
    sendLoopPrompt(pi, ctx, prompt);
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);
  }, EMPTY_RESPONSE_RETRY_MS);
}

function sendIterationPrompt(pi: ExtensionAPI, ctx: UiLikeContext, resolved: ResolvedProjectAdapter, asFollowUp = false) {
  const autoContinueLimit = autoContinueLimitFromEnv();
  if (shouldPauseForAutoContinueLimit(state.autoContinueCount, autoContinueLimit)) {
    state = { ...state, phase: "paused", lastReason: "auto_continue_limit_reached", emptyResponseRetries: 0, markerRecoveryRetries: 0, usedReportRepairRetry: false };
    appendLoopLog("loop_auto_continue_limited", { reason: `max_auto_continues=${autoContinueLimit}` });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);
    notify(ctx, `Development goal auto-continuation guard reached after ${autoContinueLimit} prompt sends. Use /development-goal resume or raise PI_DEV_GOAL_MAX_AUTO_CONTINUES to continue automatically.`, "warning");
    return;
  }
  const prompt = buildIterationPrompt(state, resolved, contextCwd(ctx));
  state = { ...state, phase: asFollowUp ? "queued" : "running", emptyResponseRetries: 0, markerRecoveryRetries: 0, usedReportRepairRetry: false, autoContinueCount: (state.autoContinueCount ?? 0) + 1 };
  appendLoopLog(asFollowUp ? "iteration_prompt_queued" : "iteration_prompt_sent", { reason: `auto_continue ${state.autoContinueCount}/${autoContinueLimit}` });
  refreshUi(ctx);
  sendLoopPrompt(pi, ctx, prompt, asFollowUp);
  state = { ...state, phase: "running" };
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
}

function sendLoopPrompt(pi: ExtensionAPI, ctx: UiLikeContext, prompt: string, asFollowUp = false) {
  const idle = typeof ctx.isIdle === "function" ? ctx.isIdle() : true;
  if (asFollowUp || !idle) {
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  } else {
    pi.sendUserMessage(prompt);
  }
}

function blockLoop(pi: ExtensionAPI, ctx: ExtensionContext, reason: string, decision?: string, extra: Partial<LoopLogRecord> = {}) {
  state = { ...state, active: false, phase: "blocked", lastDecision: decision ?? "blocked", lastReason: reason, emptyResponseRetries: 0, markerRecoveryRetries: 0, usedReportRepairRetry: false };
  appendLoopLog("loop_blocked", { decision, reason, ...extra });
  appendLoopLog("loop_postmortem", {
    decision: decision ?? "blocked",
    reason,
    blockerState: extra.blockerState,
    likelyCause: likelyBlockerCause(reason),
    nextSafeAction: nextSafeBlockerAction(reason),
  });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Development goal blocked: ${reason}`, "warning");
}

async function initConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext) {
  const cwd = contextCwd(ctx);
  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);

  if (!parsed.dryRun && fs.existsSync(configPath) && !parsed.force) {
    notify(ctx, `${relativeToCwd(cwd, configPath)} already exists; leaving it unchanged. Use /development-goal init --force to replace it.`);
    return;
  }

  const config = await buildInitConfig(parsed, ctx, cwd);
  if (!config) return;

  if (parsed.dryRun) {
    notify(ctx, `Development-goal init preview (no files written):\n${JSON.stringify(config, null, 2)}`);
    return;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (fs.existsSync(configPath) && !parsed.force) {
    notify(ctx, `${relativeToCwd(cwd, configPath)} already exists; leaving it unchanged. Use /development-goal init --force to replace it.`);
    return;
  }
  writeJsonFileAtomic(configPath, config);
  notify(ctx, `Wrote ${relativeToCwd(cwd, configPath)}`);
}

async function buildInitConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext, cwd: string): Promise<ProjectConfig | undefined> {
  const defaults = initDefaults(parsed, cwd);
  if (!shouldPromptForInit(parsed, ctx)) return defaults.config;
  return promptForInitConfig(parsed, ctx, cwd, defaults.adapterName);
}

async function promptForInitConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext, cwd: string, initialAdapterName: string): Promise<ProjectConfig | undefined> {
  const ui = ctx.ui;
  const defaults = initDefaults(parsed, cwd, initialAdapterName);
  const config: ProjectConfig = { ...defaults.config };

  const defaultTopic = config.defaultTopic || defaults.adapter.defaultTopic;
  const topicText = await ui.editor!("Default objective", defaultTopic);
  if (topicText === undefined) return cancelInit(ctx);
  config.defaultTopic = topicText.trim() || defaultTopic;

  const language = selectValue(await ui.select!("Preferred language", COMMON_LANGUAGE_CHOICES));
  if (language === undefined) return cancelInit(ctx);
  config.language = language || config.language || DEFAULT_LANGUAGE;

  const delivery = selectValue(await ui.select!("Git delivery policy", ["manual", "commit", "push"]));
  if (delivery === undefined) return cancelInit(ctx);
  config.push = delivery === "push";
  config.commit = delivery === "commit" || config.push;

  const validationText = await ui.editor!("Validation commands (one per line)", (config.validationCommands ?? []).join("\n"));
  if (validationText === undefined) return cancelInit(ctx);
  config.validationCommands = splitLinesOrDefault(validationText, config.validationCommands ?? []);

  const preflightText = await ui.editor!("Preflight commands (one per line)", (config.preflightCommands ?? []).join("\n"));
  if (preflightText === undefined) return cancelInit(ctx);
  config.preflightCommands = splitLinesOrDefault(preflightText, config.preflightCommands ?? []);

  const skillsText = await ui.editor!("Skills (one per line)", (config.skills ?? []).join("\n"));
  if (skillsText === undefined) return cancelInit(ctx);
  config.skills = ensureMandatorySkills(splitLinesOrDefault(skillsText, config.skills ?? []));

  const stopConditionsText = await ui.editor!("Stop conditions (one per line)", (config.stopConditions ?? []).join("\n"));
  if (stopConditionsText === undefined) return cancelInit(ctx);
  config.stopConditions = splitLinesOrDefault(stopConditionsText, config.stopConditions ?? []);

  const logPathText = await ui.input!("Log path", config.logPath || DEFAULT_LOG_RELATIVE);
  if (logPathText === undefined) return cancelInit(ctx);
  config.logPath = logPathText.trim() || config.logPath || DEFAULT_LOG_RELATIVE;

  const ok = await ui.confirm!("Write development-goal config", initConfigSummary(config, cwd));
  if (!ok) return cancelInit(ctx);
  return config;
}

function cancelInit(ctx: UiLikeContext): undefined {
  notify(ctx, "Development-goal init cancelled.");
  return undefined;
}

function publishStatus(pi: ExtensionAPI, ctx: UiLikeContext) {
  const cwd = contextCwd(ctx);
  const text = statusReport(state, cwd);
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-goal-status", content: text, display: true });
  }
}

function publishHelp(pi: ExtensionAPI, ctx: UiLikeContext) {
  const text = [
    "Development-goal commands:",
    "- /development-goal [options] <topic> — start a goal",
    "- /development-goal improve-codebase-architecture [focus] — start an architecture-improvement goal",
    "- /development-goal git-commit-push [focus] — legacy delivery command; prefer /git-commit-push to validate, commit, and push current changes",
    "- /development-goal grill-me [seed] — use grill-me in the configured language to choose the next goal, then start it",
    "- /development-goal restart [options] <topic> — replace the active goal",
    "- /development-goal pause — pause automatic continuation without clearing goal state",
    "- /development-goal resume — resume a paused goal at the current iteration",
    "- /development-goal stop — stop the active goal",
    "- /development-goal status — show current state",
    "- /development-goal adapters — show detected adapter/config",
    "- /development-goal analyze-logs [path] — summarize one log file or a directory of goal logs",
    "- /development-goal analyze-logs --since=2h [path] — summarize only recent timestamped records",
    "- /development-goal analyze-logs --html [path] — also write a self-contained HTML health report",
    "- /development-goal analyze-logs --json [path] — emit machine-readable JSON for automation",
    "- Start/restart option: --tokens <n|nK|nM> / --budget <n|nK|nM> records a soft token budget in prompts and status",
    "- /development-goal init [options] <default topic> — configure .pi/development-goal.json interactively",
    "",
    "Configurable init options:",
    "- /development-goal init --dry-run ... — preview without writing files",
    "- --iterations <n> | --max-iterations <n> | -n <n> — optional legacy safety cap; omit for continuous goal mode",
    "- --commit | --no-commit | --push | --no-push (--push implies --commit)",
    "- --validation <command> | --test <command> (repeatable)",
    "- --preflight <command> (repeatable)",
    "- --skill <name-or-note> (repeatable), for example greploop or grill-me",
    "- --stop-condition <text> (repeatable)",
    "- --log-path <path>",
    "- --force — atomically replace an existing config",
    "- --yes | -y | --defaults — accept generated values without prompts",
    "",
    "Active-goal behavior:",
    "- DEV_GOAL_DECISION: continue starts the next iteration automatically when Pi is idle until DEV_GOAL_DECISION: done, blocked, stop, or pause.",
    "- PI_DEV_GOAL_MAX_AUTO_CONTINUES caps automatic prompt sends before the goal pauses for manual resume. Default: 500.",
    "- Provider transport errors such as WebSocket failures retry the same iteration instead of triggering final-marker recovery.",
    "- A useful non-provider response missing final markers gets one informational final-marker-only recovery prompt before blocking.",
    "- Plain text typed during an active goal becomes steering for the current or next safe package.",
  ].join("\n");
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-goal-help", content: text, display: true });
  }
}

function publishAdapters(pi: ExtensionAPI, ctx: UiLikeContext) {
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd);
  const text = [
    `Detected adapter: ${resolved.adapter.name}`,
    `Adapter description: ${resolved.adapter.description}`,
    `Config: ${relativeToCwd(cwd, resolved.configPath)}${resolved.configLoaded ? " present" : " missing"}`,
  ].join("\n");
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-goal-adapters", content: text, display: true });
  }
}

function refreshUi(ctx: UiLikeContext) {
  if (!ctx.hasUI || !ctx.ui) return;
  const theme = ctx.ui.theme;
  const statusKey = DEVELOPMENT_GOAL_IDENTITY.statusKey;
  ctx.ui.setStatus?.(statusKey, undefined);
  ctx.ui.setWidget?.(statusKey, undefined);
  ctx.ui.setStatus?.(statusKey, statusLine(state, theme));
  ctx.ui.setWidget?.(statusKey, statusWidgetLines(state, contextCwd(ctx), theme), { placement: "belowEditor" });
}

function appendLoopLog(event: string, extra: Partial<LoopLogRecord> = {}) {
  const logPath = state.logPath || path.join(process.cwd(), DEFAULT_LOG_RELATIVE);
  appendLoopLogRecord(logPath, buildLoopLogRecord({ ...state, logPath }, event, extra, new Date().toISOString(), LOG_TOPIC_MAX));
}

function restoreGrillGoalState(entries: Array<{ type?: string; customType?: string; data?: unknown }>): GrillGoalState | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === GRILL_STATE_TYPE && isGrillGoalState(entry.data)) return entry.data;
  }
  return undefined;
}

function isGrillGoalState(value: unknown): value is GrillGoalState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GrillGoalState>;
  return typeof item.active === "boolean" &&
    typeof item.seedTopic === "string" &&
    typeof item.language === "string" &&
    typeof item.adapterName === "string" &&
    typeof item.startedAt === "string";
}

function parseLoopDecision(text: string): LoopDecision | undefined {
  return parseLoopReport(text)?.decision;
}

function parseValidated(text: string): boolean | undefined {
  return parseLoopReport(text)?.validated;
}

function requiresValidation(decision: LoopDecision): boolean {
  return decision === "continue" || decision === "done";
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) {
    ctx.ui.notify(message, level);
  } else {
    console.log(message);
  }
}

export const __test__ = {
  BUILT_IN_ADAPTERS,
  buildIterationPrompt,
  parseArgs,
  parseLoopDecision,
  parseLoopDeliveryEvidence,
  parseLoopReport,
  parseSinceFilter,
  parseValidated,
  resolveProjectAdapter,
  shouldCompactBeforeNextIteration,
  statusReport,
  tokenizeArgs,
};
