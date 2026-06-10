---
name: candidates-folder-refactor
description: Rank noisy folders for skill-folder-refactor. Use when asked to find refactor candidates, noisy folders, or top folders/subfolders to split.
---

# Candidates Folder Refactor

Find the top five noisy folders that are good candidates for `skill-folder-refactor`. This skill only scouts and ranks; it does not move files.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, and existing maps such as `codebase-map-understand.md` when present. Use existing codebase maps for relationship/hotspot leads before ranking broad codebase candidates, then verify with scanner metrics and live files.
2. Run the scanner from the repo root, optionally with a target folder. It writes a local reuse log under the target folder:

```bash
node skills/engineering/candidates-folder-refactor/scripts/find-candidates.mjs [folder]
node skills/engineering/candidates-folder-refactor/scripts/find-candidates.mjs [folder] --from-log
autofolderrefactor ignore [folder]
autofolderrefactor <loops> [folder]
sh skills/engineering/candidates-folder-refactor/scripts/install.sh
sh install-autofolderrefactor.sh
./install-autofolderrefactor.sh
```

Use `autofolderrefactor N` only when the owner explicitly wants fully automatic candidate #1 → smart share-code + folder-refactor loops. The script expands the guarded `share-code` prompt directly for Pi print mode, because slash-command injection can exit too early in non-interactive runs. It is scoped to the current working directory: scan roots and selected candidates must resolve to `pwd` or subfolders, never parents or symlink escapes. Pre-existing dirty work outside `pwd` is allowed by default and left alone; set `PI_AUTO_FOLDER_REFACTOR_BLOCK_OUTSIDE_DIRTY=1` for strict legacy blocking. Automatic loops must refactor around behavior/responsibility with tests and clear module boundaries, not shallow file moves or vague `utils`/`common` buckets. Shared-code reuse and contract extraction are valuable only when they make the next change easier, safer, and more obvious without changing current behavior, and only after identical behavior is proven across concrete call sites. When refactor candidates are exhausted or below `PI_AUTO_FOLDER_REFACTOR_BUGFIND_THRESHOLD`, it transitions to visibility-driven bug finding through small refactors, invariants, replay tests, and contract extraction.

The scanner honors `.refactorignore` in the current working directory and scan root. Use one pattern per line, with `#` comments, optional trailing `/` for directories, `*`/`**` globs, and `!` negation for later rules. It also reports `Suggested .refactorignore entries` for artifact/generated/vendor-looking folders and omits those from refactor candidates. Smart suggestions use confidence-scored evidence: generated-code headers, lock/generated marker files, artifact-heavy extensions, vendor/opensource path patterns, artifact folder names, low-churn unreferenced huge trees, and parent-folder compaction. Source roots such as `lib/`, `src/`, `internal/`, `domain/`, and weak architecture names like `external/` are protected unless stronger artifact/generated evidence exists. Scanner content reads are budgeted by `PI_CANDIDATES_FOLDER_REFACTOR_MAX_CONTENT_FILE_BYTES` and `PI_CANDIDATES_FOLDER_REFACTOR_MAX_TOTAL_CONTENT_BYTES`; files beyond those budgets still count structurally but skip import/symbol content analysis.

3. On reruns, read `[folder]/.pi/candidates-folder-refactor/latest.json` first to reuse prior candidates, ignored false positives, and the likely next `/folder-refactor` target before deciding whether a fresh scan is needed.
4. Read the top results, then inspect each candidate enough to confirm whether the noise is real or just generated/vendor/test-fixture bulk.

## Workflow

1. **Choose scan root**
   - No folder named: scan the current repo and rank folders/subfolders below it.
   - Folder named: scan that folder and its subfolders. If the folder is not the repository root and has significant root-file debt, it may be ranked as the candidate itself (`.` from inside that folder, or the folder path from its parent).
2. **Score candidates**
   - Prefer folders with many files, many direct children, mixed extensions, mixed responsibility signals, and nested subfolders.
   - Add evidence columns for recent `git log` churn, import fan-in/fan-out, test presence, responsibility role signals, and duplicate file/symbol names.
   - Ignore generated/vendor/cache/build folders (`node_modules`, `.git`, `dist`, `build`, `coverage`, `.pi`, `.understand-anything`, etc.).
   - Treat scores as triage signals, not proof of bad architecture.
3. **Confirm top five**
   - Inspect names/tree/imports/tests around each result.
   - Drop false positives caused by generated code, vendored code, snapshots, fixtures, or a deliberately cohesive language/package boundary.
   - For each surviving candidate, include raw scanner metrics inline (`files/churn/callers/imports/tests/roles/duplicates`) before the judgment so evidence is easy to compare.
   - Explain why `/folder-refactor <candidate>` should be the next guarded command and what boundary to give it.
4. **Use the target log for cheap reruns**
   - Each fresh scanner run writes `[target]/.pi/candidates-folder-refactor/latest.json` and appends `runs.jsonl`.
   - Start reruns with `--from-log` or by reading `latest.json`; then focus inspection on prior top candidates, newly changed folders, and the previous `Next step` instead of rescanning every broad subtree by default.
   - Treat the log as local agent memory: useful for continuity, never source of truth over live files.
5. **Hand off**
   - If the owner picks a candidate, run `/folder-refactor <candidate>` so the extension starts `skill-folder-refactor` with scan/audit/state guardrails.
   - If the owner says `lgtm` after the candidate report, treat it as approving candidate #1 and immediately run `/folder-refactor <candidate #1>` with the candidate metrics and suggested boundary as context.

## Red lines

- Do not edit production files while scouting candidates.
- Do not recommend repo-root refactors; recommend a bounded folder instead. A non-repo-root scan target may be recommended when its root files are the actual debt.
- Do not rank generated, vendor, cache, build-output, dependency folders, or `.pi/candidates-folder-refactor/` logs as actionable targets.
- Do not present the numeric score as objective truth; include human-readable evidence such as churn, callers, tests, roles, and duplicates.

## Output contract

```text
Candidates folder refactor: <repo-or-folder>
Top candidates:
1. <path> — metrics: files <n>, churn <n>, callers <n>, imports-out <n>, tests <n>, roles <n>, duplicates <n>. <why noisy; suggested /folder-refactor boundary>
2. ...
Validation/scout evidence:
- scanner: <command>
- log: <target>/.pi/candidates-folder-refactor/latest.json
- inspected: <paths or searches>
Next step: say `lgtm` to run `/folder-refactor <best path>` immediately, or name another candidate.
```

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
