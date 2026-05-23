# Development Goal Rename and Intake Design

## Goal

Replace `/development-loop` with `/development-goal`: a goal-driven Pi extension that works until the goal is reached, not until an iteration cap is exhausted.

## Accepted decisions

- Hard rename command surface to `/development-goal` only.
- Remove `/development-loop` and `/dev-loop` command aliases.
- Rename the package, GitHub repository, and local checkout folder to `pi-package-development-goal`.
- Update package metadata URLs from `TrebuchetDynamics/pi-package-development-loop` to `TrebuchetDynamics/pi-package-development-goal`.
- Hard rename persisted paths and UI keys:
  - config: `.pi/development-goal.json`
  - logs: `.pi/development-goal/logs.jsonl`
  - state type: `development-goal-state`
  - status/widget key: `development-goal`
- Remove user-facing iterations and `--iterations` / `--max-iterations` options.
- Keep internal `turnCount` for logs, status, and runaway-guard accounting.
- Rename final markers to:
  - `DEV_GOAL_REPORT: {...}`
  - `DEV_GOAL_VALIDATED: yes|no`
  - `DEV_GOAL_DECISION: continue|stop|blocked|done`
- Every start enters an explicit `intake` phase before implementation.

## Command behavior

`/development-goal start <goal>` creates a goal run. The first prompt is an intake prompt, not an implementation prompt.

The intake prompt tells the agent to:

1. inspect project instructions and repo context first;
2. identify only decision-blocking gaps;
3. answer any code-discoverable question by inspecting files instead of asking the user;
4. ask the user only for real product/design decisions that cannot be inferred safely;
5. produce a concise goal plan/checklist;
6. continue to implementation only when gaps are closed or none exist.

If no real gaps exist, the agent should say so and proceed with `DEV_GOAL_DECISION: continue`.

## Run model

The goal continues until one of these terminal decisions:

- `done`: objective complete after completion audit.
- `blocked`: missing evidence, unsafe git state, credentials, or user decision required.
- `stop`: clean handoff requested.

`continue` schedules the next turn. There is no max-iteration cap. The internal `turnCount` increments when a goal prompt is sent and appears only as progress/accounting metadata.

## Validation and completion

`done` still requires a completion audit:

1. restate objective as deliverables;
2. map each requirement to evidence;
3. list missing or weak evidence;
4. choose `continue` or `blocked` unless all required evidence is present.

`DEV_GOAL_VALIDATED: yes` is allowed only after configured validation commands have fresh evidence.

## Migration stance

This is a hard rename. Existing `/development-loop` command names, old final markers, old paths, old package metadata, and the old local checkout folder are removed or renamed rather than kept as aliases. The GitHub repository rename requires owner/admin access; if automation lacks that permission, implementation must stop with a clear blocker and exact manual rename steps.

## Test strategy

Use TDD with `tests/validate-package.mjs`:

- package metadata names `pi-package-development-goal` and the `TrebuchetDynamics/pi-package-development-goal` repository;
- command registration includes `/development-goal` only;
- parser no longer accepts iteration options as active configuration;
- start sends intake prompt first;
- intake prompt includes grill/brainstorm instructions and real-gap constraint;
- `DEV_GOAL_*` markers parse and drive continuation;
- status, logs, config path, and state key use development-goal names;
- no docs references to `/development-loop`, `/dev-loop`, or `DEV_LOOP_*` remain except migration/history notes if intentionally kept.
