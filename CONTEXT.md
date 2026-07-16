# pi-package-goal Context

This package ships Pi skills plus `/understand`, folder-refactor, RTK bridge, Onklaud advisory, and OpenWiki extensions.

## Language

**Package Identity**:
The npm/Pi package metadata: package name, repository URL, homepage, issue URL, package description, package keywords, packaged files, `pi.skills`, and `pi.extensions` manifests.
_Avoid_: stale resource manifests, deleted command entrypoints, docs that omit packaged resources

**Understand Extension**:
The package-local extension at `extensions/understand/index.js` registers `/understand` and related aliases. It clones/updates `Lum1104/Understand-Anything` into the user checkout and dispatches to the upstream skill files instead of copying upstream code into this package.
_Avoid_: silent startup network work, shell-injected git commands, bundling upstream code without notices

**Understand Artifacts**:
Generated files from `/understand`, such as `.understand-anything/knowledge-graph.json`, `.understand-anything/meta.json`, `codebase-map-understand.md`, and `*-understand-compare.md`. They are local agent-orientation artifacts, not package product files.
_Avoid_: committing generated graph snapshots by default, treating stale maps as source of truth, packaging generated Understand output

**Understand Compare**:
A deterministic file-generation workflow that compares two existing Understand graphs for porting, rewrites, and pattern borrowing. It writes a Markdown compare map and does not auto-trigger follow-up LLM reasoning.
_Avoid_: hidden model calls, expensive automatic analysis after file generation, requiring compare to run `/understand` itself

**Understand Refactor**:
A deterministic file-generation workflow that reads the current repo's existing Understand graph, reads any previous output plan for continuity before overwriting it, verifies hotspot files against the live checkout, discovers related tests, writes and displays a refactor plan with bounded slices, then supports concrete follow-up commands: `/understand-refactor grill N`, `/understand-refactor ignore N`, and `/understand-refactor regenerate with focus <area>`.
_Avoid_: hidden model calls, treating graph heuristics as final architectural judgment, editing production code during plan generation, requiring refactor to run `/understand` itself, recommending graph-only hotspots without live-code confidence labels, ending with only a file path and no decision prompt, losing prior refactor decisions when regenerating the same output file, asking the user to manually compose the next skill prompt, silently running follow-up reasoning without an explicit candidate choice

**Skill Bundle**:
The curated set of bundled skills under `skills/`. Skills load on demand through Pi's skill discovery.
_Avoid_: hidden behavior not represented in docs or manifests, unlisted resource paths

**Skill Composition**:
Lightweight handoff guidance embedded inside high-traffic seam skills. It names when to switch to another skill and what evidence should cross that seam. `skill-router` chooses a single primary workflow for ambiguous tasks, `goal` orchestrates long-running objectives, and `autonomous-codebase-improver` is the bounded repo-improvement front door that chooses one validated slice and routes to one specialist.
_Avoid_: vague "use related skills" advice, handoffs without evidence, duplicating long protocol text in every skill, broad choreography layers that hide validation ownership

**Skill Lifecycle**:
The package-level discipline for skill changes: author or import a skill, preserve provenance, validate trigger quality and contract coverage, enable it through the package manifest, evaluate it against realistic use, and deprecate or split it when overlap appears.
_Avoid_: self-generated skills enabled without review, untracked source/license history, stale skills with no validation path, treating skill creation as a one-time prompt dump

**Skill Shadowing**:
A skill-library failure mode where two skill descriptions or trigger phrases are similar enough that the wrong skill may load or a broader skill hides a narrower one. Validation should catch obvious overlap before release; intentional overlap belongs in explicit orchestration or handoff language.
_Avoid_: duplicate trigger phrases, catch-all descriptions, adding broad UI/planning/refactor skills without boundaries, relying on agent intuition to choose between near-identical skills

**Prompt Cache Auditor Skill**:
The `prompt-cache-auditor` skill audits LLM agent harness prompt-caching paths by first classifying provider topology, stable versus volatile prompt prefixes, cache keys/markers, and verification counters, then applying one request-building fix at a time and requiring warm-turn cache-read evidence before claiming savings.
_Avoid_: live paid API calls without approval, credential-bearing captures in reports, current-user-turn cache breakpoints, random per-request `prompt_cache_key`, savings claims without provider usage counters

