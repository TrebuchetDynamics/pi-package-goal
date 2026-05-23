# AGENTS.md — pi-package-development-goal

This repository packages a global Pi development-goal extension plus selected third-party skills.

## Rules

- Keep package resources under `extensions/`, `skills/`, `prompts/`, or `themes/`.
- Preserve third-party notices and license copies when updating bundled skills.
- Run `npm test` before committing.
- Do not add runtime dependencies unless they are declared in `dependencies`.
- Pi core imports belong in `peerDependencies` with `"*"`.
