import { isAbsolute, relative, resolve } from "node:path";
import { splitCommandArgs } from "../pi-bridge/command-grammar.js";

export const DEFAULT_TOKEN_BUDGET = "700k";
export const BUG_HUNT_REFACTOR_FOCUS = "bug-hunt-refactor";
export const GOAL_TECHNICAL_AUDITOR_USAGE = `Usage: /goal-technical-auditor [--tokens 700k] [--dry-run] [--focus ${BUG_HUNT_REFACTOR_FOCUS}] [scope|prompt]\nExamples: /goal-technical-auditor ., /goal-technical-auditor lib, /goal-technical-auditor --tokens 500k ., /goal-technical-auditor bug hunt`;

export function parseGoalTechnicalAuditorArgs(input) {
  let tokens;
  try {
    tokens = splitCommandArgs(input);
  } catch (error) {
    return parsedArgs({ error: error.message });
  }

  let tokenBudget = DEFAULT_TOKEN_BUDGET;
  let dryRun = false;
  let help = false;
  let focus = null;
  const scopeTokens = [];

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
      if (!value || value.startsWith("--")) return parsedArgs({ scopeTokens, dryRun, help, focus, error: "Missing value for --tokens." });
      tokenBudget = value.replace(/\s+/g, "");
      index += 1;
      continue;
    }
    if (token.startsWith("--tokens=")) {
      tokenBudget = token.slice("--tokens=".length).replace(/\s+/g, "");
      continue;
    }
    if (token === "--focus") {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) return parsedArgs({ scopeTokens, tokenBudget, dryRun, help, focus, error: "Missing value for --focus." });
      if (value !== BUG_HUNT_REFACTOR_FOCUS) return parsedArgs({ scopeTokens, tokenBudget, dryRun, help, focus, error: `Unknown focus: ${value}. Supported focus: ${BUG_HUNT_REFACTOR_FOCUS}.` });
      focus = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--focus=")) {
      const value = token.slice("--focus=".length);
      if (value !== BUG_HUNT_REFACTOR_FOCUS) return parsedArgs({ scopeTokens, tokenBudget, dryRun, help, focus, error: `Unknown focus: ${value}. Supported focus: ${BUG_HUNT_REFACTOR_FOCUS}.` });
      focus = value;
      continue;
    }
    if (token.startsWith("--")) return parsedArgs({ scopeTokens, tokenBudget, dryRun, help, focus, error: `Unknown option: ${token}. ${GOAL_TECHNICAL_AUDITOR_USAGE}` });
    scopeTokens.push(token);
  }

  const error = validateTokenBudget(tokenBudget);
  return parsedArgs({ scopeTokens, tokenBudget: error ? DEFAULT_TOKEN_BUDGET : tokenBudget, dryRun, help, focus, error });
}

function parsedArgs({ scopeTokens = [], tokenBudget = DEFAULT_TOKEN_BUDGET, dryRun = false, help = false, focus = null, error = null } = {}) {
  const interpreted = interpretScopeOrPrompt(scopeTokens, focus);
  return { scope: interpreted.scope, tokenBudget, dryRun, help, focus: interpreted.focus, prompt: interpreted.prompt, error };
}

export function interpretScopeOrPrompt(scopeTokens = [], focus = null) {
  const raw = scopeTokens.join(" ").trim();
  if (!raw) return { scope: ".", focus, prompt: "" };

  const normalized = raw.toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  const meansCurrentRepo = /\b(?:current|this|repo|repository|project|cwd|here)\b/.test(normalized);
  const asksForBugHunt = /\bbug\b/.test(normalized) && /\bhunt\b/.test(normalized);
  const promptLike = /\b(?:audit|review|hunt|bugs?|fix(?:es)?|issues?|current|repo|project|codebase|worktree)\b/.test(normalized);
  const pathLike = raw === "." || raw.startsWith("./") || raw.startsWith("/") || raw.startsWith("../") || /^[\w@./:-]+$/.test(raw);

  if (asksForBugHunt) {
    return { scope: ".", focus: focus ?? BUG_HUNT_REFACTOR_FOCUS, prompt: raw };
  }

  if (meansCurrentRepo && promptLike) {
    return { scope: ".", focus, prompt: raw };
  }

  if (!pathLike && promptLike) {
    return { scope: ".", focus, prompt: raw };
  }

  return { scope: raw, focus, prompt: "" };
}

