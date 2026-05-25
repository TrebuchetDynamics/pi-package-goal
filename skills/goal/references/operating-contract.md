# Goal Operating Contract

Detailed operating rules for the `goal` skill. Keep `SKILL.md` compact; use this reference when auto-discovery, routing, or completion semantics matter.

## Auto-discovery checklist

When the user invokes no-arg `goal` and current status is not `active`, `paused`, or `blocked`:

1. Inspect explicit task sources:
   - `TODO.md`, `TASKS.md`, `ROADMAP.md`;
   - unchecked markdown tasks;
   - nearby issue, plan, PRD, ADR, or context docs;
   - comments that clearly name pending work.
2. Inspect repo/package signals:
   - failing tests or obvious validation gaps;
   - stale docs against manifests;
   - package resources missing from docs;
   - dirty worktree changes.
3. If an Understand agent map exists (`codebase-map-understand.md`), use it to identify high-signal seams before scanning broadly.
4. Self-grill the top 2-3 candidates and choose work that is:
   - valuable;
   - safe;
   - bounded to the current session;
   - verifiable with files, tests, docs, command output, or owner decisions.
5. Start the best candidate as the active objective and immediately take one concrete action.

## Dirty worktree guardrail

Dirty worktree changes are a signal, not consent to edit or ship them.

Before using dirty files as auto-discovery evidence:

- inspect `git status --short --branch`;
- inspect the relevant diff or file metadata;
- classify whether the change is likely user-owned, generated, local state, or in-scope work;
- do not edit unrelated user work;
- ask one ownership/scope question if unclear.

## No-arg status semantics

- `goal status` is always status-only.
- No-arg `goal` shows state when status is `active`, `paused`, or `blocked`.
- No-arg `goal` treats `complete`, `cleared`, or missing objective as inactive and may auto-discover new work.

This lets a completed goal become a launch point for the next useful objective without hiding the explicit status-only command.

## Replacement semantics

Ask before replacing an existing objective only when current status is `active`, `paused`, or `blocked`.

Do not ask replacement confirmation when status is `complete` or `cleared`; starting new work is safe because there is no live objective to interrupt.

## Multi-slice continuation

Broad objectives such as ports, migrations, parity work, audits, or module-by-module improvements should progress through repeated bounded slices.

After each slice:

1. record the artifact changed or produced;
2. run the focused validation for that slice;
3. update Goal state evidence with the validation receipt;
4. inspect repo evidence for the next smallest safe slice;
5. continue immediately if the objective remains active and no stop condition applies.

Good next-slice evidence includes unchecked TODO/parity items, failing or missing focused tests, module lists from the source app, `codebase-map-understand.md` seams verified against live files, and explicit continuation markers like `DEV_GOAL_DECISION: continue_next_slice`.

Do not stop at a status-only report when the next safe slice is known. A status reply is enough only for `goal status`, user-requested pause, blocked work, failed validation, soft-budget/context limits, or a completed objective.

## Skill routing details

Goal is an orchestrator. It should load the next specialist only at a real seam:

| Trigger | Next skill | Success signal |
| --- | --- | --- |
| Broken, flaky, or slow behavior | `diagnose` | Repro or regression test passes after a fix. |
| Planned feature with clear behavior | `tdd` | RED-GREEN-REFACTOR evidence. |
| Uncertain design, UI, state model, or algorithm | `prototype` | Throwaway artifact answers the design question. |
| Tangled seams or hard-to-test code | `improve-codebase-architecture` | Smaller seam, clearer boundary, and passing validation. |
| Skill creation or skill improvement | `write-a-skill` | Compact skill with concrete triggers, red lines, and validation. |
| Pi extension or package resource work | `pi-extensions-helper` | Manifest/API/package smoke signal passes. |
| Owner decision needed | `grill-me` or `grill-with-docs` | User answers the hard decision or docs record it. |
| User asks to ship completed work | `git-commit-push` | Validation receipts, commit hash, push result. |

Use this handoff evidence shape in Goal state:

```text
handoff evidence:
- trigger: <why the current skill is handing off>
- artifact: <file/command/test/doc/decision produced>
- next skill: <skill to continue with>
- success signal: <what proves the next skill worked>
```

## Completion audit details

Completion requires real evidence, not memory. Before declaring `complete`:

1. Restate the objective as concrete deliverables and success criteria.
2. Map each explicit requirement to evidence.
3. Inspect relevant files, command output, tests, git state, docs, or decisions.
4. Name weak evidence, missing requirements, or uncertainty.
5. Keep working or set `status: blocked` if anything material is missing.
6. Set `status: complete` only after the evidence covers the objective.
