import { parseTokenBudget } from "./development-loop-budget.ts";

export type DevelopmentLoopCommand = "start" | "restart" | "pause" | "resume" | "stop" | "status" | "init" | "adapters" | "analyze-logs" | "help";

export type SinceFilter = {
  cutoffMs: number;
  cutoffIso: string;
  label: string;
};

export type ParsedCommand = {
  command: DevelopmentLoopCommand;
  adapter?: string;
  topic?: string;
  iterations?: number;
  tokenBudget?: number;
  commit?: boolean;
  push?: boolean;
  force?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  html?: boolean;
  json?: boolean;
  since?: string;
  logPath?: string;
  validationCommands: string[];
  preflightCommands: string[];
  skills: string[];
  stopConditions: string[];
};

const COMMANDS = new Set<DevelopmentLoopCommand>(["start", "restart", "pause", "resume", "stop", "status", "init", "adapters", "analyze-logs", "help"]);
const DEFAULT_ADAPTER_NAMES = ["generic-git"];

export function parseArgs(raw: string | undefined, adapterNames: string[] = DEFAULT_ADAPTER_NAMES): ParsedCommand {
  const tokens = tokenizeArgs(raw || "");
  const commandToken = tokens[0] as DevelopmentLoopCommand | undefined;
  const command = commandToken && COMMANDS.has(commandToken) ? tokens.shift() as DevelopmentLoopCommand : "start";
  const parsed: ParsedCommand = {
    command,
    validationCommands: [],
    preflightCommands: [],
    skills: [],
    stopConditions: [],
  };
  const positional: string[] = [];
  const adapterSet = new Set(adapterNames);

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
    if (token === "--tokens" || token === "--token-budget" || token === "--budget") {
      parsed.tokenBudget = parseTokenBudget(tokens[++i]);
      continue;
    }
    if (token.startsWith("--tokens=") || token.startsWith("--token-budget=") || token.startsWith("--budget=")) {
      parsed.tokenBudget = parseTokenBudget(token.split("=").slice(1).join("="));
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
    if (token === "--json" || token === "--machine-readable") {
      parsed.json = true;
      continue;
    }
    if (token === "--since" || token === "--after" || token === "--last") {
      parsed.since = tokens[++i];
      continue;
    }
    if (token.startsWith("--since=") || token.startsWith("--after=") || token.startsWith("--last=")) {
      parsed.since = token.split("=").slice(1).join("=");
      continue;
    }
    if (token === "--no-html" || token === "--no-report-html") {
      parsed.html = false;
      continue;
    }
    if (token === "--no-json" || token === "--no-machine-readable") {
      parsed.json = false;
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
    if (token.startsWith("--json=") || token.startsWith("--machine-readable=")) {
      parsed.json = parseBoolean(token.split("=").slice(1).join("="));
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

  if (command === "init" && !parsed.adapter && positional.length > 0 && adapterSet.has(positional[0])) {
    parsed.adapter = positional.shift();
  }
  if (!parsed.topic && positional.length > 0) {
    parsed.topic = positional.join(" ").trim();
  }
  return parsed;
}

export function parseSinceFilter(value: string, nowMs = Date.now()): SinceFilter | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const durationMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i);
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    const unitMs = unit.startsWith("ms") || unit.startsWith("millisecond")
      ? 1
      : unit === "s" || unit.startsWith("sec")
        ? 1_000
        : unit === "m" || unit.startsWith("min")
          ? 60_000
          : unit === "h" || unit.startsWith("hr") || unit.startsWith("hour")
            ? 60 * 60_000
            : unit === "d" || unit.startsWith("day")
              ? 24 * 60 * 60_000
              : 7 * 24 * 60 * 60_000;
    if (!Number.isFinite(amount) || amount < 0) return undefined;
    const cutoffMs = nowMs - amount * unitMs;
    return { cutoffMs, cutoffIso: new Date(cutoffMs).toISOString(), label: `last ${trimmed.replace(/\s+/g, "")}` };
  }

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return undefined;
  return { cutoffMs: timestamp, cutoffIso: new Date(timestamp).toISOString(), label: new Date(timestamp).toISOString() };
}

export function tokenizeArgs(raw: string): string[] {
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

function parseBoolean(value: string): boolean | undefined {
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}
