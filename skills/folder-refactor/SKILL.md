---
name: folder-refactor
description: Refactor one folder into subfolders and shared code. Use for folder refactors, directory splits, module organization, or dedupe.
---

# Folder Refactor

Refactor one explicitly named folder into coherent subfolders and shared modules without changing behavior.

## Quick start

1. Identify the target folder and scope boundary. If no folder is named, ask for it; if the target is repo root, treat it as high risk and recommend narrowing to one folder.
2. Inspect `git status --short --branch`, repo instructions, existing maps (`codebase-map-understand.md` when present), folder tree, imports/exports, callers, related tests, package manifests, and language module boundaries.
3. If no target is named and the user wants discovery, run `candidates-folder-refactor` first and use its top-five evidence to pick one bounded folder.
4. Propose the smallest safe folder topology, then implement in explicit move-only, extraction, and cleanup phases.
5. Treat the refactor as an active objective: keep taking bounded slices until the named folder reaches the planned topology, validation fails, ownership/risk is unclear, or context budget requires a handoff.
6. Keep the repo GREEN: existing relevant tests must pass after each slice; if no adequate behavior tests exist for the moved code, create focused public-interface tests before deeper extraction/cleanup.
7. Do not call a partial slice "complete". Completion means the whole named folder matches the planned topology, not merely that the latest batch of files moved successfully.
8. Make shared code a first-class outcome after move-only safety: actively look for duplicated helpers/types/test setup in the new subfolders and extract proven shared modules when tests protect the behavior.

## Workflow

1. **Map the folder**
   - List current files, public entrypoints, internal-only modules, tests, fixtures, generated files, and external callers.
   - Find duplicated logic, types, constants, validation, adapters, and utility seams before creating new code.
   - Name the current behavior contract: imports that must keep working, package boundaries, exported symbols, CLI/API routes, snapshots, and observable outputs.
   - Identify related validation before editing. If coverage is missing or too implementation-coupled for the behavior being preserved, use `tdd` discipline: add one focused behavior test through a public interface, watch it pass on the current code when possible, then refactor against it.
   - For Go, inspect `go.mod`, package names, exported identifiers, import paths, and candidate validation such as `go test ./...`, targeted `go test ./path/...`, `go list ./...`, or `go vet ./...`.
2. **Choose subfolders by responsibility**
   - Match existing project layout and naming before inventing new topology.
   - Prefer domain/responsibility folders over vague buckets like `utils/` or `common/`.
   - Create shared modules only after at least two concrete call sites need the same behavior; keep duplication when behavior only looks similar.
   - Keep public exports stable with barrel/compatibility files when callers outside the folder depend on current paths.
3. **Refactor safely**
   - Phase 1 is move-only: move files, update imports/exports, and preserve behavior. Do not rename symbols, extract code, delete compatibility shims, or clean up logic in this phase.
   - Run the narrowest meaningful validation after Phase 1 before any extraction. If move-only validation fails, fix import/path breakage before continuing.
   - If no meaningful validation exists, create or extend behavior tests at the nearest public seam before continuing beyond move-only work.
   - Phase 2: scan the moved subfolders for duplicate helpers, fixtures, constants, setup, adapters, validation, and value-object logic; extract shared code only from proven duplicate call sites; run validation again.
   - Prefer local shared modules inside the target folder (for example `shared/`, `internal/`, `testutil/`, or language-idiomatic equivalents) over dumping unrelated code into global utilities.
   - Phase 3: clean up compatibility shims, dead code, and names only when callers and tests prove it is safe.
   - Preserve behavior before cleanup; do not combine moves, rewrites, and semantic changes in one opaque patch.
   - Delete duplicate code only after tests or direct diff evidence prove the shared implementation covers it.
4. **Continue autonomously**
   - Do not stop after moving one or two files if the target topology still has obvious remaining slices and validation is green.
   - After each validated slice, re-list the target folder, compare remaining root files/subfolders against the planned topology, update the objective, and pick the next safest slice in the same turn.
   - Prefer finishing all move-only slices for the named folder before attempting extraction or cleanup slices.
   - If many files still sit in the old/root location and their destination is obvious from the topology, continue moving the next batch instead of reporting success.
   - Stop automatic continuation only for failed validation, unclear ownership, public API/product behavior risk, generated-file risk, excessive diff size, context/budget pressure, or when the whole folder matches the planned topology.
   - If forced to stop before completion, leave a concrete continuation plan naming the next files/subfolder to move and the validation command to rerun.
