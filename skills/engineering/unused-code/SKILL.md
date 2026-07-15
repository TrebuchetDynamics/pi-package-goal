---
name: unused-code
description: Remove proven unreachable code in small validated batches. Use when asked to find and delete dead, stale, orphaned, or unused code; not for dependency pruning, over-engineering reports, or speculative cleanup.
---

# Unused Code

Find code with no live path, prove it is unused, then delete the smallest safe batch. Age, low coverage, and unfamiliarity are leads, not proof.

## Quick start

1. Set one repository or folder scope. Inspect `git status --short --branch`, repo instructions, manifests, entrypoints, package exports, build config, and existing validation.
2. Read `codebase-map-understand.md` when present for candidate relationships, then verify every lead against live source.
3. Run the narrowest meaningful baseline test, build, typecheck, or lint command before deleting anything.
4. Rank candidates by confidence and delete leaf code first: private symbol → private file → export/config/docs made obsolete by that deletion.
5. Validate after each small batch and inspect the final diff for accidental removals.

## Proof gate

Before deleting a candidate, check all applicable liveness paths:

- direct imports, callers, references, re-exports, package exports, and entrypoints;
- string/config/template references, routes, CLI commands, jobs, serializers, reflection, dependency injection, plugin registries, and runtime discovery;
- generated-code ownership, migrations, schemas, fixtures, examples, docs, and tests;
- public or cross-package consumers that may exist outside the checkout;
- source history when it clarifies a replacement or compatibility promise.

Deletion requires a known ownership boundary, no plausible live path, and at least one executable post-delete signal. Prefer compiler/linter evidence plus independent reference tracing. Coverage and text search alone never prove dead code.

## Workflow

1. Record each candidate as `path:symbol`, replacement if any, liveness checks, boundary risk, and validation command.
2. Keep uncertain public APIs, extension hooks, reflective code, migrations, security checks, and compatibility shims. Report the blocker instead of guessing.
3. Delete one coherent leaf batch. Remove newly orphaned imports, exports, tests, docs, and config only when their sole purpose was the deleted code.
4. Run the candidate-specific check, then the relevant broader suite. If it fails, restore only this skill's batch and reclassify the candidate.
5. Search again for stale references and inspect `git diff --check` plus the changed-file list.
6. Continue only while the next candidate passes the same proof gate. No evidence-backed candidate means delete nothing.

## Skill contract

### Entry protocol

- Named symbol/folder: proceed within that boundary.
- Broad request: choose the highest-confidence private leaf candidate; do not turn it into an architecture rewrite.
- Unknown external consumers, runtime registration, data retention, compliance, or production ownership: stop before deletion and ask one owner-decision question.

### Topology check

- Where can the candidate be reached statically or dynamically?
- Is it private, package-public, or externally public?
- What replaced it, if anything?
- Which command fails if deletion breaks a live path?
- Does the worktree already contain owner changes in the same files?

### Verification gate

Done requires baseline and post-delete command receipts, no stale references, a reviewed diff, and explicit disclosure of retained uncertain candidates. A passing test suite does not replace the liveness proof gate.

### Red lines

- Do not delete from age, naming, coverage, a single search, or an unused warning alone.
- Do not remove public APIs, migrations, schemas, plugin hooks, reflective registrations, or security/compliance paths without proving the ownership boundary or receiving approval.
- Do not add tooling or dependencies just to search for dead code.
- Do not overwrite unrelated dirty worktree changes or use destructive git cleanup.
- Do not mix behavior changes, dependency upgrades, or broad refactors into the deletion batch.

### Output contract

```text
Unused-code cleanup:
- scope:
- deleted: <path:symbol + proof>
- retained: <candidate + blocker>
- validation: <baseline and post-delete receipts>
- net: <-files/-lines when available>
```

## Example

User: “Remove the old v1 parser now that v2 is live.”
Agent: trace imports, exports, config strings, and runtime registration; baseline parser tests/build; delete only the private v1 leaf with no live path; rerun validation; retain any public v1 shim whose external consumers are unknown.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
