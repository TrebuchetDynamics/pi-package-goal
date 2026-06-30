---
name: bug-harvest
description: Find and fix one evidence-backed bug. Use when asked to hunt bugs, fix something broken, improve by finding a bug, or patch failing validation.
---

# Bug Harvest

Use this as a thin, discoverable wrapper around `diagnose` and `tdd`. The job is not to scan forever; it is to find one high-confidence bug candidate, build a feedback loop, fix it, and validate it.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, manifests, tests, and recent validation output.
2. Harvest candidates only from evidence:
   - failing tests, lint, typecheck, build, or package validation;
   - issue/task docs or TODOs tied to executable behavior;
   - reproducible commands, logs, traces, fixtures, or bug reports already in scope;
   - stale paths/scripts where the intended current artifact is obvious.
3. Pick one candidate with the clearest repro and smallest blast radius.
4. Switch to `diagnose` for the repro/fix loop.
5. Switch to `tdd` only when the fix needs a new regression test or missing seam.

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

Reject code-smell-only candidates. If no candidate has a runnable or constructible feedback signal, stop and report what evidence is missing.

## Fix loop

1. Run or create the smallest repro.
2. Confirm it reflects the candidate symptom, not a different nearby failure.
3. Form 3–5 hypotheses if the cause is not obvious.
4. Make the smallest safe fix.
5. Add or update a focused regression check when there is a correct seam.
6. Rerun the repro, then relevant repo validation.
7. If the user asked to ship, hand off to `git-commit-push` with validation receipts.

## Red lines

- Do not invent bugs from vague code smells.
- Do not edit broad architecture while fixing one bug; hand architecture blockers to `technical-auditor`.
- Do not require external services, secrets, production data, or dependency upgrades without explicit approval.
- Do not hide behavior changes inside a “bug fix”; name them and verify them.

## Output contract

```text
Bug harvest:
- candidate:
- repro:
- fix:
- regression/validation:
- handoff or next candidate:
```

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