5. **Check diff budget before broadening**
   - Pause for owner review if the patch unexpectedly changes public import paths, package exports, generated snapshots, migrations, data formats, or more than the target folder plus import-fix callers.
   - If the diff becomes mostly rewrites instead of moves/import updates, stop and split the work.
6. **Verify and report**
   - Run related tests/typechecks or explain the closest available validation.
   - Report old → new topology, reused/shared modules, public compatibility kept or intentionally changed, and remaining risks.

## Skill contract

### Entry protocol
- Trivial: for a tiny folder with obvious moves and existing tests, proceed directly.
- Medium ambiguity: propose the target topology and ask only the missing hard question.
- High ambiguity/risk: stop if the target is repo root, ownership, public API stability, generated files, migrations, or production behavior are unclear.

### Topology check
- Is there exactly one target folder and a clear boundary for out-of-scope files?
- Which imports are public contracts versus internal implementation details?
- Which code is duplicated enough to share, and which similarity should stay separate?
- Are tests, snapshots, build config, package exports, language package/module boundaries, and path aliases affected?

### Test gate
Before changing behavior-adjacent structure, prove at least one of:
- relevant existing tests pass and cover the public behavior being preserved;
- a new focused behavior test was added using `tdd` discipline and passes before/after the refactor;
- no correct test seam exists, in which case stop deeper cleanup/extraction and report the seam gap instead of pretending validation is adequate.

### Shared-code gate
Before declaring the refactor complete, perform a shared-code pass across the new subfolders and tests. Report either the shared modules extracted or why duplication intentionally remains.

Extract shared code when:
- at least two concrete call sites need the same behavior;
- the behavior is identical, not just similarly shaped;
- the shared location has a clear responsibility inside the target folder;
- behavior tests or direct public-interface checks cover both callers;
- deletion of the duplicate happens only after the shared implementation validates.

Keep duplication when semantics differ, tests are missing, the shared name would be vague (`utils`, `common` without a specific responsibility), or extraction would broaden public API.

### Extraction gate
Before creating shared code, prove the shared-code gate is satisfied; otherwise document why extraction is intentionally skipped.

### Continuation gate
A folder-refactor is not done merely because one safe slice passed. Before stopping, check whether the planned topology still has obvious remaining files, import updates, duplicate modules, shared-code opportunities, or cleanup slices. Continue automatically while validation is green and no red line is hit.

### Completion audit
Before saying the topology is complete, re-read the target folder tree from disk and list remaining root files. For every remaining file, classify it as:
- intentional root public facade/compatibility file;
- intentionally out of scope for the chosen topology;
- next move/extraction candidate.

If any next move/extraction candidates remain and validation is green, continue instead of ending. Never write "complete for this slice" as the final state; report either "complete for target folder" or "incomplete, continuing/blocked".

### Verification gate
Before done, related tests must pass. If no related tests existed, include the new behavior test(s) created or a blocker explaining why no correct public seam exists. Typecheck/build, import graph/search checks, and generated snapshot updates are supporting evidence, not substitutes for available behavior tests.

Suggested validation by ecosystem:
- JS/TS: package test script, typecheck/build script when present, and `rg` for stale old import paths.
- Go: `go test ./...`, targeted `go test ./path/...`, `go list ./...`, and package/export checks.
- Python: targeted tests, import smoke checks, and `rg` for stale module paths.

### Red lines
- Do not broaden beyond the named folder without explicit approval; repo-root refactors require explicit owner acceptance of blast radius.
- Do not change behavior, public import paths, package/module boundaries, package exports, migrations, data formats, or generated artifacts silently.
- Do not create speculative shared abstractions with only one call site; prefer boring duplication over premature sharing.
- Do not overwrite unrelated dirty worktree changes.

### Output contract
Final response must include:
- target folder;
- planned topology and whether it is complete for the target folder, not just the latest slice;
- files/subfolders moved or created;
- shared-code opportunities found, extractions performed, and duplication intentionally left;
- compatibility notes for callers/imports;
- validation evidence, including related tests passed or new behavior tests created;
- remaining root files classified as facade/out-of-scope/next candidate;
- if incomplete, the exact next autonomous slice and what `lgtm` will continue.

## Shared contract

Follow [the shared skill contract](../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