**Skill Folder Refactor Skill**:
The `skill-folder-refactor` skill keeps folder refactors bounded to one named directory, treats repo-root reshapes as high-risk owner decisions, first maps imports/callers/tests/package boundaries, then reorganizes by responsibility while extracting shared code only from proven duplicate call sites.
_Avoid_: broad repo-wide rewrites, speculative common abstractions, silent public import path breakage, mixing behavior changes with file moves, ignoring language module boundaries

**Share Code Skill**:
The `share-code` skill composes folder-refactor discipline with a stronger reuse-and-bug pass: it refactors one bounded folder to make duplicate behavior visible, extracts only proven shared code, prioritizes production/source duplication over test cleanup, and treats inconsistent edge cases found during extraction as evidence-backed bug fixes rather than hidden refactor changes.
_Avoid_: speculative utilities, one-call-site abstractions, test-first cleanup unless requested, hiding behavior changes inside refactors, broad repo-wide dedupe sweeps

**Folder Refactor Extension**:
The package-local extension at `extensions/folder-refactor/index.js` registers `/folder-refactor` plus deterministic `folder_refactor_scan`, `folder_refactor_audit`, and `folder_refactor_state` tools so agents must prove exact remaining root files are classified before reporting a refactor complete.
_Avoid_: relying on memory for completion audits, ending with unexecuted safe next candidates, hiding root files behind broad categories

**RTK Extension**:
The package-local extension at `extensions/rtk/index.js` integrates with external `rtk-ai/rtk`: it registers `/rtk status|install`, rewrites eligible Pi `bash` tool calls through `rtk rewrite` when a supported `rtk` binary is on PATH, and fails open when RTK is missing, disabled, too old, or cannot produce a rewrite.
_Avoid_: bundling the Rust binary, silently executing remote installers without a user command/confirmation, blocking commands for token optimization, rewriting non-bash Pi tools

**Onklaud Extension**:
The package-local extension at `extensions/onklaud/index.js` is a thin `/goal` launcher plus CLI helper: `/onklaud explain` describes the boundary, `/onklaud status` checks CLI health, `/onklaud install` explicitly installs the CLI into user-local paths after confirmation or `--yes`, and `/onklaud <task>` queues a goal prompt that uses Onklaud 5 as an advisory council while Pi keeps ownership of edits, validation, commits, and pushes.
_Avoid_: presenting Onklaud as a separate repo-mutating coding agent, installing implicitly, writing outside user-local install/bin paths by default, sending secrets or credential-bearing logs to external model councils, treating Onklaud advice as verified source truth, letting external CLIs mutate the repo directly

**Provider Bridge Pattern**:
A documented extension design pattern for registering external or CLI-backed model providers while keeping Pi responsible for tool execution. Provider bridges need explicit status commands, auth-source disclosure, smoke-test guidance, and owner approval for credential reuse or unofficial endpoints before bundling.
_Avoid_: bundling provider proxies by default, silently reading credential files, letting upstream CLIs edit files outside Pi's tools, treating prompt-bridged tool calls as native reliability

**Package Theme**:
A Pi TUI theme resource under `themes/` that provides a complete token map and optional top-level HTML export colors. Themes are package resources, not installer side effects.
_Avoid_: incomplete color tokens, putting `export` inside `colors`, copying palettes without attribution when source material is bundled

**Candidates Folder Refactor Skill**:
The `candidates-folder-refactor` skill scouts for noisy folders/subfolders and ranks bounded targets to hand to `/folder-refactor`, including support for scanning beneath a named folder and the `auto-folder-refactor N [folder]` loop for explicitly requested fully automatic top-candidate runs.
_Avoid_: treating heuristic scores as proof, recommending repo-root refactors, ranking generated/vendor/cache/build folders as actionable targets, running automatic loops without owner intent

