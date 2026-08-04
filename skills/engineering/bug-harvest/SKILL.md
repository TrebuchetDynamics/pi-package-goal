---
name: bug-harvest
description: Run long-running evidence-backed bug hunts, fixing one unknown bug at a time and immediately continuing to the next. Use for ongoing bug harvesting or unexplained failing validation; not a specific reported defect with a known repro.
---

# Bug Harvest

Run a continuous campaign of bounded bug fixes. Each iteration owns one evidence-backed defect; after validation, immediately hunt the next one instead of stopping.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, manifests, tests, and recent validation output.
2. Harvest at most three candidates from evidence:
   - failing tests, lint, typecheck, build, or package validation;
   - issue/task docs or TODOs tied to executable behavior;
   - reproducible commands, logs, traces, fixtures, or bug reports already in scope;
   - stale paths/scripts where the intended current artifact is obvious.
3. Pick the candidate with the clearest repro and smallest blast radius.
4. Use `diagnose` for the repro/fix loop.
5. Use `tdd` only when the fix needs a new regression test or missing seam.
6. Record the validation receipt, then immediately return to candidate discovery.

## Candidate filter

Accept a candidate only when you can state:

```text
Bug candidate:
- symptom:
- evidence:
- repro command or artifact:
- expected signal after fix:
- likely files:
```

Reject code-smell-only candidates. Keep one active candidate at a time; unproven leads remain leads.

Pre-existing dirty or untracked paths stay quarantined from candidate discovery unless the user explicitly puts them in scope or a repo-owned failing command proves their relevance. Do not inspect or modify one merely because its filename resembles the current topic.

Get first executable evidence with a bounded command after the repo and ownership check: prefer a reported failure or scoped validation, then inspect its path. Do not spend a turn only announcing plans, searching TODOs, or reading unrelated dirty work.

## Campaign loop

- After each validated fix, preserve its receipt and immediately rescan for the next evidence-backed candidate.
- A named next candidate is an instruction to reproduce it now, not a handoff or final-report item.
- Do not emit a final response between bugs while a safe candidate remains.
- Changed-file count, elapsed iterations, or one successful fix are not stop reasons.
- Stop only when the user pauses/stops, a hard blocker prevents safe work, a bounded rescan finds no evidence-backed candidate, or context exhaustion requires a resumable handoff.
- Keep unrelated dirty work untouched and isolate every iteration to its own files and validation signal.

## Fix loop

1. Run or create the smallest repro and confirm it matches the symptom.
2. Form 3–5 hypotheses when the cause is not obvious.
3. Make the smallest safe root-cause fix.
4. Add or update one focused regression check when there is a correct seam.
5. Rerun the repro, then relevant repository validation.
6. Record the fix and receipt, clear the active candidate, and continue the campaign loop.

## Severity receipt

After validating each fix, record `severity: critical|high|medium|low` and `why: <evidenced consequence, affected path/users, and realistic trigger>`. Critical means proven exploit, data loss, or broad outage; high means a realistic security impact or broken core path; medium means bounded wrong behavior or reliability loss; low means a limited edge case or maintainer-facing failure. Do not inflate severity from diff size, code smell, or hypothetical reach.

A severity assessment is not a stop reason. Add it to the campaign receipt and immediately look for another evidence-backed bug.

## Red lines

- Do not invent bugs from vague code smells.
- Do not investigate multiple candidates concurrently.
- Do not edit broad architecture while fixing one bug; record architecture blockers for `technical-auditor`.
- Do not require external services, secrets, production data, or dependency upgrades without explicit approval.
- Do not hide behavior changes inside a bug fix; name and verify them.
- If the user asked to ship, use `git-commit-push` only at a campaign stop or explicit delivery checkpoint.

## Output contract

Emit this only when the campaign stops:

```text
Bug harvest:
- fixed bugs:
  - <bug> — severity: <level>; why: <concrete impact and trigger>
- regression/validation:
- search performed after last fix:
- stop reason:
- resumable next action:
```

## Example

User: “The benchmark is frozen and scoring needs spend approval. Don’t wait—find gaps and bugs now; preserve my untracked test.”
Agent: Quarantines the untracked file, runs tracked local validation, reproduces and fixes the highest-signal independent defect, validates it, then continues harvesting.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
