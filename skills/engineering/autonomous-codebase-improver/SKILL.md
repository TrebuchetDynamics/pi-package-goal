---
name: autonomous-codebase-improver
description: Run broad, open-ended or continuous roadmap-driven repository improvement as validated slices. Use when the agent should find and fix weaknesses, bugs, UI, tests, architecture, performance, or pipeline issues; not a single known defect or fixed plan.
---

# Autonomous Codebase Improver

Use this as the orchestrator for broad “make this repo better” requests. It is intentionally not a multi-agent framework: one objective, a live evidence queue, one bounded slice at a time, and deterministic validation before continuation.

Research basis: `research/agentic-coding-skills/report.md` found the strongest pattern is retrieval-first repo context, explicit agent-computer interfaces, deterministic feedback signals, and benchmark-style completion audits instead of self-reported progress. `research/software-development-skill-design/report.md` reinforces narrow routing, low-overhead instructions, and trajectory evidence rather than broad orchestration.

## Operating modes

- **Single-slice mode:** use when the user asks for one improvement or a checkpoint. Select, implement, validate, and report one bounded slice.
- **Continuous campaign mode:** use when the user says keep improving, work continuously, follow the roadmap/tasks, find everything worth fixing, or gives a broad ongoing objective. Maintain a ranked queue and keep completing validated slices until a terminal condition applies.

Continuous means repeated bounded work, not one giant diff.

## Quick start

1. Determine the mode and scope from the request; continuous intent authorizes continuation, not risky actions.
2. Inspect `git status --short --branch`, repo instructions, package manifests, README/CONTEXT, task sources, tests/CI, and `codebase-map-understand.md` when present.
3. Build or refresh a small evidence-backed candidate queue across relevant weakness lanes.
4. Pick exactly one highest-priority safe slice; record why it outranks alternatives or why higher-ranked signals are unavailable.
5. Route to one specialist skill only when the slice crosses that seam.
6. Validate the slice, update the queue, and continue according to the selected mode. Use `git-commit-push` only when the user asks to ship.

## Candidate discovery

1. Read repository-owned work first: `ROADMAP.md`, `TODO.md`, `TASKS.md`, issue/plan/PRD/ADR files, unchecked tasks, CI failures, and explicit acceptance criteria.
2. Sweep only relevant live surfaces for correctness, security, CI/pipeline and release reliability, performance, architecture, tests/observability, UI/accessibility/responsive states, and docs/package drift.
3. Verify map, TODO, smell, and static-analysis leads against live code, callers, behavior, or a runnable check.
4. Keep at most three candidates that are actionable now; compare severity/impact, owner priority, evidence confidence, reversibility, and validation cost.

Prefer documented work over invented improvements. A code smell is a lead, not a bug; require a concrete consequence before selecting it. If no safe candidate has a validation path, report that instead of manufacturing work.

## Slice selection ladder

Prefer slices in this order, with critical security/data-loss risk and explicit owner priority allowed to override:

1. Failing release/build/validation or a reproducible correctness, security, or data-loss defect.
2. An explicit roadmap/task/issue with acceptance criteria and a fast feedback loop.
3. CI/pipeline, packaging, deployment-preparation, or flaky-test reliability with local validation.
4. A high-leverage architecture or performance seam with caller and test evidence.
5. A UI surface with visual hierarchy, accessibility, responsive, loading, empty, or error-state evidence.
6. Missing tests/observability for changed or risky behavior.
7. Package/docs drift with a clear manifest, link, example, or test signal.

Skip slices that need secrets, production access, deploy/publish, dependency upgrades, broad rewrites, unclear ownership, or destructive git actions. Do not choose an easier lower-ranked slice while a higher-ranked safe signal remains actionable; record blockers or explicit deferrals instead.

## Specialist routing

