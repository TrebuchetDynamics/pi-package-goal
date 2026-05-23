# pi-package-development-goal Context

This context defines the product language for the Pi package that ships reusable goal-running extensions and bundled skills. Use these terms when naming modules, prompts, docs, logs, and tests.

## Language

**Development Goal**:
A Pi workflow that keeps working on a project objective until the objective is done, blocked, or deliberately stopped. A Development Goal owns its command surface, persisted state, logs, prompts, status UI, and final markers.
_Avoid_: Development loop, dev loop, iteration loop

**Goal Run**:
One active execution of a Development Goal in a project workspace. A Goal Run has one objective, one run id, one persisted state record, and many turns until a terminal decision.
_Avoid_: Loop run, iteration batch

**Development Goal Identity**:
The shared naming contract for a Development Goal: command names, package names, persisted paths, status keys, log locations, final marker names, user-facing wording, migration policy, and legacy alias decisions. Development Goal Identity should expose constants plus derived helpers for paths and keys, so callers do not rebuild those facts themselves.
_Avoid_: Scattered rename constants, branding strings, command aliases

**Migration Policy**:
The explicit rule for how a Development Goal handles old public names, old persisted paths, old status keys, and old final markers after an identity change. The current Development Goal Migration Policy is a hard break: old names, paths, markers, and aliases are removed rather than redirected.
_Avoid_: Ad hoc backwards compatibility, silent fallback, scattered aliases

**E2E Goal**:
A Pi workflow that exercises real usage paths for UI, API, TUI, mobile, or mixed apps. An E2E Goal is a separate goal type but should share lifecycle behaviour with a Development Goal when the concepts match.
_Avoid_: E2E loop, smoke loop

## Example dialogue

Dev: "The Development Goal command changed, but status still writes the old key."

Domain expert: "That is a Development Goal Identity leak. The command name and status key belong to the same identity contract."

Dev: "Should the E2E Goal use the same identity contract?"

Domain expert: "It should use the same lifecycle concepts where they match, but its E2E Goal identity stays separate: its command, state path, logs, and final markers name E2E usage testing."
