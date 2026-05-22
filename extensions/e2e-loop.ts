import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type E2EPhase = "idle" | "running" | "blocked" | "done";
type E2EDecision = "continue" | "stop" | "blocked" | "done";

type E2EState = {
  active: boolean;
  objective: string;
  iteration: number;
  maxIterations: number;
  phase: E2EPhase;
  startedAt: string;
  logPath: string;
  lastDecision?: E2EDecision | string;
  lastReason?: string;
};

type ParsedCommand = {
  command: "start" | "restart" | "stop" | "status" | "help";
  objective?: string;
  iterations?: number;
};

type E2ELogRecord = {
  at: string;
  event: string;
  objective: string;
  iteration: number;
  maxIterations: number;
  phase: E2EPhase;
  logPath: string;
  decision?: string;
  reason?: string;
};

type UiLikeContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: string) => void;
    setStatus?: (key: string, value: string | undefined) => void;
  };
  sessionManager?: {
    getCwd?: () => string;
    getEntries?: () => Array<{ type?: string; customType?: string; data?: unknown }>;
  };
  isIdle?: () => boolean;
};

const CUSTOM_STATE_TYPE = "e2e-loop-state";
const DEFAULT_LOG_RELATIVE = path.join(".pi", "e2e-loop", "logs.jsonl");
const DEFAULT_OBJECTIVE = "test the app fully through real usage paths";
const DEFAULT_ITERATIONS = 1;
const HARD_MAX_ITERATIONS = 10;
const STATUS_OBJECTIVE_MAX = 72;

let state: E2EState = inactiveState();

export default function e2eLoopExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    state = restoreState(ctx.sessionManager?.getEntries?.() ?? []) ?? inactiveState();
    refreshUi(ctx);
  });

  pi.on("agent_end", async (event: { messages?: Array<{ role?: string; content?: unknown }> }, ctx) => {
    if (!state.active || state.phase !== "running") return;

    const assistantText = lastAssistantText(event.messages ?? []);
    const decision = parseE2EDecision(assistantText);
    const validated = parseE2EValidated(assistantText);

    if (!decision) {
      state = { ...state, active: false, phase: "blocked", lastDecision: "blocked", lastReason: "missing E2E_LOOP_DECISION final marker" };
      appendE2ELog("loop_blocked", { reason: state.lastReason });
      persistState(pi);
      refreshUi(ctx);
      notify(ctx, "E2E loop blocked: missing E2E_LOOP_DECISION final marker", "warning");
      return;
    }

    if (requiresValidation(decision) && validated !== true) {
      state = { ...state, active: false, phase: "blocked", lastDecision: decision, lastReason: "missing E2E_LOOP_VALIDATED: yes" };
      appendE2ELog("loop_blocked", { decision, reason: state.lastReason });
      persistState(pi);
      refreshUi(ctx);
      notify(ctx, "E2E loop blocked: missing E2E_LOOP_VALIDATED: yes", "warning");
      return;
    }

    if (decision === "blocked" || decision === "stop" || decision === "done") {
      state = {
        ...state,
        active: false,
        phase: decision === "done" ? "done" : decision === "blocked" ? "blocked" : "idle",
        lastDecision: decision,
        lastReason: decision,
      };
      appendE2ELog("loop_finished", { decision, reason: decision });
      persistState(pi);
      refreshUi(ctx);
      notify(ctx, `E2E loop ${decision}.`);
      return;
    }

    appendE2ELog("iteration_result", { decision });
    persistState(pi);

    if (state.iteration >= state.maxIterations) {
      state = { ...state, active: false, phase: "done", lastDecision: "done", lastReason: "max_iterations_reached" };
      appendE2ELog("loop_finished", { decision: "done", reason: "max_iterations_reached" });
      persistState(pi);
      refreshUi(ctx);
      notify(ctx, `E2E loop stopped after ${state.iteration}/${state.maxIterations} iteration(s).`);
      return;
    }

    state = { ...state, iteration: state.iteration + 1, lastDecision: decision };
    refreshUi(ctx);
    sendE2EPrompt(pi, ctx);
  });

  const command = {
    description: "Run a real-usage E2E testing loop for UI, API, and TUI apps",
    getArgumentCompletions: (prefix: string) => ["start", "restart", "status", "stop", "help"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };

  pi.registerCommand("e2e-loop", command);
  pi.registerCommand("e2e", { ...command, description: "Alias for /e2e-loop" });
}

