import { splitCommandArgs } from "../pi-bridge/command-grammar.js";

export const DEFAULT_TOKEN_BUDGET = "300k";
export const DEFAULT_PATTERN = "daily-triage";
export const DEFAULT_TOOL = "grok";
export const DEFAULT_LEVEL = "L1";

export const LOOP_ENGINEERING_USAGE = `Usage: /loop-engineering [--tokens 300k] [--dry-run] [audit|init|cost|goal|design] [args]\nAliases: /loop-engineering, /loop\nExamples:\n  /loop-engineering audit .\n  /loop-engineering init daily-triage --tool grok\n  /loop-engineering cost ci-sweeper --level L1\n  /loop-engineering goal .\n  /loop 1d Run loop-triage. Update STATE.md. No auto-fix in week one.`;

const ACTIONS = new Set(["audit", "init", "cost", "goal", "design"]);
const PATTERNS = new Set([
  "daily-triage",
  "pr-babysitter",
  "ci-sweeper",
  "dependency-sweeper",
  "changelog-drafter",
  "post-merge-cleanup",
  "issue-triage",
]);
const TOOLS = new Set(["grok", "claude", "codex", "cursor"]);
const LEVELS = new Set(["L1", "L2", "L3"]);

export function parseLoopEngineeringArgs(input) {
  let tokens;
  try {
    tokens = splitCommandArgs(input);
  } catch (error) {
    return parsedArgs({ error: error.message });
  }

  let tokenBudget = DEFAULT_TOKEN_BUDGET;
  let dryRun = false;
  let help = false;
  let tool = DEFAULT_TOOL;
  let level = DEFAULT_LEVEL;
  const words = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--tokens") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, dryRun, help, tool, level, error: "Missing value for --tokens." });
      tokenBudget = value.replace(/\s+/g, "");
      index += 1;
      continue;
    }
    if (token.startsWith("--tokens=")) {
      tokenBudget = token.slice("--tokens=".length).replace(/\s+/g, "");
      continue;
    }
    if (token === "--tool") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, tokenBudget, dryRun, help, tool, level, error: "Missing value for --tool." });
      tool = value.toLowerCase();
      index += 1;
      continue;
    }
    if (token.startsWith("--tool=")) {
      tool = token.slice("--tool=".length).toLowerCase();
      continue;
    }
    if (token === "--level") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, tokenBudget, dryRun, help, tool, level, error: "Missing value for --level." });
      level = value.toUpperCase();
      index += 1;
      continue;
    }
    if (token.startsWith("--level=")) {
      level = token.slice("--level=".length).toUpperCase();
      continue;
    }
    if (token.startsWith("--")) return parsedArgs({ words, tokenBudget, dryRun, help, tool, level, error: `Unknown option: ${token}. ${LOOP_ENGINEERING_USAGE}` });
    words.push(token);
  }

  const error = validateTokenBudget(tokenBudget) ?? validateChoice("tool", tool, TOOLS) ?? validateChoice("level", level, LEVELS);
  return parsedArgs({ words, tokenBudget: error ? DEFAULT_TOKEN_BUDGET : tokenBudget, dryRun, help, tool, level, error });
}

function parsedArgs({ words = [], tokenBudget = DEFAULT_TOKEN_BUDGET, dryRun = false, help = false, tool = DEFAULT_TOOL, level = DEFAULT_LEVEL, error = null } = {}) {
  const first = words[0]?.toLowerCase() ?? "";
  const action = ACTIONS.has(first) ? first : "design";
  const rest = ACTIONS.has(first) ? words.slice(1) : words;
  const pattern = PATTERNS.has(rest[0]) ? rest[0] : DEFAULT_PATTERN;
  return {
    action,
    tokenBudget,
    dryRun,
    help,
    tool,
    level,
    pattern,
    args: rest.join(" ").trim(),
    request: rest.join(" ").trim(),
    error,
  };
}

function validateTokenBudget(rawTokenBudget) {
  const raw = String(rawTokenBudget ?? "").trim();
  const suffix = raw.slice(-1).toLowerCase();
  const numeric = suffix === "k" || suffix === "m" ? raw.slice(0, -1) : raw;
  const value = Number(numeric);
  if (!Number.isFinite(value) || value <= 0) return "Token budget must be positive.";
  return null;
}

