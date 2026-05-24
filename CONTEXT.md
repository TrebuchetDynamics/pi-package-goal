# pi-package-goal Context

This package now ships Pi skills only. It does not register Pi extensions.

## Language

**Package Identity**:
The npm/Pi package metadata: package name, repository URL, homepage, issue URL, package description, package keywords, packaged files, and `pi.skills` manifest. Package Identity must not reintroduce `pi.extensions` unless the product explicitly changes back to extension delivery.
_Avoid_: stale extension manifests, deleted command entrypoints, docs that promise slash-command extensions

**Skill Bundle**:
The curated set of bundled skills under `skills/`. Skills are the package's primary product surface and load on demand through Pi's skill discovery.
_Avoid_: hidden extension behavior, startup code, unlisted resource paths

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
