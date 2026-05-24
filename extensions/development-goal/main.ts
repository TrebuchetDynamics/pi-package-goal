import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import {
  DEVELOPMENT_GOAL_DEFAULTS,
  resolveDevelopmentGoalSettings,
} from "./defaults.ts";
import { DEVELOPMENT_GOAL_IDENTITY } from "./identity.ts";
import {
  contextCwd,
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
  buildIterationPrompt,
  buildSteeringPrompt,
  PROMPT_OBJECTIVE_MAX,
} from "./prompts.ts";
import { compactionReason, shouldCompactBeforeNextIteration } from "./compaction.ts";
import {
  appendLoopLogRecord,
  buildLoopLogRecord,
  type LoopLogRecord,
} from "./logger.ts";
import {
  hasContextOverflowProviderError,
  hasTransportProviderError,
} from "./provider-error.ts";
import { parseLoopDeliveryEvidence, parseLoopReport, type FinalReport } from "./report-parser.ts";
import { terminalAuditEvent } from "./terminal-audit.ts";
import { evaluateFinalReportGate } from "./final-report-gate.ts";
import { lastAssistantText } from "./runtime.ts";
import { mergeSteeringTopic } from "./steering.ts";
import { evaluateActiveGoalToolCallSafety } from "./tool-safety.ts";
import { singleLineText } from "./values.ts";
import {
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
  restoreState,
  type LoopState,
} from "./state.ts";
import { initConfig, publishHelp, publishStatus } from "./command-ui.ts";
import {
  compactBeforeNextIteration as runCompactBeforeNextIteration,
  continueQueuedIterationAfterCompaction as runContinueQueuedIterationAfterCompaction,
  pauseLoop as runPauseLoop,
  queueNextIteration as runQueueNextIteration,
  requestContextOverflowCompaction as runRequestContextOverflowCompaction,
  requestMissingMarkerRecovery as runRequestMissingMarkerRecovery,
  requestReportRepair as runRequestReportRepair,
  resumeCurrentIterationAfterCompaction as runResumeCurrentIterationAfterCompaction,
  resumeLoop as runResumeLoop,
  scheduleEmptyResponseRetry as runScheduleEmptyResponseRetry,
  scheduleTransportErrorRetry as runScheduleTransportErrorRetry,
  sendLoopPrompt,
  startLoop as runStartLoop,
  type GoalRunControllerDeps,
} from "./goal-run-controller.ts";
import {
  handleGrillGoalAssistantText as handleGrillGoalResult,
  restoreGrillGoalState,
  startGrillGoalPlanning,
  type GrillGoalState,
} from "./grill-goal.ts";
import {
  transitionBlocked,
  transitionContextOverflowWaiting,
  transitionEmptyResponseWaiting,
  transitionIterationReported,
  transitionMaxIterationsReached,
  transitionPreparingForCompaction,
  transitionProviderTransportWaiting,
  transitionReportRepairRetryCleared,
  transitionResponseRetryCountersCleared,
  transitionRetryCounterRestored,
  transitionStoppedByUser,
  transitionTerminalDecision,
  transitionUserSteering,
} from "./goal-run-transitions.ts";
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
const EMPTY_RESPONSE_MAX_RETRIES = 2;
const MISSING_MARKER_RECOVERY_MAX_RETRIES = 1;

let state: LoopState = inactiveState(DEFAULT_LOG_RELATIVE, DEFAULT_ITERATIONS);
let pendingGrillGoal: GrillGoalState | undefined;

function controllerDeps(): GoalRunControllerDeps {
  return {
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    appendLoopLog,
    refreshUi,
    notify,
  };
}

