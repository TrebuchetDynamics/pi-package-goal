# pi-package-goal Context

This package ships Pi skills plus a single `/understand` bridge extension.

## Language

**Package Identity**:
The npm/Pi package metadata: package name, repository URL, homepage, issue URL, package description, package keywords, packaged files, `pi.skills`, and `pi.extensions` manifests.
_Avoid_: stale resource manifests, deleted command entrypoints, docs that omit packaged resources

**Understand Extension**:
The package-local extension at `extensions/understand.js` registers `/understand` and related aliases. It clones/updates `Lum1104/Understand-Anything` into the user checkout and dispatches to the upstream skill files instead of copying upstream code into this package.
_Avoid_: silent startup network work, shell-injected git commands, bundling upstream code without notices

**Skill Bundle**:
The curated set of bundled skills under `skills/`. Skills load on demand through Pi's skill discovery.
_Avoid_: hidden behavior not represented in docs or manifests, unlisted resource paths

**Goal Skill**:
An in-conversation objective discipline skill that tracks active/paused/complete/blocked state in the conversation and requires a completion audit before done.
_Avoid_: invented persistent state, hook installation, filesystem state writes

**Git Commit Push Skill**:
A delivery skill that audits git state, reviews changed files for safety, runs validation, commits safe in-scope work, pushes to the current upstream, and reports `GIT_COMMIT_PUSH_*` markers.
_Avoid_: deploy/publish side effects, force-push/rebase/merge without explicit approval, committing secrets or local state, success claims without validation and push evidence

**Validation Receipts**:
Concrete command outputs, test results, git state, commit hashes, and push results used to prove a skill's final claim.
_Avoid_: assistant prose in place of command evidence

**Third-Party Skill Notices**:
License and attribution records in `THIRD_PARTY_NOTICES.md` and `licenses/` for bundled upstream-derived skills.
_Avoid_: updating bundled skills without preserving license copies and source attribution