async function runCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) {
  const parsed = parseArgs(args);
  switch (parsed.command) {
    case "status":
      publishStatus(pi, ctx);
      return;
    case "stop":
      state = { ...state, active: false, phase: "idle", lastDecision: "stopped_by_user" };
      appendE2ELog("loop_stopped", { reason: "stopped_by_user" });
      persistState(pi);
      refreshUi(ctx);
      notify(ctx, "E2E loop stopped.");
      return;
    case "help":
      publishHelp(pi, ctx);
      return;
    case "restart":
      startLoop(pi, ctx, parsed);
      return;
    case "start":
    default:
      if (state.active) {
        notify(ctx, `${statusLine(state)}\nUse /e2e-loop restart to replace it or /e2e-loop stop to stop it.`, "warning");
        refreshUi(ctx);
        return;
      }
      startLoop(pi, ctx, parsed);
  }
}

function startLoop(pi: ExtensionAPI, ctx: UiLikeContext, parsed: ParsedCommand) {
  const cwd = contextCwd(ctx);
  state = {
    active: true,
    objective: parsed.objective || DEFAULT_OBJECTIVE,
    iteration: 1,
    maxIterations: clampIterations(parsed.iterations ?? DEFAULT_ITERATIONS),
    phase: "running",
    startedAt: new Date().toISOString(),
    logPath: absoluteLogPath(cwd),
  };
  appendE2ELog("loop_started");
  persistState(pi);
  refreshUi(ctx);
  notify(ctx, `Starting E2E loop ${state.iteration}/${state.maxIterations}: ${state.objective}; log: ${relativeToCwd(cwd, state.logPath)}`);
  sendE2EPrompt(pi, ctx);
}

function sendE2EPrompt(pi: ExtensionAPI, ctx: UiLikeContext) {
  const prompt = buildE2EPrompt(state, contextCwd(ctx));
  const asFollowUp = typeof ctx.isIdle === "function" && !ctx.isIdle();
  appendE2ELog(asFollowUp ? "iteration_prompt_queued" : "iteration_prompt_sent");
  persistState(pi);
  if (asFollowUp) {
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    return;
  }
  pi.sendUserMessage(prompt);
}

function buildE2EPrompt(s: E2EState, cwd: string): string {
  return `Use the project instructions and matching skills now. E2E loop run ${s.iteration}/${s.maxIterations}.

Project root: ${cwd}
Objective: ${s.objective}

Run one complete real-usage E2E testing iteration:
1. State scope lock with the exact absolute project path.
2. Inspect the app shape and current dirty state before edits; preserve unrelated work.
3. Classify the target as UI, API, TUI/CLI, mobile, library, or mixed app.
4. Build a feature inventory and coverage matrix for all user-visible flows, public API contracts, TUI commands, and critical error paths you can discover.
5. If it is a web UI, use Playwright or the project-standard browser E2E tool for the highest-risk uncovered flows and save screenshot evidence for key states.
6. If it is a Flutter/mobile UI, use Maestro, Flutter integration_test, or the project-standard harness for the highest-risk uncovered flows and save screenshots when the tool supports it.
7. If it is an API, inventory every public endpoint or contract surface and test request/response schemas, status codes, error contracts, and auth/permission boundaries when locally available.
8. If it is a TUI/CLI, exercise real commands or a PTY-style harness and preserve a TUI transcript or equivalent observable output evidence with exit codes and key flows.
9. Add the smallest durable real-usage test or improve the existing E2E harness toward the next uncovered row in the coverage matrix; do not fake product behavior to make tests pass.
10. Run the most relevant project validation commands you can identify plus git diff --check.
11. Report the coverage matrix status, screenshot paths, contract-test files, TUI transcript paths, or the exact blocker if required tooling, credentials, emulators, browsers, or services are missing.

Prefer test-first changes when editing code. For UI work, screenshot evidence is required before claiming success. For API work, public endpoint contract assertions are required before claiming success. For TUI work, observable terminal behavior and a TUI transcript are required before claiming success.

End with these exact marker lines:
E2E_LOOP_VALIDATED: yes|no
E2E_LOOP_DECISION: continue|stop|blocked|done

Only use E2E_LOOP_VALIDATED: yes after fresh validation evidence exists. Use E2E_LOOP_DECISION: blocked when validation is red, required services are missing, credentials are unavailable, or the scope is unsafe.`;
}

