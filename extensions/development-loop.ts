import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

type LoopPhase = "idle" | "started" | "queued" | "running" | "reported" | "blocked" | "done";
type LoopDecision = "continue" | "stop" | "blocked" | "done";

type ProjectConfig = {
  adapter?: string;
  defaultTopic?: string;
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
  command: "start" | "restart" | "stop" | "status" | "init" | "adapters";
  adapter?: string;
  topic?: string;
  iterations?: number;
  commit?: boolean;
  push?: boolean;
  validationCommands: string[];
  preflightCommands: string[];
  skills: string[];
};

type UiLikeContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: string) => void;
    setStatus?: (key: string, value: string | undefined) => void;
    setWidget?: (key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }) => void;
    confirm?: (title: string, message: string, options?: unknown) => Promise<boolean> | boolean;
    select?: (title: string, items: Array<string | { value: string; label?: string; description?: string }>) => Promise<string | undefined> | string | undefined;
    input?: (title: string, placeholder?: string) => Promise<string | undefined> | string | undefined;
    editor?: (title: string, text?: string) => Promise<string | undefined> | string | undefined;
  };
  sessionManager?: {
    getEntries?: () => Array<{ type?: string; customType?: string; data?: unknown }>;
    getCwd?: () => string;
  };
  isIdle?: () => boolean;
  hasPendingMessages?: () => boolean;
};

const CUSTOM_STATE_TYPE = "development-loop-state";
const DEFAULT_CONFIG_RELATIVE = path.join(".pi", "development-loop.json");
const DEFAULT_LOG_RELATIVE = path.join(".pi", "development-loop", "logs.jsonl");
const DEFAULT_ITERATIONS = 3;
const HARD_MAX_ITERATIONS = 25;
const STATUS_TOPIC_MAX = 72;

const COMMON_PREFLIGHT = [
  "pwd",
  "git rev-parse --show-toplevel 2>/dev/null || true",
  "git rev-parse --abbrev-ref HEAD 2>/dev/null || true",
  "git status --short --branch --untracked-files=all 2>/dev/null || true",
];

