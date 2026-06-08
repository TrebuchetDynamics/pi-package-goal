# Graphify codebase graph guidance

Use this when a skill needs codebase-wide relationship evidence.

## Activation rule

Before broad codebase exploration, check for `graphify-out/graph.json`.

- If it exists, run a focused Graphify query before broad manual grepping/reading.
- If it does not exist and the task is broad architecture/refactor/onboarding/impact work, start `/graphify .` unless the current skill is explicitly read-only/status-only, the user asked not to build artifacts, or graph building is blocked by missing backend/credentials.
- If Graphify cannot build or query, record the blocker and continue with direct repo evidence instead of pretending graph evidence exists.

## When to use Graphify

Use Graphify for tasks involving:

- architecture, module relationships, caller/callee paths, data flow, dependency seams, refactor candidates, dedupe, bug-impact analysis, onboarding, PR/review impact, package-resource relationships, route/component/data-flow relationships, or “how does this codebase work?”

Skip Graphify for:

- a tiny localized edit in one known file;
- pure prose shaping with no codebase claims;
- delivery-only status where all changed paths are already known and no architecture/impact claim is being made;
- explicit user requests not to build/query graph artifacts.

## Query patterns by task

Use concrete relationship questions, not vague summaries:

- Architecture: `graphify query "architecture hotspots, module relationships, callers, tests, and cross-module seams" --budget 2500`
- Refactor: `graphify query "duplicate logic, shared seams, callers, and tests for <target>" --budget 2000`
- Diagnose/TDD: `graphify query "call paths and tests related to <bug or behavior>" --budget 2000`
- Review/delivery: `graphify query "impact and callers for changed files <paths>" --budget 2000`
- UI/frontend: `graphify query "routes components data flow and tests for <surface>" --budget 2000`
- Pi/package resources: `graphify query "package resources extensions skills tests and manifest relationships for <topic>" --budget 2000`

## Verification discipline

- Treat graph results as leads. Verify every claimed file, caller, dependency, hotspot, route, or test against live source files before editing or reporting.
- If graph output conflicts with current files, trust live files and note the graph as stale.
- Use `/graphify <path> --update` only when refreshing the graph is useful for the task; do not refresh as delivery theater.
- Do not commit generated `graphify-out/` artifacts unless the user explicitly asks.

## Evidence handoff

When handing to another skill, include:

```text
graphify evidence:
- query: <question asked>
- result: <nodes/files/edges used>
- verified files: <live files read>
- stale/unknown: <anything not verified>
```