function publishStatus(pi: ExtensionAPI, ctx: UiLikeContext) {
  const text = statusReport(state, contextCwd(ctx));
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "e2e-loop-status", content: text, display: true });
  }
}

function publishHelp(pi: ExtensionAPI, ctx: UiLikeContext) {
  const text = [
    "E2E loop commands:",
    "- /e2e-loop start [--iterations=N] <objective> — start a real-usage E2E test loop",
    "- /e2e-loop restart [--iterations=N] <objective> — replace the active E2E loop",
    "- /e2e-loop status — show current E2E loop state",
    "- /e2e-loop stop — stop the active E2E loop",
    "- /e2e-loop help — show this help",
    "",
    "Testing guidance:",
    "- Inventory features first: keep a coverage matrix of user-visible flows, public endpoints, TUI commands, and critical errors.",
    "- Web UI: use Playwright or the project-standard browser E2E tool and capture screenshots.",
    "- Flutter/mobile UI: use Maestro, Flutter integration_test, or the project-standard harness and capture screenshots when supported.",
    "- API: test every locally reachable public endpoint contract with real request/response assertions.",
    "- TUI/CLI: exercise observable terminal behavior through real commands or a PTY-style harness and keep a TUI transcript.",
  ].join("\n");
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "e2e-loop-help", content: text, display: true });
  }
}

function statusReport(s: E2EState, cwd = process.cwd()): string {
  return [
    statusLine(s),
    `objective: ${s.objective || DEFAULT_OBJECTIVE}`,
    `state: ${stateExplanation(s)}`,
    `log: ${relativeToCwd(cwd, s.logPath)}`,
    "Commands: /e2e-loop status | /e2e-loop stop | /e2e-loop restart --iterations=N <objective>",
  ].join("\n");
}

function statusLine(s: E2EState): string {
  return compactJoin([
    s.active ? "● running" : s.phase === "blocked" ? "■ blocked" : s.phase === "done" ? "✓ done" : "○ idle",
    `e2e ${s.iteration}/${s.maxIterations}`,
    compactObjective(s.objective),
  ]);
}

function refreshUi(ctx: UiLikeContext) {
  if (!ctx.hasUI || !ctx.ui) return;
  ctx.ui.setStatus?.("e2e-loop", statusLine(state));
}

function stateExplanation(s: E2EState): string {
  if (s.phase === "blocked") return `blocked${s.lastReason ? `: ${s.lastReason}` : ""}`;
  if (s.phase === "done") return s.lastReason === "max_iterations_reached" ? "done after max iterations" : "done";
  if (s.active) return "running";
  return "idle";
}

