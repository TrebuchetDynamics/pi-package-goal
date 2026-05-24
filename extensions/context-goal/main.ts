import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type ParsedCommand = {
  command: "audit" | "apply" | "status" | "help";
  yes: boolean;
};

type UiLikeContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: string) => void;
    confirm?: (title: string, message: string, options?: unknown) => Promise<boolean> | boolean;
  };
  sessionManager?: { getCwd?: () => string };
};

type ContextProposal = {
  id: string;
  title: string;
  reason: string;
  action: "add-context-term" | "create-memory-file" | "manual-review";
  term?: string;
  definition?: string;
  avoid?: string;
};

type ContextAudit = {
  cwd: string;
  checkedAt: string;
  contextPath: string;
  memoryPath: string;
  hasContext: boolean;
  hasMemory: boolean;
  logFiles: string[];
  proposals: ContextProposal[];
};

type TermRule = {
  term: string;
  triggers: RegExp[];
  definition: string;
  avoid: string;
};

const COMMANDS = new Set(["audit", "apply", "status", "help"]);
const CONTEXT_FILE = "CONTEXT.md";
const MEMORY_FILE = "MEMORY.md";
const TERM_RULES: TermRule[] = [
  {
    term: "Context Goal",
    triggers: [/context-goal/i, /context steward/i],
    definition: "A Pi extension that audits project understanding artifacts, works when both CONTEXT.md and MEMORY.md are absent, proposes baseline file creation, and applies only explicitly approved context/memory patches. A Context Goal keeps project vocabulary useful without turning MEMORY.md into a junk drawer.",
    avoid: "Silent memory writes, unreviewed context edits, dumping session notes into MEMORY.md, unstructured memory junk drawers",
  },
  {
    term: "Final Report Gate",
    triggers: [/final-report-gate/i, /malformed_final_report/i, /report quality/i],
    definition: "A Development Goal module that evaluates a parsed final report before Goal Run state transitions. The Final Report Gate decides whether to accept, request one repair-only report retry, or block malformed final reports.",
    avoid: "Inline final-report checks, scattered malformed-report branches, accepting low-quality terminal markers",
  },
  {
    term: "Goal Log Analysis",
    triggers: [/log-analysis/i, /analyze-logs/i, /logs\.jsonl/i],
    definition: "A Development Goal module that reads one or more goal logs.jsonl files and turns raw Goal Run events into health counters, top blockers, evidence summaries, and recommendations.",
    avoid: "Inline analyze-logs helpers, scattered log dashboard counters, command-owned health report formatting",
  },
];

const lastAuditsByCwd = new Map<string, ContextAudit>();

export default function contextGoalExtension(pi: ExtensionAPI) {
  const command = {
    description: "Audit and steward CONTEXT.md without unreviewed memory writes",
    getArgumentCompletions: (prefix: string) => ["audit", "apply", "status", "help"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };
  pi.registerCommand("context-goal", command);
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
      publish(pi, ctx, audit ? formatAudit(audit) : "Context Goal has not run yet for this project. Use /context-goal audit.");
      return;
    }
    case "apply":
      await applyLastAudit(pi, ctx, parsed);
      return;
    case "audit":
    default: {
      const audit = auditContext(contextCwd(ctx));
      lastAuditsByCwd.set(audit.cwd, audit);
      publish(pi, ctx, formatAudit(audit));
      return;
    }
  }
}

function auditContext(cwd: string, now = new Date().toISOString()): ContextAudit {
  const contextPath = path.join(cwd, CONTEXT_FILE);
  const memoryPath = path.join(cwd, MEMORY_FILE);
  const hasContextFile = fs.existsSync(contextPath);
  const hasMemoryFile = fs.existsSync(memoryPath);
  const contextText = readTextIfExists(contextPath);
  const logFiles = discoverGoalLogs(path.join(cwd, ".pi"));
  const evidenceText = [
    listProjectFiles(cwd).join("\n"),
    logFiles.map((file) => readTextIfExists(file)).join("\n"),
  ].join("\n");
  const proposals: ContextProposal[] = [];

  if (!hasContextFile) {
    proposals.push({
      id: "create-context",
      title: `Create ${CONTEXT_FILE}`,
      reason: "No CONTEXT.md exists. Approve a bootstrap file so agents have a stable home for project vocabulary.",
      action: "add-context-term",
      term: "Project Context",
      definition: "The project-owned vocabulary and durable architecture concepts that agents should use when naming modules, seams, prompts, logs, docs, and tests.",
      avoid: "Session transcript dumps, temporary task notes",
    });
  }

  if (!hasMemoryFile) {
    proposals.push({
      id: "create-memory",
      title: `Create ${MEMORY_FILE}`,
      reason: "No MEMORY.md exists. Approve a guarded durable-memory template so agents know what belongs there and what does not.",
      action: "create-memory-file",
    });
  } else {
    proposals.push({
      id: "review-memory",
      title: `Review ${MEMORY_FILE}`,
      reason: "MEMORY.md exists; Context Goal should keep durable vocabulary in CONTEXT.md or ADRs instead of unstructured memory.",
      action: "manual-review",
    });
  }

  for (const rule of TERM_RULES) {
    if (contextText.includes(`**${rule.term}**`)) continue;
    if (!rule.triggers.some((trigger) => trigger.test(evidenceText))) continue;
    proposals.push({
      id: `add-${slug(rule.term)}`,
      title: `Add ${rule.term} to ${CONTEXT_FILE}`,
      reason: `${rule.term} appears in recent project evidence but is not defined in CONTEXT.md.`,
      action: "add-context-term",
      term: rule.term,
      definition: rule.definition,
      avoid: rule.avoid,
    });
  }

  return {
    cwd,
    checkedAt: now,
    contextPath,
    memoryPath,
    hasContext: hasContextFile,
    hasMemory: hasMemoryFile,
    logFiles,
    proposals: dedupeProposals(proposals),
  };
}

