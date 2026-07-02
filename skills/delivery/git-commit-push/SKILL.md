---
name: git-commit-push
description: Polish, validate, commit, and push safe git worktree changes with aggressive split commits. Use for git commit push, split commits, commit and push, ship changes, delivery audit, pull-before-push, or GIT_COMMIT_PUSH blockers.
---

# Git Commit Push

Use this skill for the final delivery step after implementation work. It replaces the former `/git-commit-push` extension with an agent-run workflow. The job is to polish obvious safe issues, prove the patch is safe, then split-commit by topic and push with worktree, validation, staging, commit, push, and final-state evidence.

## Entry protocol

Resolve mode before acting:

- **Audit/status mode** — only if the user explicitly asks for `audit`, `status`, `review`, `dry run`, or `do not commit/push`: inspect and report; do not stage, commit, or push.
- **Ship mode (default)** — if the user invokes the skill without an explicit audit/status request, or asks to `commit`, `push`, `ship`, `commit and push`, `finish delivery`, `polish and commit`, or `fix issues and ship`: inspect, safely polish, validate, intentionally stage, commit, and push.
- **Blocked-continuation mode** — if the user asks to resolve a previous `GIT_COMMIT_PUSH_DECISION: blocked|review_needed`: inspect the named blocker first, safely fix it when in scope, then continue if ship mode is explicit or the prior request was already ship mode.

If validation commands are provided, use them. Otherwise infer project validation, with `npm test` when `package.json` has a test script, plus `git diff --check`.

Ask only if ownership/scope is unclear, a fix would change product behavior or broaden scope, destructive git operations are needed, remote integration is non-fast-forward without explicit pull/merge approval, or credentials/remote state require an owner decision. Do not ask merely to approve safe formatting, import cleanup, `.gitignore` hygiene, missing test fixtures/templates/helpers, obvious validation fixes, safe split commits, leaving unrelated dirt unstaged, `git fetch`, `git merge --ff-only`, or `git push -u origin HEAD` when there is exactly one remote named `origin` and the user asked to push.

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

## Unblock and split-commit mandate

In ship mode, unblock everything that can be safely isolated. Unrelated or review-needed dirt in the worktree is not automatically a stop sign: leave it unstaged and ship safe in-scope topics with explicit pathspecs. Block the whole delivery only when no safe topic can be isolated, a risky path overlaps the safe topic, validation cannot be made meaningful, or git/remote state prevents safe delivery.

Before staging, make the smallest reviewable topic plan from the inspected paths. Split as much as possible without breaking validation: docs separate from code, tests separate when they are useful alone, independent fixes separate, generated/lockfile/hygiene separate, and mixed files split with `git add -p` or explicit hunk staging when practical. Do not collapse unrelated topics just to make fewer commits.

For each topic: stage only its files/hunks, inspect `git diff --cached --name-status` and the cached diff when hunks were split, run the smallest meaningful validation for that topic when available, commit it, then move to the next topic. Rerun the full delivery validation set before push. Do not wait for unrelated review-needed paths if the current topic validates and stages cleanly.

If anything remains uncommitted, report why it did not block the shipped topics or the exact reason it did. A blocker must name the path, the red line it crosses, what safe alternatives were tried or rejected (`leave unstaged`, `.gitignore`, restore, separate commit, hunk split, scoped validation, temp validation), and the owner decision needed.

## Skill composition

- If validation fails because behavior is broken, pause delivery and use `diagnose`; hand off with trigger, failing command/output artifact, next skill, and expected passing repro/regression signal.
- If the patch lacks focused coverage for new behavior, use `tdd`; hand off with changed behavior, uncovered artifact, next skill, and expected RED→GREEN test signal.
- If the change is an extension/package resource, apply `pi-extensions-helper`; hand off with manifest/extension artifact and expected type/test/smoke signal.
- If the user asks for a second-model or structured review before ship, run `autoreview`; hand off with diff scope and expected clean review signal.
- If Goal mode is active, copy validation receipts, commit hash, and push result back into Goal evidence.

## Workflow

1. Read repo instructions (`AGENTS.md`, package scripts, relevant docs) and inspect `git status --short --branch`.
2. Inspect diffs for every changed and untracked path. For untracked files, inspect names, type/size, and contents when text. Remember `git diff --stat` excludes untracked files; report modified and untracked files from `git status --short` plus explicit untracked-file inspection, not diff stat alone.
3. If the patch claims architecture/refactor/codebase-impact evidence and `codebase-map-understand.md` exists, consult the codebase map for the touched modules/callers and verify the named files before classifying the patch. Do not build or refresh codebase map during delivery unless validation or the accepted scope requires it.
4. Check whether generated junk, local state, logs, caches, temp files, or tool outputs should be ignored. In ship mode, fix safe hygiene directly: tighten `.gitignore`, remove/leave unstaged generated junk, run formatters already declared by the repo, update imports, and apply small mechanical fixes from validation.
5. Classify each path:
   - **safe in-scope** — directly belongs to the requested work, including safe polish, formatting, import cleanup, and `.gitignore` hygiene;
   - **review_needed** — plausibly useful but ownership/scope is unclear, unrelated owner work that can be left unstaged, or a fix would alter intended behavior/API;
   - **blocked** — secrets, credentials, generated/binary junk that cannot be safely ignored, local state/logs, dependency lockfile surprises that overlap the delivery, unrelated work that cannot be isolated, or validation failures without a safe in-scope fix.