function parseArgs(raw: string | undefined): ParsedCommand {
  const tokens = tokenizeArgs(raw || "");
  const commandToken = tokens[0];
  const known = new Set(["start", "restart", "stop", "status", "help"]);
  const command = known.has(commandToken) ? tokens.shift() as ParsedCommand["command"] : "start";
  const parsed: ParsedCommand = { command };
  const positional: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--iterations" || token === "--max-iterations" || token === "-n") {
      parsed.iterations = numberOrUndefined(tokens[++i]);
      continue;
    }
    if (token.startsWith("--iterations=") || token.startsWith("--max-iterations=") || token.startsWith("-n=")) {
      parsed.iterations = numberOrUndefined(token.split("=").slice(1).join("="));
      continue;
    }
    positional.push(token);
  }

  if (positional.length > 0) parsed.objective = positional.join(" ").trim();
  return parsed;
}

function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
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

function parseE2EDecision(text: string): E2EDecision | undefined {
  return parseFinalE2EMarkerBlock(text)?.decision;
}

function parseE2EValidated(text: string): boolean | undefined {
  return parseFinalE2EMarkerBlock(text)?.validated;
}

function parseFinalE2EMarkerBlock(text: string): { validated: boolean; decision: E2EDecision } | undefined {
  const match = text.match(/(?:^|\r?\n)\s*E2E_LOOP_VALIDATED:\s*(yes|no)\s*\r?\n\s*E2E_LOOP_DECISION:\s*(continue|stop|blocked|done)\s*$/i);
  if (!match) return undefined;
  return {
    validated: match[1].toLowerCase() === "yes",
    decision: match[2].toLowerCase() as E2EDecision,
  };
}

function requiresValidation(decision: E2EDecision): boolean {
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

function inactiveState(): E2EState {
  return {
    active: false,
    objective: "",
    iteration: 0,
    maxIterations: DEFAULT_ITERATIONS,
    phase: "idle",
    startedAt: new Date(0).toISOString(),
    logPath: DEFAULT_LOG_RELATIVE,
  };
}

function restoreState(entries: Array<{ type?: string; customType?: string; data?: unknown }>): E2EState | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === CUSTOM_STATE_TYPE && isE2EState(entry.data)) return entry.data;
  }
  return undefined;
}

function isE2EState(value: unknown): value is E2EState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<E2EState>;
  return typeof item.active === "boolean" &&
    typeof item.objective === "string" &&
    typeof item.iteration === "number" &&
    typeof item.maxIterations === "number" &&
    typeof item.phase === "string" &&
    typeof item.startedAt === "string" &&
    typeof item.logPath === "string";
}

function persistState(pi: ExtensionAPI) {
  pi.appendEntry(CUSTOM_STATE_TYPE, state);
}

function appendE2ELog(event: string, extra: Partial<E2ELogRecord> = {}) {
  const logPath = path.isAbsolute(state.logPath) ? state.logPath : path.join(process.cwd(), state.logPath || DEFAULT_LOG_RELATIVE);
  const record: E2ELogRecord = {
    at: new Date().toISOString(),
    event,
    objective: state.objective,
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

function contextCwd(ctx: UiLikeContext): string {
  return ctx.sessionManager?.getCwd?.() || ctx.cwd || process.cwd();
}

function absoluteLogPath(cwd: string): string {
  return path.join(cwd, DEFAULT_LOG_RELATIVE);
}

function relativeToCwd(cwd: string, target: string): string {
  const absolute = path.isAbsolute(target) ? target : path.join(cwd, target);
  const relative = path.relative(cwd, absolute);
  return relative && !relative.startsWith("..") ? relative : absolute;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}

function clampIterations(value: number): number {
  return Math.max(1, Math.min(Math.floor(value), HARD_MAX_ITERATIONS));
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

function compactObjective(objective: string): string | undefined {
  if (!objective) return undefined;
  if (objective.length <= STATUS_OBJECTIVE_MAX) return objective;
  return `${objective.slice(0, STATUS_OBJECTIVE_MAX - 1)}…`;
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) {
    ctx.ui.notify(message, level);
  } else {
    console.log(message);
  }
}

export const __test__ = {
  buildE2EPrompt,
  parseArgs,
  parseE2EDecision,
  parseE2EValidated,
  restoreState,
  statusReport,
  tokenizeArgs,
};