async function applyLastAudit(pi: ExtensionAPI, ctx: ExtensionCommandContext, parsed: ParsedCommand) {
  const cwd = contextCwd(ctx);
  const audit = lastAuditsByCwd.get(cwd) ?? auditContext(cwd);
  lastAuditsByCwd.set(cwd, audit);
  const applicable = audit.proposals.filter(isApprovableProposal);
  if (applicable.length === 0) {
    publish(pi, ctx, "Context Goal has no approved-file patches to apply.");
    return;
  }

  const preview = formatApplyPreview(audit, applicable);
  const approved = parsed.yes || await confirmApply(ctx, preview);
  if (!approved) {
    publish(pi, ctx, `Context Goal apply cancelled.\n\n${preview}`);
    return;
  }

  applyApprovedProposals(audit, applicable);
  const nextAudit = auditContext(audit.cwd);
  lastAuditsByCwd.set(audit.cwd, nextAudit);
  publish(pi, ctx, `Context Goal applied ${applicable.length} approved ${applicable.length === 1 ? "patch" : "patches"}.\n\n${formatAudit(nextAudit)}`);
}

function isApprovableProposal(proposal: ContextProposal): boolean {
  if (proposal.action === "create-memory-file") return true;
  return proposal.action === "add-context-term" && Boolean(proposal.term && proposal.definition);
}

function applyApprovedProposals(audit: ContextAudit, proposals: ContextProposal[]) {
  const contextTerms = proposals.filter((proposal) => proposal.action === "add-context-term" && proposal.term && proposal.definition);
  if (contextTerms.length > 0) applyContextTerms(audit.contextPath, contextTerms);
  if (proposals.some((proposal) => proposal.action === "create-memory-file")) createMemoryFile(audit.memoryPath);
}

function createMemoryFile(memoryPath: string) {
  if (fs.existsSync(memoryPath)) return;
  fs.writeFileSync(memoryPath, initialMemoryText(), "utf8");
}

function initialMemoryText(): string {
  return [
    "# Project Memory",
    "",
    "Durable operational memory for this project. Use sparingly.",
    "",
    "## Rules",
    "",
    "- Add facts only after explicit user or project approval.",
    "- Prefer CONTEXT.md for project vocabulary and ADRs for decisions.",
    "- Do not store session transcripts, temporary todos, guesses, or implementation notes.",
    "",
    "## Durable facts",
    "",
    "<!-- Add approved durable facts here. -->",
    "",
  ].join("\n");
}

