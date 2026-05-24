import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SHIP_GOAL_IDENTITY } from "./identity.ts";

type ShipCommand = "audit" | "run" | "status" | "help";

type ParsedCommand = {
  command: ShipCommand;
  validations: string[];
};

type UiLikeContext = {
  cwd?: string;
  ui?: { notify?: (message: string, level?: string) => void };
  sessionManager?: { getCwd?: () => string };
};

type ExecResult = {
  code?: number;
  stdout?: string;
  stderr?: string;
};

type ChangedFile = {
  status: string;
  file: string;
};

type ValidationResult = {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
};

type ShipAudit = {
  cwd: string;
  checkedAt: string;
  gitAvailable: boolean;
  branch: string;
  changedFiles: ChangedFile[];
  validationCommands: string[];
  validationResults: ValidationResult[];
  risks: string[];
  decision: "ready" | "blocked" | "review_needed";
};

const COMMANDS = new Set<ShipCommand>(["audit", "run", "status", "help"]);
const DEFAULT_VALIDATION_COMMANDS = ["git diff --check"];
const STATUS_MAX_FILES = 12;

const lastAuditsByCwd = new Map<string, ShipAudit>();

export default function shipGoalExtension(pi: ExtensionAPI) {
  const command = {
    description: "Audit shipping readiness with git, validation, and risk evidence",
    getArgumentCompletions: (prefix: string) => ["audit", "run", "status", "help"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };
  pi.registerCommand(SHIP_GOAL_IDENTITY.command.name, command);
}

async function runCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) {
  const parsed = parseArgs(args);
  switch (parsed.command) {
    case "help":
      publish(pi, ctx, helpText());
      return;
    case "status": {
      const cwd = contextCwd(ctx);
      const audit = lastAuditsByCwd.get(cwd);
      publish(pi, ctx, audit ? formatShipAudit(audit) : "Ship Goal has not run yet for this project. Use /ship-goal audit or /ship-goal run.");
      return;
    }
    case "run": {
      const audit = await auditShipping(pi, contextCwd(ctx), { runValidation: true, validations: parsed.validations });
      lastAuditsByCwd.set(audit.cwd, audit);
      publish(pi, ctx, formatShipAudit(audit));
      return;
    }
    case "audit":
    default: {
      const audit = await auditShipping(pi, contextCwd(ctx), { runValidation: false, validations: parsed.validations });
      lastAuditsByCwd.set(audit.cwd, audit);
      publish(pi, ctx, formatShipAudit(audit));
      return;
    }
  }
}

async function auditShipping(
  pi: ExtensionAPI,
  cwd: string,
  options: { runValidation: boolean; validations?: string[] },
  now = new Date().toISOString(),
): Promise<ShipAudit> {
  const status = await runGitStatus(pi, cwd);
  const validationCommands = normalizeValidationCommands(options.validations?.length ? options.validations : inferValidationCommands(cwd));
  const validationResults = options.runValidation
    ? await runValidationCommands(pi, cwd, validationCommands)
    : [];
  const risks = detectRisks(status.changedFiles, validationResults, options.runValidation, validationCommands);
  const decision = decideShipping(status.gitAvailable, risks, validationResults, options.runValidation);

  return {
    cwd,
    checkedAt: now,
    gitAvailable: status.gitAvailable,
    branch: status.branch,
    changedFiles: status.changedFiles,
    validationCommands,
    validationResults,
    risks,
    decision,
  };
}

async function runGitStatus(pi: ExtensionAPI, cwd: string): Promise<{ gitAvailable: boolean; branch: string; changedFiles: ChangedFile[] }> {
  const result = await runShell(pi, cwd, "git status --short --branch");
  if ((result.code ?? 1) !== 0) {
    return { gitAvailable: false, branch: "not a git repository", changedFiles: [] };
  }
  const lines = (result.stdout || "").split(/\r?\n/).filter(Boolean);
  const branch = lines.find((line) => line.startsWith("## "))?.replace(/^##\s+/, "") || "unknown";
  const changedFiles = lines
    .filter((line) => !line.startsWith("## "))
    .map(parseChangedFile)
    .filter((file): file is ChangedFile => Boolean(file));
  return { gitAvailable: true, branch, changedFiles };
}

function parseChangedFile(line: string): ChangedFile | undefined {
  const match = line.match(/^(.{1,2})\s+(.+)$/);
  if (!match) return;
  const file = match[2].replace(/^.* -> /, "").trim();
  return { status: match[1].trim() || "modified", file };
}

function inferValidationCommands(cwd: string): string[] {
  const commands = [...DEFAULT_VALIDATION_COMMANDS];
  const packageJsonPath = path.join(cwd, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (pkg?.scripts?.test) commands.unshift("npm test");
    else if (pkg?.scripts?.validate) commands.unshift("npm run validate");
  } catch {
    // No package.json or malformed package.json: keep generic validation only.
  }
  return commands;
}

function normalizeValidationCommands(commands: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const command of commands.map((value) => value.trim()).filter(Boolean)) {
    if (seen.has(command)) continue;
    seen.add(command);
    out.push(command);
  }
  return out.length ? out : [...DEFAULT_VALIDATION_COMMANDS];
}