6. In audit/status mode, stop after the classification and validation receipts; do not stage.
7. In ship mode, keep working through safe polish loops and safe topic commits until no more isolatable in-scope work remains. Do not block safe topic commits merely because unrelated `review_needed` paths remain unstaged.
8. Build a split-commit plan before staging. Prefer many small coherent commits over one mixed commit. Use `git add -p` for mixed files when a clean hunk split is practical; otherwise keep the file with the topic that needs it and say why it could not split safely.
9. Run validation:
   - required user-specified commands;
   - inferred project tests;
   - `git diff --check`.
   If unrelated dirty paths make whole-worktree validation noisy, first try the smallest non-destructive isolation that proves the staged topic: scoped validation, `git diff --check -- <topic paths>`, or a temporary worktree with only the safe patch applied. Say when validation is scoped instead of whole-repo.
10. If validation fails, enter the ship-mode repair loop: fix safe in-scope issues directly and rerun validation. Use `diagnose` for behavior failures that need debugging, but continue delivery after the regression is fixed and validation is green. Missing validation artifacts such as templates, fixtures, helper scripts, or stale path references are presumed repairable until inspected. Report blocked only when the next fix is risky, broad, unclear, outside scope, or explicitly crosses a red line.
11. Stage intentionally by explicit pathspec or hunk per topic. Include safe polish files such as formatter results, import cleanup, or `.gitignore` hygiene in the smallest topic they belong to. Never use broad staging (`git add .`, `git add -A`) unless every changed/untracked path has been inspected and classified safe in-scope. Before every commit, inspect `git diff --cached --name-status` and ensure it contains only that topic; inspect `git diff --cached` too when hunk staging was used.
12. Make coherent split commits whenever changes are separable; use one commit only when the safe paths form one topic or cannot be split without invalid intermediate states. After each commit, capture `git rev-parse --short HEAD` and `git show --stat --oneline --no-renames HEAD`.
13. Before push, run the full delivery validation set once more unless it was already run after the last commit. Then push to the current branch's upstream. If no upstream exists and there is exactly one remote named `origin`, use `git push -u origin HEAD`; otherwise ask before choosing. If push is rejected for fetch-first/non-fast-forward, run `git fetch` and inspect incoming commits. Use `git merge --ff-only @{u}` only when it fast-forwards cleanly. For divergent history, only merge/rebase if the user explicitly requested pull/merge/rebase or resolving the push rejection; inspect incoming changes first, stop on conflicts or overlap with uncommitted work, and rerun validation before pushing.
14. Verify final `git status --short --branch` and report commit hash(es), push result, remaining worktree state, and validation receipts.

## Red lines

- Do not commit secrets, `.env` files, private keys, credentials, or personal machine state.
- Do not include `.pi/*/logs.jsonl`, caches, build output, generated Understand artifacts, generated codebase map artifacts, or unrelated user edits unless explicitly requested.
- Do not deploy, publish packages, rewrite history, force-push, rebase, merge remote changes except fast-forward-only, change remotes, or delete branches unless explicitly requested. `git fetch`, `git merge --ff-only`, and `git push -u origin HEAD` under the workflow rules are allowed.
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
Delivery: <commit/push result, split commit plan/list, pull/merge result if any, or why skipped>
Unblocked: <safe topics shipped or explicitly none>
Still uncommitted: <review_needed/blocked paths left unstaged and why they did not/did block delivery>
Final state: <git status --short --branch summary>
Completion audit: <concise statement that all modified and untracked files were inspected/classified; note when untracked tests are absent from diff stat but included from status/inspection>
GIT_COMMIT_PUSH_VALIDATED: yes|no
GIT_COMMIT_PUSH_DECISION: shipped|blocked|review_needed
```

Use `review_needed` when owner review or scope confirmation is genuinely needed before commit, never because the user omitted explicit ship wording. Use `blocked` when validation cannot be safely fixed after a focused repair attempt, risky files prevent safe isolation/delivery, or git/remote state prevents safe delivery. If blocked by validation, include the repair attempts already made and the exact red-line reason the next fix cannot be performed safely. Use `shipped` only after validation passes for the shipped scope, commit succeeds, push succeeds, and final git state is verified; remaining unrelated review-needed paths may be left unstaged if they are explicitly reported.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
