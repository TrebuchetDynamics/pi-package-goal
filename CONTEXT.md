# pi-package-goal Context

This context defines the product language for the Pi package that ships reusable goal-running extensions and bundled skills. Use these terms when naming modules, prompts, docs, logs, and tests.

## Language

**Development Goal**:
A Pi workflow that keeps working on a project objective until the objective is done, blocked, or deliberately stopped. A Development Goal owns its command surface, persisted state, logs, prompts, status UI, and final markers.
_Avoid_: Development loop, dev loop, iteration loop

**Goal Run**:
One active execution of a Development Goal in a project workspace. A Goal Run has one objective, one run id, one persisted state record, and many turns until a terminal decision.
_Avoid_: Loop run, iteration batch

**Goal Family**:
The set of Pi workflows whose commands follow the `*-goal` pattern and share lifecycle concepts while specializing their purpose. Development Goal, E2E Goal, Context Goal, Architecture Goal, View Goal, Debug Goal, and Research Goal are members of the Goal Family.
_Avoid_: Unrelated loop extensions, one-off command clones

**Goal Identity**:
The shared naming contract for one Goal Family member: command names, persisted paths, status keys, log locations, final marker names, user-facing wording, migration policy, and legacy alias decisions. Goal Identity should expose constants plus derived helpers for paths and keys, so callers do not rebuild those facts themselves. Final markers are rendered per Goal Identity while shared parser behaviour stays behind the same module interface. The Goal Identity seam lives under `extensions/goal-core/identity.ts` to make room for shared Goal Family modules, while each Goal Family member keeps its values in a per-goal identity module such as `extensions/development-goal/identity.ts` or `extensions/e2e-goal/identity.ts`. Private goal implementation modules live under goal-named folders such as `extensions/development-goal/` and `extensions/e2e-goal/`; package resource entrypoints stay at `extensions/development-goal.ts` and `extensions/e2e-goal.ts`. Keep the Goal Identity interface small: `slug`, `label`, `command`, `stateType`, `statusKey`, `configFile`, `logDir`, `markers`, and `migrationPolicy`. Marker names are derived from the slug by default, with explicit overrides only for exceptions. Goal Identity does not own prompt prose; prompt modules render copy using Goal Identity values.
_Avoid_: Scattered rename constants, branding strings, command aliases, one-off marker parsers, package-level metadata, prompt copy inside identity

**Package Identity**:
The shared naming contract for the Pi package itself: npm package name, repository URL, homepage, issue URL, package description, package keywords, and bundled extension list. Package Identity is separate from Goal Identity because one package can ship many Goal Family members.
_Avoid_: Per-goal package metadata, duplicating repository URLs inside goal identities

**Goal Identity Schema**:
The runtime validation rule for a Goal Identity. Goal Identity Schema complements TypeScript types by detecting malformed identity objects when Goal Family members are registered or tested. Tests should throw on invalid Goal Identity values; production extension registration should warn and skip the invalid Goal Family member.
_Avoid_: Type-only identity checks, unchecked plain objects

**Development Goal Identity**:
The Goal Identity for Development Goal.
_Avoid_: Development loop identity, dev-loop branding

**Development Goal Skill Stack**:
The curated set of skills a Development Goal stitches into a Goal Run: `caveman`, `goal`, `grill-me`, `grill-with-docs`, `improve-codebase-architecture`, `diagnose`, `tdd`, `write-a-skill`, plus repo-local matching skills when relevant. The order matters: terse mode first, objective discipline second, plan grilling before architecture and diagnosis, implementation verification after. The Skill Stack is the primary product shape: a goal runner that preserves objective discipline, prompts, diagnoses, plans, documents, creates skills, and verifies work using these skills.
_Avoid_: Hidden agent personality, unlisted prompt tricks, one-off skill mentions

**Development Goal Defaults**:
The single built-in configuration baseline for Development Goal runs: the `generic-git` name, default objective, Development Goal Skill Stack, preflight commands, validation commands, and stop conditions. Development Goal Defaults are implementation facts, not an Adapter seam; introduce a new seam only after a second concrete runtime variation exists.
_Avoid_: Adapter registry, built-in adapter list, hypothetical adapter seam

**Goal Log Analysis**:
A Development Goal module that reads one or more goal `logs.jsonl` files and turns raw Goal Run events into health counters, top blockers, evidence summaries, and recommendations. Goal Log Analysis owns log discovery, parsing accumulation, health report formatting, JSON output, and optional HTML report generation behind one interface so command handling does not know every counter or event-specific rule.
_Avoid_: Inline analyze-logs helpers, scattered log dashboard counters, command-owned health report formatting

**Context Goal**:
A Pi extension that audits project understanding artifacts, works when both CONTEXT.md and MEMORY.md are absent, proposes baseline fresh-project file creation, and applies only explicitly approved context/memory patches. A Context Goal keeps project vocabulary useful without turning MEMORY.md into a junk drawer, so it does not create MEMORY.md just because CONTEXT.md already exists.
_Avoid_: Silent memory writes, unreviewed context edits, dumping session notes into MEMORY.md, unstructured memory junk drawers

**Final Report Gate**:
A Development Goal module that evaluates a parsed final report before Goal Run state transitions. The Final Report Gate decides whether to accept, request one repair-only report retry, or block malformed final reports.
_Avoid_: Inline final-report checks, scattered malformed-report branches, accepting low-quality terminal markers

**Git Commit Push**:
A Pi extension command that gates git delivery after implementation work appears complete. Git Commit Push inspects git state, infers or accepts validation commands, runs validation, flags risky files, and when ready queues an agent handoff to commit and push safe in-scope changes. Git Commit Push replaces `/development-goal git-commit-push` while still forbidding deploy or publish side effects unless explicitly requested separately.
_Avoid_: Hidden commit/push without a ready audit, deploy/publish side effects, replacing project validation with assistant prose

**Understand Extension**:
A Pi extension command that installs, updates, links, and invokes Lum1104/Understand-Anything from a local checkout. Understand Extension owns the thin installer/runner seam; the third-party Understand-Anything skills and graph-generation workflow stay in the upstream checkout.
_Avoid_: Vendoring upstream Understand-Anything code into this package, duplicating its graph pipeline, running external installers at Pi startup

**Migration Policy**:
The explicit rule for how a Development Goal handles old public names, old persisted paths, old status keys, and old final markers after an identity change. The current Development Goal Migration Policy is a hard break: old names, paths, markers, and aliases are removed rather than redirected.
_Avoid_: Ad hoc backwards compatibility, silent fallback, scattered aliases

**E2E Goal**:
A Pi workflow that exercises real usage paths for UI, API, TUI, mobile, or mixed apps. An E2E Goal is a separate goal type but should share lifecycle behaviour with a Development Goal when the concepts match.
_Avoid_: E2E loop, smoke loop

## Example dialogue

Dev: "The Development Goal command changed, but status still writes the old key."

Domain expert: "That is a Goal Identity leak. The command name and status key belong to the same identity contract."

Dev: "Should the E2E Goal use the same identity contract?"

Domain expert: "It should use the same Goal Identity module shape, but its own identity values: command, state path, logs, and final markers name E2E usage testing."