**Candidate State**:
The eligibility lifecycle for an `auto-folder-refactor` candidate: `open` candidates can run now; `cooldown` candidates are retryable later after a soft failed attempt; `blocked` candidates need a real blocker resolved; `done` candidates are already clean; `exhausted` candidates have no currently useful child candidate.
_Avoid_: skip, skipped, permanently skipped, hidden candidate

**Shared Skill Contract**:
A compact baseline under `skills/shared/COMMON-CONTRACT.md` for repo hygiene, verification evidence, handoff shape, and safety defaults. Every `SKILL.md` references it so package-wide expectations stay discoverable without bloating each skill.
_Avoid_: hidden universal expectations, rigid forms that override specialist instructions, broad edits to unrelated user work

**Handoff Evidence**:
A small standard shape for skill-to-skill transfers: trigger, artifact, next skill, and success signal. It is guidance, not a rigid schema.
_Avoid_: freeform vague handoffs, heavyweight forms, claims without a concrete artifact or success signal

**Goal Skill**:
An in-conversation objective discipline skill that tracks active/paused/complete/blocked state in the conversation, auto-discovers a bounded objective when invoked with no active goal, and requires a completion audit before done.
_Avoid_: invented persistent state, hook installation, filesystem state writes, stopping at empty status when documented work is discoverable

**NACK Skill**:
A planning skill under `skills/planning/nack/` that treats short user pushback (`nack`, `not convinced`, `check again`) as a targeted re-check of the latest assistant claim or recommendation, reporting changed/stands/blocked from evidence before continuing.
_Avoid_: argumentative loops, treating pushback as approval, broad plan grilling, external code-review handling

**Goal Technical Auditor Extension**:
The package-local extension at `extensions/goal-technical-auditor/index.js` registers `/goal-technical-auditor` as a deterministic controller around `/goal` and `technical-auditor` Full mode. It persists phase/finding state in Pi session entries, commits a Markdown audit ledger, validates and commits one finding at a time on the current branch, stashes twice-failed slices, re-audits until no new safe actionable finding remains, and permits completion only after final validation and one successful push. Protected/default branches require confirmation.
_Avoid_: hidden workflow modes, parallel-agent orchestration, silently starting broad automation for invalid arguments, premature `goal_complete`, destructive rollback, force-push/history rewriting, or weakening the command's predictable Full-mode meaning

**Ketch Extension**:
The package-local extension at `extensions/ketch/index.js` exposes one `ketch` model tool plus a thin `/ketch <request>` command that queues the tool-backed research workflow. It infers web search, public code search, library docs, URL scrape, or bounded crawl from a request. It prefers `$KETCH_BIN` or `ketch` on `PATH`, then auto-installs the pinned Ketch v0.11.0 release into the user cache after SHA-256 verification; it never changes Ketch backend configuration automatically.
_Avoid_: multiple command wrappers, startup installation, unpinned downloads, unverified archives, global package-manager mutation, automatic API-key/config changes, unbounded output, or using external search for the local codebase

**Skill Router Skill**:
A front-door planning skill under `skills/planning/skill-router/` that selects exactly one primary skill for a user task and routes blank tasks to `autonomous-codebase-improver` so the agent can still work autonomously from repo evidence.
_Avoid_: becoming a second planning layer, stacking skills up front, using routing as approval for risky actions

**Autonomous Codebase Improver Skill**:
A bounded repo-improvement skill under `skills/engineering/autonomous-codebase-improver/` that applies the research-backed loop from `research/agentic-coding-skills/`: inspect repo evidence, pick one safe slice, route to exactly one specialist, validate, and defer shipping to `git-commit-push` when requested.
_Avoid_: multi-agent scaffolding by default, broad repo-wide rewrites, self-approved completion, stacking specialists without a real seam

**Bug Harvest Skill**:
A narrow engineering skill under `skills/engineering/bug-harvest/` that finds one evidence-backed bug candidate from failing validation, issues, TODOs tied to behavior, or reproducible logs, then hands the repro/fix loop to `diagnose` and regression coverage to `tdd` when needed.
_Avoid_: inventing bugs from code smells, scanning forever, broad architecture edits disguised as bug fixes