export default function developmentLoopExtension(pi: ExtensionAPI) {
  async function onSessionStart(_event: unknown, ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getEntries();
    state = restoreState(entries) ?? inactiveState(DEFAULT_LOG_RELATIVE, DEFAULT_ITERATIONS);
    pendingGrillGoal = restoreGrillGoalState(entries);
    refreshUi(ctx);
    if (state.active && state.phase === "running" && state.lastReason === "empty_agent_response_waiting_for_compaction") {
      const retryNumber = Math.max(1, state.emptyResponseRetries ?? 0);
      if (retryNumber <= EMPTY_RESPONSE_MAX_RETRIES) {
        state = transitionRetryCounterRestored(state, retryNumber);
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        runScheduleEmptyResponseRetry(pi, ctx, controllerDeps(), state.iteration, retryNumber);
      }
    }
    if (state.active && state.phase === "running" && state.lastReason === "provider_transport_error_waiting_for_retry") {
      const retryNumber = Math.max(1, state.emptyResponseRetries ?? 0);
      if (retryNumber <= EMPTY_RESPONSE_MAX_RETRIES) {
        state = transitionRetryCounterRestored(state, retryNumber);
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        runScheduleTransportErrorRetry(pi, ctx, controllerDeps(), state.iteration, retryNumber);
      }
    }
  }

  async function onAgentEnd(event: { messages?: Array<{ role?: string; content?: unknown; stopReason?: string }> }, ctx: ExtensionContext) {
    const messages = event.messages ?? [];
    const assistantText = lastAssistantText(messages);

    if (pendingGrillGoal?.active) {
      const result = await handleGrillGoalResult(pi, ctx, pendingGrillGoal, assistantText, notify, (parsed, replaceActive, options) => runStartLoop(pi, ctx, controllerDeps(), parsed, replaceActive, options));
      pendingGrillGoal = result.pending;
      if (result.handled) return;
    }

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
        state = transitionContextOverflowWaiting(state);
        appendLoopLog("context_overflow_waiting_for_compaction", { reason: "provider_context_length_exceeded" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development goal is waiting for compaction after a provider context-overflow error.", "warning");
        if (!alreadyWaitingForContextOverflowCompaction) runRequestContextOverflowCompaction(pi, ctx, controllerDeps());
        return;
      }
      if (hasTransportProviderError(messages)) {
        const transportRetries = (state.emptyResponseRetries ?? 0) + 1;
        if (transportRetries > EMPTY_RESPONSE_MAX_RETRIES) {
          blockLoop(pi, ctx, "provider transport error retry limit reached", "blocked", { blockerKind: "provider_transport_error", blockerState: "provider transport error retry limit reached" });
          return;
        }
        state = transitionProviderTransportWaiting(state, transportRetries);
        appendLoopLog("provider_transport_error_waiting_for_retry", { reason: "provider_transport_error", providerError: "transport" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development goal is retrying the same iteration after a provider transport error.");
        runScheduleTransportErrorRetry(pi, ctx, controllerDeps(), state.iteration, transportRetries);
        return;
      }
      if (!assistantText.trim()) {
        const emptyResponseRetries = (state.emptyResponseRetries ?? 0) + 1;
        if (emptyResponseRetries > EMPTY_RESPONSE_MAX_RETRIES) {
          blockLoop(pi, ctx, "empty provider response retry limit reached");
          return;
        }
        state = transitionEmptyResponseWaiting(state, emptyResponseRetries);
        appendLoopLog("empty_agent_response_waiting_for_compaction", { reason: "missing_assistant_text" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development goal is waiting for compaction or retry after an empty provider response.", "warning");
        runScheduleEmptyResponseRetry(pi, ctx, controllerDeps(), state.iteration, emptyResponseRetries);
        return;
      }
      if ((state.markerRecoveryRetries ?? 0) >= MISSING_MARKER_RECOVERY_MAX_RETRIES) {
        blockLoop(pi, ctx, "missing DEV_GOAL_DECISION final marker after recovery request");
        return;
      }
      runRequestMissingMarkerRecovery(pi, ctx, controllerDeps());
      return;
    }

    if (state.emptyResponseRetries || state.markerRecoveryRetries) {
      state = transitionResponseRetryCountersCleared(state);
    }

    if (finalReportGate.action === "repair") {
      runRequestReportRepair(pi, ctx, controllerDeps(), finalReportGate.report, finalReportGate.logEvent);
      return;
    }

    if (finalReportGate.action === "block") {
      blockLoop(pi, ctx, "malformed_final_report", "blocked", finalReportGate.logEvent);
      return;
    }

    if (state.usedReportRepairRetry) {
      state = transitionReportRepairRetryCleared(state);
    }

    if (requiresValidation(decision) && validated !== true) {
      blockLoop(pi, ctx, "missing DEV_GOAL_VALIDATED: yes for continue/done decision", decision);
      return;
    }

    if (decision === "blocked" || decision === "stop" || decision === "done") {
      const audit = finalReport ? terminalAuditEvent({ report: finalReport }) : undefined;
      const finalStatus = audit?.finalStatus;
      state = transitionTerminalDecision(state, decision, finalStatus);
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

    state = transitionIterationReported(state, decision, deliveryEvidence);
    appendLoopLog("iteration_result", { decision, ...deliveryEvidence });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);

    if (hasIterationCap(state) && state.iteration >= state.maxIterations) {
      state = transitionMaxIterationsReached(state);
      appendLoopLog("loop_finished", { decision: "done", reason: "max_iterations_reached", ...deliveryEvidence });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Development goal stopped after ${state.iteration}/${state.maxIterations} iteration(s).`);
      return;
    }

    if (runCompactBeforeNextIteration(pi, ctx, controllerDeps())) return;
    runQueueNextIteration(pi, ctx, controllerDeps());
  }

  async function onSessionBeforeCompact(event: { preparation?: { tokensBefore?: number } }, ctx: ExtensionContext) {
    if (!state.active) return;
    state = transitionPreparingForCompaction(state);
    appendLoopLog("compaction_started", { reason: compactionReason(event.preparation?.tokensBefore) });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);
    notify(ctx, "Development goal state saved before compaction.");
  }

  async function onSessionCompact(_event: unknown, ctx: ExtensionContext) {
    if (!state.active) return;
    if (state.phase === "running") {
      runResumeCurrentIterationAfterCompaction(pi, ctx, controllerDeps());
      return;
    }
    if (state.phase === "queued" || state.phase === "reported") {
      runContinueQueuedIterationAfterCompaction(pi, ctx, controllerDeps());
    }
  }

  async function onInput(event: InputEvent, ctx: ExtensionContext): Promise<InputEventResult> {
    if (!state.active || state.phase === "paused") return { action: "continue" };
    if (event.source === "extension") return { action: "continue" };

    const steeringText = singleLineText(event.text);
    if (!steeringText || steeringText.startsWith("/")) return { action: "continue" };

    const cwd = contextCwd(ctx);
    const resolved = resolveDevelopmentGoalSettings(cwd);
    state = transitionUserSteering(state, mergeSteeringTopic(state.topic, steeringText));
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
    description: "Run a project development goal",
    getArgumentCompletions: completeCommandArgs,
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };

  pi.registerCommand(DEVELOPMENT_GOAL_IDENTITY.command.name, command);
}

async function runCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) {
  const parsed = parseArgs(args);
  switch (parsed.command) {
    case "status":
      publishStatus(pi, ctx, state);
      return;
    case "pause":
      runPauseLoop(pi, ctx, controllerDeps());
      return;
    case "resume":
      runResumeLoop(pi, ctx, controllerDeps());
      return;
    case "stop":
      state = transitionStoppedByUser(state);
      appendLoopLog("loop_stopped", { reason: "stopped_by_user" });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, "Development goal stopped.");
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
      await runStartLoop(pi, ctx, controllerDeps(), improveCodebaseArchitectureCommand(parsed), false);
      return;
    case "git-commit-push":
      await runStartLoop(pi, ctx, controllerDeps(), gitCommitPushCommand(parsed), false);
      return;
    case "grill-me":
      pendingGrillGoal = await startGrillGoalPlanning(pi, ctx, state, parsed, notify, sendLoopPrompt) ?? pendingGrillGoal;
      return;
    case "restart":
      await runStartLoop(pi, ctx, controllerDeps(), parsed, true);
      return;
    case "start":
    default:
      await runStartLoop(pi, ctx, controllerDeps(), parsed, false);
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

function blockLoop(pi: ExtensionAPI, ctx: ExtensionContext, reason: string, decision?: string, extra: Partial<LoopLogRecord> = {}) {
  state = transitionBlocked(state, reason, decision ?? "blocked");
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
  DEVELOPMENT_GOAL_DEFAULTS,
  buildIterationPrompt,
  parseArgs,
  parseLoopDecision,
  parseLoopDeliveryEvidence,
  parseLoopReport,
  parseSinceFilter,
  parseValidated,
  resolveDevelopmentGoalSettings,
  shouldCompactBeforeNextIteration,
  statusReport,
  tokenizeArgs,
};
