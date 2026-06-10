---
name: improve-codebase-architecture
description: Compatibility shim for architecture improvement requests. Use technical-auditor architecture mode for refactoring opportunities, tighter seams, better testability, or AI-navigable code.
---

# Improve Codebase Architecture

This skill is now a compatibility entry point. Use `technical-auditor` in **Architecture mode** for architecture improvement, refactoring opportunities, tighter seams, better testability, or AI-navigable code. When the user invokes `technical-auditor` with no mode argument, use its default **Full mode** instead, which runs both broad audit and architecture-deepening review.

## Handoff

1. Inspect `git status --short --branch` and repo instructions before relying on worktree state.
2. If `codebase-map-understand.md` exists, consult the codebase map for architecture hotspots, module relationships, callers, tests, and cross-module seams; treat map facts as leads only.
3. Load `../technical-auditor/SKILL.md` and follow its Architecture mode, including the architecture-deepening references under `../technical-auditor/references/`.
4. Preserve the architecture vocabulary: module, interface, implementation, depth, seam, adapter, leverage, locality.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