**Unused Code Skill**:
A deletion-focused engineering skill under `skills/engineering/unused-code/` that uses fresh Understand graph edges and orphan reports to rank leads, then proves private code has no static, dynamic, configured, or external live path in current source before removing it in small baseline-checked batches.
_Avoid_: treating graph degree, exported/contained nodes, validator orphans, stale graph data, age, coverage, text search, or one unused warning as deletion proof; copying tokenized dashboard URLs into reports; deleting public APIs, migrations, plugin hooks, reflective registrations, or unrelated dirty work without a known ownership boundary

**Wiki Docs Skill**:
A source-backed documentation skill under `skills/engineering/wiki-docs/` for README, architecture, onboarding, and Karpathy-style project wiki work. It maps existing docs to live code claims, uses `codebase-map-understand.md` only as an optional lead source, updates one bounded docs slice by default, and validates links/examples/tests where practical.
_Avoid_: blind full-wiki regeneration, treating generated maps as truth, uncited architecture claims, overwriting human docs tone without preserving intent

**Beautify GitHub README Skill**:
A third-party frontend skill under `skills/frontend/beautify-github-readme/` for evidence-based GitHub README visual redesigns, read-only README audits, and standalone GitHub-safe SVG assets. It keeps whole-README and SVG-only modes explicit and runs its bundled Python audit helper by package-relative path.
_Avoid_: routing general website UI or ordinary documentation maintenance here, inventing project claims, treating inspection as edit permission, or committing/pushing/publishing without explicit authorization

**Bug-Hunt Refactor Focus**:
An opt-in `/goal-technical-auditor --focus bug-hunt-refactor` objective emphasis for code reduction, proven shared-code extraction, and pre/during/post refactor bug hunts while preserving the command's technical-auditor Full-mode launch shape.
_Avoid_: making bug-hunt refactoring the default for every audit, speculative utilities, one-call-site abstractions, broad repo-wide dedupe sweeps

**Git Commit Push Skill**:
A delivery skill that audits git state, reviews changed files for safety, fixes obvious safe polish/validation issues in scope, runs validation, split-commits safe in-scope work by reviewable topic/hunk, handles safe fetch/fast-forward or explicitly requested remote integration, pushes, and reports `GIT_COMMIT_PUSH_*` markers.
_Avoid_: deploy/publish side effects, force-push/rebase/non-fast-forward merge without explicit approval, committing secrets or local state, product rewrites disguised as polish, success claims without validation and push evidence

**Validation Receipts**:
Concrete command outputs, test results, git state, commit hashes, and push results used to prove a skill's final claim.
_Avoid_: assistant prose in place of command evidence

**Third-Party Skill Notices**:
License and attribution records in `THIRD_PARTY_NOTICES.md` and `licenses/` for bundled upstream-derived skills.
_Avoid_: updating bundled skills without preserving license copies and source attribution

**Superpowers Skills**:
The upstream `obra/superpowers` skill set is bundled under `skills/superpowers/` with package-local trigger descriptions, provenance frontmatter, and shared-contract references so it coexists with local `tdd`, `diagnose`, `write-a-skill`, `autoreview`, and delivery skills.
_Avoid_: hidden upstream updates without notices, broad bootstrap behavior shadowing local skills, copying upstream harness assumptions without Pi boundaries

**Tmux Profile**:
Portable tmux helper assets under `tmux/`, including `tmux.conf`, `tx`, installer scripts, local style defaults, and status helper scripts. These are package helper assets rather than Pi package resources.
_Avoid_: docs/install drift, hard-coded helper paths that contradict installer overrides, machine-local style choices committed as shared defaults

**Tmux Status Profile**:
The low-bandwidth tmux status-bar interface assembled by `tmux/tmux.conf` from local style settings. The shared default is static and avoids periodic redraws, status-shell commands, resize overrides, and truecolor forcing for SSH/mobile compatibility; richer path/git status belongs in `~/.tmux/local.tmux`.
_Avoid_: scattering status path/color/git knowledge across config, installer, docs, and tests; overriding tmux resize defaults; adding mobile-specific resize hooks; making dynamic status the shared default
