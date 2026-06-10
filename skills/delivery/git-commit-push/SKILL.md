---
name: git-commit-push
description: Polish, validate, commit, and push safe git worktree changes. Use for git commit push, commit and push, ship changes, delivery audit, or GIT_COMMIT_PUSH blockers.
---

# Git Commit Push

Use this skill for the final delivery step after implementation work. It replaces the former `/git-commit-push` extension with an agent-run workflow. The job is to polish obvious safe issues, prove the patch is safe, then commit and push with worktree, validation, staging, commit, push, and final-state evidence.

## Entry protocol

Resolve mode before acting:

- **Audit/status mode** — only if the user explicitly asks for `audit`, `status`, `review`, `dry run`, or `do not commit/push`: inspect and report; do not stage, commit, or push.
- **Ship mode (default)** — if the user invokes the skill without an explicit audit/status request, or asks to `commit`, `push`, `ship`, `commit and push`, `finish delivery`, `polish and commit`, or `fix issues and ship`: inspect, safely polish, validate, intentionally stage, commit, and push.
- **Blocked-continuation mode** — if the user asks to resolve a previous `GIT_COMMIT_PUSH_DECISION: blocked|review_needed`: inspect the named blocker first, safely fix it when in scope, then continue if ship mode is explicit or the prior request was already ship mode.

If validation commands are provided, use them. Otherwise infer project validation, with `npm test` when `package.json` has a test script, plus `git diff --check`.

Ask only if ownership/scope is unclear, a fix would change product behavior or broaden scope, destructive git operations are needed, no upstream exists, push is rejected, or credentials/remote state require an owner decision. Do not ask merely to approve safe formatting, import cleanup, `.gitignore` hygiene, missing test fixtures/templates/helpers, or obvious validation fixes in ship mode.

## Ship-mode repair mandate

In ship mode, a validation failure is an instruction to repair the repo, not a reason to stop at the first red command. Keep a tight repair loop: reproduce the failing command, inspect the exact missing/broken artifact, make the smallest safe repo-consistent fix, rerun the failing command, then rerun the delivery validation set. Report `blocked` only after the next required fix crosses a red line or genuinely needs owner input.

Treat these as safe in-scope repair candidates unless evidence says otherwise:

- missing files referenced by tracked tests, Makefiles, scripts, docs, or package manifests;
- missing templates, test fixtures, small shell helpers, generated-file ignore rules, or packaging manifests required by validation;
- stale paths/names in tests or scripts when the intended current path is obvious from nearby files;
- formatting, import, lint, vet, typecheck, or diff-check failures;
- deterministic test setup cleanup that removes local-state coupling.

Before blocking on validation, prove at least one of:

- the missing/broken artifact cannot be reconstructed from adjacent tests/docs/scripts;
- the fix would require product behavior/API changes, secrets, credentials, deployment access, dependency upgrades, or external services;
- multiple plausible repairs exist and choosing among them is an owner decision;
- a focused repair was attempted and the failure moved to a genuinely different risky blocker.

## Skill composition

- If validation fails because behavior is broken, pause delivery and use `diagnose`; hand off with trigger, failing command/output artifact, next skill, and expected passing repro/regression signal.
- If the patch lacks focused coverage for new behavior, use `tdd`; hand off with changed behavior, uncovered artifact, next skill, and expected RED→GREEN test signal.
- If the change is an extension/package resource, apply `pi-extensions-helper`; hand off with manifest/extension artifact and expected type/test/smoke signal.
- If the user asks for a second-model or structured review before ship, run `autoreview`; hand off with diff scope and expected clean review signal.
- If Goal mode is active, copy validation receipts, commit hash, and push result back into Goal evidence.

## Workflow