const BUILT_IN_ADAPTERS: LoopAdapter[] = [
  {
    name: "gormes",
    label: "Gormes",
    description: "Gormes Go-native Hermes-compatible agent runtime",
    defaultTopic: "auto-select the highest-impact builder-ready row or parity-safe improvement",
    skills: [
      "gormes-skill-manager",
      "gormes-delivery-loop",
      "gormes-architecture-zoomout",
      "gormes-planner",
      "gormes-hermes-parity",
      "gormes-builder",
      "gormes-tdd-slice",
      "gormes-git when commit/push is enabled",
    ],
    preflightCommands: COMMON_PREFLIGHT,
    validationCommands: [
      "go test ./... -count=1",
      "go run ./cmd/progress validate",
      "git diff --check",
    ],
    stopConditions: [
      "branch is not development",
      "progress row is not builder-ready",
      "upstream parity evidence is missing for a parity claim",
      "validation fails twice with the same blocker",
      "slice would touch unrelated dirty work",
    ],
    matches(cwd: string): boolean {
      if (path.basename(cwd) === "gormes-agent") return true;
      if (safeRead(path.join(cwd, "go.mod")).includes("github.com/TrebuchetDynamics/gormes-agent")) return true;
      return safeRead(path.join(cwd, "AGENTS.md")).toLowerCase().includes("gormes-agent");
    },
  },
  {
    name: "navivox",
    label: "Navivox",
    description: "Navivox app and voice/chat UX delivery loop",
    defaultTopic: "auto-select the highest-impact Navivox UX or gateway-channel improvement",
    skills: [
      "navivox-telegram-ui for Telegram-like chat/contact UI",
      "test-driven-development for implementation slices",
      "verification-before-completion before reporting done",
    ],
    preflightCommands: COMMON_PREFLIGHT,
    validationCommands: [
      "flutter analyze",
      "flutter test",
      "git diff --check",
    ],
    stopConditions: [
      "Flutter tools are unavailable",
      "repo ownership or untracked app tree makes commit unsafe",
      "validation fails twice with the same blocker",
      "slice would touch unrelated dirty work",
    ],
    matches(cwd: string): boolean {
      if (path.basename(cwd) === "navivox-app") return true;
      const pubspec = safeRead(path.join(cwd, "pubspec.yaml")).toLowerCase();
      return pubspec.includes("name: navivox") || pubspec.includes("navivox_app");
    },
  },
  {
    name: "generic-git",
    label: "Generic Git",
    description: "Conservative generic git-project development loop",
    defaultTopic: "make the smallest safe project improvement with tests",
    skills: [
      "brainstorming for creative/product changes",
      "test-driven-development for code changes",
      "verification-before-completion before reporting done",
    ],
    preflightCommands: COMMON_PREFLIGHT,
    validationCommands: [
      "git diff --check",
    ],
    stopConditions: [
      "project instructions are missing or conflict with the requested work",
      "no relevant test/build command can be identified",
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
  }

  async function onAgentEnd(event: { messages?: Array<{ role?: string; content?: unknown; stopReason?: string }> }, ctx: ExtensionContext) {
    if (!state.active) return;
    if (state.phase !== "running") return;

    const assistantText = lastAssistantText(event.messages ?? []);
    const decision = parseLoopDecision(assistantText);
    const validated = parseValidated(assistantText);

    if (!decision) {
      blockLoop(pi, ctx, "missing DEV_LOOP_DECISION final marker");
      return;
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

    queueNextIteration(pi, ctx);
  }

  pi.on("session_start", onSessionStart);
  pi.on("agent_end", onAgentEnd);

  const command = {
    description: "Run an adapter-aware project development loop",
    getArgumentCompletions: (prefix: string) => ["start", "restart", "status", "stop", "init", "adapters"]
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
    notify(ctx, `${statusLine(state)}\nUse /development-loop restart to replace it or /development-loop stop to stop it.`);
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
  const commit = parsed.commit ?? resolved.config.commit ?? false;
  const push = parsed.push ?? resolved.config.push ?? false;
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
  state = { ...state, iteration: state.iteration + 1, phase: "queued" };
  appendLoopLog("iteration_queued");
  refreshUi(ctx);
  notify(ctx, `Queued development loop iteration ${state.iteration}/${state.maxIterations}.`);
  sendIterationPrompt(pi, ctx, resolved, true);
}

function sendIterationPrompt(pi: ExtensionAPI, ctx: UiLikeContext, resolved: ResolvedProjectAdapter, asFollowUp = false) {
  const prompt = buildIterationPrompt(state, resolved, contextCwd(ctx));
  state = { ...state, phase: asFollowUp ? "queued" : "running" };
  appendLoopLog(asFollowUp ? "iteration_prompt_queued" : "iteration_prompt_sent");
  refreshUi(ctx);
  const idle = typeof ctx.isIdle === "function" ? ctx.isIdle() : true;
  if (asFollowUp || !idle) {
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  } else {
    pi.sendUserMessage(prompt);
  }
  state = { ...state, phase: "running" };
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
}

function blockLoop(pi: ExtensionAPI, ctx: ExtensionContext, reason: string, decision?: string) {
  state = { ...state, active: false, phase: "blocked", lastDecision: decision ?? "blocked", lastReason: reason };
  appendLoopLog("loop_blocked", { decision, reason });
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
  refreshUi(ctx);
  notify(ctx, `Development loop blocked: ${reason}`, "warning");
}

async function initConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext) {
  const cwd = contextCwd(ctx);
  let adapterName = parsed.adapter;
  let defaultTopic = parsed.topic;
  let validationCommands = parsed.validationCommands;
  let preflightCommands = parsed.preflightCommands;
  let skills = parsed.skills;
  let commit = parsed.commit ?? false;
  let push = parsed.push ?? false;

  if (ctx.hasUI && !adapterName) {
    const detected = resolveProjectAdapter(cwd).adapter.name;
    const selection = await ctx.ui.select("Development loop adapter", [
      { value: detected, label: `${detected} (detected)` },
      ...BUILT_IN_ADAPTERS.filter((adapter) => adapter.name !== detected).map((adapter) => ({
        value: adapter.name,
        label: adapter.label,
        description: adapter.description,
      })),
    ]);
    adapterName = typeof selection === "string" ? selection : detected;
  }

  adapterName = adapterName || resolveProjectAdapter(cwd).adapter.name;
  const adapter = getAdapterByName(adapterName) ?? BUILT_IN_ADAPTERS[BUILT_IN_ADAPTERS.length - 1];

  if (ctx.hasUI && !defaultTopic) {
    defaultTopic = await ctx.ui.input("Default development-loop topic", adapter.defaultTopic) || adapter.defaultTopic;
  }
  defaultTopic = defaultTopic || adapter.defaultTopic;

  if (ctx.hasUI && validationCommands.length === 0) {
    const edited = await ctx.ui.editor("Validation commands, one per line", adapter.validationCommands.join("\n"));
    validationCommands = splitLines(edited || adapter.validationCommands.join("\n"));
  }
  if (validationCommands.length === 0) validationCommands = adapter.validationCommands;

  if (preflightCommands.length === 0) preflightCommands = adapter.preflightCommands;
  if (skills.length === 0) skills = adapter.skills;

  if (ctx.hasUI && parsed.commit === undefined) {
    commit = await ctx.ui.confirm("Commit by default?", "Allow /development-loop start to ask the agent to commit validated slices by default?") || false;
  }
  if (ctx.hasUI && parsed.push === undefined) {
    push = commit ? await ctx.ui.confirm("Push by default?", "Allow /development-loop start to ask the agent to push committed slices by default?") || false : false;
  }

  const config: ProjectConfig = {
    adapter: adapterName,
    defaultTopic,
    skills,
    preflightCommands,
    validationCommands,
    commit,
    push,
    logPath: DEFAULT_LOG_RELATIVE,
    maxIterations: DEFAULT_ITERATIONS,
    stopConditions: adapter.stopConditions,
  };

  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (fs.existsSync(configPath) && ctx.hasUI) {
    const ok = await ctx.ui.confirm("Overwrite development-loop config?", `${relativeToCwd(cwd, configPath)} already exists. Replace it?`);
    if (!ok) {
      notify(ctx, "Development-loop init cancelled.");
      return;
    }
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  notify(ctx, `Wrote ${relativeToCwd(cwd, configPath)}`);
}

function publishStatus(pi: ExtensionAPI, ctx: UiLikeContext) {
  const cwd = contextCwd(ctx);
  const text = statusReport(state, cwd);
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-loop-status", content: text, display: true });
  }
}

function publishAdapters(pi: ExtensionAPI, ctx: UiLikeContext) {
  const cwd = contextCwd(ctx);
  const resolved = resolveProjectAdapter(cwd);
  const isBuiltInAdapter = BUILT_IN_ADAPTERS.some((adapter) => adapter.name === resolved.adapter.name);
  const projectAdapterLines = isBuiltInAdapter ? [] : [
    `Project-configured adapter ${resolved.adapter.name}: ${resolved.adapter.description}`,
  ];
  const text = [
    `Detected adapter: ${resolved.adapter.name}`,
    ...projectAdapterLines,
    "Built-in adapters:",
    ...BUILT_IN_ADAPTERS.map((adapter) => `- ${adapter.name}: ${adapter.description}`),
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
  const skills = nonEmpty(config.skills) ? config.skills! : adapter.skills;
  const stopConditions = nonEmpty(config.stopConditions) ? config.stopConditions! : adapter.stopConditions;
  const commitPolicy = s.commit
    ? s.push
      ? "Commit each validated coherent slice and push to the current branch only when the worktree is safe."
      : "Commit each validated coherent slice when the worktree is safe; do not push."
    : "Do not commit or push unless the user explicitly asks later.";

  return `Use the project instructions and matching skills now. Development loop iteration ${s.iteration}/${s.maxIterations}.

Project root: ${cwd}
Adapter: ${adapter.name} — ${adapter.description}
Topic/objective: ${s.topic}
Config source: ${resolved.configLoaded ? relativeToCwd(cwd, resolved.configPath) : "built-in adapter defaults"}
Loop log path: ${relativeToCwd(cwd, s.logPath)}

Suggested skills/adapters for this project:
${skills.map((skill) => `- ${skill}`).join("\n") || "- Use the smallest project-matching skill set."}

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
4. Choose one small verifiable slice for the topic.
5. Prefer test-first changes when editing code.
6. Run the validation commands above. If a command is not applicable, explain exact evidence and substitute the closest project-appropriate check.
7. If validation fails twice with the same cause, stop and report the first failing stderr line.
8. Apply the commit/push policy above.
9. End with exact changed files, validations, blocker state, and these two final marker lines:
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done

Only use DEV_LOOP_VALIDATED: yes after validation evidence exists. Use DEV_LOOP_DECISION: blocked when validation is red, evidence is missing, scope is unsafe, or credentials/external services are required.`;
}

function resolveProjectAdapter(cwd: string, requestedAdapter?: string): ResolvedProjectAdapter {
  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);
  const loaded = loadProjectConfig(configPath);
  const config = loaded.config ?? {};
  const adapterName = requestedAdapter || config.adapter;
  const builtIn = adapterName ? getAdapterByName(adapterName) : BUILT_IN_ADAPTERS.find((adapter) => adapter.matches(cwd));
  const adapter = builtIn ?? (adapterName ? customAdapter(adapterName, config) : getAdapterByName("generic-git")!);
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
    adapter: config.adapter ?? adapter.name,
    defaultTopic: config.defaultTopic ?? adapter.defaultTopic,
    skills: nonEmpty(config.skills) ? config.skills : adapter.skills,
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
    adapter: stringOrUndefined(raw.adapter),
    defaultTopic: stringOrUndefined(raw.defaultTopic),
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

function customAdapter(name: string, config: ProjectConfig): LoopAdapter {
  return {
    ...getAdapterByName("generic-git")!,
    name,
    label: name,
    description: `Project-configured adapter ${name}`,
    defaultTopic: config.defaultTopic || getAdapterByName("generic-git")!.defaultTopic,
    skills: config.skills || getAdapterByName("generic-git")!.skills,
    preflightCommands: config.preflightCommands || getAdapterByName("generic-git")!.preflightCommands,
    validationCommands: config.validationCommands || getAdapterByName("generic-git")!.validationCommands,
    stopConditions: config.stopConditions || getAdapterByName("generic-git")!.stopConditions,
    matches: () => true,
  };
}

function statusReport(s: LoopState, cwd = process.cwd()): string {
  const logPath = s.logPath || path.join(cwd, DEFAULT_LOG_RELATIVE);
  const last = readLastLoopRecord(logPath);
  return [
    statusLine(s),
    `adapter: ${s.adapterName}`,
    `topic: ${s.topic}`,
    `state: ${stateExplanation(s, last)}`,
    summarizeLastLoopRecord(last),
    `log: ${relativeToCwd(cwd, logPath)}`,
    "Commands: /development-loop status | /development-loop stop | /development-loop restart --iterations=N <topic> | /development-loop init",
  ].join("\n");
}

function statusLine(s: LoopState): string {
  if (!s.active) return `Development loop: ${s.phase === "idle" ? "idle" : s.phase}${s.lastDecision ? ` (${s.lastDecision})` : ""}`;
  return `Development loop: ${s.phase} ${s.iteration}/${s.maxIterations} ${compactTopic(s.topic)}`;
}

function refreshUi(ctx: UiLikeContext) {
  if (!ctx.hasUI || !ctx.ui) return;
  ctx.ui.setStatus?.("development-loop", statusLine(state));
  ctx.ui.setWidget?.("development-loop", statusWidgetLines(state, contextCwd(ctx)), { placement: "belowEditor" });
}

function statusWidgetLines(s: LoopState, cwd: string): string[] | undefined {
  if (!s.active && s.phase === "idle" && !s.lastDecision) return undefined;
  const last = readLastLoopRecord(s.logPath || path.join(cwd, DEFAULT_LOG_RELATIVE));
  return [
    statusLine(s),
    `Adapter: ${s.adapterName} • ${stateExplanation(s, last)}`,
    summarizeLastLoopRecord(last),
    `Log: ${relativeToCwd(cwd, s.logPath || path.join(cwd, DEFAULT_LOG_RELATIVE))}`,
  ];
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
  const known = new Set(["start", "restart", "stop", "status", "init", "adapters"]);
  const command = known.has(commandToken) ? tokens.shift() as ParsedCommand["command"] : "start";
  const parsed: ParsedCommand = {
    command,
    validationCommands: [],
    preflightCommands: [],
    skills: [],
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
    if (token === "--iterations" || token === "-n") {
      parsed.iterations = numberOrUndefined(tokens[++i]);
      continue;
    }
    if (token.startsWith("--iterations=") || token.startsWith("-n=")) {
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
    if (token === "--validation") {
      const value = tokens[++i];
      if (value) parsed.validationCommands.push(value);
      continue;
    }
    if (token.startsWith("--validation=")) {
      parsed.validationCommands.push(token.slice("--validation=".length));
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

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
