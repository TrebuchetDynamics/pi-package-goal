# Repository Study Contract

Use this checklist before producing an architecture review. The goal is to make each candidate evidence-backed, repo-specific, and verifiable.

## Baseline orientation

Start by inspecting:

- `git status --short --branch` for dirty work and branch context; classify each dirty path as in-scope evidence, unrelated owner work, or blocker before relying on it;
- nearest `AGENTS.md` or repo instructions;
- `README.md`, package/app manifests, and validation scripts;
- `CONTEXT.md` or `CONTEXT-MAP.md` for domain language;
- `docs/adr/` for durable decisions;
- `codebase-map-understand.md` when it exists.

If `CONTEXT-MAP.md` exists, identify the relevant context before reading `CONTEXT.md` or ADRs. If no domain docs exist, say so in the study evidence instead of inventing a glossary.

## Candidate evidence requirements

Before a candidate can appear in the HTML report, gather at least:

1. **Friction evidence** — a file path, call path, test pain, repeated branch, or coupling point that makes the current module shallow.
2. **Caller evidence** — at least one caller or entry point that crosses the current interface.
3. **Validation evidence** — an existing test, missing-test signal, or validation command affected by the seam.
4. **Domain/decision evidence** — relevant `CONTEXT.md` term, ADR, or explicit note that none was found.
5. **Deletion-test result** — whether deleting the suspected module concentrates complexity or merely moves it.
6. **Dependency category** — `in-process`, `local-substitutable`, `ports & adapters`, or `mock` from [architecture-deepening-dependencies.md](architecture-deepening-dependencies.md).
7. **Worktree status** — whether evidence came from committed source, accepted in-flight changes, or unrelated dirty work that must be excluded.

Do not include candidates based only on aesthetics, naming preference, file size, or generic layering rules. A large file is not automatically shallow; a small file is not automatically deep.

## Generated map discipline

`codebase-map-understand.md` is useful orientation, not source of truth.

When using it:

- check its analyzed commit/date when available;
- follow its file paths with targeted reads;
- verify current `git status --short --branch`, dirty-path classification, and live code before citing it;
- cite the map as graph evidence only after live files confirm the seam still exists.

If the map is stale or absent, continue with direct repo study instead of blocking.

## Exploration passes

Use direct tool passes when no sub-agent tool exists:

- **Domain pass** — read domain docs and ADRs; list terms and decisions that shape seams.
- **Shape pass** — inspect imports, exports, call paths, manifests, and package/module layout.
- **Testability pass** — inspect tests and validation commands; note where tests cross the same interface callers use, or where they must pierce implementation details.
- **Change-locality pass** — use `rg` to find repeated conditionals, duplicated orchestration, pass-through modules, and logic spread across callers.
- **Dirty-worktree pass** — if the repo is not clean, read diffs for relevant dirty files and exclude unrelated user work from candidates, diagrams, and validation claims.
- **Dependency-shape pass** — identify whether the deepening is in-process, local-substitutable, ports & adapters, or mock; note which adapters would prove the seam is real.

When parallel sub-agents are available, they may run these passes independently, but their findings still need concrete file/command evidence.

## Candidate confidence rubric

Use these labels consistently:

- **Strong** — multiple evidence types agree; deletion test says the module is shallow; tests or callers would clearly improve.
- **Worth exploring** — real friction exists, but the deepened shape or dependency strategy needs design work.
- **Speculative** — plausible pattern, but evidence is thin; include only if it helps frame discussion and mark it honestly.

## Study notes shape

Keep notes compact and internal unless the user asks for them. The report should include evidence receipts, not a transcript.

```text
candidate: <deepening name>
friction: <file/path/line or command evidence>
caller path: <entry point -> current module -> dependency>
validation path: <test/command or missing-test signal>
worktree: <clean|in-scope dirty evidence|excluded unrelated dirty paths>
domain/ADR: <term/decision or none found>
deletion test: <concentrates complexity | moves complexity | inconclusive>
dependency category: <in-process|local-substitutable|ports & adapters|mock>
confidence: <Strong|Worth exploring|Speculative>
```

## Review quality gate

Before writing the HTML report, check:

- at least two candidates have complete evidence, unless the repo area is genuinely tiny;
- every `Strong` candidate has caller evidence, validation evidence, and a deletion-test result;
- every `Worth exploring` candidate names the uncertainty that remains;
- every candidate either uses clean committed source or identifies accepted in-scope dirty evidence;
- every `Speculative` candidate is clearly useful for discussion, not filler;
- the top recommendation has the strongest locality/leverage proof, not just the biggest diff.

## Red lines

- Do not edit production code during exploration.
- Do not write repo artifacts for the report; write HTML to the OS temp directory.
- Do not propose a new interface before the user chooses a candidate.
- Do not contradict an ADR silently; surface real conflicts in the report.
- Do not treat generated files, vendored code, build output, or local state as architecture evidence unless the repo explicitly owns them.
