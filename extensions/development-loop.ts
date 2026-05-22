import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";

type LoopPhase = "idle" | "started" | "queued" | "running" | "reported" | "blocked" | "done";
type LoopDecision = "continue" | "stop" | "blocked" | "done";
type ObjectiveKind = "short" | "oversized" | "provider-noise";

type DeliveryEvidence = {
  summary?: string;
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
};

type FinalReport = {
  decision?: LoopDecision;
  validated?: boolean;
  deliveryEvidence: DeliveryEvidence;
};

type ProjectConfig = {
  adapter?: string;
  defaultTopic?: string;
  language?: string;
  skills?: string[];
  preflightCommands?: string[];
  validationCommands?: string[];
  commit?: boolean;
  push?: boolean;
  logPath?: string;
  maxIterations?: number;
  stopConditions?: string[];
};

type LoopAdapter = {
  name: string;
  label: string;
  description: string;
  defaultTopic: string;
  skills: string[];
  preflightCommands: string[];
  validationCommands: string[];
  stopConditions: string[];
  matches(cwd: string): boolean;
};

type ResolvedProjectAdapter = {
  adapter: LoopAdapter;
  config: ProjectConfig;
  configPath: string;
  configLoaded: boolean;
  configError?: string;
};

type LoopState = {
  active: boolean;
  adapterName: string;
  runId?: string;
  topic: string;
  iteration: number;
  maxIterations: number;
  startedAt: string;
  logPath: string;
  phase: LoopPhase;
  lastDecision?: LoopDecision | string;
  lastReason?: string;
  commit: boolean;
  push: boolean;
  emptyResponseRetries?: number;
  markerRecoveryRetries?: number;
};

type LoopLogRecord = {
  at: string;
  event: string;
  adapterName: string;
  runId?: string;
  topic: string;
  topicLength?: number;
  topicTruncated?: boolean;
  topicHash?: string;
  topicKind?: ObjectiveKind;
  topicSanitized?: boolean;
  iteration: number;
  maxIterations: number;
  phase: LoopPhase;
  decision?: string;
  reason?: string;
  summary?: string;
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
  likelyCause?: string;
  nextSafeAction?: string;
  logPath: string;
};

type LoopLogAnalysis = {
  logFiles: number;
  records: number;
  invalidRecords: number;
  loopsStarted: number;
  finishedLoops: number;
  finishedWithoutValidationRecords: number;
  finishedWithoutDeliveryRecords: number;
  iterationResultRecords: number;
  iterationResultWithoutValidationRecords: number;
  iterationPromptSentRecords: number;
  topPromptResultImbalanceSource?: string;
  topPromptResultImbalanceSourceDelta: number;
  duplicatePromptSentGroups: number;
  duplicatePromptSentExtraRecords: number;
  assistantDecisionRecords: number;
  topAssistantDecision?: string;
  topAssistantDecisionCount: number;
  topFinishDecision?: string;
  topFinishDecisionCount: number;
  blockedLoops: number;
  topBlockReason?: string;
  topBlockReasonCount: number;
  topBlockedSource?: string;
  topBlockedSourceCount: number;
  postmortems: number;
  selfImprovementQueuedRecords: number;
  topSelfImprovementSource?: string;
  topSelfImprovementSourceCount: number;
  topSelfImprovementReason?: string;
  topSelfImprovementReasonCount: number;
  topSelfImprovementAction?: string;
  topSelfImprovementActionCount: number;
  topPostmortemCause?: string;
  topPostmortemCauseCount: number;
  topNextSafeAction?: string;
  topNextSafeActionCount: number;
  finalMarkerRecoveryRequests: number;
  topFinalMarkerRecoverySource?: string;
  topFinalMarkerRecoverySourceCount: number;
  topFinalMarkerRecoveryReason?: string;
  topFinalMarkerRecoveryReasonCount: number;
  finalMarkerRecoverySuccesses: number;
  finalMarkerRecoveryBlocks: number;
  topFinalMarkerRecoveryBlockSource?: string;
  topFinalMarkerRecoveryBlockSourceCount: number;
  topFinalMarkerRecoveryBlockReason?: string;
  topFinalMarkerRecoveryBlockReasonCount: number;
  deliveryEvidenceRecords: number;
  changedFileEvidenceRecords: number;
  validationEvidenceRecords: number;
  commitEvidenceRecords: number;
  reportSummaryRecords: number;
  reportNextStepItems: number;
  topReportSummary?: string;
  topReportSummaryCount: number;
  topReportNextStep?: string;
  topReportNextStepCount: number;
  pushEvidenceRecords: number;
  commitWithoutPushRecords: number;
  topCommitWithoutPushSource?: string;
  topCommitWithoutPushSourceCount: number;
  topPushStatus?: string;
  topPushStatusCount: number;
  ciGreenRecords: number;
  ciRedRecords: number;
  topCiRedSource?: string;
  topCiRedSourceCount: number;
  ciGateMissingRecords: number;
  topCiGateMissingSource?: string;
  topCiGateMissingSourceCount: number;
  topCiGateMissingReason?: string;
  topCiGateMissingReasonCount: number;
  unresolvedLoopStarts: number;
  topUnresolvedSource?: string;
  topUnresolvedSourceCount: number;
  emptyProviderResponses: number;
  emptyProviderRetryRecords: number;
  topEmptyProviderSource?: string;
  topEmptyProviderSourceCount: number;
  topEmptyProviderReason?: string;
  topEmptyProviderReasonCount: number;
  queuedIterationRecords: number;
  topQueuedIterationSource?: string;
  topQueuedIterationSourceCount: number;
  topQueuedIterationReason?: string;
  topQueuedIterationReasonCount: number;
  providerErrorRecords: number;
  topProviderErrorSource?: string;
  topProviderErrorSourceCount: number;
  topProviderErrorCode?: string;
  topProviderErrorCodeCount: number;
  topProviderErrorCategory?: string;
  topProviderErrorCategoryCount: number;
  contextOverflowResponses: number;
  compactionEvents: number;
  topCompactionSource?: string;
  topCompactionSourceCount: number;
  compactionResumeRecords: number;
  compactionFailureRecords: number;
  topCompactionFailureReason?: string;
  topCompactionFailureReasonCount: number;
  userSteeringRecords: number;
  maxUserSteeringLength: number;
  providerNoiseTopicRecords: number;
  sanitizedTopicRecords: number;
  truncatedTopics: number;
  oversizedTopicRecords: number;
  mostRepeatedOversizedTopicRecords: number;
  maxTopicLength: number;
  readError?: string;
  recommendations: string[];
};

type LoopLogAccumulator = {
  analysis: LoopLogAnalysis;
  oversizedTopicCounts: Map<string, number>;
  blockReasonCounts: Map<string, number>;
  blockedSourceCounts: Map<string, number>;
  finishDecisionCounts: Map<string, number>;
  assistantDecisionCounts: Map<string, number>;
  promptSentCounts: Map<string, number>;
  sourcePromptSentCounts: Map<string, number>;
  sourceIterationResultCounts: Map<string, number>;
  postmortemCauseCounts: Map<string, number>;
  nextSafeActionCounts: Map<string, number>;
  finalMarkerRecoverySourceCounts: Map<string, number>;
  finalMarkerRecoveryReasonCounts: Map<string, number>;
  finalMarkerRecoveryBlockSourceCounts: Map<string, number>;
  finalMarkerRecoveryBlockReasonCounts: Map<string, number>;
  selfImprovementSourceCounts: Map<string, number>;
  selfImprovementReasonCounts: Map<string, number>;
  selfImprovementActionCounts: Map<string, number>;
  commitWithoutPushSourceCounts: Map<string, number>;
  pushStatusCounts: Map<string, number>;
  reportSummaryCounts: Map<string, number>;
  reportNextStepCounts: Map<string, number>;
  ciRedSourceCounts: Map<string, number>;
  ciGateMissingSourceCounts: Map<string, number>;
  ciGateMissingReasonCounts: Map<string, number>;
  emptyProviderSourceCounts: Map<string, number>;
  emptyProviderReasonCounts: Map<string, number>;
  queuedIterationSourceCounts: Map<string, number>;
  queuedIterationReasonCounts: Map<string, number>;
  providerErrorSourceCounts: Map<string, number>;
  providerErrorCodeCounts: Map<string, number>;
  providerErrorCategoryCounts: Map<string, number>;
  compactionSourceCounts: Map<string, number>;
  compactionFailureReasonCounts: Map<string, number>;
  markerRecoveryKeys: Set<string>;
  markerRecoverySucceededKeys: Set<string>;
  markerRecoveryBlockedKeys: Set<string>;
  startedRunIds: Set<string>;
  terminalRunIds: Set<string>;
  sourceStartedRunIds: Map<string, Set<string>>;
  sourceTerminalRunIds: Map<string, Set<string>>;
  legacyStartsBySource: Map<string, number>;
  legacyFinishedBySource: Map<string, number>;
  legacyBlockedBySource: Map<string, number>;
  legacyLoopStarts: number;
  legacyFinishedLoops: number;
  legacyBlockedLoops: number;
  legacyMarkerRecoveryBlocks: number;
};

type ParsedCommand = {
  command: "start" | "restart" | "stop" | "status" | "init" | "adapters" | "analyze-logs" | "help";
  adapter?: string;
  topic?: string;
  iterations?: number;
  commit?: boolean;
  push?: boolean;
  force?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  html?: boolean;
  logPath?: string;
  validationCommands: string[];
  preflightCommands: string[];
  skills: string[];
  stopConditions: string[];
};

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

const CUSTOM_STATE_TYPE = "development-loop-state";
const DEFAULT_CONFIG_RELATIVE = path.join(".pi", "development-loop.json");
const DEFAULT_LOG_RELATIVE = path.join(".pi", "development-loop", "logs.jsonl");
const DEFAULT_ITERATIONS = 3;
const HARD_MAX_ITERATIONS = 25;
const STATUS_TOPIC_MAX = 72;
const STEERING_TOPIC_MAX = 240;
const PROMPT_OBJECTIVE_MAX = 600;
const LOG_TOPIC_MAX = 600;
const AUTO_CONTINUATION_RETRY_MS = 50;
const AUTO_CONTINUATION_MAX_ATTEMPTS = 20;
const EMPTY_RESPONSE_RETRY_MS = 50;
const EMPTY_RESPONSE_MAX_RETRIES = 1;
const MISSING_MARKER_RECOVERY_MAX_RETRIES = 1;
const PROACTIVE_COMPACTION_MIN_TOKENS = 240_000;
const PROACTIVE_COMPACTION_CONTEXT_RATIO = 0.35;
const DEFAULT_LANGUAGE = "English";
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
const MANDATORY_SKILLS = ["caveman", "improve-codebase-architecture"];

const COMMON_PREFLIGHT = [
  "pwd",
  "git rev-parse --show-toplevel 2>/dev/null || true",
  "git rev-parse --abbrev-ref HEAD 2>/dev/null || true",
  "git status --short --branch --untracked-files=all 2>/dev/null || true",
];

const TASK_DISCOVERY_CUES = [
  "repo-local skills whose names match the work, including *-git, *-release, *-e2e, *-playwright, and *-maestro-flutter when present",
  "TODO.md, TODOS.md, TODO.txt, PLAN.md, PLANS.md, ROADMAP.md, and similar planning files",
  "progress.json, progress/*.json, status.json, backlog files, and project task trackers",
  "PR/MR/CL review state and Greptile review comments when greploop is explicitly requested or git delivery is enabled",
  "docs/plans, docs/adr, docs/roadmap, issues, and other project progress notes",
];

const REVIEW_LOOP_GUIDANCE = [
  "Use greploop for PR/MR/CL review cleanup only when the user requested a Greptile review loop, a PR/MR/CL is available, and required gh/glab/p4 authentication is present.",
  "Do not trigger Greptile, post review comments, resolve review threads, push, or re-shelve unless the commit/push policy permits it or the user explicitly asked for that external review action.",
  "If Greptile, required CLIs, credentials, or PR/MR/CL context are unavailable for a requested greploop, report DEV_LOOP_DECISION: blocked with the missing prerequisite.",
];

const BUILT_IN_ADAPTERS: LoopAdapter[] = [
  {
    name: "generic-git",
    label: "Generic Git",
    description: "Conservative generic git-project development loop",
    defaultTopic: "discover and complete the smallest safe project task with validation",
    skills: [
      "caveman",
      "improve-codebase-architecture",
      "repo-local skills that match the detected task before package defaults",
      "greploop for PR/MR/CL review cleanup when Greptile is installed and external review actions are explicitly allowed",
      "zoom-out for source-backed project understanding",
      "writing-plans for multi-step plans when available",
      "writing-shape for docs, articles, READMEs, and narrative docs",
      "writing-skills for creating or updating skills",
      "test-driven-development for code changes",
      "verification-before-completion before reporting done",
    ],
    preflightCommands: COMMON_PREFLIGHT,
    validationCommands: [
      "git diff --check",
    ],
    stopConditions: [
      "project instructions are missing or conflict with the requested work",
      "no task can be selected after inspecting TODO.md, progress.json, planning files, and repo-local guidance",
      "no relevant test/build command can be identified",
      "Greptile, gh/glab/p4, credentials, or PR/MR/CL context are required for greploop and unavailable",
      "validation fails twice with the same blocker",
      "commit or push would include unrelated dirty work",
    ],
    matches(cwd: string): boolean {
      return dirExists(path.join(cwd, ".git"));
    },
  },
];

let state: LoopState = inactiveState();