1. Read repo instructions (`AGENTS.md`, package scripts, relevant docs) and inspect `git status --short --branch`.
2. Inspect diffs for every changed and untracked path. For untracked files, inspect names, type/size, and contents when text.
3. If the patch claims architecture/refactor/codebase-impact evidence and `codebase-map-understand.md` exists, consult the codebase map for the touched modules/callers and verify the named files before classifying the patch. Do not build or refresh codebase map during delivery unless validation or the accepted scope requires it.
4. Check whether generated junk, local state, logs, caches, temp files, or tool outputs should be ignored. In ship mode, fix safe hygiene directly: tighten `.gitignore`, remove/leave unstaged generated junk, run formatters already declared by the repo, update imports, and apply small mechanical fixes from validation.
5. Classify each path:
   - **safe in-scope** — directly belongs to the requested work, including safe polish, formatting, import cleanup, and `.gitignore` hygiene;
   - **review_needed** — plausibly useful but ownership/scope is unclear, or a fix would alter intended behavior/API;
   - **blocked** — secrets, credentials, generated/binary junk that cannot be safely ignored, local state/logs, dependency lockfile surprises, unrelated user work, or validation failures without a safe in-scope fix.
6. In audit/status mode, stop after the classification and validation receipts; do not stage.
7. In ship mode, keep working through safe polish loops until clean or blocked. Block before commit only if any path is `blocked`, or if `review_needed` paths are required for delivery and cannot be safely resolved without owner input.
8. Run validation:
   - required user-specified commands;
   - inferred project tests;
   - `git diff --check`.
9. If validation fails, enter the ship-mode repair loop: fix safe in-scope issues directly and rerun validation. Use `diagnose` for behavior failures that need debugging, but continue delivery after the regression is fixed and validation is green. Missing validation artifacts such as templates, fixtures, helper scripts, or stale path references are presumed repairable until inspected. Report blocked only when the next fix is risky, broad, unclear, outside scope, or explicitly crosses a red line.
10. Stage intentionally by explicit pathspec. Include safe polish files such as formatter results, import cleanup, or `.gitignore` hygiene. Never use broad staging (`git add .`, `git add -A`) unless every changed/untracked path has been inspected and classified safe in-scope.
11. Prefer coherent split commits when changes are separable; otherwise make one clear commit. After committing, capture `git rev-parse --short HEAD` and `git show --stat --oneline --no-renames HEAD`.
12. Push to the current branch's upstream. If no upstream exists, ask before choosing one. If push is rejected for fetch-first/non-fast-forward, stop and ask before rebase/merge.
13. Verify final `git status --short --branch` and report commit hash(es), push result, remaining worktree state, and validation receipts.

## Red lines

- Do not commit secrets, `.env` files, private keys, credentials, or personal machine state.
- Do not include `.pi/*/logs.jsonl`, caches, build output, generated Understand artifacts, generated codebase map artifacts, or unrelated user edits unless explicitly requested.
- Do not deploy, publish packages, rewrite history, force-push, rebase, merge remote changes, change remotes, or delete branches unless explicitly requested.
- Do not make product/architecture changes, dependency upgrades, lockfile churn, or broad rewrites under the label of polish unless explicitly in scope.
- Do not stage broadly before every path has been inspected.
- Do not mark delivery successful without real command output proving validation and push status.

## Output contract

Always end with:

```text
Git Commit Push audit: <absolute repo path>
decision: shipped|blocked|review_needed
Mode: audit|ship|blocked-continuation
Scope:
- safe in-scope: <paths or none>
- review_needed: <paths/reason or none>
- blocked: <paths/reason or none>
Validation:
- <command>: pass|fail|not run (<reason if needed>)
Delivery: <commit/push result or why skipped>
Final state: <git status --short --branch summary>
GIT_COMMIT_PUSH_VALIDATED: yes|no
GIT_COMMIT_PUSH_DECISION: shipped|blocked|review_needed
```

Use `review_needed` when owner review or scope confirmation is genuinely needed before commit, never because the user omitted explicit ship wording. Use `blocked` when validation cannot be safely fixed after a focused repair attempt, risky files are present, or git/remote state prevents safe delivery. If blocked by validation, include the repair attempts already made and the exact red-line reason the next fix cannot be performed safely. Use `shipped` only after validation passes, commit succeeds, push succeeds, and final git state is verified.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
