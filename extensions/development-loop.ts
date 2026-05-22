import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";

type LoopPhase = "idle" | "started" | "queued" | "running" | "reported" | "blocked" | "done";
type LoopDecision = "continue" | "stop" | "blocked" | "done";

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
};

type LoopLogRecord = {
  at: string;
  event: string;
  adapterName: string;
  topic: string;
  iteration: number;
  maxIterations: number;
  phase: LoopPhase;
  decision?: string;
  reason?: string;
  logPath: string;
};

type ParsedCommand = {
  command: "start" | "restart" | "stop" | "status" | "init" | "adapters" | "help";
  adapter?: string;
  topic?: string;
  iterations?: number;
  commit?: boolean;
  push?: boolean;
  force?: boolean;
  dryRun?: boolean;
  yes?: boolean;
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
const AUTO_CONTINUATION_RETRY_MS = 50;
const AUTO_CONTINUATION_MAX_ATTEMPTS = 20;
const EMPTY_RESPONSE_RETRY_MS = 50;
const EMPTY_RESPONSE_MAX_RETRIES = 1;
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

    const assistantText = lastAssistantText(event.messages ?? []);
    const decision = parseLoopDecision(assistantText);
    const validated = parseValidated(assistantText);

    if (!decision) {
      if (!assistantText.trim()) {
        const emptyResponseRetries = (state.emptyResponseRetries ?? 0) + 1;
        if (emptyResponseRetries > EMPTY_RESPONSE_MAX_RETRIES) {
          blockLoop(pi, ctx, "empty provider response retry limit reached");
          return;
        }
        state = { ...state, phase: "running", lastReason: "empty_agent_response_waiting_for_compaction", emptyResponseRetries };
        appendLoopLog("empty_agent_response_waiting_for_compaction", { reason: "missing_assistant_text" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development loop is waiting for compaction or retry after an empty provider response.", "warning");
        scheduleEmptyResponseRetry(pi, ctx, state.iteration, emptyResponseRetries);
        return;
      }
      if (isContextOverflowProviderError(assistantText)) {
        state = { ...state, phase: "running", lastReason: "context_overflow_waiting_for_compaction", emptyResponseRetries: 0 };
        appendLoopLog("context_overflow_waiting_for_compaction", { reason: "provider_context_length_exceeded" });
        pi.appendEntry(CUSTOM_STATE_TYPE, state);
        refreshUi(ctx);
        notify(ctx, "Development loop is waiting for compaction after a provider context-overflow error.", "warning");
        return;
      }
      blockLoop(pi, ctx, "missing DEV_LOOP_DECISION final marker");
      return;
    }

    if (state.emptyResponseRetries) {
      state = { ...state, emptyResponseRetries: 0 };
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
      appendLoopLog("loop_finished", { decision, reason: decision });
      pi.appendEntry(CUSTOM_STATE_TYPE, state);
      refreshUi(ctx);
      notify(ctx, `Development loop ${decision}.`);
      return;
    }

    state = { ...state, phase: "reported", lastDecision: decision };
    appendLoopLog("iteration_result", { decision });
    pi.appendEntry(CUSTOM_STATE_TYPE, state);
    refreshUi(ctx);

    if (state.iteration >= state.maxIterations) {
      state = { ...state, active: false, phase: "done", lastDecision: "done", lastReason: "max_iterations_reached" };
      appendLoopLog("loop_finished", { decision: "done", reason: "max_iterations_reached" });
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
    getArgumentCompletions: (prefix: string) => ["start", "restart", "status", "stop", "init", "adapters", "help"]
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

  state = {
    active: true,
    adapterName: adapter.name,
    topic,
    iteration: 1,
    maxIterations,
    startedAt: new Date().toISOString(),
    logPath,
    phase: "started",
    commit,
    push,
    emptyResponseRetries: 0,
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
  state = { ...state, iteration: state.iteration + 1, phase: "queued", emptyResponseRetries: 0 };
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
  state = { ...state, phase: "running", lastReason: "resumed_after_compaction", emptyResponseRetries: 0 };
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
  state = { ...state, phase: asFollowUp ? "queued" : "running", emptyResponseRetries: 0 };
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
  state = { ...state, active: false, phase: "blocked", lastDecision: decision ?? "blocked", lastReason: reason, emptyResponseRetries: 0 };
  appendLoopLog("loop_blocked", { decision, reason });
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
Topic/objective: ${singleLineText(s.topic)}
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
9. End with exact changed files, validations, blocker state, and these two final marker lines:
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done

Only use DEV_LOOP_VALIDATED: yes after validation evidence exists. Use DEV_LOOP_DECISION: blocked when validation is red, evidence is missing, scope is unsafe, or credentials/external services are required.`;
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

function buildDevelopmentLoopCompactionInstructions(s: LoopState, resolved: ResolvedProjectAdapter, cwd: string): string {
  return `Preserve development loop state for automatic continuation.

Current development loop state:
- Project root: ${cwd}
- Adapter: ${resolved.adapter.name}
- Objective: ${singleLineText(s.topic)}
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
Current objective: ${singleLineText(s.topic)}
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
    `topic: ${singleLineText(s.topic)}`,
    `state: ${stateExplanation(s, last)}`,
    summarizeLastLoopRecord(last),
    `log: ${relativeToCwd(cwd, logPath)}`,
    "Commands: /development-loop status | /development-loop stop | /development-loop restart --iterations=N <topic> | /development-loop init",
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
  const detail = compactJoin([
    recordEvent(last) ? `last ${recordEvent(last)}` : "last none",
    recordTime(last),
    last?.iteration !== undefined ? `i${String(last.iteration)}` : undefined,
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
  if (s.active) return compactTopic(singleLineText(s.topic));
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
  const at = record?.at;
  if (typeof at !== "string") return undefined;
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
  const at = record.at;
  if (typeof at === "string") parts.push(`at ${at}`);
  if (record.iteration !== undefined) parts.push(`iteration ${String(record.iteration)}`);
  if (typeof record.decision === "string") parts.push(`decision ${record.decision}`);
  if (typeof record.reason === "string") parts.push(`reason ${record.reason}`);
  return parts.join("; ");
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
    topic: state.topic,
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
  const value = record?.event;
  return typeof value === "string" ? value : undefined;
}

function isContextOverflowProviderError(text: string): boolean {
  return /context[\s_-]*length[\s_-]*exceeded|input exceeds the context window|context overflow detected/i.test(text);
}

function parseLoopDecision(text: string): LoopDecision | undefined {
  const match = text.match(/DEV_LOOP_DECISION:\s*(continue|stop|blocked|done)/i);
  return match?.[1]?.toLowerCase() as LoopDecision | undefined;
}

function parseValidated(text: string): boolean | undefined {
  const match = text.match(/DEV_LOOP_VALIDATED:\s*(yes|no)/i);
  if (!match) return undefined;
  return match[1].toLowerCase() === "yes";
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
  const known = new Set(["start", "restart", "stop", "status", "init", "adapters", "help"]);
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
    if (token === "--no-dry-run") {
      parsed.dryRun = false;
      continue;
    }
    if (token.startsWith("--dry-run=") || token.startsWith("--preview=")) {
      parsed.dryRun = parseBoolean(token.split("=").slice(1).join("="));
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
