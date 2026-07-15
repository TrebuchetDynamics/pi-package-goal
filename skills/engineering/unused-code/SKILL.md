---
name: unused-code
description: Remove proven unreachable code in small validated batches. Use when asked to find and delete dead, stale, orphaned, or unused code; not for dependency pruning, over-engineering reports, or speculative cleanup.
---

# Unused Code

Find code with no live path, prove it is unused, then delete the smallest safe batch. Age, low coverage, and unfamiliarity are leads, not proof.

## Quick start

1. Set one repository or folder scope. Inspect `git status --short --branch`, repo instructions, manifests, entrypoints, package exports, build config, and existing validation.
2. Use `codebase-map-understand.md` and `.understand-anything/knowledge-graph.json` when present to rank candidates, then verify every lead against live source.
3. Run the narrowest meaningful baseline test, build, typecheck, or lint command before deleting anything.
4. Rank candidates by confidence and delete leaf code first: private symbol → private file → export/config/docs made obsolete by that deletion.
5. Validate after each small batch and inspect the final diff for accidental removals.

## Understand graph pass

When `.understand-anything/knowledge-graph.json` exists, use it as a bounded candidate index before broad text search:

1. Compare `project.gitCommitHash` with `git rev-parse HEAD` and check candidate files in `git status --short`. A mismatch or uncommitted candidate means the graph is stale orientation only.
2. Inspect the graph's actual edge types before scoring degree. Rank file nodes with no inbound reachability edge that the graph really models, such as `imports`, `calls`, or `depends_on`; use layers and tour membership only as secondary context.
3. Do not infer function-level deadness when the graph has no function-call edges. `contains` and `exports` describe structure/exposure, not runtime reachability.
4. Treat dashboard or validator “orphans” as leads, never deletion proof. Support files, evidence artifacts, runtime-loaded code, and external APIs can be intentionally disconnected.
5. For each lead, trace the live source with language-aware references plus string/config/runtime checks from the proof gate. If the graph conflicts with source, source wins.

Use stdlib Python to query the JSON when needed; add no graph-parsing dependency. Generated graph/map files stay local and uncommitted by default. A tokenized dashboard URL is for local navigation only—do not copy its token into reports.

If no graph exists, continue with the normal proof gate. Do not generate one unless the user requested it or approved graph generation for a broad scan.

## Proof gate

Before deleting a candidate, check all applicable liveness paths:

- direct imports, callers, references, re-exports, package exports, and entrypoints;
- string/config/template references, routes, CLI commands, jobs, serializers, reflection, dependency injection, plugin registries, and runtime discovery;
- generated-code ownership, migrations, schemas, fixtures, examples, docs, and tests;
- public or cross-package consumers that may exist outside the checkout;
- source history when it clarifies a replacement or compatibility promise.

Deletion requires a known ownership boundary, no plausible live path, and at least one executable post-delete signal. Prefer compiler/linter evidence plus independent reference tracing. Graph degree, orphan status, coverage, and text search alone never prove dead code.

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
- graph: <path + commit/freshness + edge types used, or not used>
- deleted: <path:symbol + proof>
- retained: <candidate + blocker>
- validation: <baseline and post-delete receipts>
- net: <-files/-lines when available>
```

## Example

User: “Use the fresh Understand graph to remove unused Rust code.”
Agent: confirm the graph commit and edge types; treat reported orphans as leads only; select one private leaf and verify it with Rust references/config search plus a baseline build; delete it, rerun validation, and leave the generated graph uncommitted.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