export default function developmentLoopExtension(pi: ExtensionAPI) {
  async function onSessionStart(_event: unknown, ctx: ExtensionContext) {
    state = restoreState(ctx.sessionManager.getEntries()) ?? inactiveState();
    refreshUi(ctx);
    if (state.active && state.phase === "running" && state.lastReason === "empty_agent_response_waiting_for_compaction") {
      const retryNumber = Math.max(1, state.emptyResponseRetries ?? 0);
      if (retryNumber <= EMPTY_RESPONSE_MAX_RETRIES) {
        state = { ...state, emptyResponseRetries: retryNumber };
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        scheduleEmptyResponseRetry(pi, ctx, state.iteration, retryNumber);
      }
    }
  }

  async function onAgentEnd(event: { messages?: Array<{ role?: string; content?: unknown; stopReason?: string }> }, ctx: ExtensionContext) {
    if (!state.active) return;
    if (state.phase !== "running") return;

    const messages = event.messages ?? [];
    const assistantText = lastAssistantText(messages);
    const decision = parseLoopDecision(assistantText);
    const validated = parseValidated(assistantText);
    const deliveryEvidence = parseDeliveryEvidence(assistantText);

    if (!decision) {
      if (hasContextOverflowProviderError(messages)) {
        const alreadyWaitingForContextOverflowCompaction = state.lastReason === "context_overflow_waiting_for_compaction";
        state = { ...state, phase: "running", lastReason: "context_overflow_waiting_for_compaction", emptyResponseRetries: 0, markerRecoveryRetries: 0 };
        appendLoopLog("context_overflow_waiting_for_compaction", { reason: "provider_context_length_exceeded" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development loop is waiting for compaction after a provider context-overflow error.", "warning");
        if (!alreadyWaitingForContextOverflowCompaction) requestContextOverflowCompaction(pi, ctx);
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
        notify(ctx, "Development loop is waiting for compaction or retry after an empty provider response.", "warning");
        scheduleEmptyResponseRetry(pi, ctx, state.iteration, emptyResponseRetries);
        return;
      }
      if ((state.markerRecoveryRetries ?? 0) >= MISSING_MARKER_RECOVERY_MAX_RETRIES) {
        blockLoop(pi, ctx, "missing DEV_LOOP_DECISION final marker after recovery request");
        return;
      }
      requestMissingMarkerRecovery(pi, ctx);
      return;
    }

    if (state.emptyResponseRetries || state.markerRecoveryRetries) {
      state = { ...state, emptyResponseRetries: 0, markerRecoveryRetries: 0 };
    }

    if (requiresValidation(decision) && validated !== true) {
      blockLoop(pi, ctx, "missing DEV_LOOP_VALIDATED: yes for continue/done decision", decision);
      return;
    }

    if (decision === "blocked" || decision === "stop" || decision === "done") {
      state = {
        ...state,
        active: false,
        phase: decision === "done" ? "done" : decision === "blocked" ? "blocked" : "idle",
        lastDecision: decision,
      };
      appendLoopLog("loop_finished", { decision, reason: decision, ...deliveryEvidence });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Development loop ${decision}.`);
      return;
    }

    state = { ...state, phase: "reported", lastDecision: decision };
    appendLoopLog("iteration_result", { decision, ...deliveryEvidence });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);

    if (state.iteration >= state.maxIterations) {
      state = { ...state, active: false, phase: "done", lastDecision: "done", lastReason: "max_iterations_reached" };
      appendLoopLog("loop_finished", { decision: "done", reason: "max_iterations_reached", ...deliveryEvidence });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Development loop stopped after ${state.iteration}/${state.maxIterations} iteration(s).`);
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
    notify(ctx, "Development loop state saved before compaction.");
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
    if (!state.active) return { action: "continue" };
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
    notify(ctx, "Development loop steering accepted for the active task.");

    return {
      action: "transform",
      text: buildSteeringPrompt(state, resolved, cwd, steeringText),
      images: event.images,
    };
  }

  pi.on("session_start", onSessionStart);
  pi.on("agent_end", onAgentEnd);
  pi.on("session_before_compact", onSessionBeforeCompact);
  pi.on("session_compact", onSessionCompact);
  pi.on("input", onInput);

  const command = {
    description: "Run an adapter-aware project development loop",
    getArgumentCompletions: (prefix: string) => ["start", "restart", "status", "stop", "init", "adapters", "analyze-logs", "help"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };

  pi.registerCommand("development-loop", command);
  pi.registerCommand("dev-loop", { ...command, description: "Alias for /development-loop" });
}

async function runCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) {
  const parsed = parseArgs(args);
  switch (parsed.command) {
    case "status":
      publishStatus(pi, ctx);
      return;
    case "stop":
      state = { ...state, active: false, phase: "idle", lastDecision: "stopped_by_user" };
      appendLoopLog("loop_stopped", { reason: "stopped_by_user" });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, "Development loop stopped.");
      return;
    case "adapters":
      publishAdapters(pi, ctx);
      return;
    case "analyze-logs":
      publishLogAnalysis(pi, ctx, parsed);
      return;
    case "help":
      publishHelp(pi, ctx);
      return;
    case "init":
      await initConfig(parsed, ctx);
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

async function startLoop(pi: ExtensionAPI, ctx: ExtensionCommandContext, parsed: ParsedCommand, replaceActive: boolean) {
  if (state.active && !replaceActive) {
    notify(ctx, `${statusLine(state)}\nNo user input is needed; queued loop iterations start automatically. Use /development-loop restart to replace it or /development-loop stop to stop it.`);
    refreshUi(ctx);
    return;
  }

  if (state.active && replaceActive && ctx.hasUI) {
    const ok = await ctx.ui.confirm("Restart development loop", "Replace the current active loop state?");
    if (!ok) return;
  }

  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, parsed.adapter);
  const adapter = resolved.adapter;
  const topic = parsed.topic || resolved.config.defaultTopic || adapter.defaultTopic;
  const maxIterations = clampIterations(parsed.iterations ?? resolved.config.maxIterations ?? DEFAULT_ITERATIONS);
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
    phase: "started",
    commit,
    push,
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
  };

  appendLoopLog("loop_started", { reason: resolved.configLoaded ? "config_loaded" : "built_in_adapter" });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Starting development loop: ${adapter.name} 1/${maxIterations}; log: ${relativeToCwd(cwd, logPath)}`);
  sendIterationPrompt(pi, ctx, resolved);
}

function queueNextIteration(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (!state.active) return;
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  state = { ...state, iteration: state.iteration + 1, phase: "queued", emptyResponseRetries: 0, markerRecoveryRetries: 0 };
  appendLoopLog("iteration_queued");
  refreshUi(ctx);
  notify(ctx, `Queued development loop iteration ${state.iteration}/${state.maxIterations}; it will start automatically when the current turn is idle.`);
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
  };
  appendLoopLog("compaction_before_next_iteration", { reason: contextUsageReason(ctx) });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Compacting before development loop iteration ${state.iteration}/${state.maxIterations}.`);
  ctx.compact({
    customInstructions: buildDevelopmentLoopCompactionInstructions(state, resolved, cwd),
    onComplete: () => notify(ctx, "Development loop compaction completed; continuing automatically."),
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
    customInstructions: `The provider reported a context-overflow error before DEV_LOOP markers were emitted. Compact the conversation, preserve the current development-loop state, and continue the same iteration after compaction.\n\n${buildDevelopmentLoopCompactionInstructions(state, resolved, cwd)}`,
    onComplete: () => notify(ctx, "Development loop context-overflow compaction completed; continuing automatically."),
    onError: (error) => {
      state = { ...state, lastReason: "context_overflow_compaction_failed" };
      appendLoopLog("context_overflow_compaction_failed", { reason: error.message });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Compaction failed after provider context-overflow error: ${error.message}. Waiting for manual compaction or retry.`, "warning");
    },
  });
}

function shouldCompactBeforeNextIteration(ctx: UiLikeContext): boolean {
  if (typeof ctx.getContextUsage !== "function") return false;
  const usage = ctx.getContextUsage();
  const tokens = typeof usage?.tokens === "number" ? usage.tokens : undefined;
  if (tokens === undefined) return false;
  if (tokens >= PROACTIVE_COMPACTION_MIN_TOKENS) return true;
  const contextWindow = typeof usage?.contextWindow === "number" ? usage.contextWindow : typeof usage?.maxTokens === "number" ? usage.maxTokens : undefined;
  return contextWindow !== undefined && contextWindow > 0 && tokens / contextWindow >= PROACTIVE_COMPACTION_CONTEXT_RATIO;
}

function resumeCurrentIterationAfterCompaction(pi: ExtensionAPI, ctx: ExtensionContext) {
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  const prompt = buildCompactionResumePrompt(state, resolved, cwd);
  state = { ...state, phase: "queued", lastReason: "resuming_after_compaction" };
  appendLoopLog("compaction_resume_queued");
  refreshUi(ctx);
  sendLoopPrompt(pi, ctx, prompt);
  state = { ...state, phase: "running", lastReason: "resumed_after_compaction", emptyResponseRetries: 0, markerRecoveryRetries: 0 };
  appendLoopLog("compaction_resume_sent");
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Resumed development loop iteration ${state.iteration}/${state.maxIterations} after compaction.`);
}

function continueQueuedIterationAfterCompaction(pi: ExtensionAPI, ctx: ExtensionContext) {
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd, state.adapterName);
  appendLoopLog("compaction_continue_queued_iteration");
  notify(ctx, `Continuing development loop iteration ${state.iteration}/${state.maxIterations} after compaction.`);
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

function requestMissingMarkerRecovery(pi: ExtensionAPI, ctx: UiLikeContext) {
  const retryNumber = (state.markerRecoveryRetries ?? 0) + 1;
  state = {
    ...state,
    phase: "running",
    lastReason: "missing_final_marker_recovery_requested",
    emptyResponseRetries: 0,
    markerRecoveryRetries: retryNumber,
  };
  appendLoopLog("missing_final_marker_recovery_requested", { reason: "missing DEV_LOOP_DECISION final marker" });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, "Development loop is requesting a final-marker-only recovery response.", "warning");
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

function sendIterationPrompt(pi: ExtensionAPI, ctx: UiLikeContext, resolved: ResolvedProjectAdapter, asFollowUp = false) {
  const prompt = buildIterationPrompt(state, resolved, contextCwd(ctx));
  state = { ...state, phase: asFollowUp ? "queued" : "running", emptyResponseRetries: 0, markerRecoveryRetries: 0 };
  appendLoopLog(asFollowUp ? "iteration_prompt_queued" : "iteration_prompt_sent");
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

function blockLoop(pi: ExtensionAPI, ctx: ExtensionContext, reason: string, decision?: string) {
  state = { ...state, active: false, phase: "blocked", lastDecision: decision ?? "blocked", lastReason: reason, emptyResponseRetries: 0, markerRecoveryRetries: 0 };
  appendLoopLog("loop_blocked", { decision, reason });
  appendLoopLog("loop_postmortem", {
    decision: decision ?? "blocked",
    reason,
    likelyCause: likelyBlockerCause(reason),
    nextSafeAction: nextSafeBlockerAction(reason),
  });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Development loop blocked: ${reason}`, "warning");
}

async function initConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext) {
  const cwd = contextCwd(ctx);
  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);

  if (!parsed.dryRun && fs.existsSync(configPath) && !parsed.force) {
    notify(ctx, `${relativeToCwd(cwd, configPath)} already exists; leaving it unchanged. Use /development-loop init --force to replace it.`);
    return;
  }

  const config = await buildInitConfig(parsed, ctx, cwd);
  if (!config) return;

  if (parsed.dryRun) {
    notify(ctx, `Development-loop init preview (no files written):\n${JSON.stringify(config, null, 2)}`);
    return;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (fs.existsSync(configPath) && !parsed.force) {
    notify(ctx, `${relativeToCwd(cwd, configPath)} already exists; leaving it unchanged. Use /development-loop init --force to replace it.`);
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

function likelyBlockerCause(reason: string): string {
  if (/missing DEV_LOOP_DECISION|missing_final_marker/i.test(reason)) return "assistant_response_missing_final_markers";
  if (/missing DEV_LOOP_VALIDATED/i.test(reason)) return "validation_evidence_missing_or_red";
  if (/empty provider response/i.test(reason)) return "provider_returned_empty_response";
  if (/context[_ -]?overflow|context[_ -]?length/i.test(reason)) return "provider_context_overflow";
  return "loop_blocked";
}

function nextSafeBlockerAction(reason: string): string {
  if (/missing DEV_LOOP_DECISION|missing_final_marker/i.test(reason)) return "reuse completed work if present, then return only DEV_LOOP_VALIDATED and DEV_LOOP_DECISION markers or restart the iteration";
  if (/missing DEV_LOOP_VALIDATED/i.test(reason)) return "run the configured validation commands, then report DEV_LOOP_VALIDATED: yes only with evidence or fix failures first";
  if (/empty provider response|context[_ -]?overflow|context[_ -]?length/i.test(reason)) return "compact the session if needed, preserve unrelated dirty work, then retry the same iteration";
  return "inspect the blocker, preserve unrelated dirty work, and restart with the smallest safe validated slice";
}

function initDefaults(parsed: ParsedCommand, _cwd: string, _adapterName = "generic-git"): { adapterName: string; adapter: LoopAdapter; config: ProjectConfig } {
  const adapter = getAdapterByName("generic-git")!;
  const adapterName = adapter.name;
  const defaultTopic = parsed.topic || adapter.defaultTopic;
  const validationCommands = parsed.validationCommands.length > 0 ? parsed.validationCommands : adapter.validationCommands;
  const preflightCommands = parsed.preflightCommands.length > 0 ? parsed.preflightCommands : adapter.preflightCommands;
  const skills = ensureMandatorySkills(parsed.skills.length > 0 ? parsed.skills : adapter.skills);
  const stopConditions = parsed.stopConditions.length > 0 ? parsed.stopConditions : adapter.stopConditions;
  const { commit, push } = resolveCommitPush(parsed.commit, parsed.push, false, false);
  const maxIterations = clampIterations(parsed.iterations ?? DEFAULT_ITERATIONS);
  const logPath = parsed.logPath || DEFAULT_LOG_RELATIVE;

  return {
    adapterName,
    adapter,
    config: {
      adapter: adapterName,
      defaultTopic,
      language: DEFAULT_LANGUAGE,
      skills,
      preflightCommands,
      validationCommands,
      commit,
      push,
      logPath,
      maxIterations,
      stopConditions,
    },
  };
}

function shouldPromptForInit(parsed: ParsedCommand, ctx: UiLikeContext): boolean {
  return parsed.yes !== true &&
    ctx.hasUI === true &&
    typeof ctx.ui?.select === "function" &&
    typeof ctx.ui.input === "function" &&
    typeof ctx.ui.editor === "function" &&
    typeof ctx.ui.confirm === "function";
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

  const iterationsText = await ui.input!("Max iterations (1-25)", String(config.maxIterations ?? DEFAULT_ITERATIONS));
  if (iterationsText === undefined) return cancelInit(ctx);
  const iterations = numberOrUndefined(iterationsText);
  config.maxIterations = iterations ? clampIterations(iterations) : config.maxIterations;

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

  const ok = await ui.confirm!("Write development-loop config", initConfigSummary(config, cwd));
  if (!ok) return cancelInit(ctx);
  return config;
}

function splitLinesOrDefault(value: string, fallback: string[]): string[] {
  const lines = splitLines(value);
  return lines.length > 0 ? lines : fallback;
}

function initConfigSummary(config: ProjectConfig, cwd: string): string {
  return [
    `Target: ${relativeToCwd(cwd, path.join(cwd, DEFAULT_CONFIG_RELATIVE))}`,
    `Adapter: ${config.adapter}`,
    `Objective: ${config.defaultTopic}`,
    `Preferred language: ${config.language || DEFAULT_LANGUAGE}`,
    `Iterations: ${config.maxIterations}`,
    `Git delivery: ${config.push ? "push" : config.commit ? "commit" : "manual"}`,
    `Validation: ${(config.validationCommands ?? []).join("; ") || "none"}`,
    `Log path: ${config.logPath || DEFAULT_LOG_RELATIVE}`,
  ].join("\n");
}

function cancelInit(ctx: UiLikeContext): undefined {
  notify(ctx, "Development-loop init cancelled.");
  return undefined;
}

function publishStatus(pi: ExtensionAPI, ctx: UiLikeContext) {
  const cwd = contextCwd(ctx);
  const text = statusReport(state, cwd);
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-loop-status", content: text, display: true });
  }
}

function publishHelp(pi: ExtensionAPI, ctx: UiLikeContext) {
  const text = [
    "Development loop commands:",
    "- /development-loop start [options] <topic> — start a loop",
    "- /development-loop restart [options] <topic> — replace the active loop",
    "- /development-loop stop — stop the active loop",
    "- /development-loop status — show current state",
    "- /development-loop adapters — show detected adapter/config",
    "- /development-loop analyze-logs [path] — summarize one log file or a directory of loop logs",
    "- /development-loop analyze-logs --html [path] — also write a self-contained HTML health report",
    "- /development-loop init [options] <default topic> — configure .pi/development-loop.json interactively",
    "",
    "Configurable init options:",
    "- /development-loop init --dry-run ... — preview without writing files",
    "- --iterations <n> | --max-iterations <n> | -n <n>",
    "- --commit | --no-commit | --push | --no-push (--push implies --commit)",
    "- --validation <command> | --test <command> (repeatable)",
    "- --preflight <command> (repeatable)",
    "- --skill <name-or-note> (repeatable), for example greploop or grill-me",
    "- --stop-condition <text> (repeatable)",
    "- --log-path <path>",
    "- --force — atomically replace an existing config",
    "- --yes | -y | --defaults — accept generated values without prompts",
    "",
    "Active-loop behavior:",
    "- DEV_LOOP_DECISION: continue starts the next iteration automatically when Pi is idle.",
    "- A non-empty response missing final markers gets one final-marker-only recovery prompt before blocking.",
    "- Plain text typed during an active loop becomes steering for the current or next safe slice.",
  ].join("\n");
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-loop-help", content: text, display: true });
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
    pi.sendMessage({ customType: "development-loop-adapters", content: text, display: true });
  }
}

function publishLogAnalysis(pi: ExtensionAPI, ctx: UiLikeContext, parsed: ParsedCommand) {
  const cwd = contextCwd(ctx);
  const targetPath = absoluteLogPath(cwd, parsed.topic || state.logPath || DEFAULT_LOG_RELATIVE);
  const analysis = analyzeLoopLogPath(targetPath);
  const htmlPath = parsed.html ? writeLoopLogHtmlReport(analysis, cwd, targetPath) : undefined;
  const text = [formatLoopLogAnalysis(analysis, cwd, targetPath), htmlPath ? `HTML health report: ${htmlPath}` : undefined].filter(Boolean).join("\n");
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-loop-log-analysis", content: text, display: true });
  }
}

function analyzeLoopLogPath(targetPath: string): LoopLogAnalysis {
  try {
    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) return analyzeLoopLogDirectory(targetPath);
    return analyzeLoopLogFile(targetPath);
  } catch (error) {
    return unreadableLoopLogAnalysis(error);
  }
}

function analyzeLoopLogFile(logPath: string): LoopLogAnalysis {
  try {
    const accumulator = createLoopLogAccumulator();
    accumulator.analysis.logFiles = 1;
    accumulateLoopLogText(fs.readFileSync(logPath, "utf8"), accumulator, logPath);
    return finalizeLoopLogAnalysis(accumulator);
  } catch (error) {
    return unreadableLoopLogAnalysis(error);
  }
}

function analyzeLoopLogDirectory(dirPath: string): LoopLogAnalysis {
  try {
    const logFiles = discoverLoopLogFiles(dirPath);
    if (logFiles.length === 0) {
      return {
        ...emptyLoopLogAnalysis(),
        readError: "No logs.jsonl files found under directory.",
        recommendations: ["Log unavailable: pass a loop log file or a directory containing .pi/**/logs.jsonl files."],
      };
    }
    const accumulator = createLoopLogAccumulator();
    for (const logFile of logFiles) {
      accumulator.analysis.logFiles++;
      accumulateLoopLogText(fs.readFileSync(logFile, "utf8"), accumulator, logFile);
    }
    return finalizeLoopLogAnalysis(accumulator);
  } catch (error) {
    return unreadableLoopLogAnalysis(error);
  }
}

function analyzeLoopLogText(content: string): LoopLogAnalysis {
  const accumulator = createLoopLogAccumulator();
  accumulateLoopLogText(content, accumulator);
  return finalizeLoopLogAnalysis(accumulator);
}

function createLoopLogAccumulator(): LoopLogAccumulator {
  return {
    analysis: emptyLoopLogAnalysis(),
    oversizedTopicCounts: new Map<string, number>(),
    blockReasonCounts: new Map<string, number>(),
    blockedSourceCounts: new Map<string, number>(),
    finishDecisionCounts: new Map<string, number>(),
    assistantDecisionCounts: new Map<string, number>(),
    promptSentCounts: new Map<string, number>(),
    sourcePromptSentCounts: new Map<string, number>(),
    sourceIterationResultCounts: new Map<string, number>(),
    postmortemCauseCounts: new Map<string, number>(),
    nextSafeActionCounts: new Map<string, number>(),
    finalMarkerRecoverySourceCounts: new Map<string, number>(),
    finalMarkerRecoveryReasonCounts: new Map<string, number>(),
    finalMarkerRecoveryBlockSourceCounts: new Map<string, number>(),
    finalMarkerRecoveryBlockReasonCounts: new Map<string, number>(),
    selfImprovementSourceCounts: new Map<string, number>(),
    selfImprovementReasonCounts: new Map<string, number>(),
    selfImprovementActionCounts: new Map<string, number>(),
    commitWithoutPushSourceCounts: new Map<string, number>(),
    pushStatusCounts: new Map<string, number>(),
    reportSummaryCounts: new Map<string, number>(),
    reportNextStepCounts: new Map<string, number>(),
    ciRedSourceCounts: new Map<string, number>(),
    ciGateMissingSourceCounts: new Map<string, number>(),
    ciGateMissingReasonCounts: new Map<string, number>(),
    emptyProviderSourceCounts: new Map<string, number>(),
    emptyProviderReasonCounts: new Map<string, number>(),
    queuedIterationSourceCounts: new Map<string, number>(),
    queuedIterationReasonCounts: new Map<string, number>(),
    providerErrorSourceCounts: new Map<string, number>(),
    providerErrorCodeCounts: new Map<string, number>(),
    providerErrorCategoryCounts: new Map<string, number>(),
    compactionSourceCounts: new Map<string, number>(),
    compactionFailureReasonCounts: new Map<string, number>(),
    markerRecoveryKeys: new Set<string>(),
    markerRecoverySucceededKeys: new Set<string>(),
    markerRecoveryBlockedKeys: new Set<string>(),
    startedRunIds: new Set<string>(),
    terminalRunIds: new Set<string>(),
    sourceStartedRunIds: new Map<string, Set<string>>(),
    sourceTerminalRunIds: new Map<string, Set<string>>(),
    legacyStartsBySource: new Map<string, number>(),
    legacyFinishedBySource: new Map<string, number>(),
    legacyBlockedBySource: new Map<string, number>(),
    legacyLoopStarts: 0,
    legacyFinishedLoops: 0,
    legacyBlockedLoops: 0,
    legacyMarkerRecoveryBlocks: 0,
  };
}

function accumulateLoopLogText(content: string, accumulator: LoopLogAccumulator, sourceKey?: string) {
  const { analysis, oversizedTopicCounts, blockReasonCounts, blockedSourceCounts, finishDecisionCounts, assistantDecisionCounts, promptSentCounts, sourcePromptSentCounts, sourceIterationResultCounts, postmortemCauseCounts, nextSafeActionCounts, finalMarkerRecoverySourceCounts, finalMarkerRecoveryReasonCounts, finalMarkerRecoveryBlockSourceCounts, finalMarkerRecoveryBlockReasonCounts, selfImprovementSourceCounts, selfImprovementReasonCounts, selfImprovementActionCounts, commitWithoutPushSourceCounts, pushStatusCounts, reportSummaryCounts, reportNextStepCounts, ciRedSourceCounts, ciGateMissingSourceCounts, ciGateMissingReasonCounts, emptyProviderSourceCounts, emptyProviderReasonCounts, queuedIterationSourceCounts, queuedIterationReasonCounts, providerErrorSourceCounts, providerErrorCodeCounts, providerErrorCategoryCounts, compactionSourceCounts, compactionFailureReasonCounts, markerRecoveryKeys, markerRecoverySucceededKeys, markerRecoveryBlockedKeys, startedRunIds, terminalRunIds, sourceStartedRunIds, sourceTerminalRunIds, legacyStartsBySource, legacyFinishedBySource, legacyBlockedBySource } = accumulator;
  const lines = content.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const record = parseLogRecord(line);
    if (!record) {
      analysis.invalidRecords++;
      continue;
    }
    analysis.records++;
    const event = recordEvent(record) || "";
    const runId = recordRunId(record);
    if (event === "iteration_result") {
      analysis.iterationResultRecords++;
      if (sourceKey) incrementCount(sourceIterationResultCounts, sourceKey);
      if (recordValidationEvidence(record).length === 0) analysis.iterationResultWithoutValidationRecords++;
    }
    if (event === "iteration_prompt_sent") {
      analysis.iterationPromptSentRecords++;
      if (sourceKey) incrementCount(sourcePromptSentCounts, sourceKey);
      incrementCount(promptSentCounts, promptSentGroupKey(record, sourceKey));
    }
    if (event === "assistant_decision") {
      analysis.assistantDecisionRecords++;
      const decision = recordDecision(record, event) || "<missing decision>";
      const count = incrementCount(assistantDecisionCounts, decision);
      if (count > analysis.topAssistantDecisionCount) {
        analysis.topAssistantDecision = decision;
        analysis.topAssistantDecisionCount = count;
      }
    }
    const recoveryKey = markerRecoveryKey(record, runId);
    if (event === "missing_final_marker_recovery_requested") {
      analysis.finalMarkerRecoveryRequests++;
      if (sourceKey) {
        const sourceCount = incrementCount(finalMarkerRecoverySourceCounts, sourceKey);
        if (sourceCount > analysis.topFinalMarkerRecoverySourceCount) {
          analysis.topFinalMarkerRecoverySource = sourceKey;
          analysis.topFinalMarkerRecoverySourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const reasonCount = incrementCount(finalMarkerRecoveryReasonCounts, reason);
      if (reasonCount > analysis.topFinalMarkerRecoveryReasonCount) {
        analysis.topFinalMarkerRecoveryReason = reason;
        analysis.topFinalMarkerRecoveryReasonCount = reasonCount;
      }
      if (recoveryKey) markerRecoveryKeys.add(recoveryKey);
    }
    if ((event === "iteration_result" || event === "loop_finished") && recoveryKey && markerRecoveryKeys.has(recoveryKey)) {
      markerRecoverySucceededKeys.add(recoveryKey);
    }
    if (event === "loop_started") {
      analysis.loopsStarted++;
      if (runId) {
        startedRunIds.add(runId);
        if (sourceKey) ensureSet(sourceStartedRunIds, sourceKey).add(runId);
      } else {
        accumulator.legacyLoopStarts++;
        if (sourceKey) incrementCount(legacyStartsBySource, sourceKey);
      }
    }
    if (event === "loop_finished") {
      analysis.finishedLoops++;
      if (recordValidationEvidence(record).length === 0) analysis.finishedWithoutValidationRecords++;
      if (!recordHasDeliveryEvidence(record)) analysis.finishedWithoutDeliveryRecords++;
      if (runId) {
        terminalRunIds.add(runId);
        if (sourceKey) ensureSet(sourceTerminalRunIds, sourceKey).add(runId);
      } else {
        accumulator.legacyFinishedLoops++;
        if (sourceKey) incrementCount(legacyFinishedBySource, sourceKey);
      }
      const decision = recordDecision(record, event) || "<missing decision>";
      const count = incrementCount(finishDecisionCounts, decision);
      if (count > analysis.topFinishDecisionCount) {
        analysis.topFinishDecision = decision;
        analysis.topFinishDecisionCount = count;
      }
    }
    if (event === "loop_blocked") {
      analysis.blockedLoops++;
      if (runId) {
        terminalRunIds.add(runId);
        if (sourceKey) ensureSet(sourceTerminalRunIds, sourceKey).add(runId);
      } else {
        accumulator.legacyBlockedLoops++;
        if (sourceKey) incrementCount(legacyBlockedBySource, sourceKey);
      }
      const rawReason = recordReason(record, event);
      const reason = rawReason || "<missing reason>";
      if (recoveryKey && markerRecoveryKeys.has(recoveryKey)) {
        const isFirstRecoveryBlock = !markerRecoveryBlockedKeys.has(recoveryKey);
        markerRecoveryBlockedKeys.add(recoveryKey);
        if (isFirstRecoveryBlock) {
          if (sourceKey) {
            const sourceCount = incrementCount(finalMarkerRecoveryBlockSourceCounts, sourceKey);
            if (sourceCount > analysis.topFinalMarkerRecoveryBlockSourceCount) {
              analysis.topFinalMarkerRecoveryBlockSource = sourceKey;
              analysis.topFinalMarkerRecoveryBlockSourceCount = sourceCount;
            }
          }
          const recoveryBlockReasonCount = incrementCount(finalMarkerRecoveryBlockReasonCounts, reason);
          if (recoveryBlockReasonCount > analysis.topFinalMarkerRecoveryBlockReasonCount) {
            analysis.topFinalMarkerRecoveryBlockReason = reason;
            analysis.topFinalMarkerRecoveryBlockReasonCount = recoveryBlockReasonCount;
          }
        }
      } else if (!recoveryKey && isMissingFinalMarkerReason(rawReason)) {
        accumulator.legacyMarkerRecoveryBlocks++;
        if (sourceKey) {
          const sourceCount = incrementCount(finalMarkerRecoveryBlockSourceCounts, sourceKey);
          if (sourceCount > analysis.topFinalMarkerRecoveryBlockSourceCount) {
            analysis.topFinalMarkerRecoveryBlockSource = sourceKey;
            analysis.topFinalMarkerRecoveryBlockSourceCount = sourceCount;
          }
        }
        const recoveryBlockReasonCount = incrementCount(finalMarkerRecoveryBlockReasonCounts, reason);
        if (recoveryBlockReasonCount > analysis.topFinalMarkerRecoveryBlockReasonCount) {
          analysis.topFinalMarkerRecoveryBlockReason = reason;
          analysis.topFinalMarkerRecoveryBlockReasonCount = recoveryBlockReasonCount;
        }
      }
      const count = incrementCount(blockReasonCounts, reason);
      if (count > analysis.topBlockReasonCount) {
        analysis.topBlockReason = reason;
        analysis.topBlockReasonCount = count;
      }
      if (sourceKey) {
        const sourceCount = incrementCount(blockedSourceCounts, sourceKey);
        if (sourceCount > analysis.topBlockedSourceCount) {
          analysis.topBlockedSource = sourceKey;
          analysis.topBlockedSourceCount = sourceCount;
        }
      }
    }
    if (event === "loop_postmortem") {
      analysis.postmortems++;
      const likelyCause = stringOrUndefined(record.likelyCause) || "<missing likelyCause>";
      const causeCount = incrementCount(postmortemCauseCounts, likelyCause);
      if (causeCount > analysis.topPostmortemCauseCount) {
        analysis.topPostmortemCause = likelyCause;
        analysis.topPostmortemCauseCount = causeCount;
      }
      const nextSafeAction = stringOrUndefined(record.nextSafeAction);
      if (nextSafeAction) {
        const actionCount = incrementCount(nextSafeActionCounts, nextSafeAction);
        if (actionCount > analysis.topNextSafeActionCount) {
          analysis.topNextSafeAction = nextSafeAction;
          analysis.topNextSafeActionCount = actionCount;
        }
      }
    }
    if (event === "self_improvement_queued") {
      analysis.selfImprovementQueuedRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(selfImprovementSourceCounts, sourceKey);
        if (sourceCount > analysis.topSelfImprovementSourceCount) {
          analysis.topSelfImprovementSource = sourceKey;
          analysis.topSelfImprovementSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const reasonCount = incrementCount(selfImprovementReasonCounts, reason);
      if (reasonCount > analysis.topSelfImprovementReasonCount) {
        analysis.topSelfImprovementReason = reason;
        analysis.topSelfImprovementReasonCount = reasonCount;
      }
      const action = recordSelfImprovementAction(record);
      if (action) {
        const actionCount = incrementCount(selfImprovementActionCounts, action);
        if (actionCount > analysis.topSelfImprovementActionCount) {
          analysis.topSelfImprovementAction = action;
          analysis.topSelfImprovementActionCount = actionCount;
        }
      }
    }
    const hasChangedFiles = recordChangedFiles(record).length > 0;
    const hasValidationEvidence = recordValidationEvidence(record).length > 0;
    const hasCommitEvidence = Boolean(recordCommitHash(record));
    const reportSummary = recordReportSummary(record);
    const reportNextSteps = recordReportNextSteps(record);
    const pushStatus = recordPushStatus(record);
    if (hasChangedFiles || hasValidationEvidence || hasCommitEvidence || reportSummary || reportNextSteps.length > 0 || pushStatus) analysis.deliveryEvidenceRecords++;
    if (hasChangedFiles) analysis.changedFileEvidenceRecords++;
    if (hasValidationEvidence) analysis.validationEvidenceRecords++;
    if (hasCommitEvidence) analysis.commitEvidenceRecords++;
    if (reportSummary) {
      analysis.reportSummaryRecords++;
      const count = incrementCount(reportSummaryCounts, reportSummary);
      if (count > analysis.topReportSummaryCount) {
        analysis.topReportSummary = reportSummary;
        analysis.topReportSummaryCount = count;
      }
    }
    for (const nextStep of reportNextSteps) {
      analysis.reportNextStepItems++;
      const count = incrementCount(reportNextStepCounts, nextStep);
      if (count > analysis.topReportNextStepCount) {
        analysis.topReportNextStep = nextStep;
        analysis.topReportNextStepCount = count;
      }
    }
    if (hasCommitEvidence && !pushStatus) {
      analysis.commitWithoutPushRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(commitWithoutPushSourceCounts, sourceKey);
        if (sourceCount > analysis.topCommitWithoutPushSourceCount) {
          analysis.topCommitWithoutPushSource = sourceKey;
          analysis.topCommitWithoutPushSourceCount = sourceCount;
        }
      }
    }
    if (pushStatus) {
      analysis.pushEvidenceRecords++;
      const count = incrementCount(pushStatusCounts, pushStatus);
      if (count > analysis.topPushStatusCount) {
        analysis.topPushStatus = pushStatus;
        analysis.topPushStatusCount = count;
      }
    }
    const ciGreen = recordCiGreen(record, event);
    if (ciGreen === true) analysis.ciGreenRecords++;
    if (ciGreen === false) {
      analysis.ciRedRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(ciRedSourceCounts, sourceKey);
        if (sourceCount > analysis.topCiRedSourceCount) {
          analysis.topCiRedSource = sourceKey;
          analysis.topCiRedSourceCount = sourceCount;
        }
      }
    }
    if (event === "ci_gate_missing") {
      analysis.ciGateMissingRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(ciGateMissingSourceCounts, sourceKey);
        if (sourceCount > analysis.topCiGateMissingSourceCount) {
          analysis.topCiGateMissingSource = sourceKey;
          analysis.topCiGateMissingSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const count = incrementCount(ciGateMissingReasonCounts, reason);
      if (count > analysis.topCiGateMissingReasonCount) {
        analysis.topCiGateMissingReason = reason;
        analysis.topCiGateMissingReasonCount = count;
      }
    }
    if (event === "empty_agent_response_waiting_for_compaction" || event === "empty_provider_response_retry_sent") {
      analysis.emptyProviderResponses++;
      if (sourceKey) {
        const sourceCount = incrementCount(emptyProviderSourceCounts, sourceKey);
        if (sourceCount > analysis.topEmptyProviderSourceCount) {
          analysis.topEmptyProviderSource = sourceKey;
          analysis.topEmptyProviderSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const count = incrementCount(emptyProviderReasonCounts, reason);
      if (count > analysis.topEmptyProviderReasonCount) {
        analysis.topEmptyProviderReason = reason;
        analysis.topEmptyProviderReasonCount = count;
      }
    }
    if (event === "empty_provider_response_retry_sent") analysis.emptyProviderRetryRecords++;
    if (isQueuedIterationEvent(event)) {
      analysis.queuedIterationRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(queuedIterationSourceCounts, sourceKey);
        if (sourceCount > analysis.topQueuedIterationSourceCount) {
          analysis.topQueuedIterationSource = sourceKey;
          analysis.topQueuedIterationSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || event;
      const count = incrementCount(queuedIterationReasonCounts, reason);
      if (count > analysis.topQueuedIterationReasonCount) {
        analysis.topQueuedIterationReason = reason;
        analysis.topQueuedIterationReasonCount = count;
      }
    }
    if (recordHasProviderError(record, event)) {
      analysis.providerErrorRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(providerErrorSourceCounts, sourceKey);
        if (sourceCount > analysis.topProviderErrorSourceCount) {
          analysis.topProviderErrorSource = sourceKey;
          analysis.topProviderErrorSourceCount = sourceCount;
        }
      }
      const code = recordProviderErrorCode(record) || "<missing code>";
      const count = incrementCount(providerErrorCodeCounts, code);
      if (count > analysis.topProviderErrorCodeCount) {
        analysis.topProviderErrorCode = code;
        analysis.topProviderErrorCodeCount = count;
      }
      const category = recordProviderErrorCategory(record, event, code);
      const categoryCount = incrementCount(providerErrorCategoryCounts, category);
      if (categoryCount > analysis.topProviderErrorCategoryCount) {
        analysis.topProviderErrorCategory = category;
        analysis.topProviderErrorCategoryCount = categoryCount;
      }
    }
    if (recordHasContextOverflowProviderError(record, event)) analysis.contextOverflowResponses++;
    if (event.startsWith("compaction_")) {
      analysis.compactionEvents++;
      if (sourceKey) {
        const sourceCount = incrementCount(compactionSourceCounts, sourceKey);
        if (sourceCount > analysis.topCompactionSourceCount) {
          analysis.topCompactionSource = sourceKey;
          analysis.topCompactionSourceCount = sourceCount;
        }
      }
    }
    if (isCompactionResumeEvent(event)) analysis.compactionResumeRecords++;
    if (isCompactionFailureEvent(event)) {
      analysis.compactionFailureRecords++;
      const reason = recordReason(record, event) || "<missing reason>";
      const count = incrementCount(compactionFailureReasonCounts, reason);
      if (count > analysis.topCompactionFailureReasonCount) {
        analysis.topCompactionFailureReason = reason;
        analysis.topCompactionFailureReasonCount = count;
      }
    }
    if (event === "user_steering") {
      analysis.userSteeringRecords++;
      analysis.maxUserSteeringLength = Math.max(analysis.maxUserSteeringLength, recordUserSteeringLength(record));
    }
    if (record.topicKind === "provider-noise") analysis.providerNoiseTopicRecords++;
    if (record.topicSanitized === true) analysis.sanitizedTopicRecords++;
    if (record.topicTruncated === true) analysis.truncatedTopics++;
    const topicLength = recordTopicLength(record);
    if (topicLength > LOG_TOPIC_MAX) {
      analysis.oversizedTopicRecords++;
      const key = stringOrUndefined(record.topicHash) || (typeof record.topic === "string" ? record.topic : `<missing-topic:${topicLength}>`);
      const count = incrementCount(oversizedTopicCounts, key);
      analysis.mostRepeatedOversizedTopicRecords = Math.max(analysis.mostRepeatedOversizedTopicRecords, count);
    }
    analysis.maxTopicLength = Math.max(analysis.maxTopicLength, topicLength);
  }
}

function isQueuedIterationEvent(event: string): boolean {
  return event === "iteration_queued" || event === "iteration_prompt_queued" || event === "compaction_continue_queued_iteration" || event === "compaction_resume_queued";
}

function isCompactionResumeEvent(event: string): boolean {
  return event === "compaction_continue_queued_iteration" || event === "compaction_resume_queued" || event === "compaction_resume_sent";
}

function isCompactionFailureEvent(event: string): boolean {
  return event.startsWith("compaction_") && event.includes("failed");
}

function recordUserSteeringLength(record: Record<string, unknown>): number {
  const text = stringOrUndefined(record.reason) || stringOrUndefined(record.text) || stringOrUndefined(record.steering) || "";
  return singleLineText(text).length;
}

function promptSentGroupKey(record: Record<string, unknown>, sourceKey?: string): string {
  const source = sourceKey || stringOrUndefined(record.logPath) || "<unknown-log>";
  const runId = recordRunId(record) || "<missing-run>";
  const adapter = stringOrUndefined(record.adapterName) || stringOrUndefined(record.adapter) || "<missing-adapter>";
  const iteration = recordScalarKey(record.iteration);
  const maxIterations = recordScalarKey(record.maxIterations);
  const topic = stringOrUndefined(record.topicHash) || (typeof record.topic === "string" ? hashText(singleLineText(record.topic)) : "<missing-topic>");
  return [source, runId, adapter, iteration, maxIterations, topic].join("|");
}

function recordScalarKey(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.floor(value));
  if (typeof value === "string" && value.trim()) return value.trim();
  return "<missing>";
}

function hasPromptResultImbalance(analysis: LoopLogAnalysis): boolean {
  return analysis.iterationPromptSentRecords !== analysis.iterationResultRecords;
}

function promptResultImbalanceText(analysis: LoopLogAnalysis): string {
  return promptResultImbalanceDeltaText(analysis.iterationPromptSentRecords - analysis.iterationResultRecords);
}

function promptResultImbalanceDeltaText(delta: number): string {
  if (delta === 0) return "0";
  if (delta > 0) return `${delta} more ${delta === 1 ? "prompt" : "prompts"} than results`;
  const resultDelta = Math.abs(delta);
  return `${resultDelta} more ${resultDelta === 1 ? "result" : "results"} than prompts`;
}

function finalizeLoopLogAnalysis(accumulator: LoopLogAccumulator): LoopLogAnalysis {
  const analysis = accumulator.analysis;
  for (const count of accumulator.promptSentCounts.values()) {
    if (count > 1) {
      analysis.duplicatePromptSentGroups++;
      analysis.duplicatePromptSentExtraRecords += count - 1;
    }
  }
  const promptResultSources = new Set<string>([
    ...accumulator.sourcePromptSentCounts.keys(),
    ...accumulator.sourceIterationResultCounts.keys(),
  ]);
  for (const source of promptResultSources) {
    const delta = (accumulator.sourcePromptSentCounts.get(source) || 0) - (accumulator.sourceIterationResultCounts.get(source) || 0);
    if (delta !== 0 && Math.abs(delta) > Math.abs(analysis.topPromptResultImbalanceSourceDelta)) {
      analysis.topPromptResultImbalanceSource = source;
      analysis.topPromptResultImbalanceSourceDelta = delta;
    }
  }
  const unresolvedRunIds = [...accumulator.startedRunIds].filter((runId) => !accumulator.terminalRunIds.has(runId)).length;
  const unresolvedLegacyStarts = Math.max(0, accumulator.legacyLoopStarts - accumulator.legacyFinishedLoops - accumulator.legacyBlockedLoops);
  analysis.unresolvedLoopStarts = unresolvedRunIds + unresolvedLegacyStarts;
  for (const [source, started] of accumulator.sourceStartedRunIds.entries()) {
    const terminals = accumulator.sourceTerminalRunIds.get(source) || new Set<string>();
    updateTopUnresolvedSource(analysis, source, [...started].filter((runId) => !terminals.has(runId)).length);
  }
  for (const source of accumulator.legacyStartsBySource.keys()) {
    const unresolved = Math.max(0, (accumulator.legacyStartsBySource.get(source) || 0) - (accumulator.legacyFinishedBySource.get(source) || 0) - (accumulator.legacyBlockedBySource.get(source) || 0));
    updateTopUnresolvedSource(analysis, source, unresolved);
  }
  analysis.finalMarkerRecoverySuccesses = [...accumulator.markerRecoverySucceededKeys].filter((key) => !accumulator.markerRecoveryBlockedKeys.has(key)).length;
  analysis.finalMarkerRecoveryBlocks = accumulator.markerRecoveryBlockedKeys.size + accumulator.legacyMarkerRecoveryBlocks;
  analysis.recommendations = loopLogRecommendations(analysis);
  return analysis;
}

function unreadableLoopLogAnalysis(error: unknown): LoopLogAnalysis {
  return {
    ...emptyLoopLogAnalysis(),
    readError: error instanceof Error ? error.message : String(error),
    recommendations: ["Log unavailable: check the configured log path or run a loop first."],
  };
}

function emptyLoopLogAnalysis(): LoopLogAnalysis {
  return {
    logFiles: 0,
    records: 0,
    invalidRecords: 0,
    loopsStarted: 0,
    finishedLoops: 0,
    finishedWithoutValidationRecords: 0,
    finishedWithoutDeliveryRecords: 0,
    iterationResultRecords: 0,
    iterationResultWithoutValidationRecords: 0,
    iterationPromptSentRecords: 0,
    topPromptResultImbalanceSourceDelta: 0,
    duplicatePromptSentGroups: 0,
    duplicatePromptSentExtraRecords: 0,
    assistantDecisionRecords: 0,
    topAssistantDecisionCount: 0,
    topFinishDecisionCount: 0,
    blockedLoops: 0,
    topBlockReasonCount: 0,
    topBlockedSourceCount: 0,
    postmortems: 0,
    selfImprovementQueuedRecords: 0,
    topSelfImprovementSourceCount: 0,
    topSelfImprovementReasonCount: 0,
    topSelfImprovementActionCount: 0,
    topPostmortemCauseCount: 0,
    topNextSafeActionCount: 0,
    finalMarkerRecoveryRequests: 0,
    topFinalMarkerRecoverySourceCount: 0,
    topFinalMarkerRecoveryReasonCount: 0,
    finalMarkerRecoverySuccesses: 0,
    finalMarkerRecoveryBlocks: 0,
    topFinalMarkerRecoveryBlockSourceCount: 0,
    topFinalMarkerRecoveryBlockReasonCount: 0,
    deliveryEvidenceRecords: 0,
    changedFileEvidenceRecords: 0,
    validationEvidenceRecords: 0,
    commitEvidenceRecords: 0,
    reportSummaryRecords: 0,
    reportNextStepItems: 0,
    topReportSummaryCount: 0,
    topReportNextStepCount: 0,
    pushEvidenceRecords: 0,
    commitWithoutPushRecords: 0,
    topCommitWithoutPushSourceCount: 0,
    topPushStatusCount: 0,
    ciGreenRecords: 0,
    ciRedRecords: 0,
    topCiRedSourceCount: 0,
    ciGateMissingRecords: 0,
    topCiGateMissingSourceCount: 0,
    topCiGateMissingReasonCount: 0,
    unresolvedLoopStarts: 0,
    topUnresolvedSourceCount: 0,
    emptyProviderResponses: 0,
    emptyProviderRetryRecords: 0,
    topEmptyProviderSourceCount: 0,
    topEmptyProviderReasonCount: 0,
    queuedIterationRecords: 0,
    topQueuedIterationSourceCount: 0,
    topQueuedIterationReasonCount: 0,
    providerErrorRecords: 0,
    topProviderErrorSourceCount: 0,
    topProviderErrorCodeCount: 0,
    topProviderErrorCategoryCount: 0,
    contextOverflowResponses: 0,
    compactionEvents: 0,
    topCompactionSourceCount: 0,
    compactionResumeRecords: 0,
    compactionFailureRecords: 0,
    topCompactionFailureReasonCount: 0,
    userSteeringRecords: 0,
    maxUserSteeringLength: 0,
    providerNoiseTopicRecords: 0,
    sanitizedTopicRecords: 0,
    truncatedTopics: 0,
    oversizedTopicRecords: 0,
    mostRepeatedOversizedTopicRecords: 0,
    maxTopicLength: 0,
    recommendations: [],
  };
}

function discoverLoopLogFiles(dirPath: string): string[] {
  const logFiles: string[] = [];
  const skipDirs = new Set([".git", "node_modules"]);
  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(path.join(currentDir, entry.name));
        continue;
      }
      if (entry.isFile() && entry.name === "logs.jsonl") logFiles.push(path.join(currentDir, entry.name));
    }
  };
  walk(dirPath);
  return logFiles.sort();
}

function markerRecoveryKey(record: Record<string, unknown>, runId: string | undefined): string | undefined {
  if (!runId) return undefined;
  const iteration = typeof record.iteration === "number" && Number.isFinite(record.iteration) ? Math.floor(record.iteration) : "unknown";
  return `${runId}:${iteration}`;
}

function isMissingFinalMarkerReason(reason: string | undefined): boolean {
  return Boolean(reason && /missing(?:_|\s|-)*(?:final(?:_|\s|-)*)?(?:marker|DEV_LOOP_DECISION|assistant_decision)/i.test(reason));
}

function recordTopicLength(record: Record<string, unknown>): number {
  if (typeof record.topicLength === "number" && Number.isFinite(record.topicLength)) return record.topicLength;
  return typeof record.topic === "string" ? singleLineText(record.topic).length : 0;
}

function recordHasDeliveryEvidence(record: Record<string, unknown>): boolean {
  return recordChangedFiles(record).length > 0
    || recordValidationEvidence(record).length > 0
    || Boolean(recordCommitHash(record))
    || Boolean(recordReportSummary(record))
    || recordReportNextSteps(record).length > 0
    || Boolean(recordPushStatus(record));
}

function recordChangedFiles(record: Record<string, unknown>): string[] {
  return stringArrayOrUndefined(record.changedFiles) || stringArrayOrUndefined(record.files) || [];
}

function recordValidationEvidence(record: Record<string, unknown>): string[] {
  return stringArrayOrUndefined(record.validationCommands)
    || stringArrayOrUndefined(record.validation)
    || stringArrayOrUndefined(record.validations)
    || objectKeys(record.validation)
    || objectKeys(record.validations)
    || [];
}

function recordCommitHash(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.commitHash) || stringOrUndefined(record.commit);
}

function recordReportSummary(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.summary) || stringOrUndefined(record.whatChanged);
}

function recordReportNextSteps(record: Record<string, unknown>): string[] {
  return stringArrayOrSingleString(record.nextSteps)
    || stringArrayOrSingleString(record.possibleNextSteps)
    || stringArrayOrSingleString(record.nextStep)
    || stringArrayOrSingleString(record.nextActions)
    || [];
}

function recordPushStatus(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.pushStatus) || stringOrUndefined(record.pushed) || stringOrUndefined(record.push);
}

function recordCiGreen(record: Record<string, unknown>, event: string): boolean | undefined {
  const explicit = booleanOrUndefined(record.ciGreen) ?? booleanOrUndefined(record.ci_green);
  if (explicit !== undefined) return explicit;
  const text = stringOrUndefined(record.ciGreen) || stringOrUndefined(record.ci_green) || stringOrUndefined(record.ciGate) || stringOrUndefined(record.ci_gate);
  if (text && /^(yes|true|green|passed|pass|local_full_gate_passed)$/i.test(text)) return true;
  if (text && /^(no|false|red|failed|fail|missing|missing_CI_GREEN_yes)$/i.test(text)) return false;
  if (event === "ci_gate_missing") return false;
  return undefined;
}

function recordHasProviderError(record: Record<string, unknown>, event: string): boolean {
  return event === "provider_error" || event.endsWith("_provider_error") || record.providerError !== undefined || record.provider_error !== undefined;
}

function recordProviderErrorCode(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.code)
    || providerErrorCodeFromValue(record.error)
    || providerErrorCodeFromValue(record.providerError)
    || providerErrorCodeFromValue(record.provider_error)
    || (recordHasContextOverflowProviderError(record, "") ? "context_length_exceeded" : undefined);
}

function providerErrorCodeFromValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    if (isContextOverflowProviderError(value)) return "context_length_exceeded";
    return undefined;
  }
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return stringOrUndefined(record.code) || stringOrUndefined(record.type) || stringOrUndefined(record.status);
}

function recordProviderErrorCategory(record: Record<string, unknown>, event: string, code: string): string {
  const text = [
    event,
    code,
    stringOrUndefined(record.reason),
    stringOrUndefined(record.message),
    providerErrorTextFromValue(record.error),
    providerErrorTextFromValue(record.providerError),
    providerErrorTextFromValue(record.provider_error),
  ].filter(Boolean).join(" ");
  if (isContextOverflowProviderError(text)) return "context-overflow";
  if (/rate[_ -]?limit|too[_ -]?many[_ -]?requests|\b429\b/i.test(text)) return "rate-limit";
  if (/auth|unauthorized|forbidden|invalid[_ -]?api[_ -]?key|permission|\b401\b|\b403\b/i.test(text)) return "auth";
  if (/websocket|socket|network|timeout|timed?\s*out|connection|econn|stream/i.test(text)) return "transport";
  return "other";
}

function providerErrorTextFromValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  return Object.values(value as Record<string, unknown>)
    .map((child) => typeof child === "string" ? child : undefined)
    .filter(Boolean)
    .join(" ") || undefined;
}

function objectKeys(value: unknown): string[] | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const keys = Object.keys(value).filter(Boolean);
  return keys.length ? keys : undefined;
}

function incrementCount(counts: Map<string, number>, key: string): number {
  const count = (counts.get(key) || 0) + 1;
  counts.set(key, count);
  return count;
}

function ensureSet(map: Map<string, Set<string>>, key: string): Set<string> {
  const existing = map.get(key);
  if (existing) return existing;
  const created = new Set<string>();
  map.set(key, created);
  return created;
}

function updateTopUnresolvedSource(analysis: LoopLogAnalysis, source: string, count: number) {
  if (count > analysis.topUnresolvedSourceCount) {
    analysis.topUnresolvedSource = source;
    analysis.topUnresolvedSourceCount = count;
  }
}

function loopLogRecommendations(analysis: LoopLogAnalysis): string[] {
  const recommendations: string[] = [];
  if (analysis.maxTopicLength > PROMPT_OBJECTIVE_MAX) recommendations.push("Oversized topics: cap prompt and log objective text before repeating it in every event.");
  if (analysis.mostRepeatedOversizedTopicRecords > 1) recommendations.push("Repeated oversized topics: summarize copied objectives once instead of carrying the same paste through every event.");
  if (analysis.emptyProviderResponses > 0) recommendations.push("Empty provider responses: inspect the top empty-provider source, retry the same iteration, and prefer compaction before blocking.");
  if (analysis.emptyProviderRetryRecords > 0) recommendations.push("Empty provider retries: track whether retries resolved, escalated to compaction, or blocked the loop.");
  if (analysis.queuedIterationRecords > 0) recommendations.push("Queued iterations: inspect the top queued source/reason and verify compaction/resume hooks flush queued prompts without leaving runs waiting silently.");
  if (analysis.providerErrorRecords > 0) recommendations.push("Provider errors: inspect the top provider error source and group codes/categories so context, rate-limit, auth, and transport failures drive different recovery paths.");
  if (hasPromptResultImbalance(analysis)) recommendations.push("Prompt/result lifecycle: inspect the top imbalance source and reconcile iteration_prompt_sent and iteration_result counts so duplicate sends or duplicate final parsing are visible.");
  if (analysis.duplicatePromptSentGroups > 0) recommendations.push("Duplicate prompt sends: investigate repeated iteration_prompt_sent groups before trusting prompt/result lifecycle counts.");
  if (analysis.contextOverflowResponses > 0) recommendations.push("Context overflow: preserve loop state and resume after compaction.");
  if (analysis.unresolvedLoopStarts > 0) recommendations.push("Unresolved loop starts: inspect the top unresolved log source to see whether loops are still active or missing terminal loop_finished/loop_blocked records.");
  if (analysis.compactionFailureRecords > 0) recommendations.push("Compaction failures: inspect failure reasons and verify the loop either resumes safely or remains queued for manual recovery.");
  if (analysis.topCompactionSource) recommendations.push("Compaction source: inspect the top compaction log source before treating aggregate compaction pressure as evenly distributed.");
  if (analysis.userSteeringRecords > 0) recommendations.push("User steering: review steering records to distinguish intentional scope changes from accidental plain-text turns.");
  if (analysis.providerNoiseTopicRecords > 0) recommendations.push("Provider-noise topics: verify provider error text is sanitized out of repeated objectives while topic hashes preserve diagnostics.");
  if (analysis.compactionEvents > analysis.loopsStarted && analysis.loopsStarted > 0) recommendations.push("Compaction-heavy runs: summarize continuation state and reduce repeated prompt text.");
  if (analysis.postmortems > 0) recommendations.push("Loop postmortems: use likelyCause and nextSafeAction to resume or file follow-up fixes.");
  if (analysis.selfImprovementQueuedRecords > 0) recommendations.push("Self-improvement follow-ups: review the top queued source/reason/action after blocked custom-loop runs and promote repeatable policy into this package.");
  if (analysis.assistantDecisionRecords > 0) recommendations.push("Assistant decisions: compare custom-loop decisions with iteration results so missing decision handshakes do not hide completed work.");
  if (analysis.finalMarkerRecoveryRequests > 0) recommendations.push("Final-marker recovery: compare the top recovery source/reason with successes and blocks to see whether marker-only retries are resolving missing final reports.");
  if (analysis.finalMarkerRecoveryBlocks > 0) recommendations.push("Final-marker recovery blocks: inspect the top block source/reason and prefer DEV_LOOP_REPORT plus final markers so useful work is not lost to malformed endings.");
  if (analysis.ciGateMissingRecords > 0) recommendations.push("CI gate missing records: inspect the top CI-gate missing source and require explicit DEV_LOOP_VALIDATED or CI_GREEN evidence before queuing follow-up work.");
  if (analysis.commitWithoutPushRecords > 0) recommendations.push("Commit-without-push records: inspect the top commit-without-push source and record pushStatus when push delivery is expected, or use an explicit skipped push status.");
  if (analysis.ciRedRecords > 0) recommendations.push("CI gate failures: inspect the top CI-red source and require local validation evidence before continue or done decisions.");
  if (analysis.iterationResultWithoutValidationRecords > 0) recommendations.push("Iteration results without validation evidence: require validationCommands on every continue/done iteration result before scheduling follow-up work.");
  if (analysis.finishedWithoutDeliveryRecords > 0) recommendations.push("Finished loops without delivery evidence: include changed files, validation, commit, and push evidence on terminal done records.");
  if (analysis.finishedWithoutValidationRecords > 0) recommendations.push("Finished loops without validation evidence: include validationCommands in terminal done records or link the final report to recorded validation evidence.");
  if (analysis.finishedLoops > 0 && analysis.validationEvidenceRecords === 0) recommendations.push("Missing validation evidence: record validationCommands or validation arrays on terminal delivery records.");
  if (analysis.topBlockedSource) recommendations.push("Blocked log source: inspect the top blocked log source before treating aggregate blocker counts as evenly distributed.");
  if (analysis.blockedLoops > 0) recommendations.push("Blocked loops: inspect missing final markers and validation evidence.");
  if (analysis.invalidRecords > 0) recommendations.push("Invalid records: keep log writes JSONL-compatible for diagnostics.");
  return recommendations.length ? recommendations : ["No obvious loop health issues detected in this log."];
}

function writeLoopLogHtmlReport(analysis: LoopLogAnalysis, cwd: string, logPath: string): string {
  const tmpDir = process.env.TMPDIR || process.env.TEMP || "/tmp";
  fs.mkdirSync(tmpDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(tmpDir, `development-loop-health-${timestamp}.html`);
  fs.writeFileSync(reportPath, buildLoopLogHtmlReport(analysis, cwd, logPath), "utf8");
  return reportPath;
}

function buildLoopLogHtmlReport(analysis: LoopLogAnalysis, cwd: string, logPath: string): string {
  const source = analysis.logFiles > 1 ? `${relativeToCwd(cwd, logPath)} (${analysis.logFiles} log files)` : relativeToCwd(cwd, logPath);
  const metrics: Array<[string, string]> = [
    ["Records", `${analysis.records}${analysis.invalidRecords ? ` (${analysis.invalidRecords} invalid)` : ""}`],
    ["Loops started", String(analysis.loopsStarted)],
    ["Finished loops", String(analysis.finishedLoops)],
    ["Finished-without-validation records", String(analysis.finishedWithoutValidationRecords)],
    ["Finished-without-delivery records", String(analysis.finishedWithoutDeliveryRecords)],
    ["Iteration result records", String(analysis.iterationResultRecords)],
    ["Iteration-result-without-validation records", String(analysis.iterationResultWithoutValidationRecords)],
    ["Iteration prompt sent records", String(analysis.iterationPromptSentRecords)],
    ["Prompt/result imbalance", promptResultImbalanceText(analysis)],
    ["Duplicate prompt-sent groups", String(analysis.duplicatePromptSentGroups)],
    ["Duplicate prompt-sent extra records", String(analysis.duplicatePromptSentExtraRecords)],
    ["Assistant decision records", String(analysis.assistantDecisionRecords)],
    ["Blocked loops", String(analysis.blockedLoops)],
    ["Postmortems", String(analysis.postmortems)],
    ["Self-improvement queued records", String(analysis.selfImprovementQueuedRecords)],
    ["Final-marker recovery requests", String(analysis.finalMarkerRecoveryRequests)],
    ["Final-marker recovery successes", String(analysis.finalMarkerRecoverySuccesses)],
    ["Final-marker recovery blocks", String(analysis.finalMarkerRecoveryBlocks)],
    ["Delivery evidence records", String(analysis.deliveryEvidenceRecords)],
    ["Validation evidence records", String(analysis.validationEvidenceRecords)],
    ["Commit evidence records", String(analysis.commitEvidenceRecords)],
    ["Report summary records", String(analysis.reportSummaryRecords)],
    ["Report next-step items", String(analysis.reportNextStepItems)],
    ["Push evidence records", String(analysis.pushEvidenceRecords)],
    ["Commit-without-push records", String(analysis.commitWithoutPushRecords)],
    ["CI-green records", String(analysis.ciGreenRecords)],
    ["CI-red records", String(analysis.ciRedRecords)],
    ["CI-gate missing records", String(analysis.ciGateMissingRecords)],
    ["Unresolved loop starts", String(analysis.unresolvedLoopStarts)],
    ["Empty provider responses", String(analysis.emptyProviderResponses)],
    ["Empty provider retry records", String(analysis.emptyProviderRetryRecords)],
    ["Queued iteration records", String(analysis.queuedIterationRecords)],
    ["Provider error records", String(analysis.providerErrorRecords)],
    ["Context overflow responses", String(analysis.contextOverflowResponses)],
    ["Compaction events", String(analysis.compactionEvents)],
    ["Compaction resume records", String(analysis.compactionResumeRecords)],
    ["Compaction failure records", String(analysis.compactionFailureRecords)],
    ["User steering records", String(analysis.userSteeringRecords)],
    ["Max user steering length", String(analysis.maxUserSteeringLength)],
    ["Provider-noise topic records", String(analysis.providerNoiseTopicRecords)],
    ["Sanitized topic records", String(analysis.sanitizedTopicRecords)],
    ["Oversized topic records", String(analysis.oversizedTopicRecords)],
    ["Max topic length", String(analysis.maxTopicLength)],
  ];
  const metricCards = metrics.map(([label, value]) => `<section class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></section>`).join("\n");
  const recommendations = analysis.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
  const topFacts = [
    analysis.topFinishDecision ? ["Top finish decision", `${analysis.topFinishDecision} (${analysis.topFinishDecisionCount})`] : undefined,
    analysis.topAssistantDecision ? ["Top assistant decision", `${analysis.topAssistantDecision} (${analysis.topAssistantDecisionCount})`] : undefined,
    analysis.topBlockReason ? ["Top block reason", `${analysis.topBlockReason} (${analysis.topBlockReasonCount})`] : undefined,
    analysis.topBlockedSource ? ["Top blocked log source", `${relativeToCwd(cwd, analysis.topBlockedSource)} (${analysis.topBlockedSourceCount})`] : undefined,
    analysis.topPromptResultImbalanceSource ? ["Top prompt/result imbalance source", `${relativeToCwd(cwd, analysis.topPromptResultImbalanceSource)} (${promptResultImbalanceDeltaText(analysis.topPromptResultImbalanceSourceDelta)})`] : undefined,
    analysis.topPostmortemCause ? ["Top postmortem cause", `${analysis.topPostmortemCause} (${analysis.topPostmortemCauseCount})`] : undefined,
    analysis.topNextSafeAction ? ["Top next safe action", `${analysis.topNextSafeAction} (${analysis.topNextSafeActionCount})`] : undefined,
    analysis.topFinalMarkerRecoverySource ? ["Top final-marker recovery log source", `${relativeToCwd(cwd, analysis.topFinalMarkerRecoverySource)} (${analysis.topFinalMarkerRecoverySourceCount})`] : undefined,
    analysis.topFinalMarkerRecoveryReason ? ["Top final-marker recovery reason", `${analysis.topFinalMarkerRecoveryReason} (${analysis.topFinalMarkerRecoveryReasonCount})`] : undefined,
    analysis.topFinalMarkerRecoveryBlockSource ? ["Top final-marker recovery block log source", `${relativeToCwd(cwd, analysis.topFinalMarkerRecoveryBlockSource)} (${analysis.topFinalMarkerRecoveryBlockSourceCount})`] : undefined,
    analysis.topFinalMarkerRecoveryBlockReason ? ["Top final-marker recovery block reason", `${analysis.topFinalMarkerRecoveryBlockReason} (${analysis.topFinalMarkerRecoveryBlockReasonCount})`] : undefined,
    analysis.topCommitWithoutPushSource ? ["Top commit-without-push log source", `${relativeToCwd(cwd, analysis.topCommitWithoutPushSource)} (${analysis.topCommitWithoutPushSourceCount})`] : undefined,
    analysis.topReportSummary ? ["Top report summary", `${analysis.topReportSummary} (${analysis.topReportSummaryCount})`] : undefined,
    analysis.topReportNextStep ? ["Top report next step", `${analysis.topReportNextStep} (${analysis.topReportNextStepCount})`] : undefined,
    analysis.topSelfImprovementSource ? ["Top self-improvement log source", `${relativeToCwd(cwd, analysis.topSelfImprovementSource)} (${analysis.topSelfImprovementSourceCount})`] : undefined,
    analysis.topSelfImprovementReason ? ["Top self-improvement reason", `${analysis.topSelfImprovementReason} (${analysis.topSelfImprovementReasonCount})`] : undefined,
    analysis.topSelfImprovementAction ? ["Top self-improvement action", `${analysis.topSelfImprovementAction} (${analysis.topSelfImprovementActionCount})`] : undefined,
    analysis.topCiRedSource ? ["Top CI-red log source", `${relativeToCwd(cwd, analysis.topCiRedSource)} (${analysis.topCiRedSourceCount})`] : undefined,
    analysis.topCiGateMissingSource ? ["Top CI-gate missing log source", `${relativeToCwd(cwd, analysis.topCiGateMissingSource)} (${analysis.topCiGateMissingSourceCount})`] : undefined,
    analysis.topCiGateMissingReason ? ["Top CI-gate missing reason", `${analysis.topCiGateMissingReason} (${analysis.topCiGateMissingReasonCount})`] : undefined,
    analysis.topUnresolvedSource ? ["Top unresolved log source", `${relativeToCwd(cwd, analysis.topUnresolvedSource)} (${analysis.topUnresolvedSourceCount})`] : undefined,
    analysis.topEmptyProviderSource ? ["Top empty provider log source", `${relativeToCwd(cwd, analysis.topEmptyProviderSource)} (${analysis.topEmptyProviderSourceCount})`] : undefined,
    analysis.topEmptyProviderReason ? ["Top empty provider reason", `${analysis.topEmptyProviderReason} (${analysis.topEmptyProviderReasonCount})`] : undefined,
    analysis.topQueuedIterationSource ? ["Top queued iteration log source", `${relativeToCwd(cwd, analysis.topQueuedIterationSource)} (${analysis.topQueuedIterationSourceCount})`] : undefined,
    analysis.topQueuedIterationReason ? ["Top queued iteration reason", `${analysis.topQueuedIterationReason} (${analysis.topQueuedIterationReasonCount})`] : undefined,
    analysis.topProviderErrorSource ? ["Top provider error log source", `${relativeToCwd(cwd, analysis.topProviderErrorSource)} (${analysis.topProviderErrorSourceCount})`] : undefined,
    analysis.topProviderErrorCode ? ["Top provider error code", `${analysis.topProviderErrorCode} (${analysis.topProviderErrorCodeCount})`] : undefined,
    analysis.topProviderErrorCategory ? ["Top provider error category", `${analysis.topProviderErrorCategory} (${analysis.topProviderErrorCategoryCount})`] : undefined,
    analysis.topCompactionSource ? ["Top compaction log source", `${relativeToCwd(cwd, analysis.topCompactionSource)} (${analysis.topCompactionSourceCount})`] : undefined,
    analysis.topCompactionFailureReason ? ["Top compaction failure reason", `${analysis.topCompactionFailureReason} (${analysis.topCompactionFailureReasonCount})`] : undefined,
    analysis.topPushStatus ? ["Top push status", `${analysis.topPushStatus} (${analysis.topPushStatusCount})`] : undefined,
  ].filter((fact): fact is [string, string] => Boolean(fact));
  const factRows = topFacts.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Development Loop Health Report</title>
<style>
:root { color-scheme: light dark; --bg: #0f172a; --panel: #111827; --text: #e5e7eb; --muted: #94a3b8; --accent: #38bdf8; --warn: #fb7185; --ok: #34d399; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
main { max-width: 1100px; margin: 0 auto; padding: 2rem; }
header { margin-bottom: 1.5rem; }
h1 { margin: 0 0 .5rem; font-size: clamp(2rem, 5vw, 3.5rem); }
.source { color: var(--muted); word-break: break-all; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; }
.card { border: 1px solid rgba(148,163,184,.25); border-radius: 1rem; background: rgba(17,24,39,.78); padding: 1rem; box-shadow: 0 12px 30px rgba(0,0,0,.22); }
.card span { display: block; color: var(--muted); font-size: .85rem; }
.card strong { display: block; margin-top: .4rem; font-size: 1.6rem; color: var(--accent); }
.panel { margin-top: 1.5rem; border-radius: 1rem; background: rgba(17,24,39,.78); padding: 1.25rem; border: 1px solid rgba(148,163,184,.25); }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: .65rem; border-bottom: 1px solid rgba(148,163,184,.18); }
th { color: var(--muted); width: 16rem; }
li { margin: .45rem 0; }
.badge { display: inline-block; border-radius: 999px; padding: .25rem .65rem; background: rgba(56,189,248,.15); color: var(--accent); }
</style>
</head>
<body>
<main>
<header>
<p class="badge">Loop health</p>
<h1>Development Loop Health Report</h1>
<p class="source">Source: ${escapeHtml(source)}</p>
</header>
<section class="grid">${metricCards}</section>
<section class="panel">
<h2>Top signals</h2>
${factRows ? `<table>${factRows}</table>` : `<p>No top signal counts were present.</p>`}
</section>
<section class="panel">
<h2>Recommendations</h2>
<ul>${recommendations}</ul>
</section>
</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] || char));
}

function formatLoopLogAnalysis(analysis: LoopLogAnalysis, cwd: string, logPath: string): string {
  const source = relativeToCwd(cwd, logPath);
  const sourceLabel = analysis.logFiles > 1 ? `${source} (${analysis.logFiles} log files)` : source;
  return [
    `Development loop log analysis: ${sourceLabel}`,
    analysis.readError ? `Error: ${analysis.readError}` : undefined,
    `Records: ${analysis.records}${analysis.invalidRecords ? ` (${analysis.invalidRecords} invalid)` : ""}`,
    `Loops started: ${analysis.loopsStarted}`,
    `Finished loops: ${analysis.finishedLoops}`,
    `Finished-without-validation records: ${analysis.finishedWithoutValidationRecords}`,
    `Finished-without-delivery records: ${analysis.finishedWithoutDeliveryRecords}`,
    `Iteration result records: ${analysis.iterationResultRecords}`,
    `Iteration-result-without-validation records: ${analysis.iterationResultWithoutValidationRecords}`,
    `Iteration prompt sent records: ${analysis.iterationPromptSentRecords}`,
    `Prompt/result imbalance: ${promptResultImbalanceText(analysis)}`,
    analysis.topPromptResultImbalanceSource ? `Top prompt/result imbalance source: ${relativeToCwd(cwd, analysis.topPromptResultImbalanceSource)} (${promptResultImbalanceDeltaText(analysis.topPromptResultImbalanceSourceDelta)})` : undefined,
    `Duplicate prompt-sent groups: ${analysis.duplicatePromptSentGroups}`,
    `Duplicate prompt-sent extra records: ${analysis.duplicatePromptSentExtraRecords}`,
    `Assistant decision records: ${analysis.assistantDecisionRecords}`,
    analysis.topAssistantDecision ? `Top assistant decision: ${analysis.topAssistantDecision} (${analysis.topAssistantDecisionCount} ${analysis.topAssistantDecisionCount === 1 ? "record" : "records"})` : undefined,
    analysis.topFinishDecision ? `Top finish decision: ${analysis.topFinishDecision} (${analysis.topFinishDecisionCount} ${analysis.topFinishDecisionCount === 1 ? "record" : "records"})` : undefined,
    `Blocked loops: ${analysis.blockedLoops}`,
    analysis.topBlockReason ? `Top block reason: ${analysis.topBlockReason} (${analysis.topBlockReasonCount} ${analysis.topBlockReasonCount === 1 ? "record" : "records"})` : undefined,
    analysis.topBlockedSource ? `Top blocked log source: ${relativeToCwd(cwd, analysis.topBlockedSource)} (${analysis.topBlockedSourceCount} ${analysis.topBlockedSourceCount === 1 ? "record" : "records"})` : undefined,
    `Postmortems: ${analysis.postmortems}`,
    `Self-improvement queued records: ${analysis.selfImprovementQueuedRecords}`,
    analysis.topSelfImprovementSource ? `Top self-improvement log source: ${relativeToCwd(cwd, analysis.topSelfImprovementSource)} (${analysis.topSelfImprovementSourceCount} ${analysis.topSelfImprovementSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topSelfImprovementReason ? `Top self-improvement reason: ${analysis.topSelfImprovementReason} (${analysis.topSelfImprovementReasonCount} ${analysis.topSelfImprovementReasonCount === 1 ? "record" : "records"})` : undefined,
    analysis.topSelfImprovementAction ? `Top self-improvement action: ${analysis.topSelfImprovementAction} (${analysis.topSelfImprovementActionCount} ${analysis.topSelfImprovementActionCount === 1 ? "record" : "records"})` : undefined,
    analysis.topPostmortemCause ? `Top postmortem cause: ${analysis.topPostmortemCause} (${analysis.topPostmortemCauseCount} ${analysis.topPostmortemCauseCount === 1 ? "record" : "records"})` : undefined,
    analysis.topNextSafeAction ? `Top next safe action: ${analysis.topNextSafeAction} (${analysis.topNextSafeActionCount} ${analysis.topNextSafeActionCount === 1 ? "record" : "records"})` : undefined,
    `Final-marker recovery requests: ${analysis.finalMarkerRecoveryRequests}`,
    analysis.topFinalMarkerRecoverySource ? `Top final-marker recovery log source: ${relativeToCwd(cwd, analysis.topFinalMarkerRecoverySource)} (${analysis.topFinalMarkerRecoverySourceCount} ${analysis.topFinalMarkerRecoverySourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topFinalMarkerRecoveryReason ? `Top final-marker recovery reason: ${analysis.topFinalMarkerRecoveryReason} (${analysis.topFinalMarkerRecoveryReasonCount} ${analysis.topFinalMarkerRecoveryReasonCount === 1 ? "record" : "records"})` : undefined,
    `Final-marker recovery successes: ${analysis.finalMarkerRecoverySuccesses}`,
    `Final-marker recovery blocks: ${analysis.finalMarkerRecoveryBlocks}`,
    analysis.topFinalMarkerRecoveryBlockSource ? `Top final-marker recovery block log source: ${relativeToCwd(cwd, analysis.topFinalMarkerRecoveryBlockSource)} (${analysis.topFinalMarkerRecoveryBlockSourceCount} ${analysis.topFinalMarkerRecoveryBlockSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topFinalMarkerRecoveryBlockReason ? `Top final-marker recovery block reason: ${analysis.topFinalMarkerRecoveryBlockReason} (${analysis.topFinalMarkerRecoveryBlockReasonCount} ${analysis.topFinalMarkerRecoveryBlockReasonCount === 1 ? "record" : "records"})` : undefined,
    `Delivery evidence records: ${analysis.deliveryEvidenceRecords}`,
    `Changed-file evidence records: ${analysis.changedFileEvidenceRecords}`,
    `Validation evidence records: ${analysis.validationEvidenceRecords}`,
    `Commit evidence records: ${analysis.commitEvidenceRecords}`,
    `Push evidence records: ${analysis.pushEvidenceRecords}`,
    `Report summary records: ${analysis.reportSummaryRecords}`,
    `Report next-step items: ${analysis.reportNextStepItems}`,
    analysis.topReportSummary ? `Top report summary: ${analysis.topReportSummary} (${analysis.topReportSummaryCount} ${analysis.topReportSummaryCount === 1 ? "record" : "records"})` : undefined,
    analysis.topReportNextStep ? `Top report next step: ${analysis.topReportNextStep} (${analysis.topReportNextStepCount} ${analysis.topReportNextStepCount === 1 ? "record" : "records"})` : undefined,
    `Commit-without-push records: ${analysis.commitWithoutPushRecords}`,
    analysis.topCommitWithoutPushSource ? `Top commit-without-push log source: ${relativeToCwd(cwd, analysis.topCommitWithoutPushSource)} (${analysis.topCommitWithoutPushSourceCount} ${analysis.topCommitWithoutPushSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topPushStatus ? `Top push status: ${analysis.topPushStatus} (${analysis.topPushStatusCount} ${analysis.topPushStatusCount === 1 ? "record" : "records"})` : undefined,
    `CI-green records: ${analysis.ciGreenRecords}`,
    `CI-red records: ${analysis.ciRedRecords}`,
    analysis.topCiRedSource ? `Top CI-red log source: ${relativeToCwd(cwd, analysis.topCiRedSource)} (${analysis.topCiRedSourceCount} ${analysis.topCiRedSourceCount === 1 ? "record" : "records"})` : undefined,
    `CI-gate missing records: ${analysis.ciGateMissingRecords}`,
    analysis.topCiGateMissingSource ? `Top CI-gate missing log source: ${relativeToCwd(cwd, analysis.topCiGateMissingSource)} (${analysis.topCiGateMissingSourceCount} ${analysis.topCiGateMissingSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topCiGateMissingReason ? `Top CI-gate missing reason: ${analysis.topCiGateMissingReason} (${analysis.topCiGateMissingReasonCount} ${analysis.topCiGateMissingReasonCount === 1 ? "record" : "records"})` : undefined,
    `Unresolved loop starts: ${analysis.unresolvedLoopStarts}`,
    analysis.topUnresolvedSource ? `Top unresolved log source: ${relativeToCwd(cwd, analysis.topUnresolvedSource)} (${analysis.topUnresolvedSourceCount} ${analysis.topUnresolvedSourceCount === 1 ? "record" : "records"})` : undefined,
    `Empty provider responses: ${analysis.emptyProviderResponses}`,
    `Empty provider retry records: ${analysis.emptyProviderRetryRecords}`,
    analysis.topEmptyProviderSource ? `Top empty provider log source: ${relativeToCwd(cwd, analysis.topEmptyProviderSource)} (${analysis.topEmptyProviderSourceCount} ${analysis.topEmptyProviderSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topEmptyProviderReason ? `Top empty provider reason: ${analysis.topEmptyProviderReason} (${analysis.topEmptyProviderReasonCount} ${analysis.topEmptyProviderReasonCount === 1 ? "record" : "records"})` : undefined,
    `Queued iteration records: ${analysis.queuedIterationRecords}`,
    analysis.topQueuedIterationSource ? `Top queued iteration log source: ${relativeToCwd(cwd, analysis.topQueuedIterationSource)} (${analysis.topQueuedIterationSourceCount} ${analysis.topQueuedIterationSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topQueuedIterationReason ? `Top queued iteration reason: ${analysis.topQueuedIterationReason} (${analysis.topQueuedIterationReasonCount} ${analysis.topQueuedIterationReasonCount === 1 ? "record" : "records"})` : undefined,
    `Provider error records: ${analysis.providerErrorRecords}`,
    analysis.topProviderErrorSource ? `Top provider error log source: ${relativeToCwd(cwd, analysis.topProviderErrorSource)} (${analysis.topProviderErrorSourceCount} ${analysis.topProviderErrorSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topProviderErrorCode ? `Top provider error code: ${analysis.topProviderErrorCode} (${analysis.topProviderErrorCodeCount} ${analysis.topProviderErrorCodeCount === 1 ? "record" : "records"})` : undefined,
    analysis.topProviderErrorCategory ? `Top provider error category: ${analysis.topProviderErrorCategory} (${analysis.topProviderErrorCategoryCount} ${analysis.topProviderErrorCategoryCount === 1 ? "record" : "records"})` : undefined,
    `Context overflow responses: ${analysis.contextOverflowResponses}`,
    `Compaction events: ${analysis.compactionEvents}`,
    analysis.topCompactionSource ? `Top compaction log source: ${relativeToCwd(cwd, analysis.topCompactionSource)} (${analysis.topCompactionSourceCount} ${analysis.topCompactionSourceCount === 1 ? "record" : "records"})` : undefined,
    `Compaction resume records: ${analysis.compactionResumeRecords}`,
    `Compaction failure records: ${analysis.compactionFailureRecords}`,
    analysis.topCompactionFailureReason ? `Top compaction failure reason: ${analysis.topCompactionFailureReason} (${analysis.topCompactionFailureReasonCount} ${analysis.topCompactionFailureReasonCount === 1 ? "record" : "records"})` : undefined,
    `User steering records: ${analysis.userSteeringRecords}`,
    `Max user steering length: ${analysis.maxUserSteeringLength}`,
    `Provider-noise topic records: ${analysis.providerNoiseTopicRecords}`,
    `Sanitized topic records: ${analysis.sanitizedTopicRecords}`,
    `Truncated topics: ${analysis.truncatedTopics}`,
    `Oversized topic records: ${analysis.oversizedTopicRecords}`,
    `Most repeated oversized topic: ${analysis.mostRepeatedOversizedTopicRecords} records`,
    `Max topic length: ${analysis.maxTopicLength}`,
    "Recommendations:",
    ...analysis.recommendations.map((item) => `- ${item}`),
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function buildIterationPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  const adapter = resolved.adapter;
  const config = resolved.config;
  const preflightCommands = nonEmpty(config.preflightCommands) ? config.preflightCommands! : adapter.preflightCommands;
  const validationCommands = nonEmpty(config.validationCommands) ? config.validationCommands! : adapter.validationCommands;
  const skills = ensureMandatorySkills(nonEmpty(config.skills) ? config.skills! : adapter.skills);
  const language = config.language || DEFAULT_LANGUAGE;
  const stopConditions = nonEmpty(config.stopConditions) ? config.stopConditions! : adapter.stopConditions;
  const commitPolicy = s.commit
    ? s.push
      ? "Commit each validated coherent slice and push to the current branch only when the worktree is safe."
      : "Commit each validated coherent slice when the worktree is safe; do not push."
    : "Do not commit or push unless the user explicitly asks later.";

  return `Use the project instructions and matching skills now. Development loop iteration ${s.iteration}/${s.maxIterations}.

Project root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Run id: ${s.runId || "legacy"}
Topic/objective: ${promptObjectiveText(s.topic)}
Objective intake: ${objectiveIntakeSummary(s.topic)}
Preferred language: ${language}
Config source: ${resolved.configLoaded ? relativeToCwd(cwd, resolved.configPath) : "built-in adapter defaults"}
Loop log path: ${relativeToCwd(cwd, s.logPath)}

Suggested skills/adapters for this project:
${skills.map((skill) => `- ${skill}`).join("\n") || "- Use the smallest project-matching skill set."}

Task discovery cues for broad objectives:
${TASK_DISCOVERY_CUES.map((cue) => `- ${cue}`).join("\n")}

Review-loop guidance:
${REVIEW_LOOP_GUIDANCE.map((cue) => `- ${cue}`).join("\n")}

Preflight commands to run before edits:
${preflightCommands.map((command) => `- ${command}`).join("\n")}

Validation commands required before DEV_LOOP_VALIDATED: yes:
${validationCommands.map((command) => `- ${command}`).join("\n")}

Commit/push policy:
- ${commitPolicy}
- Preserve unrelated dirty work. Stage only files that belong to this iteration.

Stop conditions:
${stopConditions.map((condition) => `- ${condition}`).join("\n")}

Run one complete vertical development iteration:
1. State scope lock with exact absolute project path and adapter.
2. Read project instructions and use matching skills before risky work.
3. Inspect current dirty state and preserve unrelated work.
4. Choose one small verifiable slice from the user topic, repo-local skills, or task discovery cues above.
5. Prefer test-first changes when editing code.
6. Run the validation commands above. If a command is not applicable, explain exact evidence and substitute the closest project-appropriate check.
7. If validation fails twice with the same cause, stop and report the first failing stderr line.
8. Apply the commit/push policy above.
9. End with exact changed files, validations, blocker state, a machine-readable delivery line when evidence exists, and these final marker lines:
DEV_LOOP_REPORT: {"validated":true,"decision":"continue","summary":"brief result","nextSteps":["next safe step"],"changedFiles":["path"],"validationCommands":["command"],"commitHash":"hash","pushStatus":"pushed"}
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done

Human-readable end report requirements, before DEV_LOOP_REPORT:
- Scope and selected slice.
- What changed and why, with exact files.
- Validation evidence, commit/push evidence, and blocker state.
- Possible next steps, especially if decision is continue, blocked, or stop.
  - For continue: name the next smallest verifiable slice.
  - For blocked: name concrete unblocking actions, missing prerequisites, or credentials.
  - For stop: name handoff or cleanup actions so the user can resume safely.
- Keep the machine-readable DEV_LOOP_REPORT and final markers last so the loop can parse them.

Omit unavailable DEV_LOOP_REPORT fields. Use false and blocked when validation is red. Only use DEV_LOOP_VALIDATED: yes after validation evidence exists. Use DEV_LOOP_DECISION: blocked when validation is red, evidence is missing, scope is unsafe, or credentials/external services are required.`;
}

function buildCompactionResumePrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Continue development loop after compaction.

The previous model request may have failed or been compacted before it emitted DEV_LOOP markers. Resume the same iteration from the compacted summary and current repository state. Do not restart from scratch, do not mark the loop blocked solely because compaction happened, and preserve unrelated dirty work.

${buildIterationPrompt(s, resolved, cwd)}`;
}

function buildEmptyResponseRetryPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Retry development loop iteration after empty provider response.

The previous model request returned no assistant text, likely because the provider stream ended early. Retry the same iteration from current repository state. Do not increment the loop iteration, do not restart from scratch, and do not mark the loop blocked solely because the provider response was empty.

${buildIterationPrompt(s, resolved, cwd)}`;
}

function buildMissingMarkerRecoveryPrompt(s: LoopState): string {
  return `Return only the development loop final markers for iteration ${s.iteration}/${s.maxIterations}.

The previous assistant response was non-empty but did not end with the required DEV_LOOP markers. Do not redo the work, do not run new commands, and do not include a summary. If validation evidence is missing or red, choose DEV_LOOP_VALIDATED: no and DEV_LOOP_DECISION: blocked.

Use exactly these two final lines and nothing else:
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done`;
}

function buildDevelopmentLoopCompactionInstructions(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Preserve development loop state for automatic continuation.

Current development loop state:
- Project root: ${cwd}
- Adapter: ${resolved.adapter.name}
- Run id: ${s.runId || "legacy"}
- Objective: ${promptObjectiveText(s.topic)}
- Iteration: ${s.iteration}/${s.maxIterations}
- Phase: ${s.phase}
- Git delivery: ${s.push ? "push" : s.commit ? "commit" : "manual"}
- Log path: ${relativeToCwd(cwd, s.logPath)}

In the compaction summary, include:
1. Current objective and selected adapter.
2. Iteration number and whether the next action is to continue the queued iteration.
3. Files changed/read and validation evidence seen so far.
4. Any blockers or missing credentials.
5. The requirement that the next assistant response ends with DEV_LOOP_VALIDATED and DEV_LOOP_DECISION markers.`;
}

function buildSteeringPrompt(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string, steeringText: string): string {
  const adapter = resolved.adapter;
  return `Development loop steering request for the active task.

Project root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Current loop iteration: ${s.iteration}/${s.maxIterations}
Current objective: ${promptObjectiveText(s.topic)}
User steering request: ${steeringText}

Incorporate this steering into the current or next safe vertical slice. Preserve unrelated dirty work. Keep using the configured validation commands before any continue/done decision.

End with these exact marker lines:
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done

Only use DEV_LOOP_VALIDATED: yes after validation evidence exists. Use DEV_LOOP_DECISION: blocked when validation is red, evidence is missing, scope is unsafe, or credentials/external services are required.`;
}

function mergeSteeringTopic(currentTopic: string, steeringText: string): string {
  const baseTopic = singleLineText(currentTopic) || "active development loop";
  const steering = singleLineText(steeringText);
  const next = `${baseTopic}; latest user steering: ${steering}`;
  return next.length <= STEERING_TOPIC_MAX ? next : `${next.slice(0, STEERING_TOPIC_MAX - 1)}…`;
}

function resolveProjectAdapter(cwd: string, _requestedAdapter?: string): ResolvedProjectAdapter {
  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);
  const loaded = loadProjectConfig(configPath);
  const config = loaded.config ?? {};
  const adapter = getAdapterByName("generic-git")!;
  return {
    adapter,
    config: mergeAdapterConfig(adapter, config),
    configPath,
    configLoaded: Boolean(loaded.config),
    configError: loaded.error,
  };
}

function mergeAdapterConfig(adapter: LoopAdapter, config: ProjectConfig): ProjectConfig {
  return {
    adapter: adapter.name,
    defaultTopic: config.defaultTopic ?? adapter.defaultTopic,
    language: config.language ?? DEFAULT_LANGUAGE,
    skills: ensureMandatorySkills(nonEmpty(config.skills) ? config.skills : adapter.skills),
    preflightCommands: nonEmpty(config.preflightCommands) ? config.preflightCommands : adapter.preflightCommands,
    validationCommands: nonEmpty(config.validationCommands) ? config.validationCommands : adapter.validationCommands,
    commit: config.commit ?? false,
    push: config.push ?? false,
    logPath: config.logPath ?? DEFAULT_LOG_RELATIVE,
    maxIterations: config.maxIterations ?? DEFAULT_ITERATIONS,
    stopConditions: nonEmpty(config.stopConditions) ? config.stopConditions : adapter.stopConditions,
  };
}

function loadProjectConfig(configPath: string): { config?: ProjectConfig; error?: string } {
  try {
    if (!fs.existsSync(configPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return { error: "config is not a JSON object" };
    return { config: normalizeConfig(parsed as Record<string, unknown>) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function normalizeConfig(raw: Record<string, unknown>): ProjectConfig {
  return {
    adapter: selectValue(raw.adapter),
    defaultTopic: stringOrUndefined(raw.defaultTopic),
    language: stringOrUndefined(raw.language),
    skills: stringArrayOrUndefined(raw.skills),
    preflightCommands: stringArrayOrUndefined(raw.preflightCommands),
    validationCommands: stringArrayOrUndefined(raw.validationCommands),
    commit: booleanOrUndefined(raw.commit),
    push: booleanOrUndefined(raw.push),
    logPath: stringOrUndefined(raw.logPath),
    maxIterations: numberOrUndefined(raw.maxIterations),
    stopConditions: stringArrayOrUndefined(raw.stopConditions),
  };
}

function getAdapterByName(name: string): LoopAdapter | undefined {
  return BUILT_IN_ADAPTERS.find((adapter) => adapter.name === name);
}

function resolveCommitPush(commitFlag: boolean | undefined, pushFlag: boolean | undefined, fallbackCommit = false, fallbackPush = false): { commit: boolean; push: boolean } {
  const push = pushFlag ?? fallbackPush;
  const commit = (commitFlag ?? fallbackCommit) || push;
  return { commit, push };
}

function statusReport(s: LoopState, cwd = process.cwd()): string {
  const logPath = s.logPath || path.join(cwd, DEFAULT_LOG_RELATIVE);
  const last = readLastLoopRecord(logPath);
  return [
    statusLine(s),
    `adapter: ${s.adapterName}`,
    `topic: ${objectiveText(s.topic)}`,
    `state: ${stateExplanation(s, last)}`,
    summarizeLastLoopRecord(last),
    `log: ${relativeToCwd(cwd, logPath)}`,
    "Commands: /development-loop status | /development-loop analyze-logs | /development-loop stop | /development-loop restart --iterations=N <topic> | /development-loop init",
  ].join("\n");
}

function statusLine(s: LoopState, theme?: UiThemeLike): string {
  const status = loopStatusMeta(s);
  const context = statusContext(s);
  return compactJoin([
    paint(theme, status.color, `${status.icon} ${status.label}`),
    s.active ? `loop ${s.iteration}/${s.maxIterations}` : "loop",
    s.adapterName !== "none" ? s.adapterName : undefined,
    s.adapterName !== "none" ? deliverySegment(s) : undefined,
    context,
  ]);
}

function refreshUi(ctx: UiLikeContext) {
  if (!ctx.hasUI || !ctx.ui) return;
  const theme = ctx.ui.theme;
  ctx.ui.setStatus?.("development-loop", statusLine(state, theme));
  ctx.ui.setWidget?.("development-loop", statusWidgetLines(state, contextCwd(ctx), theme), { placement: "belowEditor" });
}

function statusWidgetLines(s: LoopState, cwd: string, theme?: UiThemeLike): string[] | undefined {
  if (!s.active && s.phase === "idle" && !s.lastDecision) return undefined;
  const logPath = s.logPath || path.join(cwd, DEFAULT_LOG_RELATIVE);
  const last = readLastLoopRecord(logPath);
  const reportSummary = last ? recordReportSummary(last) : undefined;
  const reportNextSteps = last ? recordReportNextSteps(last) : [];
  const detail = compactJoin([
    recordEvent(last) ? `last ${recordEvent(last)}` : "last none",
    recordTime(last),
    last?.iteration !== undefined ? `i${String(last.iteration)}` : undefined,
    reportSummary ? `summary ${compactStatusText(reportSummary)}` : undefined,
    widgetNextStepsSummary(reportNextSteps),
    `log ${relativeToCwd(cwd, logPath)}`,
  ]);
  return [paint(theme, "dim", detail)];
}

function loopStatusMeta(s: LoopState): { icon: string; label: string; color: string } {
  if (s.phase === "blocked") return { icon: "■", label: "block", color: "error" };
  if (s.phase === "done") return { icon: "✓", label: "done", color: "success" };
  if (!s.active) return { icon: "○", label: "idle", color: "dim" };
  if (s.phase === "queued") return { icon: "◆", label: "queue", color: "warning" };
  if (s.phase === "reported") return { icon: "◇", label: "report", color: "accent" };
  if (s.phase === "started") return { icon: "●", label: "start", color: "accent" };
  return { icon: "●", label: "run", color: "accent" };
}

function deliverySegment(s: LoopState): string {
  if (s.push) return "git:push";
  if (s.commit) return "git:commit";
  return "git:manual";
}

function statusContext(s: LoopState): string | undefined {
  if (s.active) return compactTopic(objectiveText(s.topic));
  if (s.phase === "blocked") return compactStatusText(s.lastReason || String(s.lastDecision || "blocked"));
  if (s.phase === "done") return compactStatusText(s.lastReason || "complete");
  return s.lastDecision ? compactStatusText(String(s.lastDecision)) : undefined;
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

function paint(theme: UiThemeLike | undefined, color: string, text: string): string {
  return theme?.fg ? theme.fg(color, text) : text;
}

function compactStatusText(text: string): string {
  if (text.length <= STATUS_TOPIC_MAX) return text;
  return `${text.slice(0, STATUS_TOPIC_MAX - 1)}…`;
}

function recordTime(record?: Record<string, unknown>): string | undefined {
  const at = recordTimestamp(record);
  if (!at) return undefined;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toISOString().slice(11, 19);
}

function stateExplanation(s: LoopState, last?: Record<string, unknown>): string {
  if (!s.active) {
    if (s.phase === "blocked") return `Blocked${s.lastReason ? `: ${s.lastReason}` : "."}`;
    if (s.phase === "done") return "Done.";
    return s.lastDecision ? `Idle after ${s.lastDecision}.` : "Idle.";
  }
  if (s.phase === "queued") return "Queued follow-up; waiting for Pi to deliver the next iteration prompt.";
  if (s.phase === "running") return "Running; waiting for final DEV_LOOP markers.";
  if (s.phase === "reported") return "Iteration reported; preparing the next action.";
  const event = recordEvent(last);
  return event ? `Active; latest event is ${event}.` : "Active.";
}

function summarizeLastLoopRecord(record?: Record<string, unknown>): string {
  if (!record) return "Last event: none recorded yet";
  const parts = [`Last event: ${recordEvent(record) ?? "unknown"}`];
  const at = recordTimestamp(record);
  if (at) parts.push(`at ${at}`);
  if (record.iteration !== undefined) parts.push(`iteration ${String(record.iteration)}`);
  if (typeof record.decision === "string") parts.push(`decision ${record.decision}`);
  if (typeof record.reason === "string") parts.push(`reason ${record.reason}`);
  const reportSummary = recordReportSummary(record);
  if (reportSummary) parts.push(`summary ${reportSummary}`);
  parts.push(...reportNextStepSummaryParts(recordReportNextSteps(record)));
  return parts.join("; ");
}

function reportNextStepSummaryParts(nextSteps: string[], limit = 3): string[] {
  const visible = nextSteps.slice(0, Math.max(0, limit));
  const parts = visible.map((step, index) => `next ${index + 1} ${step}`);
  if (nextSteps.length > visible.length) parts.push(`next +${nextSteps.length - visible.length} more`);
  return parts;
}

function widgetNextStepsSummary(nextSteps: string[]): string | undefined {
  if (!nextSteps[0]) return undefined;
  const suffix = nextSteps.length > 1 ? ` (+${nextSteps.length - 1} more)` : "";
  return `next ${compactStatusText(`${nextSteps[0]}${suffix}`)}`;
}

function compactionReason(tokensBefore?: number): string {
  return typeof tokensBefore === "number" ? `tokens_before=${tokensBefore}` : "tokens_before=unknown";
}

function contextUsageReason(ctx: UiLikeContext): string {
  const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
  const tokens = typeof usage?.tokens === "number" ? usage.tokens : undefined;
  const contextWindow = typeof usage?.contextWindow === "number" ? usage.contextWindow : typeof usage?.maxTokens === "number" ? usage.maxTokens : undefined;
  return compactJoin([
    tokens !== undefined ? `tokens=${tokens}` : undefined,
    contextWindow !== undefined ? `context_window=${contextWindow}` : undefined,
  ]) || "tokens=unknown";
}

function appendLoopLog(event: string, extra: Partial<LoopLogRecord> = {}) {
  const logPath = state.logPath || path.join(process.cwd(), DEFAULT_LOG_RELATIVE);
  const record: LoopLogRecord = {
    at: new Date().toISOString(),
    event,
    adapterName: state.adapterName,
    ...(state.runId ? { runId: state.runId } : {}),
    ...loopLogTopicFields(state.topic),
    iteration: state.iteration,
    maxIterations: state.maxIterations,
    phase: state.phase,
    logPath,
    ...extra,
  };
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Logging must never break the agent loop.
  }
}

function loopLogTopicFields(value: unknown): Pick<LoopLogRecord, "topic" | "topicLength" | "topicTruncated" | "topicHash" | "topicKind" | "topicSanitized"> {
  const info = objectiveInfo(value, LOG_TOPIC_MAX);
  if (info.topic.length <= LOG_TOPIC_MAX) {
    return {
      topic: info.topic,
      topicLength: info.rawLength,
      topicHash: info.topicHash,
      topicKind: info.kind,
      ...(info.sanitized ? { topicSanitized: true } : {}),
    };
  }
  return {
    topic: `${info.topic.slice(0, LOG_TOPIC_MAX - 1)}…`,
    topicLength: info.rawLength,
    topicTruncated: true,
    topicHash: info.topicHash,
    topicKind: info.kind,
    ...(info.sanitized ? { topicSanitized: true } : {}),
  };
}

function readLastLoopRecord(logPath: string): Record<string, unknown> | undefined {
  try {
    const content = fs.readFileSync(logPath, "utf8").trim();
    if (!content) return undefined;
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = parseLogRecord(lines[i]);
      if (parsed) return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseLogRecord(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function recordEvent(record?: Record<string, unknown>): string | undefined {
  return normalizeLoopLogEvent(rawRecordEvent(record));
}

function rawRecordEvent(record?: Record<string, unknown>): string | undefined {
  const value = record?.event;
  if (typeof value === "string") return value;
  const type = record?.type;
  return typeof type === "string" ? type : undefined;
}

function normalizeLoopLogEvent(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "loop_start") return "loop_started";
  if (value === "done") return "loop_finished";
  if (value === "blocked") return "loop_blocked";
  return value;
}

function recordTimestamp(record?: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record?.at) || stringOrUndefined(record?.timestamp);
}

function recordRunId(record?: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record?.runId) || stringOrUndefined(record?.run_id);
}

function recordDecision(record: Record<string, unknown>, event: string): string | undefined {
  const explicit = stringOrUndefined(record.decision);
  if (explicit) return explicit;
  const finalLineDecision = finalLineLoopDecision(record);
  if (finalLineDecision) return finalLineDecision;
  if (event === "loop_finished" && rawRecordEvent(record) === "done") return "done";
  return undefined;
}

function recordReason(record: Record<string, unknown>, event: string): string | undefined {
  const explicit = stringOrUndefined(record.reason);
  if (explicit) return explicit;
  if (event === "loop_blocked" && rawRecordEvent(record) === "blocked") return "blocked";
  return undefined;
}

function recordSelfImprovementAction(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.nextAction)
    || stringOrUndefined(record.next_action)
    || stringOrUndefined(record.nextSafeAction)
    || stringOrUndefined(record.action);
}

function finalLineLoopDecision(record: Record<string, unknown>): string | undefined {
  const finalLine = stringOrUndefined(record.finalLine);
  const match = finalLine?.match(/\b(?:DEV_)?LOOP_DECISION:\s*(continue|stop|blocked|done)\b/i);
  return match?.[1]?.toLowerCase();
}

function isContextOverflowProviderError(text: string): boolean {
  return /context[\s_-]*length[\s_-]*exceeded|input exceeds the context window|context overflow detected/i.test(text);
}

function recordHasContextOverflowProviderError(record: Record<string, unknown>, event: string): boolean {
  if (event === "context_overflow_waiting_for_compaction" || isContextOverflowProviderError(event)) return true;
  return [
    record.reason,
    record.message,
    record.error,
    record.code,
    record.content,
    record.warning,
    record.providerError,
    record.provider_error,
  ].some((value) => valueHasContextOverflowProviderError(value));
}

function valueHasContextOverflowProviderError(value: unknown): boolean {
  if (typeof value === "string") return isContextOverflowProviderError(value);
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((child) => valueHasContextOverflowProviderError(child));
}

function hasContextOverflowProviderError(messages: Array<{ role?: string; content?: unknown }>): boolean {
  return messages.some((message) => message.role !== "user" && isContextOverflowProviderError(messageText(message)));
}

function parseFinalMarkerBlock(text: string): RegExpMatchArray | null {
  return text.match(/(?:^|\r?\n)\s*DEV_LOOP_VALIDATED:\s*(yes|no)\s*\r?\n\s*DEV_LOOP_DECISION:\s*(continue|stop|blocked|done)\s*$/i);
}

function parseDeliveryEvidence(text: string): DeliveryEvidence {
  const typedReport = parseTypedFinalReport(text);
  if (typedReport) return typedReport.deliveryEvidence;

  const lines = text.split(/\r?\n/);
  const changedFiles: string[] = [];
  const validationCommands: string[] = [];
  const nextSteps: string[] = [];
  let summary: string | undefined;
  let commitHash: string | undefined;
  let pushStatus: string | undefined;
  let section: "changed" | "validation" | "nextSteps" | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      section = undefined;
      continue;
    }

    const summaryHeader = trimmed.match(/^(?:Summary|End report summary|What changed(?: and why)?):\s*(.*)$/i);
    if (summaryHeader) {
      summary = cleanReportText(summaryHeader[1]) || summary;
      section = undefined;
      continue;
    }

    const nextStepsHeader = trimmed.match(/^(?:Possible next steps|Next steps|Follow-up actions|Follow up actions)(?:\s+[^:]*)?:\s*(.*)$/i);
    if (nextStepsHeader) {
      section = "nextSteps";
      addInlineListItems(nextSteps, nextStepsHeader[1], cleanReportText);
      continue;
    }

    const changedHeader = trimmed.match(/^Changed files(?:\s+[^:]*)?:\s*(.*)$/i);
    if (changedHeader) {
      section = "changed";
      addInlineListItems(changedFiles, changedHeader[1], cleanChangedFileEvidence);
      continue;
    }

    const validationHeader = trimmed.match(/^Validation(?:\s+[^:]*)?:\s*(.*)$/i);
    if (validationHeader) {
      section = "validation";
      addInlineListItems(validationCommands, validationHeader[1], cleanValidationEvidence);
      continue;
    }

    const explicitPush = trimmed.match(/\bpush(?:ed| status)?\s*:\s*(success|succeeded|pushed|failed|blocked|yes|no)\b/i);
    if (explicitPush) pushStatus = normalizePushStatus(explicitPush[1]);

    if (/\b(?:commit|committed|push|pushed)\b/i.test(trimmed)) {
      const hash = trimmed.match(/\b[0-9a-f]{7,40}\b/i)?.[0];
      if (hash && !commitHash) commitHash = hash;
      if (/\bpushed\b|commit(?:ted)?\/pushed/i.test(trimmed)) pushStatus = pushStatus || "pushed";
    }

    if (looksLikeSectionHeader(trimmed)) {
      section = undefined;
      continue;
    }

    const bullet = trimmed.match(/^(?:[-*]\s+|\d+\.\s+)(.+)$/);
    if (!bullet || !section) continue;
    if (section === "changed") addUnique(changedFiles, cleanChangedFileEvidence(bullet[1]));
    if (section === "validation") addUnique(validationCommands, cleanValidationEvidence(bullet[1]));
    if (section === "nextSteps") addUnique(nextSteps, cleanReportText(bullet[1]));
  }

  return {
    ...(summary ? { summary } : {}),
    ...(nextSteps.length ? { nextSteps } : {}),
    ...(changedFiles.length ? { changedFiles } : {}),
    ...(validationCommands.length ? { validationCommands } : {}),
    ...(commitHash ? { commitHash } : {}),
    ...(pushStatus ? { pushStatus } : {}),
  };
}

function addInlineListItems(target: string[], value: string | undefined, clean: (item: string) => string | undefined) {
  if (!value) return;
  for (const item of value.split(/,\s*/)) addUnique(target, clean(item));
}

function cleanChangedFileEvidence(value: string): string | undefined {
  const text = cleanEvidenceText(value);
  if (!text) return undefined;
  return text.split(/\s+(?:[-–—]|\()\s*/)[0]?.trim() || undefined;
}

function cleanValidationEvidence(value: string): string | undefined {
  const text = cleanEvidenceText(value);
  if (!text) return undefined;
  return text.replace(/\s+(?:exited|passed|failed|succeeded|returned|→).*/i, "").trim() || undefined;
}

function cleanReportText(value: string): string | undefined {
  const text = cleanEvidenceText(value);
  return text ? text.replace(/\s+/g, " ").trim() : undefined;
}

function cleanEvidenceText(value: string): string | undefined {
  const code = value.match(/`([^`]+)`/)?.[1];
  const text = (code || value).replace(/^\[[ x-]\]\s*/i, "").trim();
  return text || undefined;
}

function addUnique(target: string[], value: string | undefined) {
  if (value && !target.includes(value)) target.push(value);
}

function looksLikeSectionHeader(value: string): boolean {
  return /^[A-Z][A-Za-z0-9 /_-]{0,60}:\s*\S/.test(value);
}

function normalizePushStatus(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "success" || lower === "succeeded" || lower === "yes") return "pushed";
  if (lower === "no") return "not_pushed";
  return lower;
}

function parseLoopDecision(text: string): LoopDecision | undefined {
  const match = parseFinalMarkerBlock(text);
  if (match) return match[2]?.toLowerCase() as LoopDecision | undefined;
  return parseTypedFinalReport(text)?.decision;
}

function parseValidated(text: string): boolean | undefined {
  const match = parseFinalMarkerBlock(text);
  if (match) return match[1].toLowerCase() === "yes";
  return parseTypedFinalReport(text)?.validated;
}

function parseTypedFinalReport(text: string): FinalReport | undefined {
  const markerBlock = parseFinalMarkerBlock(text);
  const reportText = markerBlock && markerBlock.index !== undefined ? text.slice(0, markerBlock.index) : text;
  const match = reportText.match(/(?:^|\r?\n)\s*DEV_LOOP_REPORT:\s*(\{[^\r\n]*\})\s*$/i);
  if (!match) return undefined;
  const rawReport = parseLogRecord(match[1]);
  if (!rawReport) return undefined;
  const decision = loopDecisionOrUndefined(rawReport.decision);
  const validated = booleanOrUndefined(rawReport.validated);
  const changedFiles = stringArrayOrUndefined(rawReport.changedFiles) || stringArrayOrUndefined(rawReport.files);
  const validationCommands = stringArrayOrUndefined(rawReport.validationCommands) || stringArrayOrUndefined(rawReport.validation);
  const commitHash = stringOrUndefined(rawReport.commitHash) || stringOrUndefined(rawReport.commit);
  const pushValue = stringOrUndefined(rawReport.pushStatus) || stringOrUndefined(rawReport.pushed) || stringOrUndefined(rawReport.push);
  const pushStatus = pushValue ? normalizePushStatus(pushValue) : undefined;
  const summary = stringOrUndefined(rawReport.summary) || stringOrUndefined(rawReport.whatChanged);
  const nextSteps = stringArrayOrSingleString(rawReport.nextSteps) || stringArrayOrSingleString(rawReport.possibleNextSteps) || stringArrayOrSingleString(rawReport.nextStep) || stringArrayOrSingleString(rawReport.nextActions);
  return {
    ...(decision ? { decision } : {}),
    ...(validated !== undefined ? { validated } : {}),
    deliveryEvidence: {
      ...(summary ? { summary } : {}),
      ...(nextSteps ? { nextSteps } : {}),
      ...(changedFiles ? { changedFiles } : {}),
      ...(validationCommands ? { validationCommands } : {}),
      ...(commitHash ? { commitHash } : {}),
      ...(pushStatus ? { pushStatus } : {}),
    },
  };
}

function loopDecisionOrUndefined(value: unknown): LoopDecision | undefined {
  const decision = stringOrUndefined(value)?.toLowerCase();
  return decision === "continue" || decision === "stop" || decision === "blocked" || decision === "done" ? decision : undefined;
}

function requiresValidation(decision: LoopDecision): boolean {
  return decision === "continue" || decision === "done";
}

function lastAssistantText(messages: Array<{ role?: string; content?: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messageText(messages[i]);
  }
  return "";
}

function messageText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
      return "";
    }).join("\n");
  }
  return "";
}

function parseArgs(raw: string | undefined): ParsedCommand {
  const tokens = tokenizeArgs(raw || "");
  const commandToken = tokens[0];
  const known = new Set(["start", "restart", "stop", "status", "init", "adapters", "analyze-logs", "help"]);
  const command = known.has(commandToken) ? tokens.shift() as ParsedCommand["command"] : "start";
  const parsed: ParsedCommand = {
    command,
    validationCommands: [],
    preflightCommands: [],
    skills: [],
    stopConditions: [],
  };
  const positional: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--adapter") {
      parsed.adapter = tokens[++i];
      continue;
    }
    if (token.startsWith("--adapter=")) {
      parsed.adapter = token.slice("--adapter=".length);
      continue;
    }
    if (token === "--iterations" || token === "--max-iterations" || token === "-n") {
      parsed.iterations = numberOrUndefined(tokens[++i]);
      continue;
    }
    if (token.startsWith("--iterations=") || token.startsWith("--max-iterations=") || token.startsWith("-n=")) {
      parsed.iterations = numberOrUndefined(token.split("=").slice(1).join("="));
      continue;
    }
    if (token === "--commit") {
      parsed.commit = true;
      continue;
    }
    if (token === "--no-commit") {
      parsed.commit = false;
      continue;
    }
    if (token.startsWith("--commit=")) {
      parsed.commit = parseBoolean(token.slice("--commit=".length));
      continue;
    }
    if (token === "--push") {
      parsed.push = true;
      continue;
    }
    if (token === "--no-push") {
      parsed.push = false;
      continue;
    }
    if (token.startsWith("--push=")) {
      parsed.push = parseBoolean(token.slice("--push=".length));
      continue;
    }
    if (token === "--force") {
      parsed.force = true;
      continue;
    }
    if (token === "--no-force") {
      parsed.force = false;
      continue;
    }
    if (token.startsWith("--force=")) {
      parsed.force = parseBoolean(token.slice("--force=".length));
      continue;
    }
    if (token === "--dry-run" || token === "--preview") {
      parsed.dryRun = true;
      continue;
    }
    if (token === "--html" || token === "--report-html") {
      parsed.html = true;
      continue;
    }
    if (token === "--no-html" || token === "--no-report-html") {
      parsed.html = false;
      continue;
    }
    if (token === "--no-dry-run") {
      parsed.dryRun = false;
      continue;
    }
    if (token.startsWith("--dry-run=") || token.startsWith("--preview=")) {
      parsed.dryRun = parseBoolean(token.split("=").slice(1).join("="));
      continue;
    }
    if (token.startsWith("--html=") || token.startsWith("--report-html=")) {
      parsed.html = parseBoolean(token.split("=").slice(1).join("="));
      continue;
    }
    if (token === "--yes" || token === "-y" || token === "--defaults" || token === "--non-interactive" || token === "--no-prompt" || token === "--no-prompts") {
      parsed.yes = true;
      continue;
    }
    if (token === "--interactive" || token === "--prompt" || token === "--prompts") {
      parsed.yes = false;
      continue;
    }
    if (token.startsWith("--yes=") || token.startsWith("--defaults=") || token.startsWith("--non-interactive=")) {
      parsed.yes = parseBoolean(token.split("=").slice(1).join("="));
      continue;
    }
    if (token === "--log-path") {
      parsed.logPath = tokens[++i];
      continue;
    }
    if (token.startsWith("--log-path=")) {
      parsed.logPath = token.slice("--log-path=".length);
      continue;
    }
    if (token === "--validation" || token === "--test" || token === "--testing" || token === "--test-command") {
      const value = tokens[++i];
      if (value) parsed.validationCommands.push(value);
      continue;
    }
    if (token.startsWith("--validation=") || token.startsWith("--test=") || token.startsWith("--testing=") || token.startsWith("--test-command=")) {
      parsed.validationCommands.push(token.split("=").slice(1).join("="));
      continue;
    }
    if (token === "--preflight") {
      const value = tokens[++i];
      if (value) parsed.preflightCommands.push(value);
      continue;
    }
    if (token.startsWith("--preflight=")) {
      parsed.preflightCommands.push(token.slice("--preflight=".length));
      continue;
    }
    if (token === "--skill") {
      const value = tokens[++i];
      if (value) parsed.skills.push(value);
      continue;
    }
    if (token.startsWith("--skill=")) {
      parsed.skills.push(token.slice("--skill=".length));
      continue;
    }
    if (token === "--stop-condition" || token === "--condition") {
      const value = tokens[++i];
      if (value) parsed.stopConditions.push(value);
      continue;
    }
    if (token.startsWith("--stop-condition=") || token.startsWith("--condition=")) {
      parsed.stopConditions.push(token.split("=").slice(1).join("="));
      continue;
    }
    if (token === "--topic") {
      const topicParts: string[] = [];
      while (tokens[i + 1] && !tokens[i + 1].startsWith("--")) {
        topicParts.push(tokens[++i]);
      }
      parsed.topic = topicParts.join(" ").trim() || undefined;
      continue;
    }
    positional.push(token);
  }

  if (command === "init" && !parsed.adapter && positional.length > 0 && getAdapterByName(positional[0])) {
    parsed.adapter = positional.shift();
  }
  if (!parsed.topic && positional.length > 0) {
    parsed.topic = positional.join(" ").trim();
  }
  return parsed;
}

function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function restoreState(entries: Array<{ type?: string; customType?: string; data?: unknown }>): LoopState | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === CUSTOM_STATE_TYPE && isLoopState(entry.data)) {
      return entry.data;
    }
  }
  return undefined;
}

function isLoopState(value: unknown): value is LoopState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LoopState>;
  return typeof item.active === "boolean" &&
    typeof item.adapterName === "string" &&
    typeof item.topic === "string" &&
    typeof item.iteration === "number" &&
    typeof item.maxIterations === "number" &&
    typeof item.startedAt === "string" &&
    typeof item.logPath === "string" &&
    typeof item.phase === "string";
}

function inactiveState(): LoopState {
  return {
    active: false,
    adapterName: "none",
    topic: "",
    iteration: 0,
    maxIterations: DEFAULT_ITERATIONS,
    startedAt: new Date(0).toISOString(),
    logPath: DEFAULT_LOG_RELATIVE,
    phase: "idle",
    commit: false,
    push: false,
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
  };
}

function contextCwd(ctx: UiLikeContext): string {
  return ctx.sessionManager?.getCwd?.() || ctx.cwd || process.cwd();
}

function absoluteLogPath(cwd: string, configured?: string): string {
  const target = configured || DEFAULT_LOG_RELATIVE;
  return path.isAbsolute(target) ? target : path.join(cwd, target);
}

function relativeToCwd(cwd: string, target: string): string {
  const absolute = path.isAbsolute(target) ? target : path.join(cwd, target);
  const relative = path.relative(cwd, absolute);
  return relative && !relative.startsWith("..") ? relative : absolute;
}

function writeJsonFileAtomic(target: string, value: unknown) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      // Best effort cleanup; keep the original config untouched when possible.
    }
    throw error;
  }
}

function safeRead(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function dirExists(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function nonEmpty(value: string[] | undefined): value is string[] {
  return Array.isArray(value) && value.length > 0;
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function ensureMandatorySkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const skill of [...MANDATORY_SKILLS, ...skills]) {
    const trimmed = skill.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function singleLineText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\[object Object\]/g, " ").replace(/[\u2500-\u257F]{3,}/g, " ").replace(/↑↓\s*(?:navi(?:gate)?|nav|na)?/gi, " ").replace(/\s+/g, " ").trim() : "";
}

function selectValue(value: unknown): string | undefined {
  if (typeof value === "string") return stringOrUndefined(value);
  if (!value || typeof value !== "object") return undefined;
  return stringOrUndefined((value as { value?: unknown }).value);
}

function stringArrayOrUndefined(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  return items.length ? items : undefined;
}

function stringArrayOrSingleString(value: unknown): string[] | undefined {
  const array = stringArrayOrUndefined(value);
  if (array) return array;
  const single = stringOrUndefined(value);
  return single ? [single] : undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}

function parseBoolean(value: string): boolean | undefined {
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return undefined;
}

function clampIterations(value: number): number {
  return Math.max(1, Math.min(Math.floor(value), HARD_MAX_ITERATIONS));
}

function compactTopic(topic: string): string {
  if (topic.length <= STATUS_TOPIC_MAX) return topic;
  return `${topic.slice(0, STATUS_TOPIC_MAX - 1)}…`;
}

function promptObjectiveText(value: unknown): string {
  const info = objectiveInfo(value, PROMPT_OBJECTIVE_MAX);
  if (info.topic.length <= PROMPT_OBJECTIVE_MAX) return info.topic;
  return `${info.topic.slice(0, PROMPT_OBJECTIVE_MAX - 1)}…`;
}

function objectiveIntakeSummary(value: unknown): string {
  const info = objectiveInfo(value, PROMPT_OBJECTIVE_MAX);
  return `${info.kind} objective · length ${info.rawLength} · hash ${info.topicHash}`;
}

function objectiveInfo(value: unknown, oversizedThreshold: number): { topic: string; rawLength: number; topicHash: string; kind: ObjectiveKind; sanitized: boolean } {
  const rawTopic = singleLineText(value);
  const topic = stripProviderErrorSuffix(rawTopic);
  const sanitized = topic !== rawTopic;
  const kind: ObjectiveKind = sanitized ? "provider-noise" : rawTopic.length > oversizedThreshold ? "oversized" : "short";
  return {
    topic,
    rawLength: rawTopic.length,
    topicHash: hashText(topic),
    kind,
    sanitized,
  };
}

function objectiveText(value: unknown): string {
  return objectiveInfo(value, PROMPT_OBJECTIVE_MAX).topic;
}

function stripProviderErrorSuffix(text: string): string {
  const errorIndex = text.search(/\bError:\s+Codex error:.*context[\s_-]*length[\s_-]*exceeded/i);
  if (errorIndex > 0) return text.slice(0, errorIndex).trim();
  return text;
}

function createRunId(startedAt: string): string {
  const timestamp = Date.parse(startedAt);
  const encodedTime = Number.isFinite(timestamp) ? timestamp.toString(36) : Date.now().toString(36);
  return `dl-${encodedTime}-${crypto.randomBytes(3).toString("hex")}`;
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
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
  parseValidated,
  resolveProjectAdapter,
  statusReport,
  tokenizeArgs,
};
