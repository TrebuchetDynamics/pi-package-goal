---
name: git-commit-push
description: Ship local Git changes by inspecting, polishing, validating, split-committing, and pushing. Use for commit, push, ship, delivery audit, or delivery blockers; not deploys or releases.
---

# Git Commit Push

Finish delivery. In ship mode, local changes are the delivery queue, not a reason to return `review_needed`.

## Mode

- **Ship mode (default):** invoking this skill, or asking to commit/push/ship, means inspect the worktree, safely fix it, commit every isolatable in-scope topic, and push.
- **Audit mode:** only when the user explicitly says audit, status, review, dry run, or do not commit/push. Inspect and validate, but do not stage, commit, or push.
- **Continuation mode:** when resolving a prior `GIT_COMMIT_PUSH_DECISION`, inspect the named blocker first, repair safe issues, then continue the previously approved ship request.

Do not ask for approval merely because there are many changed files, the diff spans code/tests/docs, or the worktree was dirty before this skill loaded. Inspect it.

## Ship-mode outcome

Ship mode is complete only when every changed and untracked path has been inspected and one of these happened:

1. **Shipped:** safe topics were committed and pushed. Unrelated owner files may remain unstaged.
2. **No-op:** the worktree was already clean and the branch synchronized; report that plainly.
3. **Needs decision:** no safe topic could be isolated because one exact owner choice blocks all delivery.
4. **Blocked:** credentials, a hard validation failure, unsafe overlapping data, or remote/Git state prevents delivery after a focused safe repair attempt.

If any safe topic was pushed, the overall decision is `shipped` even when unrelated files remain. `review_needed` is valid only when no safe topic can be isolated and an exact owner decision blocks all delivery. A list of uncommitted paths is not a blocker explanation.

## Scope rules

For every modified, staged, and untracked path, inspect the real diff/content and classify it:

- **Ship now:** created or changed for the current request, part of a coherent local feature/fix, required tests/docs/config, or safe mechanical polish.
- **Leave unstaged:** demonstrably unrelated owner work, generated output, logs/cache/local state, or a separate topic that the user did not ask to ship.
- **Needs decision:** ownership or intended behavior remains genuinely ambiguous after inspection and cannot be isolated from all safe work.
- **Blocked:** secrets/credentials, unsafe binary or generated data, destructive history requirements, unresolved conflicts, or validation that cannot be safely repaired.

Conversation provenance is evidence: files changed during the current task are in scope unless the diff shows otherwise. Without provenance, infer from diff coherence, branch/task context, tests, and docs; do not classify everything as `review_needed` just because ownership was not narrated.

## Workflow

1. **Inspect**
   - Read repo instructions and `git status --short --branch`.
   - Inspect staged and unstaged diffs.
   - Inspect every untracked file's name, type/size, and text content when practical. `git diff --stat` excludes untracked files.
   - Check remotes/upstream without mutating history.

2. **Plan commits**
   - Group the safe work into the fewest coherent reviewable topics.
   - Split independent fixes; keep code with tests/docs required to explain or validate it.
   - Leave unrelated files unstaged. Use explicit pathspecs or `git add -p` for mixed files.

3. **Polish**
   - Apply safe formatting, import cleanup, `.gitignore` hygiene, stale-path fixes, and deterministic test setup repairs.
   - Do not turn delivery into a product rewrite, dependency upgrade, or architecture project.

4. **Validate**
   - Run user-provided commands; otherwise infer the project's build/typecheck/lint/tests and run `git diff --check`.
   - A failure means inspect and make the smallest safe fix, then rerun the failed command.
   - Missing fixtures/templates/helpers and obvious formatting/path failures are repair candidates, not automatic blockers.
   - Use `diagnose` for a real behavior failure or `tdd` for missing behavior coverage, then resume delivery when green.

5. **Commit each topic**
   - Stage only that topic.
   - Inspect `git diff --cached --name-status`; inspect the cached diff when staging hunks.
   - Run its smallest meaningful check, commit it, and record the hash.
   - Repeat until no safe in-scope topic remains. Do not stop after tests pass; commit and push.

6. **Push**
   - Run the full validation set after the final commit.
   - Push the current branch to its configured upstream; with exactly one `origin` and no upstream, use `git push -u origin HEAD`.
   - Do not run `git pull` or use `--autostash` as a routine first step. Push first.
   - If push is rejected, fetch and inspect incoming commits. Use fast-forward-only only when it truly fast-forwards without overlap. Ask before merge/rebase or when incoming changes overlap delivered work. Never force-push.

7. **Verify final state**
   - Run `git status --short --branch` and check ahead/behind.
   - Report pushed commits, validation receipts, and every remaining path with its concrete reason.

## When to ask

Ask one focused question only when the answer changes ownership, intended behavior, secret handling, destructive history, deployment/publication, dependency policy, conflict resolution, or unsafe remote integration.

Do not ask merely to approve formatting, obvious test repairs, split commits, explicit path staging, leaving unrelated dirt unstaged, or pushing to the already configured upstream.

## Red lines

- Never commit secrets, `.env` files, private keys, credentials, personal machine state, logs, caches, build output, or generated Understand artifacts.
- Do not deploy, publish, release, force-push, rewrite history, rebase, merge divergent history, change remotes, delete branches, or broaden product scope without explicit approval.
- Do not use broad staging until every path has been inspected.
- Do not discard or overwrite unrelated owner work.
- Do not claim delivery without fresh validation, commit hashes, push output, and final Git state.

## Output contract

End with no more than three human-readable lines, then the two machine markers. Omit empty fields and do not repeat the same hash, branch, path, or decision under multiple headings. Summarize commit lists as a count/range and validation by subsystem unless the user asks for full detail.

```text
SHIPPED|NO-OP|NEEDS DECISION|BLOCKED — <commit count/range and push result, or one blocker>
Checks: <grouped validation receipts>; inspected all modified and untracked paths
Left local: <exact paths + reason> | Need: <one owner action>  # omit when empty
GIT_COMMIT_PUSH_VALIDATED: yes|no
GIT_COMMIT_PUSH_DECISION: shipped|blocked|review_needed
```

For audit mode, start with `AUDIT — <what would happen>` and keep the same line limit. Never print separate Mode, Scope, Delivery, Unblocked, Final state, or Completion audit sections; their facts belong in the compact lines above.

When the decision is `review_needed`, do not ask the user to "review" a schema. Ask one plain yes/no question, say what each answer does, and include only the fact needed to decide:

```text
NEEDS DECISION — Commit and push `polydart` 921b9a0 → 8898e0a?
Why: the pointer change contains README/SVG updates only; checks passed.
Reply `yes` to ship it or `no` to leave it local.
GIT_COMMIT_PUSH_VALIDATED: no
GIT_COMMIT_PUSH_DECISION: review_needed
```

If the choice is not binary, give at most three numbered options and ask for the option number.

Marker mapping:

- `SHIPPED` → `shipped` after safe commit(s) and successful push.
- `NO-OP` → `shipped` only when the worktree is clean and upstream is already synchronized.
- `NEEDS DECISION` → `review_needed` only when no safe topic could ship; name the exact decision.
- `BLOCKED` → `blocked` only after a focused safe repair attempt or a hard red line.
- Audit mode reports what would happen and uses the marker matching the discovered state; it never mutates Git.

## Example

User invokes ship mode on a synchronized branch with coherent UI, MapLibre, Maestro, test, and documentation changes; TypeScript and Jest pass.

Agent: inspect every path, group coherent topics, stage explicitly, commit, rerun validation, and push. Do not run pull/autostash first, preserve all changes without inspection, or return `review_needed` merely because several domains changed.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