function validateChoice(name, value, allowed) {
  return allowed.has(value) ? null : `Unknown ${name}: ${value}. Allowed: ${[...allowed].join(", ")}.`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function buildLoopEngineeringObjective(input) {
  const parsed = parseLoopEngineeringArgs(input);
  return {
    ...parsed,
    goalCommand: `/goal --tokens ${parsed.tokenBudget} ${buildObjectiveText(parsed)}`,
  };
}

function buildObjectiveText(parsed) {
  const base = `Use Loop Engineering discipline for this repository: design the control system that prompts agents, not a one-off prompt. Ground decisions in the current repo, keep week one report-only unless the user explicitly asks for unattended changes, and prefer the smallest loop that works.

Loop primitives to consider:
- Automations/scheduling
- Worktrees
- Skills/project knowledge
- Plugins/connectors/MCP
- Sub-agents/checkers
- Durable memory/state outside the chat

Safety rails:
- Use the @cobusgreyling CLI set when useful: loop-audit, loop-init, loop-cost, and goal-audit.
- Capture git status and classify dirty work before edits.
- Start at L1 report-only, then L2 assisted fixes, then L3 unattended only with explicit owner approval.
- Estimate token cost before increasing cadence.
- Keep LOOP.md, STATE.md, loop-budget.md, and loop-run-log.md small and useful when you create or update them.
- Do not publish, deploy, spend money, rewrite history, auto-merge, or enable unattended mutation without explicit approval.`;

  if (parsed.action === "audit") {
    const scope = parsed.args || ".";
    return `${base}

Task: audit loop readiness for \`${scope}\`.
- Inspect existing loop docs/state files and package/project automation.
- If network/tooling is available and safe, run: npx @cobusgreyling/loop-audit ${shellQuote(scope)} --suggest
- Summarize the score, gaps, and the smallest next changes to reach a safer L1 loop.
- If you edit files, keep changes limited to loop docs/config and validate them.`;
  }

  if (parsed.action === "init") {
    return `${base}

Task: scaffold the smallest useful Loop Engineering starter.
- Pattern: ${parsed.pattern}
- Tool: ${parsed.tool}
- First run or estimate cost with: npx @cobusgreyling/loop-cost --pattern ${parsed.pattern} --level ${parsed.level}
- Then, only if the repo is clean enough and the user request still warrants scaffolding, run: npx @cobusgreyling/loop-init . --pattern ${parsed.pattern} --tool ${parsed.tool}
- Inspect the generated diff, remove boilerplate that does not apply, and leave the loop at ${parsed.level} unless explicitly told otherwise.`;
  }

  if (parsed.action === "cost") {
    return `${base}

Task: estimate loop cost before implementation.
- Pattern: ${parsed.pattern}
- Level: ${parsed.level}
- Run when available: npx @cobusgreyling/loop-cost --pattern ${parsed.pattern} --level ${parsed.level}
- Recommend the cheapest safe cadence and stop before scaffolding unless the user asked for setup too.`;
  }

  if (parsed.action === "goal") {
    const scope = parsed.args || ".";
    return `${base}

Task: audit Goal Engineering readiness for \`${scope}\`.
- Inspect existing goals, objective docs, loop state, run logs, and completion criteria.
- If network/tooling is available and safe, run: npx @cobusgreyling/goal-audit ${shellQuote(scope)}
- Use the result to tighten run-until-done objectives, evidence gates, and handoff criteria.
- Do not replace Pi's /goal command; this is an external readiness audit for goal-shaped automation.`;
  }

  const request = parsed.request || "choose the safest first loop for this repository and prepare an L1 report-only rollout";
  return `${base}

User loop request:
${request}

Task: translate the request into a concrete Loop Engineering rollout.
- Choose one of the seven common patterns when it fits: daily-triage, pr-babysitter, ci-sweeper, dependency-sweeper, changelog-drafter, post-merge-cleanup, issue-triage.
- Run cost/audit/goal-audit checks when useful before writing files.
- Produce or update only the minimal repo artifacts needed for an L1 loop, then validate.`;
}
