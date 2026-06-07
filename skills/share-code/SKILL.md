---
name: share-code
description: Refactor a folder to share proven duplicate code and expose bugs. Use when asked to reuse code, dedupe, or find bugs via refactor.
---

# Share Code

Refactor one bounded folder to discover real shared-code opportunities and bug-revealing seams without changing intended behavior.

## Quick start

1. Identify the target folder. If none is named, pick smartly instead of asking by running `candidates-folder-refactor` (or reading its latest log) and selecting the highest-signal bounded candidate with duplicate/reuse evidence, tests/callers, and non-generated source files; do not start at repo root.
2. Inspect `git status --short --branch`, repo instructions, existing maps (`codebase-map-understand.md` when present), folder tree, imports/callers, related tests, and package/module boundaries.
3. Baseline behavior before edits: run the narrowest relevant tests, or add a focused public-interface test with `tdd` discipline before deeper extraction.
4. Use `skill-folder-refactor` mechanics for safe move-only slices, then run a reuse-and-bug pass over the new seams.

## Workflow

1. **Map reuse candidates**
   - Find duplicate helpers, validation, parsing, formatting, constants, adapters, fixtures, test setup, error handling, and type/value-object logic.
   - Require at least two concrete call sites with identical behavior before sharing code.
   - Keep duplication when behavior merely looks similar, tests are absent, or the shared name would be vague.
2. **Refactor to make seams visible**
   - First make move-only, responsibility-based folder changes using `skill-folder-refactor` rules.
   - Prefer local shared modules inside the target folder (`shared/`, `internal/`, `testutil/`, or project idioms) over global utilities.
   - Preserve public import paths with facades/compatibility files unless the owner approves a breaking change.
3. **Use refactor pressure to find bugs**
   - While extracting, look for inconsistent edge-case handling, divergent validation rules, impossible states, stale callers, dead branches, copy/paste mistakes, and tests that assert implementation instead of behavior.
   - When a suspected bug appears, stop widening the refactor, write or update a focused failing test when practical, then fix the bug in the smallest patch.
   - Separate behavior-preserving refactor commits/slices from intentional bug fixes in the report.
4. **Verify**
   - Run related tests/typechecks after move-only slices, after each shared extraction, and after each bug fix.
   - Search for stale old imports and duplicate implementations that should have been deleted.
   - If no meaningful validation seam exists, stop before broad cleanup and report the test seam gap.

## Skill contract

### Entry protocol
- Named target: proceed for a bounded folder with obvious duplicates and existing tests.
- No named target: do not ask the owner to choose. Run `candidates-folder-refactor` or inspect `[folder]/.pi/candidates-folder-refactor/latest.json`, select the best bounded folder, state the evidence briefly, and proceed.
- Medium ambiguity after scan: pick the safest high-signal candidate and name the suspected shared seams; ask only if multiple candidates imply different product ownership or risk.
- High ambiguity/risk: stop when the only target is repo root, public API breakage, generated files, migrations, or ownership are unclear.

### Topology check
- Is there exactly one folder boundary?
- Which callers/imports are public contracts?
- Which duplicate behaviors are proven identical?
- Which suspected bugs need tests before changing behavior?

### Verification gate
Before done, provide test/build/search evidence for behavior preservation, each shared extraction, and each bug fix. A bug claim needs a concrete assertion: failing-before/passing-after test, direct repro, or explicit code-path evidence.

### Red lines
- Do not create speculative shared abstractions from one call site.
- Do not hide behavior changes inside refactor-only slices.
- Do not broaden beyond the named folder plus necessary import-fix callers without approval.
- Do not overwrite unrelated dirty worktree changes.

### Output contract
Final response must include target folder, shared code extracted or intentionally left duplicated, bugs found/fixed or ruled out, compatibility notes, validation evidence, and any blocked next slice.

## Shared contract

Follow [the shared skill contract](../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