- Need to find one fixable bug from repo evidence → `bug-harvest`; success signal: one candidate has a repro and validation path.
- Known broken, failing, flaky, or slow behavior → `diagnose`; success signal: repro/regression command passes.
- CI/pipeline, build, packaging, or release-check failure → `diagnose`; success signal: the smallest safe local reproduction passes without deploying or publishing.
- New expected behavior or missing focused coverage → `tdd`; success signal: RED→GREEN test evidence.
- Architecture, refactor, seams, testability, module boundaries → `technical-auditor` Architecture mode; success signal: locality/caller/test evidence for one safe slice.
- UI layout, visual hierarchy, accessibility, responsive states → `ui-design`; success signal: visual-state evidence plus build/test/lint where available.
- Folder topology or shared code in one noisy directory → `skill-folder-refactor` or `share-code`; success signal: guarded scan/audit or proven duplicate extraction.
- Source-backed README/docs/wiki drift → `wiki-docs`; success signal: docs slice cites live files and validates links/examples/tests where practical.
- Pi extension/package resources → `pi-extensions-helper`; success signal: package manifest and extension tests/smoke evidence.
- Finished work the user wants shipped → `git-commit-push`; success signal: validation, commit, push, final clean or classified state.

## Campaign and slice state

Keep state in the conversation unless the repository already owns a roadmap/task file or the user asks to update one. Do not create a tracking system just to run this skill.

```text
Campaign state:
- mode: <single-slice|continuous>
- objective and scope:
- task source: <roadmap|tasks|issues|audit|live discovery>
- queue: <up to three ranked candidates>
- completed: <validated slices>
- blocked: <candidate + reason + owner action>
- current slice:

Slice state:
- lane: <bug|security|pipeline|architecture|performance|ui|tests|docs|package>
- evidence: <files/commands/map leads inspected>
- selection rationale: <why this is the highest-priority safe slice>
- intended change: <one sentence>
- validation: <command or concrete proof>
- stop condition: <what proves done or blocks>
```

## Operating loop

1. Build or identify the feedback signal before editing.
2. Make the smallest safe change that can satisfy that signal.
3. Run scoped validation, then repo-level validation when practical.
4. Record receipts, update the campaign queue, and re-scan the changed area for exposed bugs or follow-up gaps.
5. In single-slice mode, report the checkpoint. In continuous campaign mode, select the next safe candidate immediately.

Do not stop after one successful slice when continuous campaign mode is active. Continue while useful in-scope work remains, validation is green, and no terminal condition applies.

## Failure handling

- If the baseline already fails, preserve the output and treat that failure as candidate evidence; do not attribute it to the new slice.
- If scoped validation fails after editing, do not start another slice. Compare against the baseline and current diff, then fix or revert only the current slice; route uncertain root cause to `diagnose`.
- If the same blocker twice produces no new evidence, stop blind retries and report the blocker plus the smallest owner action needed.
- If repo-level validation exposes an unrelated failure, classify it separately and leave unrelated code untouched.

## Terminal conditions

Stop continuous work only when the scoped roadmap/queue is exhausted and a fresh discovery pass finds no safe candidate; an owner decision, credential, production access, or risky action is required; validation cannot be restored; the same blocker repeats without new evidence; or the user pauses/stops the campaign. Budget/context limits produce a handoff, not a false completion claim.

## Example

User: “Work continuously through this repo’s weaknesses.” Agent: read the roadmap and CI first, then inspect relevant bug, security, pipeline, performance, architecture, UI, and test signals; rank three candidates; fix and validate the release-blocking failure; update the queue; then continue to the next safe task instead of stopping at the first success.

## Completion audit

Before saying the autonomous improvement is done, map the original request to artifacts:

- objective, scope, and repository task source restated;
- each explicit task and its acceptance criteria mapped to files, behavior, decisions, and fresh validation;
- changed files/artifacts and validation receipts named;
- campaign queue entries completed, explicitly deferred, or blocked with an owner action;
- a final discovery pass found no remaining safe in-scope work;
- dirty worktree state inspected and classified.

Do not claim completion because “some improvement” landed or one test suite passed. A continuous campaign is complete only when the scoped task source is exhausted and fresh discovery finds no safe candidate; otherwise continue or report the exact blocker.

## Red lines

- Do not run broad repo rewrites, dependency upgrades, deploy/publish, force-push/rebase/merge, or secret-bearing operations without explicit approval.
- Do not edit unrelated dirty worktree paths.
- Do not stack multiple specialist skills in one step; route only at real seams.
- Do not ship without `git-commit-push` validation and user shipping intent.

## Output contract

End each autonomous pass with:

```text
Autonomous improvement pass:
- mode and task source:
- slice completed:
- selection rationale:
- files changed:
- validation:
- queue update:
- blocked/deferred:
- next safe slice or terminal reason:
```

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
