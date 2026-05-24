---
name: git-commit-push
description: Audit, commit, and push safe git worktree changes. Use when the user asks to git commit push, commit and push, ship changes, run a delivery audit, or resolve GIT_COMMIT_PUSH blockers.
---

# Git Commit Push

Use this skill for the final delivery step after implementation work. It replaces the former `/git-commit-push` extension with an agent-run workflow.

## Entry protocol

- If the user asks for `audit` or status only: inspect and report; do not commit or push.
- If the user asks to commit/push/ship: run the audit, validation, commit, and push path.
- If validation commands are provided, use them. Otherwise infer project validation, with `npm test` when `package.json` has a test script, plus `git diff --check`.
- Ask only if ownership/scope is unclear, destructive git operations are needed, or credentials/remote state require an owner decision.

## Workflow

1. Read repo instructions (`AGENTS.md`, package scripts, relevant docs) and inspect `git status --short --branch`.
2. Inspect diffs for every changed/untracked file. Classify safe in-scope changes vs risky/out-of-scope artifacts.
3. Block before commit if changes include secrets, credentials, generated/binary junk, local state/logs, dependency lockfile surprises, or unrelated user work.
4. Run validation:
   - required user-specified commands;
   - inferred project tests;
   - `git diff --check`.
5. If validation fails, diagnose only when a small safe fix is obvious; otherwise report blocked and do not commit.
6. Stage intentionally. Prefer coherent split commits when changes are separable; otherwise make one clear commit.
7. Push to the current branch's upstream. If no upstream exists, ask before choosing one. If push is rejected for fetch-first/non-fast-forward, stop and ask before rebase/merge.
8. Verify final `git status --short --branch` and report commit hash(es), push result, and validation receipts.

## Red lines

- Do not commit secrets, `.env` files, private keys, credentials, or personal machine state.
- Do not include `.pi/*/logs.jsonl`, caches, build output, or unrelated user edits unless explicitly requested.
- Do not deploy, publish packages, rewrite history, force-push, rebase, merge remote changes, or delete branches unless explicitly requested.
- Do not mark delivery successful without real command output proving validation and push status.

## Output contract

Always end with:

```text
Git Commit Push audit: <absolute repo path>
decision: shipped|blocked|review_needed
Validation:
- <command>: pass|fail|not run (<reason if needed>)
Delivery: <commit/push result or why skipped>
GIT_COMMIT_PUSH_VALIDATED: yes|no
GIT_COMMIT_PUSH_DECISION: shipped|blocked|review_needed
```

Use `review_needed` when changes look safe but owner review or scope confirmation is needed before commit.
