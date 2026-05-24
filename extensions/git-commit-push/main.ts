import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { GIT_COMMIT_PUSH_IDENTITY } from "./identity.ts";

type GitCommitPushCommand = "audit" | "run" | "status" | "help";

type ParsedCommand = {
  command: GitCommitPushCommand;
  validations: string[];
  delivery?: boolean;
  push?: boolean;
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

type GitCommitPushAudit = {
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

type GitCommitPushDeliveryPlan = {
  status: "queued" | "disabled" | "not_ready" | "unavailable";
  push: boolean;
  prompt?: string;
};

const COMMANDS = new Set<GitCommitPushCommand>(["audit", "run", "status", "help"]);
const DEFAULT_VALIDATION_COMMANDS = ["git diff --check"];
const STATUS_MAX_FILES = 12;

const lastAuditsByCwd = new Map<string, GitCommitPushAudit>();

export default function gitCommitPushExtension(pi: ExtensionAPI) {
  const command = {
    description: "Validate and deliver git commits with risk evidence",
    getArgumentCompletions: (prefix: string) => ["audit", "run", "status", "help"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };
  pi.registerCommand(GIT_COMMIT_PUSH_IDENTITY.command.name, command);
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
      publish(pi, ctx, audit ? formatGitCommitPushAudit(audit) : "Git Commit Push has not run yet for this project. Use /git-commit-push to validate and deliver, or /git-commit-push audit for a read-only check.");
      return;
    }
    case "run": {
      const audit = await auditGitCommitPush(pi, contextCwd(ctx), { runValidation: true, validations: parsed.validations });
      lastAuditsByCwd.set(audit.cwd, audit);
      const delivery = planDelivery(pi, audit, parsed);
      publish(pi, ctx, formatGitCommitPushAudit(audit, delivery));
      if (delivery.status === "queued" && delivery.prompt) queueDeliveryPrompt(pi, delivery.prompt);
      return;
    }
    case "audit":
    default: {
      const audit = await auditGitCommitPush(pi, contextCwd(ctx), { runValidation: false, validations: parsed.validations });
      lastAuditsByCwd.set(audit.cwd, audit);
      publish(pi, ctx, formatGitCommitPushAudit(audit));
      return;
    }
  }
}

async function auditGitCommitPush(
  pi: ExtensionAPI,
  cwd: string,
  options: { runValidation: boolean; validations?: string[] },
  now = new Date().toISOString(),
): Promise<GitCommitPushAudit> {
  const status = await runGitStatus(pi, cwd);
  const validationCommands = normalizeValidationCommands(options.validations?.length ? options.validations : inferValidationCommands(cwd));
  const validationResults = options.runValidation
    ? await runValidationCommands(pi, cwd, validationCommands)
    : [];
  const risks = detectRisks(status.branch, status.changedFiles, validationResults, options.runValidation, validationCommands);
  const decision = decideGitCommitPush(status.gitAvailable, risks, validationResults, options.runValidation);

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

function detectRisks(branch: string, changedFiles: ChangedFile[], validationResults: ValidationResult[], ranValidation: boolean, validationCommands: string[]): string[] {
  const risks: string[] = [];
  if (!ranValidation) risks.push(`validation_not_run: ${validationCommands.join(", ")}`);
  if (/\[(?:behind|diverged|gone)\b/i.test(branch)) risks.push(`branch_not_push_ready: ${branch}`);
  for (const result of validationResults) {
    if (result.code !== 0) risks.push(`validation_failed: ${result.command}`);
  }
  for (const changed of changedFiles) {
    if (/(^|\/)\.env($|[./-])|\.pem$|\.key$|(^|\/)id_rsa/.test(changed.file)) risks.push(`secret_like_file_changed: ${changed.file}`);
    if (/^\.pi\/.*\/logs\.jsonl$/.test(changed.file)) risks.push(`runtime_log_tracked: ${changed.file}`);
    if (/U/.test(changed.status)) risks.push(`merge_conflict_status: ${changed.file}`);
  }
  if (changedFiles.length === 0) risks.push("no_changes_to_commit");
  return risks;
}

function decideGitCommitPush(gitAvailable: boolean, risks: string[], validationResults: ValidationResult[], ranValidation: boolean): GitCommitPushAudit["decision"] {
  if (!gitAvailable) return "blocked";
  if (risks.some((risk) => risk.startsWith("validation_failed") || risk.startsWith("secret_like_file_changed") || risk.startsWith("merge_conflict_status") || risk.startsWith("branch_not_push_ready"))) return "blocked";
  if (!ranValidation || validationResults.length === 0 || risks.length > 0) return "review_needed";
  return "ready";
}

function formatGitCommitPushAudit(audit: GitCommitPushAudit, delivery?: GitCommitPushDeliveryPlan): string {
  const validationText = audit.validationResults.length
    ? audit.validationResults.map((result) => `- ${result.command}: ${result.code === 0 ? "pass" : `fail (${result.code})`}`).join("\n")
    : audit.validationCommands.map((command) => `- ${command}: not run`).join("\n");
  const changedText = audit.changedFiles.length
    ? audit.changedFiles.slice(0, STATUS_MAX_FILES).map((file) => `- ${file.status} ${file.file}`).join("\n")
    : "none";
  const omitted = audit.changedFiles.length > STATUS_MAX_FILES ? [`... ${audit.changedFiles.length - STATUS_MAX_FILES} more changed files`] : [];
  const validated = audit.validationResults.length > 0 && audit.validationResults.every((result) => result.code === 0);
  const deliveryLines = delivery ? [`Delivery: ${formatDeliveryPlan(delivery)}`] : [];
  return [
    `Git Commit Push audit: ${audit.cwd}`,
    `decision: ${audit.decision}`,
    `git: ${audit.gitAvailable ? audit.branch : "unavailable"}`,
    `changed files: ${audit.changedFiles.length}`,
    "Changed files:",
    changedText,
    ...omitted,
    "Validation:",
    validationText,
    `Risks: ${audit.risks.length ? audit.risks.join("; ") : "none"}`,
    ...deliveryLines,
    `${GIT_COMMIT_PUSH_IDENTITY.markers.validated}: ${validated ? "yes" : "no"}`,
    `${GIT_COMMIT_PUSH_IDENTITY.markers.decision}: ${audit.decision}`,
  ].join("\n");
}

function planDelivery(pi: ExtensionAPI, audit: GitCommitPushAudit, parsed: ParsedCommand): GitCommitPushDeliveryPlan {
  const push = parsed.push !== false;
  if (parsed.delivery === false) return { status: "disabled", push };
  if (audit.decision !== "ready") return { status: "not_ready", push };
  if (typeof (pi as { sendUserMessage?: unknown }).sendUserMessage !== "function") return { status: "unavailable", push };
  return { status: "queued", push, prompt: buildGitCommitPushDeliveryPrompt(audit, push) };
}

function queueDeliveryPrompt(pi: ExtensionAPI, prompt: string) {
  const sendUserMessage = (pi as { sendUserMessage?: (content: string) => void }).sendUserMessage;
  if (typeof sendUserMessage === "function") sendUserMessage.call(pi, prompt);
}

function formatDeliveryPlan(delivery: GitCommitPushDeliveryPlan): string {
  const target = delivery.push ? "commit/push" : "commit-only";
  if (delivery.status === "queued") return `queued ${target} handoff to agent`;
  if (delivery.status === "disabled") return `${target} handoff disabled by flag`;
  if (delivery.status === "unavailable") return `ready, but no agent delivery channel is available`;
  return `not queued because readiness decision is not ready`;
}

function buildGitCommitPushDeliveryPrompt(audit: GitCommitPushAudit, push: boolean): string {
  const changed = audit.changedFiles.length
    ? audit.changedFiles.map((file) => `- ${file.status} ${file.file}`).join("\n")
    : "- none";
  const validations = audit.validationResults.length
    ? audit.validationResults.map((result) => `- ${result.command}: ${result.code === 0 ? "pass" : `fail (${result.code})`}`).join("\n")
    : "- none";
  const deliveryObjective = push
    ? "Commit and push all current safe worktree changes."
    : "Commit all current safe worktree changes without pushing.";
  const pushInstruction = push
    ? "Push the current branch after validation is green. Never force push; if push is rejected or the branch is behind/diverged, stop and report blocked with fetch/rebase/merge next steps."
    : "Do not push because --no-push was requested; report the commit hash and leave pushStatus as not_requested.";

  return [
    "Git Commit Push delivery handoff",
    "",
    `Scope: ${audit.cwd}`,
    `Readiness decision: ${audit.decision}`,
    `Git branch: ${audit.branch}`,
    `Delivery objective: ${deliveryObjective}`,
    "",
    "Changed files from Git Commit Push audit:",
    changed,
    "",
    "Validation already run:",
    validations,
    "",
    "Instructions:",
    "- Inspect `git status --short --branch --untracked-files=all` and relevant diffs before staging.",
    "- Treat current tracked, modified, deleted, and untracked changes as in scope unless a file is secret-like, generated cache, vendored dependency, or otherwise unsafe.",
    "- Stage only safe in-scope files. If anything is unsafe, do not stage it; report blocked.",
    "- Split changes into coherent commits when there are separable concerns; otherwise make one clear commit.",
    "- Run `git diff --cached --check` after staging and rerun project validation if you edit files or staged content was not covered by the audit validation.",
    `- ${pushInstruction}`,
    "- Do not deploy or publish packages from Git Commit Push unless the user explicitly asks separately.",
    "",
    "Final response must end with:",
    `${GIT_COMMIT_PUSH_IDENTITY.markers.validated}: yes|no`,
    `${GIT_COMMIT_PUSH_IDENTITY.markers.decision}: shipped|blocked|review_needed`,
  ].join("\n");
}

function helpText(): string {
  return [
    "Git Commit Push commands:",
    "- /git-commit-push — run inferred validation, then queue a commit/push delivery handoff when ready",
    "- /git-commit-push audit — inspect git state and list git delivery validation without running it",
    "- /git-commit-push run — explicit alias for /git-commit-push",
    "- /git-commit-push run --validation \"npm test\" --validation \"git diff --check\" — run explicit validation before delivery",
    "- /git-commit-push run --no-delivery — run validation only, without queueing a delivery handoff",
    "- /git-commit-push run --no-push — validate and queue a commit-only handoff",
    "- /git-commit-push status — show the last git delivery audit for this project",
    "- /git-commit-push help — show this help",
    "",
    "Git Commit Push replaces /development-goal git-commit-push as the delivery command: it validates first, then asks the agent to commit and push safe in-scope work. It still does not deploy or publish packages.",
  ].join("\n");
}

function parseArgs(raw: string | undefined): ParsedCommand {
  const tokens = tokenizeArgs(raw || "");
  const first = tokens[0] as GitCommitPushCommand | undefined;
  const command = first && COMMANDS.has(first) ? tokens.shift() as GitCommitPushCommand : "run";
  const validations: string[] = [];
  const parsedFlags: Pick<ParsedCommand, "delivery" | "push"> = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--validation" && tokens[index + 1]) {
      validations.push(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith("--validation=")) {
      validations.push(token.slice("--validation=".length));
      continue;
    }
    if (token === "--no-delivery" || token === "--audit-only" || token === "--check-only") {
      parsedFlags.delivery = false;
      continue;
    }
    if (token === "--delivery") {
      parsedFlags.delivery = true;
      continue;
    }
    if (token === "--no-push") {
      parsedFlags.push = false;
      continue;
    }
    if (token === "--push") {
      parsedFlags.push = true;
      continue;
    }
    if (token.startsWith("--push=")) {
      const value = parseBoolean(token.slice("--push=".length));
      if (value !== undefined) parsedFlags.push = value;
    }
  }
  return { command, validations, ...parsedFlags };
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
    pi.sendMessage({ customType: "git-commit-push", content: text, display: true });
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

function parseBoolean(value: string): boolean | undefined {
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return undefined;
}

export const __test__ = {
  auditGitCommitPush,
  detectRisks,
  formatGitCommitPushAudit,
  parseArgs,
  parseChangedFile,
};
