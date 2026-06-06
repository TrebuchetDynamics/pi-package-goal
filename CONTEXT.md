# pi-package-goal Context

This package ships Pi skills plus a single `/understand` bridge extension.

## Language

**Package Identity**:
The npm/Pi package metadata: package name, repository URL, homepage, issue URL, package description, package keywords, packaged files, `pi.skills`, and `pi.extensions` manifests.
_Avoid_: stale resource manifests, deleted command entrypoints, docs that omit packaged resources

**Understand Extension**:
The package-local extension at `extensions/understand.js` registers `/understand` and related aliases. It clones/updates `Lum1104/Understand-Anything` into the user checkout and dispatches to the upstream skill files instead of copying upstream code into this package.
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
Lightweight handoff guidance embedded inside high-traffic seam skills. It names when to switch to another skill and what evidence should cross that seam. `goal` is the only orchestrator for long-running objectives; there is no separate global choreography layer.
_Avoid_: vague "use related skills" advice, handoffs without evidence, duplicating long protocol text in every skill

**Prompt Cache Auditor Skill**:
The `prompt-cache-auditor` skill audits LLM agent harness prompt-caching paths by first classifying provider topology, stable versus volatile prompt prefixes, cache keys/markers, and verification counters, then applying one request-building fix at a time and requiring warm-turn cache-read evidence before claiming savings.
_Avoid_: live paid API calls without approval, credential-bearing captures in reports, current-user-turn cache breakpoints, random per-request `prompt_cache_key`, savings claims without provider usage counters

**Skill Folder Refactor Skill**:
The `skill-folder-refactor` skill keeps folder refactors bounded to one named directory, treats repo-root reshapes as high-risk owner decisions, first maps imports/callers/tests/package boundaries, then reorganizes by responsibility while extracting shared code only from proven duplicate call sites.
_Avoid_: broad repo-wide rewrites, speculative common abstractions, silent public import path breakage, mixing behavior changes with file moves, ignoring language module boundaries

**Folder Refactor Extension**:
The package-local extension at `extensions/folder-refactor.js` registers `/folder-refactor` plus deterministic `folder_refactor_scan`, `folder_refactor_audit`, and `folder_refactor_state` tools so agents must prove exact remaining root files are classified before reporting a refactor complete.
_Avoid_: relying on memory for completion audits, ending with unexecuted safe next candidates, hiding root files behind broad categories

**Goal Advisor Extension**:
The package-local extension at `extensions/goal-advisor.js` registers `/goal-advisor` and the `goal_advisor` tool. It is disabled until the user explicitly configures an advisor model and enables it, because every consultation is a separate model call with cost and latency.
_Avoid_: automatic paid advisor calls, advisor tools with filesystem access, hidden model delegation, branch-hostile global use counters

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

**Git Commit Push Skill**:
A delivery skill that audits git state, reviews changed files for safety, fixes obvious safe polish/validation issues in scope, runs validation, commits safe in-scope work, pushes to the current upstream, and reports `GIT_COMMIT_PUSH_*` markers.
_Avoid_: deploy/publish side effects, force-push/rebase/merge without explicit approval, committing secrets or local state, product rewrites disguised as polish, success claims without validation and push evidence

**Validation Receipts**:
Concrete command outputs, test results, git state, commit hashes, and push results used to prove a skill's final claim.
_Avoid_: assistant prose in place of command evidence

**Third-Party Skill Notices**:
License and attribution records in `THIRD_PARTY_NOTICES.md` and `licenses/` for bundled upstream-derived skills.
_Avoid_: updating bundled skills without preserving license copies and source attribution

**Tmux Profile**:
Portable tmux helper assets under `tmux/`, including `tmux.conf`, `tx`, installer scripts, local style defaults, and status helper scripts. These are package helper assets rather than Pi package resources.
_Avoid_: docs/install drift, hard-coded helper paths that contradict installer overrides, machine-local style choices committed as shared defaults

**Tmux Status Profile**:
The tmux status-bar interface assembled by `tmux/tmux.conf` from local style settings plus the lightweight `git-status.sh` branch segment. The profile intentionally avoids resize overrides and complex multi-helper status execution for SSH/mobile compatibility.
_Avoid_: scattering status path/color/git knowledge across config, installer, docs, and tests; overriding tmux resize defaults; adding mobile-specific resize hooks
