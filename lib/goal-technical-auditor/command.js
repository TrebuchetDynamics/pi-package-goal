export const DEFAULT_TOKEN_BUDGET = "200k";

export function parseGoalTechnicalAuditorArgs(input) {
  const raw = String(input ?? "").trim();
  const tokenMatch = raw.match(/(?:^|\s)--tokens(?:=|\s+)([0-9]+(?:\.[0-9]+)?\s*[kKmM]?)(?:\s|$)/);
  const tokenBudget = tokenMatch ? tokenMatch[1].replace(/\s+/g, "") : DEFAULT_TOKEN_BUDGET;
  const scope = tokenMatch
    ? `${raw.slice(0, tokenMatch.index)} ${raw.slice((tokenMatch.index ?? 0) + tokenMatch[0].length)}`.trim()
    : raw;
  return { scope: scope || ".", tokenBudget };
}

export function buildGoalTechnicalAuditorObjective(input) {
  const { scope, tokenBudget } = parseGoalTechnicalAuditorArgs(input);
  return {
    scope,
    scopeLabel: formatScopeForObjective(scope),
    tokenBudget,
    goalCommand: `/goal --tokens ${tokenBudget} ${buildObjectiveText(scope)}`,
  };
}

export function formatScopeForObjective(scope) {
  return scope === "." ? "the current Pi working directory (`.`)" : `folder/path \`${scope}\``;
}

function buildObjectiveText(scope) {
  const scopeLabel = formatScopeForObjective(scope);
  return `Run technical-auditor Full mode for ${scopeLabel}, then execute a safe prioritized development loop from the audit findings.

Mega automation contract:
1. Load and follow /skill:technical-auditor in Full mode. No mode argument means Full mode: broad audit plus architecture-deepening review.
2. Study repo instructions, dirty worktree, manifests, CI/tests, and Graphify when graphify-out/graph.json exists. Treat graph facts as leads and verify live files.
3. Produce the required audit evidence and architecture review output before changing production code, unless a tiny safety-net/test change is needed to validate the audit path.
4. Convert the audit Task Plan into implementation slices. Start with Milestone 0 safety nets, then critical correctness/security, then high-impact architecture/testability improvements, then polish.
5. Implement only safe, in-scope, validated changes. Do not publish, deploy, spend money, rewrite history, force-push, expose secrets, or overwrite unrelated dirty work.
6. After each slice, run the most relevant validation commands plus package/project validation when feasible. Record evidence.
7. Continue autonomously while safe useful slices remain. If blocked by ownership, risky product behavior, legal/security uncertainty, or failing validation you cannot fix safely, stop with a clear blocker and next action.
8. Before marking the goal complete, perform the technical-auditor completion audit: every audit finding chosen for this run is either fixed with validation, explicitly deferred with reason, or blocked with owner decision needed; no unverified completion claims.`;
}
