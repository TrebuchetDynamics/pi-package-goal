# Graphify codebase graph guidance

Use this when a skill needs codebase-wide relationship evidence.

## When to use Graphify

- If `graphify-out/graph.json` exists and the task asks about architecture, module relationships, caller/callee paths, data flow, refactor candidates, onboarding, PR impact, or “how does this codebase work?”, query Graphify before broad manual exploration.
- For broad repo understanding where no graph exists, consider `/graphify .` when the extra setup cost is justified. Do not build a graph for a tiny localized edit, a single known file, or a pure writing/design task.
- If the user explicitly asks to rebuild/update a graph, use `/graphify .`, `/graphify <path>`, or `/graphify <path> --update` as appropriate.

## How to use it

- Prefer `/graphify query "<question>"` from Pi. In shell-only validation contexts, `graphify query "<question>" --budget <n>` is acceptable when the CLI is already installed.
- Ask relationship questions, not vague summaries: “What callers reach X?”, “Which files connect auth to billing?”, “What paths mention Y?”, “Where are duplicate parser seams?”
- Treat graph results as leads. Verify every claimed file, caller, dependency, or hotspot against live source files and tests before editing or reporting.
- If graph output conflicts with current files, trust live files and note the graph as stale. Use `/graphify <path> --update` only when the task benefits from refreshing the graph.

## Evidence handoff

When handing to another skill, include:

```text
graphify evidence:
- query: <question asked>
- result: <nodes/files/edges used>
- verified files: <live files read>
- stale/unknown: <anything not verified>
```
