---
name: autonomous-codebase-improver
description: Orchestrate broad, open-ended repository improvement one validated slice at a time. Use when the agent should discover and prioritize useful work; not a single known defect or a prewritten implementation plan.
---

# Autonomous Codebase Improver

Use this as the orchestrator for broad “make this repo better” requests. It is intentionally not a multi-agent framework: one objective, one repo evidence pass, one bounded slice, one validation loop.

Research basis: `research/agentic-coding-skills/report.md` found the strongest pattern is retrieval-first repo context, explicit agent-computer interfaces, deterministic feedback signals, and benchmark-style completion audits instead of self-reported progress.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, package manifests, README/CONTEXT, and `codebase-map-understand.md` when present.
2. State the improvement lane: bug fix, architecture/refactor, UI/design, tests/validation, docs/package hygiene, or delivery polish.
3. Pick exactly one safe slice from live evidence.
4. Route to one specialist skill only when the slice crosses that seam.
5. Validate the slice with concrete commands and finish through `git-commit-push` only when the user asks to ship.

## Slice selection ladder

Prefer slices in this order:

1. Failing validation already visible in the repo.
2. A reproducible bug or flaky behavior with a fast feedback loop.
3. A high-leverage architecture seam with caller and test evidence.
4. A UI/design surface with visual, accessibility, or state evidence.
5. Package/docs drift with a clear manifest or test signal.
6. Small test coverage gaps for changed or risky behavior.

Skip slices that need secrets, production access, deploy/publish, dependency upgrades, broad rewrites, unclear ownership, or destructive git actions.

## Specialist routing

- Need to find one fixable bug from repo evidence → `bug-harvest`; success signal: one candidate has a repro and validation path.
- Known broken, failing, flaky, or slow behavior → `diagnose`; success signal: repro/regression command passes.
- New expected behavior or missing focused coverage → `tdd`; success signal: RED→GREEN test evidence.
- Architecture, refactor, seams, testability, module boundaries → `technical-auditor` Architecture mode; success signal: locality/caller/test evidence for one safe slice.
- UI layout, visual hierarchy, accessibility, responsive states → `ui-design`; success signal: visual-state evidence plus build/test/lint where available.
- Folder topology or shared code in one noisy directory → `skill-folder-refactor` or `share-code`; success signal: guarded scan/audit or proven duplicate extraction.
- Source-backed README/docs/wiki drift → `wiki-docs`; success signal: docs slice cites live files and validates links/examples/tests where practical.
- Pi extension/package resources → `pi-extensions-helper`; success signal: package manifest and extension tests/smoke evidence.
- Finished work the user wants shipped → `git-commit-push`; success signal: validation, commit, push, final clean or classified state.

## Operating loop

For each slice:

```text
Slice state:
- lane: <bug|architecture|ui|tests|docs|package|delivery>
- evidence: <files/commands/map leads inspected>
- intended change: <one sentence>
- validation: <command or concrete proof>
- stop condition: <what proves done or blocks>
```

1. Build or identify the feedback signal before editing.
2. Make the smallest safe change that can satisfy that signal.
3. Run scoped validation, then repo-level validation when practical.
4. Record receipts and classify remaining gaps.
5. Continue to another slice only if the user asked for ongoing autonomous improvement, validation is green, and no owner decision is needed.

## Completion audit

Before saying the autonomous improvement is done, map the original request to artifacts:

- research recommendations applied or explicitly deferred;
- new/changed skill files named;
- validation commands and results;
- remaining candidate skills or improvements listed as future work;
- dirty worktree state inspected and classified.

Do not claim completion because “some improvement” landed. Completion means every explicit recommendation selected for this pass has either been implemented and validated or intentionally deferred with a reason.

## Red lines

- Do not run broad repo rewrites, dependency upgrades, deploy/publish, force-push/rebase/merge, or secret-bearing operations without explicit approval.
- Do not edit unrelated dirty worktree paths.
- Do not stack multiple specialist skills in one step; route only at real seams.
- Do not ship without `git-commit-push` validation and user shipping intent.

## Output contract

End each autonomous pass with:

```text
Autonomous improvement pass:
- slice completed:
- files changed:
- validation:
- research recommendations applied:
- deferred recommendations:
- next safe slice:
```

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
