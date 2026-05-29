---
name: candidates-folder-refactor
description: Rank noisy folders for folder-refactor. Use when asked to find refactor candidates, noisy folders, or top folders/subfolders to split.
---

# Candidates Folder Refactor

Find the top five noisy folders that are good candidates for `folder-refactor`. This skill only scouts and ranks; it does not move files.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, and existing maps such as `codebase-map-understand.md` when present.
2. Run the scanner from the repo root, optionally with a target folder:

```bash
node skills/candidates-folder-refactor/scripts/find-candidates.mjs [folder]
```

3. Read the top results, then inspect each candidate enough to confirm whether the noise is real or just generated/vendor/test-fixture bulk.

## Workflow

1. **Choose scan root**
   - No folder named: scan the current repo and rank folders/subfolders below it.
   - Folder named: scan only beneath that folder and rank subfolders under it; do not recommend the folder itself.
2. **Score candidates**
   - Prefer folders with many files, many direct children, mixed extensions, mixed responsibility signals, and nested subfolders.
   - Add evidence columns for recent `git log` churn, import fan-in/fan-out, test presence, responsibility role signals, and duplicate file/symbol names.
   - Ignore generated/vendor/cache/build folders (`node_modules`, `.git`, `dist`, `build`, `coverage`, `.pi`, `.understand-anything`, etc.).
   - Treat scores as triage signals, not proof of bad architecture.
3. **Confirm top five**
   - Inspect names/tree/imports/tests around each result.
   - Drop false positives caused by generated code, vendored code, snapshots, fixtures, or a deliberately cohesive language/package boundary.
   - For each surviving candidate, explain why `folder-refactor` would be the next skill and what boundary to give it.
4. **Hand off**
   - If the owner picks a candidate, hand off to `folder-refactor` with the exact target folder, evidence from the scan, and validation hints found nearby.

## Red lines

- Do not edit production files while scouting candidates.
- Do not recommend repo-root refactors; recommend a bounded folder instead.
- Do not rank generated, vendor, cache, build-output, or dependency folders as actionable targets.
- Do not present the numeric score as objective truth; include human-readable evidence such as churn, callers, tests, roles, and duplicates.

## Output contract

```text
Candidates folder refactor: <repo-or-folder>
Top candidates:
1. <path> — <why noisy; suggested folder-refactor boundary>
2. ...
Validation/scout evidence:
- scanner: <command>
- inspected: <paths or searches>
Next step: run folder-refactor on <best path> if owner approves
```

## Shared contract

Follow [the shared skill contract](../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
