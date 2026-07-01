import { splitCommandArgs } from "../pi-bridge/command-grammar.js";

export const DEFAULT_TOKEN_BUDGET = "700k";
export const ONKLAUD_EXPLANATION = `Onklaud is a thin Pi extension around /goal, not a separate coding agent.

What it does:
- /onklaud <task> queues a /goal prompt that tells Pi to use the onklaud CLI as an advisory council.
- Pi owns edits, tests, validation, commits, and pushes; Onklaud only gives planning/review/gate advice.
- /onklaud status checks whether the external CLI is usable.
- /onklaud install installs that external CLI into user-local paths after confirmation.

Use it when you want a second-opinion council on a meaningful Pi task. Skip it for tiny edits, secrets-heavy debugging, or when you only want to run the raw onklaud CLI yourself.`;
export const ONKLAUD_USAGE = `Usage: /onklaud [--tokens 700k] [--dry-run] [status|explain|install|task...]
Examples: /onklaud explain, /onklaud status, /onklaud install --yes, /onklaud fix the failing tests, /onklaud`;
export const ONKLAUD_REPO_URL = "https://github.com/KorroAi/onklaud-5.git";

export function parseOnklaudArgs(input = "") {
  let tokens;
  try {
    tokens = splitCommandArgs(input);
  } catch (error) {
    return parsedArgs({ error: error.message });
  }

  let tokenBudget = DEFAULT_TOKEN_BUDGET;
  let dryRun = false;
  let help = false;
  let yes = false;
  let installDir = "";
  let binDir = "";
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
    if (token === "--yes" || token === "-y") {
      yes = true;
      continue;
    }
    if (token === "--dir") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, dryRun, help, yes, installDir, binDir, error: "Missing value for --dir." });
      installDir = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--dir=")) {
      installDir = token.slice("--dir=".length);
      continue;
    }
    if (token === "--bin-dir") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, dryRun, help, yes, installDir, binDir, error: "Missing value for --bin-dir." });
      binDir = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--bin-dir=")) {
      binDir = token.slice("--bin-dir=".length);
      continue;
    }
    if (token === "--tokens") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ words, dryRun, help, yes, installDir, binDir, error: "Missing value for --tokens." });
      tokenBudget = value.replace(/\s+/g, "");
      index += 1;
      continue;
    }
    if (token.startsWith("--tokens=")) {
      tokenBudget = token.slice("--tokens=".length).replace(/\s+/g, "");
      continue;
    }
    if (token.startsWith("--")) return parsedArgs({ words, tokenBudget, dryRun, help, yes, installDir, binDir, error: `Unknown option: ${token}. ${ONKLAUD_USAGE}` });
    words.push(token);
  }

  let error = validateTokenBudget(tokenBudget);
  const installOptionsWithoutInstall = (yes || installDir || binDir) && words[0]?.toLowerCase() !== "install";
  if (!error && installOptionsWithoutInstall) error = "Install options (--yes, --dir, --bin-dir) require the install action.";
  return parsedArgs({ words, tokenBudget: error ? DEFAULT_TOKEN_BUDGET : tokenBudget, dryRun, help, yes, installDir, binDir, error });
}

function parsedArgs({ words = [], tokenBudget = DEFAULT_TOKEN_BUDGET, dryRun = false, help = false, yes = false, installDir = "", binDir = "", error = null } = {}) {
  const first = words[0]?.toLowerCase() ?? "";
  const action = first === "status" || first === "explain" || first === "install" ? first : "run";
  const taskWords = action === "run" ? words : words.slice(1);
  return {
    action,
    task: taskWords.join(" ").trim(),
    autonomous: action === "run" && taskWords.length === 0,
    tokenBudget,
    dryRun,
    help,
    yes,
    installDir,
    binDir,
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

export function buildOnklaudObjective(input = "") {
  const parsed = parseOnklaudArgs(input);
  return {
    ...parsed,
    goalCommand: `/goal --tokens ${parsed.tokenBudget} ${buildObjectiveText(parsed)}`,
  };
}

function buildObjectiveText(parsed) {
  const taskText = parsed.autonomous
    ? `No task was provided. Make major safe development progress autonomously in the current Pi working directory. First inspect git status, repo instructions, manifests, tests, docs/plans/TODOs, and codebase-map-understand.md when present; choose the highest-impact safe objective; then implement validated slices until done or blocked.`
    : `Task: ${parsed.task}`;

  return `Use Onklaud 5 as an advisory council while Pi fulfills the objective with normal tools.

${taskText}

Onklaud protocol:
- Run \`onklaud status\` before relying on Onklaud. If it is unavailable or unhealthy, continue with the normal Pi workflow and record that Onklaud was unavailable.
- Use Onklaud for planning/review/gate checkpoints on meaningful work, for example: \`onklaud loop --type code --prompt "<question>" --draft-file <tmp-file>\` or \`onklaud gate --domain coding --text "<summary>" --json\`.
- Treat Onklaud output as advice, not authority. Verify every recommendation against live files before editing.
- Pi owns all file edits, tests, validation, commits, and pushes. Do not delegate tool execution or repo mutation to Onklaud.
- Do not send secrets, credentials, private keys, .env contents, or sensitive logs to Onklaud; redact if needed.
- Capture git status and dirty-file ownership before edits. Do not overwrite unrelated dirty work.
- Do not publish, deploy, spend money, rewrite history, force-push, expose secrets, or change remotes.
- After each slice, run focused validation plus package/project validation when feasible; continue until the objective is fixed, deferred with reason, or blocked with an owner decision.
- Before completion, run a final evidence audit: changed files, validation receipts, Onklaud checkpoint result when used, remaining worktree state, and unresolved owner decisions.`;
}

export function onklaudCompletions(prefix = "") {
  return ["status", "explain", "install --yes", "install --dir ~/.local/share/onklaud-5 --bin-dir ~/.local/bin", "--dry-run", "--tokens 700k", "fix the failing tests", "improve this repo"]
    .filter((value) => value.startsWith(prefix))
    .map((value) => ({ value, label: value }));
}
