# pi-package-goal

`pi-package-goal` is a Pi package that bundles curated agent skills, extensions, and helper scripts for safer agent workflows. It includes:

- slash-command extensions such as `/goal`, `/understand`, `/folder-refactor`, `/ponytail`, `/rtk`, `/onklaud`, and `/s3upload`, plus low-redraw TUI behavior for SSH/tmux;
- agent skills for planning, engineering, docs, delivery, Pi package work, frontend/UI, research, and communication;
- the `trebuchet-neon` TUI theme; and
- `tx` tmux plus `autofolderrefactor` helper bins.

Use it when you want Pi to keep an objective in view, choose a focused workflow, understand a codebase, or ship changes with validation discipline.

## Start here by audience

| You are... | Read first | Try first |
| --- | --- | --- |
| New to Pi or this package | [Quick start](#quick-start), then [Pi words used below](#pi-words-used-below) | `/goal improve the README until a new user can install and choose a skill` |
| A package evaluator | [What you get](#what-you-get), [Included extensions](#included-extensions), [Package shape](#package-shape) | `/understand` in a disposable repo |
| A contributor or maintainer | [Development](#development), [Package shape](#package-shape), [`AGENTS.md`](AGENTS.md) | `npm test` |
| An agent working in this repo | [Pick the right entrypoint](#pick-the-right-entrypoint), [Safe delivery](#safe-delivery-with-git-commit-push), [`AGENTS.md`](AGENTS.md) | `git status --short --branch` |

## Pi words used below

- **Pi package** — installable bundle discovered by Pi through `package.json`'s `pi.extensions`, `pi.skills`, and `pi.themes` fields.
- **Extension** — JavaScript code that adds slash commands, tools, hooks, providers, or TUI behavior to Pi.
- **Skill** — Markdown instructions Pi can load for a specific workflow, such as `diagnose`, `tdd`, or `git-commit-push`.
- **Slash command** — a command typed inside Pi, such as `/goal status` or `/understand`.
- **Theme** — TUI color tokens selectable from Pi settings.

## Quick start

Prerequisites:

- Pi installed from [pi.dev](https://pi.dev).
- Node.js `>=22` available to Pi's package installer.
- Optional tools only when you use those features: `tmux`, [rtk](https://github.com/rtk-ai/rtk), or the upstream [Understand-Anything](https://github.com/Lum1104/Understand-Anything) checkout created by `/understand`.

Check Pi:

```bash
pi --version
```

Install globally:

```bash
pi install git:github.com/TrebuchetDynamics/pi-package-goal
```

Or install for the current project/team repo:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-package-goal
```

Reload any open Pi session after installing or updating:

```text
/reload
```

Smoke-test the installed commands inside Pi:

```text
/goal status
/ponytail status
```

If those commands are unknown, reload Pi again and check the install command output.

### Optional OmniRoute setup

From a checkout, review and run the installer to install OmniRoute globally, start its local daemon, create the `pi-auto` free-model fallback route, and select it as Pi's default model:

```bash
sh install-omniroute-pi.sh
```

The installer preserves existing providers and settings, writes permission-restricted backups before changes, and configures `~/.pi/agent/models.json` plus `settings.json`. For an existing local or remote OmniRoute server, use `--config-only --base-url <url>`; that route must already exist on remote servers.

To install the bundled skills globally for both Codex and Claude Code from a checkout:

```bash
sh install-agent-skills.sh
```

This installs flattened skill directories to `~/.agents/skills` for Codex and
`~/.claude/skills` for Claude Code. Existing same-name skills are backed up
under `~/.local/state/pi-package-goal/skill-backups/`, outside the active skill
directories. Use `--codex-only`, `--claude-only`, `--dry-run`, or `--no-backup`
when needed. The previous Claude-only command remains available:

```bash
sh install-claude-skills.sh
```

If this Pi package is installed at the same time, Pi may report skill-name
collisions between `~/.agents/skills` and its package checkout. A checked
`~/.agents/skills` path means that copy loaded; the package copy is skipped as
the duplicate. This does not remove the skill from Codex or Claude Code.

Security note: Pi packages can include extensions and skills that run with your local permissions. Review third-party package source before installing it.

## Pick the right entrypoint

| If you want to... | Start with | Why |
| --- | --- | --- |
| Choose the right skill automatically | `skill-router` | Selects one primary skill for the task; with no task, starts autonomous repo improvement. |
| Keep a long-running objective on track | `/goal <objective>` or `goal` | Tracks progress and requires evidence before completion. |
| Improve a repo autonomously but safely | `autonomous-codebase-improver` or `/goal-technical-auditor [folder]` | Picks one validated slice from repo evidence, then routes to the right specialist. |
| Hunt for one fixable bug from repo evidence | `bug-harvest` | Finds a high-confidence bug candidate, then uses a repro-first fix loop. |
| Debug broken, flaky, or slow behavior | `diagnose` | Reproduce, minimize, instrument, fix, and regression-test. |
| Add behavior test-first | `tdd` | Red-green-refactor with repo study before code edits. |
| Ship finished work | `git-commit-push` | Polishes, validates, split-commits safe in-scope changes, and pushes. |
| Share a local file with an expiring Azure link | `/s3upload <file>` | Uses the separately installed CLI and existing private-container configuration. |
| Review before shipping | `autoreview` | Runs a structured closeout review when tooling is available. |
| Get an unbiased second opinion | `autoreview` (reviewer) or `grill-with-docs` (advisor) | Dispatches a clean-context delegate for a plan- or change-time review when a fork/subagent tool is available. |
| Understand a codebase | `/understand` | Builds a graph and automatically writes an agent-readable map. |
| Create or update project docs/wiki | `wiki-docs` | Maintains source-backed README, architecture, onboarding, or Karpathy-style wiki pages. |
| Run provenance-first research | `research-forge` | Installs/uses `rforge` for literature search, OSS research, evidence extraction, meta-analysis, and auditable reports. |
| Plan a graph-backed refactor | `/understand-refactor <focus>` | Generates a deterministic plan, then starts docs-backed grilling. |
| Refactor one noisy folder | `/folder-refactor <folder>` | Uses scan/state/audit guardrails to avoid lazy completion. |
| Rank folder-refactor candidates | `candidates-folder-refactor` | Scores bounded noisy folders and suggests the top target. |
| Build or review Pi resources | `pi-ecosystem-scout`, `pi-extensions-helper`, `write-a-skill` | Uses Pi package, extension, and skill conventions. |
| Build polished frontend UI | `ui-design` | Routes to the right frontend/design skill. |
| Use terse responses | `caveman` | Switches to low-token communication. |
| Prefer the smallest working solution | `/ponytail` or `ponytail` | Enforces YAGNI, stdlib/native-first choices, shortest diffs, and over-engineering review helpers. |

Skills load on demand. Ask naturally, or use `/skill:<name>` when skill commands are enabled. Packaged skills default to Ponytail-style scope control (YAGNI, stdlib/native first, shortest safe diff) while keeping normal compact prose; use `caveman` only when you explicitly want low-token wording.

```text
/goal improve the README until a new user can install and choose a skill
/goal-technical-auditor skills/engineering
/skill:diagnose debug the failing npm test
/skill:tdd add coverage for the parser edge case
/understand
/folder-refactor skills/engineering
/s3upload myapp.apk
```

## What you get

| Area | What it helps with | Start with |
| --- | --- | --- |
| Goal discipline | Keep a session pointed at one objective and finish only after evidence is checked. | `goal` |
| Safe delivery | Polish obvious issues, validate, commit only safe work, push, or share a local file through private Azure Blob Storage. | `git-commit-push`, `s3upload` |
| Engineering loops | Improve one safe repo slice, hunt bugs, debug, test-drive, prototype, review, improve architecture, run technical audits, or audit prompt caching. | `autonomous-codebase-improver`, `bug-harvest`, `diagnose`, `tdd`, `prototype`, `technical-auditor`, `prompt-cache-auditor` |
| Clean-context review | Get an unbiased advisor (plan-time) or reviewer (change-time) second opinion, dispatched to a clean context when a fork/subagent tool is available — see [clean-context delegation](skills/shared/CLEAN-CONTEXT-DELEGATION.md). | `autoreview`, `grill-with-docs` |
| Planning and handoff | Route to the right skill, update source-backed docs, turn context into PRDs/issues, triage work, summarize for the next agent. | `skill-router`, `wiki-docs`, `to-prd`, `to-issues`, `triage`, `handoff` |
| Pi ecosystem work | Scout, build, or review Pi skills/extensions/packages. | `pi-ecosystem-scout`, `pi-extensions-helper`, `write-a-skill` |
| Frontend/design craft | Build polished frontend UIs, avoid generic AI aesthetics, generate frontend reference images, and convert Stitch designs. | `ui-design`, `frontend-design`, `design-taste-frontend`, `gpt-taste`, `image-to-code`, `hallmark`, `stitch-react-components`, `ui-ux-pro-max` |
| Visual theme | Use a complete neon-inspired TUI token map with top-level HTML export colors. | `trebuchet-neon` |
| Codebase understanding | Run Understand-Anything from Pi and generate agent-readable maps, compare maps, and refactor plans. | `/understand` |
| Research workflow | Install/use ResearchForge `rforge` for provenance-first literature discovery, OSS study, systematic reviews, and auditable reports. | `research-forge` |
| Shell helpers | Install a portable tmux profile and session launcher. | `tx` |

## Included extensions

### `/s3upload`

`/s3upload <file or request>` is the direct shortcut for the bundled `s3upload` skill. It queues `/skill:s3upload ...`, which uses the separately installed CLI and existing Azure configuration to upload, list, or explicitly delete all files; uploaded links expire as requested and Azure deletes blobs through exact expiry or the container lifecycle policy.

```text
/s3upload myapp.apk
/s3upload upload recent generated image for 48 hours
/s3upload delete all files in temporary-uploads
```

Use the exact spelling `s3upload`; update this package and run `/reload` after first installing a version that includes the command.

### Mobile SSH low-redraw

When Pi runs inside both SSH and tmux, `mobile-low-redraw` hides the animated `Working…`/elapsed-time row. Streamed responses and tool results remain visible, while idle or long-running agent work no longer repaints that loader every second. Local non-SSH Pi sessions are unchanged.

### `/ponytail`

`/ponytail` is bundled from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail). It sets a session mode that appends Ponytail's minimalism instructions before agent runs.

| Command | Use it for |
| --- | --- |
| `/ponytail` or `/ponytail full` | Enable default Ponytail mode. |
| `/ponytail lite` | Build what was asked while naming the lazier alternative. |
| `/ponytail ultra` | Prefer deletion/YAGNI aggressively and challenge unnecessary requirements. |
| `/ponytail off` or `normal mode` | Disable Ponytail for the session. |
| `/ponytail status` | Show current and default modes. |
| `/ponytail default <off\|lite\|full\|ultra\|review>` | Persist the default mode in the Ponytail config. |
| `/ponytail-review`, `/ponytail-audit`, `/ponytail-gain`, `/ponytail-debt`, `/ponytail-help` | Dispatch to the bundled Ponytail skills. |

### `/goal`

`/goal` is the bundled [pi-goal](https://github.com/Michaelliv/pi-goal) extension, installed from this package under the simple extension name `goal`.

| Command | Use it for |
| --- | --- |
| `/goal <objective>` | Start or replace a persistent objective for the current session. |
| `/goal --tokens 50k <objective>` | Pursue the objective until complete or the token budget is reached. |
| `/goal status` | Show the current goal, usage, and status bar setting. |
| `/goal edit [--tokens 100k] <objective>` | Update the current objective or budget without resetting usage. |
| `/goal pause` / `/goal resume` | Stop or resume autonomous continuation. |
| `/goal clear` | Remove the current goal. |
| `/goal statusbar on|off` | Toggle the footer status line. |

While active, the extension exposes `get_goal`, `goal_complete`, and compatibility `update_goal` tools so the agent can inspect the objective and mark it complete only after evidence-backed verification.

### `/goal-technical-auditor`

`/goal-technical-auditor [--tokens 700k] [--dry-run] [--focus bug-hunt-refactor] [folder|prompt]` starts a persistent `/goal` that runs `technical-auditor` in default Full mode, then turns the audit task plan into safe validated development slices. It is an autonomous improver loop: it works through all safe audit recommendations, reruns the audit on the same scope, and stops only when recommendations are fixed, deferred with reason, or blocked with an owner decision. The optional folder argument scopes the work; when omitted, it audits and improves the current Pi working directory (`.`). Natural-language prompts such as `bug hunt` or `audit current repo` are treated as current-repo intent, not paths; unquoted path-like values must exist, so quote prompts that look like folder names.

Examples:

```text
/goal-technical-auditor
/goal-technical-auditor skills/engineering
/goal-technical-auditor --tokens 500k .
/goal-technical-auditor --dry-run --focus bug-hunt-refactor lib
/goal-technical-auditor "bug hunt"
```

The controller records audit passes and findings in a committed `docs/audits/` ledger, validates and commits one finding at a time on the current branch, preserves twice-failed slices in Git stashes, and re-audits before final delivery. It performs one final push after validation; `main`, `master`, and the remote default branch require confirmation.

| Control | Effect |
| --- | --- |
| `/goal-technical-auditor status` | Show phase, branch, findings, blockers, and next action. |
| `/goal-technical-auditor resume` | Resume only after branch, HEAD, ledger, and worktree drift checks pass. |
| `/goal-technical-auditor abort` | Pause the associated `/goal` while preserving commits, ledger, and stashes. |

### Ketch research tool

The package exposes one model tool, `ketch`, for live web research plus `/ketch <research request or URL>` as its user-facing shortcut. It infers whether a request needs web search, public code search, library docs, URL scraping, or a bounded site crawl; `surface` remains available as an override when inference is wrong.

Ketch is resolved in this order: `$KETCH_BIN`, `ketch` on `PATH`, then a pinned Ketch v0.11.0 release downloaded to the user cache with SHA-256 verification. Installation happens only on the first `ketch` tool call and does not change global package-manager state or Ketch configuration. Backends that need API keys still report Ketch's `precondition` error for the operator to configure.

Ketch is an independent MIT-licensed project: [github.com/1broseidon/ketch](https://github.com/1broseidon/ketch).

### `/understand`

`/understand` bridges Pi to the upstream [Understand-Anything](https://github.com/Lum1104/Understand-Anything) project.

On first use it prompts to clone Understand-Anything into `~/.understand-anything/repo`, then dispatches to the upstream workflows. It honors `UA_DIR`, `UA_REPO_URL`, and optional `UA_REF` for pinned upstream checkouts.

| Command | Use it for |
| --- | --- |
| `/understand` | Build or refresh the current directory's knowledge graph, then write `codebase-map-understand.md`. |
| `/understand --no-agent-map` | Build only the upstream graph and skip the automatic Markdown map. |
| `/understand src/frontend --language zh` | Understand a specific path, then write a folder-scoped map such as `frontend-codebase-map-understand.md`. |
| `/understand dashboard` | Open the upstream dashboard workflow. |
| `/understand chat How does auth work?` | Ask about the generated graph. |
| `/understand diff` | Summarize recent graph/code changes. |
| `/understand agent` or `/understand-agent` | Refresh `codebase-map-understand.md` from an existing graph. |
| `/understand agent @frontend` or `/understand-agent @frontend` | Refresh `frontend-codebase-map-understand.md` from `frontend/.understand-anything/knowledge-graph.json`. |
| `/understand compare ../project-a ../project-b` | Compare two existing graphs and write a deterministic compare map. |
| `/understand refactor "auth flow"` | Generate a deterministic refactor plan from the current graph. |
| `/understand-refactor @internal/channels/telegram/.` | Generate/use a folder-only graph for refactor planning. |
| `/understand-refactor "most tangled part"` | Direct alias for graph-based refactor planning. |
| `/understand explain src/auth/login.ts` | Explain one file or path. |
| `/understand onboard` | Generate onboarding guidance from the graph. |
| `/understand domain` | Extract domain concepts. |
| `/understand knowledge ~/path/to/wiki` | Add external knowledge. |
| `/understand update` | Update the upstream checkout. |

Direct aliases are also registered:

```text
/understand-dashboard
/understand-chat
/understand-diff
/understand-explain
/understand-onboard
/understand-domain
/understand-knowledge
/understand-agent
/understand-compare
/understand-refactor
```

Notes:

- `/understand` analyzes the shell's current working directory when no path is supplied, then writes the agent-readable map after the analysis settles; `/understand agent` remains available to regenerate the Markdown map from that current directory's existing graph.
- `/understand compare <folder-a> <folder-b>` requires both folders to already contain `.understand-anything/knowledge-graph.json`.
- `/understand refactor [@folder] [focus] [output.md]` uses the current repo graph by default; with `@folder`, it reads `folder/.understand-anything/knowledge-graph.json`, defaults the plan name from that folder, and if no graph exists, starts `/understand <folder>` directly to build a folder-only graph first.
- Refactor mode reads an existing output plan before overwriting it, combines that continuity with graph hotspots, live file checks, related-test discovery, and before/during/after bug-search checkpoints, displays the generated plan inline, then immediately starts `grill-with-docs` on the top candidate so the refactor workflow can proceed or ask for owner steering. Follow-ups remain available: `/understand-refactor grill N`, `/understand-refactor ignore N`, or `/understand-refactor regenerate with focus <area>`.
- Compare and refactor modes only generate deterministic Markdown files. Ask the LLM to reason over those files when you want analysis.

### `/folder-refactor`

`/folder-refactor <folder>` starts a guarded folder refactor with deterministic scan/state/audit tools:

- `folder_refactor_scan` inventories root files and safety hints before work starts.
- `folder_refactor_state` preserves validated slices and next candidates for longer objectives.
- `folder_refactor_audit` blocks completion claims until every remaining root file is classified and safe next candidates are not skipped.

Use it for bounded folder splits, shared-code extraction from proven duplicate call sites, and behavior-preserving module organization.

### `/rtk`

This package includes `extensions/rtk/index.js`, a Pi extension for [rtk-ai/rtk](https://github.com/rtk-ai/rtk). When the `rtk` binary is available in `PATH` or `~/.local/bin`, eligible Pi `bash` tool calls are rewritten through `rtk rewrite` before execution, for example `git status` can become `rtk git status`.

The extension fails open: missing, old, or broken RTK leaves commands unchanged. It also compacts noisy `bash`/`grep` tool results, strips ANSI/control noise, summarizes common test/build/git/search output, tracks per-session savings, and can run in suggestion-only mode.

Useful commands:

```text
/rtk status
/rtk stats
/rtk clear-stats
/rtk install
```

Review and install RTK yourself, then reload Pi:

```bash
brew install rtk
```

For non-Homebrew platforms, review the official RTK installation instructions upstream before running any installer. The extension never executes the remote installer for you. Use environment flags to tune behavior: `RTK_DISABLED=1` bypasses all rewriting/compaction, `RTK_MODE=suggest` reports rewrites without changing commands, `RTK_COMPACT=0` disables output compaction, `RTK_COMPACT_READ=1` enables lossy read compaction for large un-ranged reads, and `RTK_MAX_OUTPUT_CHARS=12000` controls hard truncation.

### `/onklaud`

`/onklaud` is a thin Pi extension around `/goal`, not a separate coding agent. It exists because a slash command can reliably generate the long safe-council prompt, check/install the external [Onklaud 5](https://github.com/KorroAi/onklaud-5) CLI, and keep Pi in charge of repo mutation.

Use it when you want a second-opinion council on a meaningful Pi task. Skip it for tiny edits, secrets-heavy debugging, or when you only want to run the raw `onklaud` CLI yourself.

Commands:

```text
/onklaud explain
/onklaud status
/onklaud gate --domain coding --text "code or summary" --json
/onklaud ponytail --task "read JSON" --json
/onklaud pre-check --task "retry logic" --json
/onklaud fast-gate --syntax-only file.js
/onklaud --dry-run fix the failing tests
/onklaud fix the failing tests
/onklaud install --yes
```

`/onklaud gate`, `ponytail`, `pre-check`, and `fast-gate` expose Onklaud's zero-cost helper layer. The extension requires explicit text/task/file input and keeps `fast-gate` offline by requiring `--syntax-only` or `--skip-kimi`. `/onklaud [task]` starts a `/goal` objective that asks Pi to do the work while using the installed CLI as an advisory council. With no task, it asks Pi to choose and execute major safe development progress from repo evidence. `/onklaud --dry-run <task>` previews the generated goal.

`/onklaud install` interactively installs Onklaud on the current machine by cloning `KorroAi/onklaud-5`, creating a local Python virtualenv, installing `fpdf2`/`pyyaml`, and writing an `onklaud` launcher under the user bin directory. Re-run it after updating this package if helper subcommands are missing. Use `/onklaud install --yes` for non-interactive installs, or `--dir` / `--bin-dir` to override locations.

The extension treats Onklaud output as advice, not authority: Pi still owns file edits, tests, validation, commits, and pushes. It does not send secrets intentionally; review CLI auth outside Pi before relying on model-backed council calls.

## Included CLI and tmux helpers

### `autofolderrefactor`

`autofolderrefactor` is a package bin that repeatedly selects the top folder-refactor candidate and runs the guarded refactor workflow.

| Command | Use it for |
| --- | --- |
| `autofolderrefactor ignore [folder]` | Scan folders first and establish `.refactorignore` entries for generated/artifact/vendor/clone trees. |
| `autofolderrefactor N [folder]` | Run an automatic loop: scan candidates, pick top #1, protect dirty work under the working directory, run the guarded share-code + folder-refactor prompt, validate, commit validated slices, cool down landed candidates, and repeat `N` times. |

Install the standalone wrapper from a checkout:

```bash
sh install-autofolderrefactor.sh
autofolderrefactor 10
```

Advanced installer path, equivalent when working directly in the skill folder:

```bash
sh skills/engineering/candidates-folder-refactor/scripts/install.sh
autofolderrefactor 10 internal
```

### `tx` tmux profile

This package includes a portable tmux profile under `tmux/`:

- `tmux/tmux.conf` — phone-friendly tmux config with a one-line status bar.
- `tmux/tx` — installable tmux session launcher exposed as the package `tx` bin.
- `tmux/install.sh` — copies the tmux config, status helper scripts, local style defaults, and `tx` into the current user account.

Install the profile from a checkout:

```bash
npm run tmux:install
```

Or, when `tx` is already on your `PATH` from an npm install/link, install the profile with:

```bash
tx install
```

Run `tx init` to create an example config, `tx add <alias> [dir]` to add sessions, and `tx doctor` to validate the setup. See [`tmux/README.md`](tmux/README.md) for the full `tx` contract.

The package bins are declared in `package.json`:

```json
{ "bin": { "tx": "./tmux/tx", "autofolderrefactor": "./skills/engineering/candidates-folder-refactor/scripts/autofolderrefactor" } }
```

## Included theme: `trebuchet-neon`

`trebuchet-neon` is a complete Pi TUI theme with a dark neon palette and top-level HTML export colors.

Select it from Pi's `/settings` theme picker after installing the package, or set it in Pi settings:

```json
{ "theme": "trebuchet-neon" }
```

Theme discipline:

- all required Pi color tokens are present;
- `export` colors live in the top-level `export` object, not inside `colors`; and
- the package uses `pi.themes` so the theme is loaded through normal Pi package discovery, not a curl-pipe installer.

## Included skills

### Goal and delivery

| Skill | When to use it |
| --- | --- |
| `goal` | Start or continue a bounded objective inside the conversation; no-arg `goal` auto-discovers useful repo work. |
| `git-commit-push` | Inspect and ship every isolatable safe local topic; do not stop merely because the worktree contains changes. |
| `s3upload` | Handle `/s3upload` or `/skill:s3upload` requests to upload one file, list uploads, or explicitly delete all files in the configured Azure container. |
| `autoreview` | Run a structured closeout review before shipping; the clean-context [reviewer](skills/shared/CLEAN-CONTEXT-DELEGATION.md) role. |
| `lgtm` | Resolve short approval against the latest explicit checkpoint without rerunning completed work or authorizing unproposed side effects. |
| `caveman` | Switch to terse, low-token communication. |
| `ponytail` | Switch to lazy-senior-dev mode: simplest solution that actually works. |
| `ponytail-review` | Review a diff for over-engineering and what to delete. |
| `ponytail-audit` | Audit a whole repo for YAGNI, stdlib/native replacements, and shrink opportunities. |
| `ponytail-gain` | Show Ponytail's published benchmark scoreboard. |
| `ponytail-debt` | List `ponytail:` shortcut comments as a debt ledger. |
| `ponytail-help` | Display Ponytail modes, skills, and commands. |

### Engineering workflows

| Skill | When to use it |
| --- | --- |
| `tdd` | Add behavior test-first with a red-green-refactor loop. |
| `diagnose` | Reproduce and fix broken, flaky, or slow behavior. |
| `unused-code` | Use Understand graph leads when available, prove code has no live path in live source, then delete it in small validated batches. |
| `prompt-cache-auditor` | Audit and fix LLM prompt-cache misses, cache-key bugs, and provider cache verification gaps. |
| `prototype` | Try a disposable design, state model, UI, or logic option before committing. |
| `skill-folder-refactor` | Refactor one folder into clearer subfolders while preserving behavior and reusing shared code. |
| `share-code` | Refactor a bounded folder to extract proven shared code and use the new seams to expose bugs. |
| `candidates-folder-refactor` | Rank noisy folders/subfolders as the top candidates to hand to `skill-folder-refactor`. |
| `improve-codebase-architecture` | Produce evidence-backed architecture reviews, then explore deeper seams for testability and AI navigation. |
| `technical-auditor` | Produce evidence-backed repository health audits with prioritized risk and improvement plans. |
| `grill-me` | Stress-test a plan and ask only hard owner-decision questions. |
| `grill-with-docs` | Stress-test a plan against project docs, run docs-council critiques (the clean-context advisor role), and record decisions. |
| `zoom-out` | Step back from the local task and reassess direction. |
| `research-forge` | Install/use `rforge` for provenance-first literature discovery, OSS study, systematic reviews, evidence extraction, and auditable reports. |

### Planning, triage, and writing

| Skill | When to use it |
| --- | --- |
| `to-prd` | Turn current context into a product requirements document. |
| `to-issues` | Break a plan into independently grabbable implementation issues. |
| `triage` | Create, classify, and prepare issues for workflow. |
| `handoff` | Summarize current context for another agent or later session. |
| `lgtm` / `nack` | Resolve short approval against the latest checkpoint, or re-check the latest challenged claim. |
| `writing-shape` | Shape rough notes or drafts into a publishable article. |

### Superpowers compatibility

Bundled from `obra/superpowers` under `skills/superpowers/`: `brainstorming`, `dispatching-parallel-agents`, `executing-plans`, `finishing-a-development-branch`, `receiving-code-review`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `using-superpowers`, `verification-before-completion`, `writing-plans`, and `writing-skills`.

### Pi, browser, and review ecosystem

| Skill | When to use it |
| --- | --- |
| `pi-ecosystem-scout` | Look for existing Pi packages, extensions, skills, prompts, and patterns before building. |
| `pi-extensions-helper` | Build, debug, package, or review Pi extensions and package resources. |
| `write-a-skill` | Create a new agent skill with the expected structure. |
| `modern-web-guidance` | Check current web-platform guidance before browser UI or frontend work. |
| `chrome-extensions` | Build, debug, review, or publish Chrome extensions. |
| `ui-design` | Orchestrate the UI/UX skills and pick the right frontend/design workflow for the task. |
| `ui-vault` | Propose evidence-backed resources and upgrades for one selected webpage from a pinned 196-item UI Vault catalog. |
| `ui-ux-pro-max` | Apply broad UI/UX design-system, typography, color, layout, accessibility, and motion guidance. |
| `frontend-design` | Create distinctive production-grade frontend interfaces that avoid generic AI aesthetics. |
| `beautify-github-readme` | Redesign a repository README or create GitHub-safe README SVG assets from real project evidence. |
| `design-taste-frontend` | Use Taste Skill v2 anti-slop rules for landing pages, portfolios, and redesigns. |
| `design-taste-frontend-v1` | Use the original Taste Skill v1 when exact legacy behavior is needed. |
| `gpt-taste` | Apply stricter GPT/Codex-oriented taste rules for high-variance layouts and GSAP-heavy pages. |
| `image-to-code` | Generate/analyze website reference images before implementing matching frontend code. |
| `redesign-existing-projects` | Audit and upgrade an existing website or app UI without breaking functionality. |
| `high-end-visual-design` | Apply soft, expensive, agency-style visual polish. |
| `minimalist-ui` | Build clean editorial minimalist interfaces with restrained color and crisp structure. |
| `industrial-brutalist-ui` | Build raw brutalist, Swiss-grid, terminal, or mechanical frontend interfaces. |
| `full-output-enforcement` | Require complete unabridged output and avoid placeholder/truncation patterns. |
| `imagegen-frontend-web` | Generate section-by-section website reference images. |
| `imagegen-frontend-mobile` | Generate premium mobile app screen and flow reference images. |
| `brandkit` | Generate brand-kit, logo-system, identity-board, and visual-guideline prompts. |
| `stitch-design-taste` | Create Stitch-friendly DESIGN.md guidance with anti-generic UI standards. |
| `hallmark` | Apply Hallmark's anti-AI-slop design flows for builds, audits, redesigns, and design extraction. |
| `stitch-react-components` | Convert Stitch designs into modular Vite/React components with validation. |
| `greploop` | Use Greptile-driven PR/MR/CL cleanup when explicitly requested and available. |

## Safe delivery with `git-commit-push`

Use `git-commit-push` when implementation work appears complete and you want safe polish plus delivery guarded by real git and validation evidence.

The skill:

1. treats local changes as the delivery queue and inspects every modified/staged/untracked path;
2. separates safe coherent topics from demonstrably unrelated or unsafe files;
3. fixes obvious hygiene and validation failures instead of stopping at the first red command;
4. runs requested or inferred validation, including `git diff --check`;
5. explicitly stages, commits, and pushes every isolatable safe topic;
6. reports `shipped` when safe topics were pushed even if unrelated owner files remain unstaged;
7. pushes before attempting remote integration—routine `git pull --autostash` is not a substitute for delivery; and
8. uses `review_needed` only when one exact owner decision prevents every safe topic from shipping, then reports compact final markers:

```text
GIT_COMMIT_PUSH_VALIDATED: yes|no
GIT_COMMIT_PUSH_DECISION: shipped|blocked|review_needed
```

It does not deploy, publish, force-push, rewrite history, rebase, or non-fast-forward merge remote changes unless explicitly asked.

## Clean-context advisor and reviewer

Several skills can ask for a second opinion. The value of that opinion comes from a *clean, unbiased context* — a delegate that has not seen the main agent's reasoning and so will not rubber-stamp it. The shared [clean-context delegation contract](skills/shared/CLEAN-CONTEXT-DELEGATION.md) defines two roles:

- **Advisor** — a strategy, architecture, or product opinion on a plan or decision, *before* execution. Surfaced by `grill-with-docs` (docs-council) and the `goal` slice checkpoint.
- **Reviewer** — a code-quality, security, or UX opinion on changes, *after* execution. Surfaced by `autoreview` and the `goal` completion audit.

How it behaves:

1. When the host exposes a fork/subagent tool, the role is dispatched to a clean-context delegate, briefed with the objective and the artifact under review but **not** the main agent's preferred answer.
2. When no such tool is available, it falls back to a single in-context lens that is explicitly labeled as lacking context isolation — never presented as a clean-context opinion.
3. Verdicts are advisory: codebase claims are verified against live source before being acted on, and a disagreement surfaces the trade-off instead of defaulting to either side.

This pattern is bundled as guidance only. It does not install a fork/subagent extension or any memory/compaction system, so it works standalone and simply improves when the host provides a dispatch tool.

## Provider bridge pattern

This package documents provider bridge patterns but intentionally does not bundle Grok/OpenCode-style provider bridges by default.

Borrowed design rules:

- provider bridges should expose a `/provider-name status` command with auth source, registered models, smoke-test command, and limitations;
- dynamic `pi.registerProvider()` and CLI-backed `streamSimple` are valid extension shapes when the API is understood;
- upstream CLI tools must be denied or disabled so Pi owns file reads, writes, shell commands, and other tool execution;
- credential-file reuse, proxy headers, OAuth refresh helpers, paid calls, and unofficial endpoints need explicit owner/legal/security approval before bundling; and
- prompt-bridged tool calls are less reliable than native provider tool calling and should fail closed if the upstream CLI attempts to act directly.

## Package shape

This package ships curated skills, package-local Pi extensions, and a theme. Package resources are declared in `package.json` with `pi.extensions`, `pi.skills`, and `pi.themes`:

```json
{
  "pi": {
    "extensions": [
      "./extensions/goal",
      "./extensions/goal-technical-auditor",
      "./extensions/understand",
      "./extensions/folder-refactor",
      "./extensions/rtk",
      "./extensions/ponytail",
      "./extensions/onklaud",
      "./extensions/s3upload"
    ],
    "skills": ["./skills"],
    "themes": ["./themes"]
  }
}
```

Package resources live under `extensions/`, `skills/`, `prompts/`, or `themes/`. Additional shell/tmux helper assets live under `tmux/` and are included in the package tarball through the `files` manifest.

## Update or remove

Refresh the installed package when the repository changes:

```bash
pi update git:github.com/TrebuchetDynamics/pi-package-goal
```

Remove it if you no longer want the bundled skills:

```bash
pi remove git:github.com/TrebuchetDynamics/pi-package-goal
```

Run `/reload` after either command in an open Pi session.

## Development

Run validation before committing changes:

```bash
npm test
git diff --check
npm pack --dry-run
```

The root package intentionally has no runtime dependencies. Audit bundled nested tooling separately when it changes:

```bash
npm --prefix skills/frontend/stitch-react-components audit --omit=dev --audit-level=moderate
```

Preserve third-party notices and license copies when updating bundled skills.
