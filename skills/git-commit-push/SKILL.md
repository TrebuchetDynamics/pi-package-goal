---
name: git-commit-push
description: Audit, commit, and push safe git worktree changes. Use when the user asks to git commit push, commit and push, ship changes, run a delivery audit, or resolve GIT_COMMIT_PUSH blockers.
---

# Git Commit Push

Use this skill for the final delivery step after implementation work. It replaces the former `/git-commit-push` extension with an agent-run workflow. The job is not just "run git commands"; it is to prove the patch is safe to ship with worktree, validation, staging, commit, push, and final-state evidence.

## Entry protocol

Resolve mode before acting:

- **Audit/status mode** — if the user asks for `audit`, `status`, `review`, or invokes the skill without an explicit commit/push/ship request: inspect and report; do not stage, commit, or push.
- **Ship mode** — if the user asks to `commit`, `push`, `ship`, `commit and push`, or `finish delivery`: run audit, validation, intentional staging, commit, and push.
- **Blocked-continuation mode** — if the user asks to resolve a previous `GIT_COMMIT_PUSH_DECISION: blocked|review_needed`: inspect the named blocker first, then continue only if the blocker is cleared and ship mode is explicit.

If validation commands are provided, use them. Otherwise infer project validation, with `npm test` when `package.json` has a test script, plus `git diff --check`.

Ask only if ownership/scope is unclear, destructive git operations are needed, no upstream exists, push is rejected, or credentials/remote state require an owner decision.

## Skill composition

- If validation fails because behavior is broken, pause delivery and use `diagnose`; hand off with trigger, failing command/output artifact, next skill, and expected passing repro/regression signal.
- If the patch lacks focused coverage for new behavior, use `tdd`; hand off with changed behavior, uncovered artifact, next skill, and expected RED→GREEN test signal.
- If the change is an extension/package resource, apply `pi-extensions-helper`; hand off with manifest/extension artifact and expected type/test/smoke signal.
- If the user asks for a second-model or structured review before ship, run `autoreview`; hand off with diff scope and expected clean review signal.
- If Goal mode is active, copy validation receipts, commit hash, and push result back into Goal evidence.

## Workflow

1. Read repo instructions (`AGENTS.md`, package scripts, relevant docs) and inspect `git status --short --branch`.
2. Inspect diffs for every changed and untracked path. For untracked files, inspect names, type/size, and contents when text.
3. Check whether generated junk, local state, logs, caches, temp files, or tool outputs should be ignored. If adding or tightening `.gitignore` is useful and in scope, update it before validation; if ownership is unclear, classify the `.gitignore` change as `review_needed` rather than silently skipping it.
4. Classify each path:
   - **safe in-scope** — directly belongs to the requested work, including useful `.gitignore` hygiene;
   - **review_needed** — plausibly useful but ownership/scope is unclear;
   - **blocked** — secrets, credentials, generated/binary junk, local state/logs, dependency lockfile surprises, or unrelated user work.
5. In audit/status mode, stop after the classification and validation receipts; do not stage.
6. In ship mode, block before commit if any path is `blocked`, or if `review_needed` paths are needed but not explicitly approved.
7. Run validation:
   - required user-specified commands;
   - inferred project tests;
   - `git diff --check`.
8. If validation fails, diagnose only when a small safe fix is obvious and in scope; otherwise report blocked and do not commit.
9. Stage intentionally by explicit pathspec. Include `.gitignore` when it was updated as part of safe hygiene. Never use broad staging (`git add .`, `git add -A`) unless every changed/untracked path has been inspected and classified safe in-scope.
10. Prefer coherent split commits when changes are separable; otherwise make one clear commit. After committing, capture `git rev-parse --short HEAD` and `git show --stat --oneline --no-renames HEAD`.
11. Push to the current branch's upstream. If no upstream exists, ask before choosing one. If push is rejected for fetch-first/non-fast-forward, stop and ask before rebase/merge.
12. Verify final `git status --short --branch` and report commit hash(es), push result, remaining worktree state, and validation receipts.

## Red lines

- Do not commit secrets, `.env` files, private keys, credentials, or personal machine state.
- Do not include `.pi/*/logs.jsonl`, caches, build output, generated Understand artifacts, or unrelated user edits unless explicitly requested.
- Do not deploy, publish packages, rewrite history, force-push, rebase, merge remote changes, change remotes, or delete branches unless explicitly requested.
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

Use `review_needed` when changes look safe but owner review, mode confirmation, or scope confirmation is needed before commit. Use `blocked` when validation fails, risky files are present, or git/remote state prevents safe delivery. Use `shipped` only after validation passes, commit succeeds, push succeeds, and final git state is verified.

## Shared contract

Follow [the shared skill contract](../COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