function applyContextTerms(contextPath: string, proposals: ContextProposal[]) {
  let text = readTextIfExists(contextPath);
  if (!text) text = `# Project Context\n\n## Language\n`;
  if (!/\n## Language\b/.test(text)) text = `${text.trimEnd()}\n\n## Language\n`;

  const additions = proposals
    .filter((proposal) => proposal.term && proposal.definition && !text.includes(`**${proposal.term}**`))
    .map((proposal) => formatContextTerm(proposal))
    .join("\n");
  if (!additions) return;

  const exampleIndex = text.search(/\n## Example\b/);
  const next = exampleIndex >= 0
    ? `${text.slice(0, exampleIndex).trimEnd()}\n\n${additions}\n${text.slice(exampleIndex)}`
    : `${text.trimEnd()}\n\n${additions}\n`;
  fs.writeFileSync(contextPath, next, "utf8");
}

function formatContextTerm(proposal: ContextProposal): string {
  return `**${proposal.term}**:\n${proposal.definition}\n_Avoid_: ${proposal.avoid || "Unreviewed context drift"}\n`;
}

function formatAudit(audit: ContextAudit): string {
  const proposals = audit.proposals.length
    ? audit.proposals.map((proposal, index) => `${index + 1}. ${proposal.title} — ${proposal.reason}`).join("\n")
    : "none";
  const approvable = audit.proposals.filter(isApprovableProposal).length;
  return [
    `Context Goal audit: ${audit.cwd}`,
    `CONTEXT.md: ${audit.hasContext ? "present" : "absent; approval can create it"}`,
    `MEMORY.md: ${audit.hasMemory ? "present; review before keeping" : "absent; approval can create guarded template"}`,
    `Goal logs checked: ${audit.logFiles.length}`,
    `Approvable patches available: ${approvable}`,
    "Proposals:",
    proposals,
    approvable > 0 ? "Run /context-goal apply to review and approve file creations/patches." : "No write is needed.",
  ].join("\n");
}

function formatApplyPreview(audit: ContextAudit, proposals: ContextProposal[]): string {
  return [
    `Context Goal apply preview: ${audit.cwd}`,
    audit.hasContext ? "Existing CONTEXT.md will be updated if context terms are approved." : "No CONTEXT.md exists; approval will create it.",
    audit.hasMemory ? "Existing MEMORY.md will not be overwritten." : "No MEMORY.md exists; approval will create a guarded template.",
    ...proposals.map(formatProposalPreview),
  ].join("\n");
}

function formatProposalPreview(proposal: ContextProposal): string {
  if (proposal.action === "create-memory-file") return `- ${MEMORY_FILE}: create guarded durable-memory template`;
  if (proposal.action === "add-context-term") return `- ${CONTEXT_FILE}: add ${proposal.term}: ${proposal.definition}`;
  return `- ${proposal.title}: ${proposal.reason}`;
}

async function confirmApply(ctx: ExtensionCommandContext, preview: string): Promise<boolean> {
  if (!ctx.hasUI || !ctx.ui?.confirm) return false;
  return Boolean(await ctx.ui.confirm("Apply Context Goal patches?", preview));
}

function helpText(): string {
  return [
    "Context Goal commands:",
    "- /context-goal audit — inspect CONTEXT.md, MEMORY.md, and recent goal logs for context proposals",
    "- /context-goal apply — ask for approval, then apply safe CONTEXT.md term additions",
    "- /context-goal apply --yes — apply safe CONTEXT.md term additions non-interactively",
    "- /context-goal status — show the last audit result",
    "- /context-goal help — show this help",
    "",
    "Context Goal works when both CONTEXT.md and MEMORY.md are absent. It can create baseline CONTEXT.md and guarded MEMORY.md files, but never applies proposals without explicit approval or --yes.",
  ].join("\n");
}

function parseArgs(raw: string | undefined): ParsedCommand {
  const tokens = tokenizeArgs(raw || "");
  const first = tokens[0];
  const command = COMMANDS.has(first) ? tokens.shift() as ParsedCommand["command"] : "audit";
  return { command, yes: tokens.includes("--yes") || tokens.includes("-y") };
}

function tokenizeArgs(raw: string): string[] {
  return raw.split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

function publish(pi: ExtensionAPI, ctx: UiLikeContext, text: string) {
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "context-goal", content: text, display: true });
  }
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) ctx.ui.notify(message, level);
  else console.log(message);
}

function contextCwd(ctx: UiLikeContext): string {
  return ctx.sessionManager?.getCwd?.() || ctx.cwd || process.cwd();
}

function readTextIfExists(file: string): string {
  try {
    return fs.statSync(file).isFile() ? fs.readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
}

function discoverGoalLogs(piDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "logs.jsonl") files.push(full);
    }
  };
  walk(piDir);
  return files.sort();
}

function listProjectFiles(cwd: string): string[] {
  const files: string[] = [];
  const roots = ["extensions", "lib", "docs"];
  for (const root of roots) walkProjectFiles(path.join(cwd, root), cwd, files);
  for (const file of [CONTEXT_FILE, MEMORY_FILE, "README.md"]) {
    const full = path.join(cwd, file);
    if (fs.existsSync(full)) files.push(file);
  }
  return files;
}

function walkProjectFiles(dir: string, cwd: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".pi") continue;
      walkProjectFiles(full, cwd, out);
      continue;
    }
    out.push(path.relative(cwd, full).split(path.sep).join("/"));
  }
}

function dedupeProposals(proposals: ContextProposal[]): ContextProposal[] {
  const seen = new Set<string>();
  const out: ContextProposal[] = [];
  for (const proposal of proposals) {
    if (seen.has(proposal.id)) continue;
    seen.add(proposal.id);
    out.push(proposal);
  }
  return out;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const __test__ = {
  applyContextTerms,
  auditContext,
  formatAudit,
  parseArgs,
};
