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

## Workflow

1. **Map the folder**
   - List current files, public entrypoints, internal-only modules, tests, fixtures, generated files, and external callers.
   - Find duplicated logic, types, constants, validation, adapters, and utility seams before creating new code.
   - Name the current behavior contract: imports that must keep working, package boundaries, exported symbols, CLI/API routes, snapshots, and observable outputs.
   - For Go, inspect `go.mod`, package names, exported identifiers, import paths, and candidate validation such as `go test ./...`, targeted `go test ./path/...`, `go list ./...`, or `go vet ./...`.
2. **Choose subfolders by responsibility**
   - Match existing project layout and naming before inventing new topology.
   - Prefer domain/responsibility folders over vague buckets like `utils/` or `common/`.
   - Create shared modules only after at least two concrete call sites need the same behavior; keep duplication when behavior only looks similar.
   - Keep public exports stable with barrel/compatibility files when callers outside the folder depend on current paths.
3. **Refactor safely**
   - Phase 1 is move-only: move files, update imports/exports, and preserve behavior. Do not rename symbols, extract code, delete compatibility shims, or clean up logic in this phase.
   - Run the narrowest meaningful validation after Phase 1 before any extraction. If move-only validation fails, fix import/path breakage before continuing.
   - Phase 2: extract shared code only from proven duplicate call sites; run validation again.
   - Phase 3: clean up compatibility shims, dead code, and names only when callers and tests prove it is safe.
   - Preserve behavior before cleanup; do not combine moves, rewrites, and semantic changes in one opaque patch.
   - Delete duplicate code only after tests or direct diff evidence prove the shared implementation covers it.
4. **Check diff budget before broadening**
   - Pause for owner review if the patch unexpectedly changes public import paths, package exports, generated snapshots, migrations, data formats, or more than the target folder plus import-fix callers.
   - If the diff becomes mostly rewrites instead of moves/import updates, stop and split the work.
5. **Verify and report**
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

### Extraction gate
Before creating shared code, prove:
- at least two concrete call sites need the same behavior;
- the behavior is identical, not just similarly shaped;
- tests or direct checks cover both callers;
- deletion of the duplicate happens only after the shared implementation validates.

### Verification gate
Before done, provide evidence from at least one of: related tests, typecheck/build, import graph/search checks, generated snapshot updates, or a blocker explaining why validation cannot run.

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
- files/subfolders moved or created;
- code reuse/extractions performed;
- compatibility notes for callers/imports;
- validation evidence and any follow-up risks.

## Shared contract

Follow [the shared skill contract](../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