function validateTokenBudget(rawTokenBudget) {
  const raw = String(rawTokenBudget ?? "").trim();
  const suffix = raw.slice(-1).toLowerCase();
  const numeric = suffix === "k" || suffix === "m" ? raw.slice(0, -1) : raw;
  const value = Number(numeric);
  if (!Number.isFinite(value) || value <= 0) return "Token budget must be positive.";
  return null;
}

export function validateScopeInsideCwd(cwd, scope) {
  const root = resolve(cwd || process.cwd());
  const target = isAbsolute(scope) ? resolve(scope) : resolve(root, scope || ".");
  const rel = relative(root, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return null;
  return `Scope must stay inside the current working directory: ${scope}`;
}

export function buildGoalTechnicalAuditorObjective(input) {
  const { scope, tokenBudget, dryRun, help, focus, prompt, error } = parseGoalTechnicalAuditorArgs(input);
  return {
    scope,
    scopeLabel: formatScopeForObjective(scope),
    tokenBudget,
    dryRun,
    help,
    focus,
    prompt,
    error,
    goalCommand: `/goal --tokens ${tokenBudget} ${buildObjectiveText(scope, focus, prompt)}`,
  };
}

export function formatScopeForObjective(scope) {
  return scope === "." ? "the current Pi working directory (`.`)" : `folder/path \`${scope}\``;
}

function buildObjectiveText(scope, focus = null, prompt = "") {
  const scopeLabel = formatScopeForObjective(scope);
  const promptText = prompt ? `\n\nUser request interpreted by /goal-technical-auditor:\n- Raw prompt: ${prompt}\n- Scope defaulted to current working directory unless an explicit existing path is provided. Do not treat prompt words as filesystem paths.` : "";
  const focusText = focus === BUG_HUNT_REFACTOR_FOCUS ? `

Bug-Hunt Refactor Focus:
- Prefer deleting dead or shallow code over adding abstractions.
- Use share-code only when duplicate production behavior is proven by live call sites.
- Run pre/during/post refactor bug hunts; inspect edge cases before moving code, during extraction, and after validation.
- Treat inconsistent edge cases found during extraction as candidate bug fixes, not hidden refactor changes.
- Avoid speculative utilities, one-call-site abstractions, and broad repo-wide dedupe sweeps.
- Validate each slice with focused tests plus the package/project validation command when feasible.` : "";
  return `Run technical-auditor Full mode for ${scopeLabel}, then execute a safe prioritized development loop from the audit findings.

Preflight before audit:
- Capture git status and classify dirty-file ownership before relying on worktree evidence.
- Read repo instructions and package/project manifests.
- Identify the package/project test command and run the relevant baseline when feasible.
- Check codebase map freshness when codebase-map-understand.md is present; treat it as leads only.${promptText}${focusText}

Mega automation contract:
1. Load and follow /skill:technical-auditor in Full mode. No mode argument means Full mode: broad audit plus architecture-deepening review.
2. Study repo instructions, dirty worktree, manifests, CI/tests, and existing codebase maps such as codebase-map-understand.md when present. Treat generated map facts as leads and verify live files.
3. Produce the required audit evidence and inline architecture candidates before changing production code, unless a tiny safety-net/test change is needed to validate the audit path.
4. Convert the audit Task Plan into implementation slices. Start with Milestone 0 safety nets, then critical correctness/security, then high-impact architecture/testability improvements, then polish.
5. Implement only safe, in-scope, validated changes. Do not publish, deploy, spend money, rewrite history, force-push, expose secrets, or overwrite unrelated dirty work.
6. After each slice, run the most relevant validation commands plus package/project validation when feasible. Record evidence.
7. Continue autonomously while safe useful slices remain. If blocked by ownership, risky product behavior, legal/security uncertainty, or failing validation you cannot fix safely, stop with a clear blocker and next action.
8. Before marking the goal complete, perform the technical-auditor completion audit: every audit finding chosen for this run is either fixed with validation, explicitly deferred with reason, or blocked with owner decision needed; no unverified completion claims.`;
}