async function runValidationCommands(pi: ExtensionAPI, cwd: string, commands: string[]): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    const result = await runShell(pi, cwd, command);
    results.push({
      command,
      code: result.code ?? 1,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    });
  }
  return results;
}

async function runShell(pi: ExtensionAPI, cwd: string, command: string): Promise<ExecResult> {
  const shell = `cd ${shellQuote(cwd)} && ${command}`;
  if (typeof pi.exec === "function") {
    return await pi.exec("bash", ["-lc", shell]);
  }
  return await new Promise((resolve) => {
    childProcess.execFile("bash", ["-lc", shell], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const rawCode = (error as { code?: unknown } | null)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 1 : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

function detectRisks(changedFiles: ChangedFile[], validationResults: ValidationResult[], ranValidation: boolean, validationCommands: string[]): string[] {
  const risks: string[] = [];
  if (!ranValidation) risks.push(`validation_not_run: ${validationCommands.join(", ")}`);
  for (const result of validationResults) {
    if (result.code !== 0) risks.push(`validation_failed: ${result.command}`);
  }
  for (const changed of changedFiles) {
    if (/(^|\/)\.env($|[./-])|\.pem$|\.key$|(^|\/)id_rsa/.test(changed.file)) risks.push(`secret_like_file_changed: ${changed.file}`);
    if (/^\.pi\/.*\/logs\.jsonl$/.test(changed.file)) risks.push(`runtime_log_tracked: ${changed.file}`);
    if (/U/.test(changed.status)) risks.push(`merge_conflict_status: ${changed.file}`);
  }
  if (changedFiles.length === 0) risks.push("no_changes_to_ship");
  return risks;
}

function decideShipping(gitAvailable: boolean, risks: string[], validationResults: ValidationResult[], ranValidation: boolean): ShipAudit["decision"] {
  if (!gitAvailable) return "blocked";
  if (risks.some((risk) => risk.startsWith("validation_failed") || risk.startsWith("secret_like_file_changed") || risk.startsWith("merge_conflict_status"))) return "blocked";
  if (!ranValidation || validationResults.length === 0 || risks.length > 0) return "review_needed";
  return "ready";
}

function formatShipAudit(audit: ShipAudit): string {
  const validationText = audit.validationResults.length
    ? audit.validationResults.map((result) => `- ${result.command}: ${result.code === 0 ? "pass" : `fail (${result.code})`}`).join("\n")
    : audit.validationCommands.map((command) => `- ${command}: not run`).join("\n");
  const changedText = audit.changedFiles.length
    ? audit.changedFiles.slice(0, STATUS_MAX_FILES).map((file) => `- ${file.status} ${file.file}`).join("\n")
    : "none";
  const omitted = audit.changedFiles.length > STATUS_MAX_FILES ? [`... ${audit.changedFiles.length - STATUS_MAX_FILES} more changed files`] : [];
  const validated = audit.validationResults.length > 0 && audit.validationResults.every((result) => result.code === 0);
  return [
    `Ship Goal audit: ${audit.cwd}`,
    `decision: ${audit.decision}`,
    `git: ${audit.gitAvailable ? audit.branch : "unavailable"}`,
    `changed files: ${audit.changedFiles.length}`,
    "Changed files:",
    changedText,
    ...omitted,
    "Validation:",
    validationText,
    `Risks: ${audit.risks.length ? audit.risks.join("; ") : "none"}`,
    `${SHIP_GOAL_IDENTITY.markers.validated}: ${validated ? "yes" : "no"}`,
    `${SHIP_GOAL_IDENTITY.markers.decision}: ${audit.decision}`,
  ].join("\n");
}

function helpText(): string {
  return [
    "Ship Goal commands:",
    "- /ship-goal audit — inspect git state and list shipping validation without running it",
    "- /ship-goal run — inspect git state and run inferred validation commands",
    "- /ship-goal run --validation \"npm test\" --validation \"git diff --check\" — run explicit validation",
    "- /ship-goal status — show the last shipping audit for this project",
    "- /ship-goal help — show this help",
    "",
    "Ship Goal does not commit, push, deploy, or publish. It produces readiness evidence before delivery.",
  ].join("\n");
}

function parseArgs(raw: string | undefined): ParsedCommand {
  const tokens = tokenizeArgs(raw || "");
  const first = tokens[0] as ShipCommand | undefined;
  const command = first && COMMANDS.has(first) ? tokens.shift() as ShipCommand : "audit";
  const validations: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--validation" && tokens[index + 1]) {
      validations.push(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith("--validation=")) validations.push(token.slice("--validation=".length));
  }
  return { command, validations };
}

function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
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

function publish(pi: ExtensionAPI, ctx: UiLikeContext, text: string) {
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "ship-goal", content: text, display: true });
  }
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) ctx.ui.notify(message, level);
  else console.log(message);
}

function contextCwd(ctx: UiLikeContext): string {
  return ctx.sessionManager?.getCwd?.() || ctx.cwd || process.cwd();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export const __test__ = {
  auditShipping,
  detectRisks,
  formatShipAudit,
  parseArgs,
  parseChangedFile,
};
