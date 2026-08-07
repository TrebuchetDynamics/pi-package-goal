<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="pi-toolset keeps coding objectives visible, routes work to specialist skills, and requires evidence before delivery">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#choose-a-workflow">Choose a workflow</a> ·
  <a href="#what-ships">What ships</a> ·
  <a href="#development">Development</a>
</p>

`pi-toolset` is a curated [Pi](https://pi.dev) package for disciplined agent work. It combines persistent objectives, specialist skills, codebase understanding, guarded refactors, research, UI craft, and evidence-backed delivery in one install.

## Quick start

Requires Pi. The bundled OmniRoute installer requires a version supported by OmniRoute: Node.js `22.22.2`, `24`, `25`, or `26`. When that Node version is missing or too old on Linux, the universal installer downloads it into `~/.local/share/pi-node/current` (the location Pi's own installer uses) and puts it on `PATH`; other platforms need Node installed manually.

### All-in-one setup

From a checkout, the universal installer sets up Pi, this package, tmux with `tx`, Search Hub, Understand-Anything, RTK, OmniRoute, and global Codex/Claude skill copies:

```bash
git clone https://github.com/TrebuchetDynamics/pi-toolset.git
cd pi-toolset
sh install.sh
```

It supports macOS, common Linux distributions, and Termux. Remote installers are fully downloaded before execution. Existing files are backed up where supported; existing Pi, Understand, RTK, and OmniRoute installations are reused, and the pi-toolset package itself is updated to the latest version on every run. OmniRoute is installed globally, starts a local daemon, and becomes Pi's default provider. Global skill copies back up changed same-name skills before replacement; unchanged tools and assets are reused on subsequent runs. To prevent Pi skill-collision warnings, the all-in-one installer disables this package's skill entries in Pi and uses the identical `~/.agents/skills` copies shared with Codex; package-only installs continue to load skills from the package. When run in a terminal, the installer shows an interactive checklist so you can deselect any component; non-interactive runs install everything. Preview with `sh install.sh --dry-run`, or set `PI_TOOLSET_SKIP=rtk,omniroute` (ids: `pi`, `package`, `tmux`, `understand`, `rtk`, `skills`, `omniroute`) or `PI_TOOLSET_SKIP_OMNIROUTE=1` to omit components. Onklaud remains opt-in.

To install only the Pi package when Pi already exists:

```bash
pi install git:github.com/TrebuchetDynamics/pi-toolset
```

Reload an open Pi session, then start with a real objective:

```text
/reload
/goal improve this repository until npm test passes and the README is clear
```

Useful smoke checks:

```text
/goal status
/ponytail status
```

Install for only the current project/team repository with `-l`:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-toolset
```

## The operating loop

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="Set an objective, understand the codebase, route to one specialist, execute a bounded change, then verify and ship">
</p>

The package does not hide the work behind a universal mega-agent. It keeps five responsibilities explicit:

1. **Set the objective** — `/goal` keeps scope and token budget visible.
2. **Orient from evidence** — `/understand` maps the codebase; live files remain authoritative.
3. **Route deliberately** — `skill-router` chooses one primary workflow.
4. **Execute a bounded slice** — `tdd`, `diagnose`, UI skills, refactor skills, or another specialist owns the change.
5. **Prove the result** — tests and `git-commit-push` provide the delivery receipt.

## Choose a workflow

| You want to…                             | Start here                                  | Success signal                                  |
| ---------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Keep a long task on course               | `/goal <objective>`                         | Objective completed with evidence               |
| Find useful repository work              | `autonomous-codebase-improver`              | One validated bounded slice                     |
| Diagnose a concrete failure              | `diagnose`                                  | Repro fails before and passes after             |
| Build behavior test-first                | `tdd`                                       | Red → green → refactor                          |
| Understand architecture                  | `/understand`                               | Knowledge graph + agent-readable map            |
| Plan a graph-backed refactor             | `/understand-refactor <focus>`              | Bounded plan grounded in live files             |
| Split one noisy folder                   | `/folder-refactor <folder>`                 | Every remaining root file classified            |
| Audit repository health                  | `technical-auditor`                         | Evidence-backed findings and priorities         |
| Improve a webpage with curated resources | `ui-vault`                                  | Scored diagnosis + 3–5 traced proposals         |
| Build or redesign UI                     | `ui-design`                                 | Correct specialist + visual/validation evidence |
| Research with provenance                 | `research-forge` or `/search-hub <request>` | Source-backed findings                          |
| Ship local work                          | `git-commit-push`                           | Validated commit and push receipts              |
| Use fewer tokens                         | `/ponytail` or `caveman`                    | Smaller scope or shorter communication          |

Skills load on demand. Invoke them naturally or use `/skill:<name>` when skill commands are enabled:

```text
/skill:diagnose debug the failing parser test
/skill:ui-vault improve src/routes/pricing.tsx
/skill:git-commit-push ship the validated changes
```

## What ships

| Surface                     | Included | Purpose                                                                                              |
| --------------------------- | -------: | ---------------------------------------------------------------------------------------------------- |
| Agent skills                |   **65** | Engineering, planning, delivery, UI, research, Pi, and communication workflows                       |
| Pi extensions               |   **15** | Commands, tools, hooks, status behavior, delegation, and research bridges                            |
| Theme                       |    **1** | `trebuchet-neon`, a complete dark Pi token map                                                       |
| Package bins                |    **2** | `tx` and `autofolderrefactor`                                                                        |
| Direct runtime dependencies |    **3** | Bundled `@narumitw/pi-goal`, `pi-posher`, and `pi-subagents`; Pi core packages remain optional peers |

### Core extension surfaces

| Surface                   | What it adds                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/goal`                   | Autonomous session goals with budgets, safety limits, strict completion/blocker tools, and optional ordered queues |
| `/goal-technical-auditor` | Autonomous audit → validated slices → re-audit controller                                                          |
| `/bug-harvest`            | Session-local continuous bug hunt with anti-repetition and clean-context handoffs                                  |
| `/verify-isolated`        | Explicit fresh-session, read-only verification against a named contract                                            |
| `/workspace-guard`        | Workspace-bound edit/write protection plus a default bash timeout                                                  |
| `/understand`             | Understand-Anything graph, map, compare, explain, onboard, domain, and refactor flows                              |
| `/folder-refactor`        | Deterministic folder scan, state, and completion audit tools                                                       |
| `/rtk`                    | Optional command rewriting and output compaction through an installed RTK binary                                   |
| `/ponytail`               | Session-level YAGNI and shortest-safe-diff modes                                                                   |
| `/search-hub`             | Keyless web search and public-page reading through `web_search` and `web_read`                                     |
| `/onklaud`                | Advisory Onklaud council while Pi retains mutation ownership                                                       |
| `/s3upload`               | Upload to private Azure storage with an expiring is.gd link and TinyURL fallback                                   |
| `/poshify`                | Run configured formatters, linters, fixes, and audits after edits or on demand                                     |
| `subagent` / `/subagents` | Delegate focused work to foreground or background child Pi sessions                                                |
| Mobile low-redraw         | Hides the repainting work timer inside SSH + tmux sessions                                                         |

Search Hub needs no binary or API key: `web_search` queries every available source in parallel—keyless DuckDuckGo plus Brave and SearXNG when configured—then merges and deduplicates results; `web_read` uses Jina Reader. Enable additional sources with `BRAVE_API_KEY` or `SEARCH_HUB_SEARXNG_URL`; `JINA_API_KEY` raises reader limits. Results are capped at 20KB or 500 lines, with full page output saved to a temporary file when truncated.

<details>
<summary><strong>Goal controls</strong></summary>

```text
/goal <objective>
/goal --tokens 50k <objective>
/goal status
/goal edit [--tokens 100k] <objective>
/goal pause
/goal resume
/goal clear

# With experimental ordered goals enabled:
/goal add <objective>
/goal prioritize <objective>
/goal drop-last
/goal skip
```

`/goal-technical-auditor [--tokens 700k] [--dry-run] [--focus bug-hunt-refactor] [folder|prompt]` runs technical-auditor in Full mode, records findings in `docs/audits/`, validates one slice at a time, and re-audits before delivery. Use `status`, `resume`, or `abort` to control it.

</details>

<details>
<summary><strong>Bug harvest controls</strong></summary>

```text
/bug-harvest [scope]
/bug-harvest status
/bug-harvest pause
/bug-harvest resume
/bug-harvest handoff
/bug-harvest stop
```

The controller queues another evidence-backed bug pass whenever the agent settles, rotates recovery instructions when work repeats, and pauses after five stuck turns. At 80% context use it hands the run to a clean session. It has no fixed iteration limit while active; reloads, restarts, and failed turns pause it to prevent silent spend.

`/verify-isolated <contract>` starts a separate read-only Pi process with no extensions, skills, prompts, context files, or mutation tools. It can use multiple provider requests, so it runs only on an explicit command. `/workspace-guard` reports write protection: `edit` and `write` stay inside the workspace or temporary directory, `.git`/`.pi`/`.agents`/`.env`/cache paths are blocked, and bash receives a 180-second default timeout. Bash is not an OS sandbox.

</details>

<details>
<summary><strong>Understand commands</strong></summary>

```text
/understand
/understand src/frontend --language zh
/understand dashboard
/understand chat How does auth work?
/understand diff
/understand agent
/understand compare ../project-a ../project-b
/understand refactor "auth flow"
/understand explain src/auth/login.ts
/understand onboard
/understand domain
/understand knowledge ~/path/to/wiki
/understand update
```

Direct aliases include `/understand-dashboard`, `/understand-chat`, `/understand-diff`, `/understand-explain`, `/understand-onboard`, `/understand-domain`, `/understand-knowledge`, `/understand-figma`, `/understand-agent`, `/understand-compare`, and `/understand-refactor`.

Generated `.ua/` data (or legacy `.understand-anything/`) and `codebase-map-understand.md` are orientation aids, not package resources or automatic source-of-truth replacements.

</details>

<details>
<summary><strong>Complete skill inventory</strong></summary>

**Communication (8)**

`caveman`, `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review`, `writing-shape`

**Delivery (4)**

`autoreview`, `git-commit-push`, `greploop`, `s3upload`

**Engineering (13)**

`autonomous-codebase-improver`, `bug-harvest`, `candidates-folder-refactor`, `diagnose`, `improve-codebase-architecture`, `prompt-cache-auditor`, `prototype`, `share-code`, `skill-folder-refactor`, `tdd`, `technical-auditor`, `unused-code`, `wiki-docs`

**Frontend and design (22)**

`beautify-github-readme`, `brandkit`, `chrome-extensions`, `design-taste-frontend`, `design-taste-frontend-v1`, `frontend-design`, `full-output-enforcement`, `gpt-taste`, `hallmark`, `high-end-visual-design`, `imagegen-frontend-mobile`, `imagegen-frontend-web`, `image-to-code`, `industrial-brutalist-ui`, `minimalist-ui`, `modern-web-guidance`, `redesign-existing-projects`, `stitch-design-taste`, `stitch-react-components`, `ui-design`, `ui-ux-pro-max`, `ui-vault`

**Pi authoring and orchestration (4)**

`pi-ecosystem-scout`, `pi-extensions-helper`, `pi-subagents`, `write-a-skill`

**Planning (11)**

`goal`, `grill-me`, `grill-with-docs`, `handoff`, `lgtm`, `nack`, `skill-router`, `to-issues`, `to-prd`, `triage`, `zoom-out`

**Research (1)**

`research-forge`

</details>

## Optional integrations

Installing only the Pi package does not install these external tools. The explicit all-in-one `install.sh` command installs OmniRoute, RTK, and global skill copies by default; use the commands below for individual setup.

### OmniRoute for Pi

The all-in-one installer runs this by default. For individual setup:

```bash
sh install-omniroute-pi.sh
```

The installer installs OmniRoute globally with strict Node engine checks and npm's legacy peer resolver (avoiding upstream React/Marked peer-warning noise), binds its local daemon to `127.0.0.1`, enables crash recovery and autostart, selects OmniRoute's keyless/no-login `auto/coding:free` routing pool, preserves existing Pi providers/settings, writes permission-restricted backups, and sets that router as Pi's default model. It also persists capacity for eight structurally heavy Pi chats across restarts; lower `OMNIROUTE_CHAT_MAX_HEAVY_IN_FLIGHT` on memory-constrained hosts. Individual free upstreams can still be rate-limited or temporarily unavailable; OmniRoute handles selection and fallback.

For an existing server:

```bash
sh install-omniroute-pi.sh --config-only --base-url https://host.example/v1
```

Remote servers must already expose the requested route. The installer probes both the supplied path and its `/v1` variant, then stores the first working models endpoint.

### RTK

The all-in-one installer installs [rtk-ai/rtk](https://github.com/rtk-ai/rtk) through its checksum-verifying official installer. Package-only users can install RTK separately, then use `/rtk status`. The extension fails open when RTK is absent or unsupported.

```text
/rtk status
/rtk stats
/rtk clear-stats
```

Set `RTK_DISABLED=1` to bypass rewriting and compaction.

### Onklaud

Use `/onklaud explain` before installation. Pi remains responsible for file changes, tests, commits, and pushes; Onklaud is advisory.

```text
/onklaud status
/onklaud --dry-run fix the failing tests
/onklaud install --yes
```

### Global Codex and Claude skill copies

The all-in-one installer runs this by default. For individual setup:

```bash
sh install-agent-skills.sh
```

This installs flattened skill directories to `~/.agents/skills` and `~/.claude/skills`, backing up same-name skills under `~/.local/state/pi-toolset/skill-backups/`. The all-in-one installer then disables the package's duplicate Pi skill entries; direct `pi install` users are unaffected. Options: `--codex-only`, `--claude-only`, `--dry-run`, and `--no-backup`.

## Theme and shell helpers

### `trebuchet-neon`

Select the bundled theme in `/settings` or set:

```json
{ "theme": "trebuchet-neon" }
```

Its dark navy, green, cyan, magenta, and amber palette is also the source for this README's visual system.

### `tx`

Install the phone-friendly tmux profile from a checkout:

```bash
npm run tmux:install
```

Then use `tx init`, `tx add <alias> [dir]`, and `tx doctor`. See [`tmux/README.md`](tmux/README.md).

### `autofolderrefactor`

This niche autonomous refactoring loop remains opt-in:

```bash
sh install-autofolderrefactor.sh
autofolderrefactor ignore [folder]
autofolderrefactor N [folder]
```

The loop ranks bounded folder candidates, preserves dirty work, runs guarded refactor workflows, validates slices, and cools down landed candidates.

## Safety model

- Package extensions and skills run with your local permissions; review source before installation.
- `pi-posher` is bundled, but its formatter/linter/audit executables remain external and user-configurable; review its seeded global config before relying on automatic post-edit checks.
- `pi-subagents` can spawn child Pi processes with configured tools; mutation-capable agents have the same local permissions as the parent process.
- Delivery workflows do not deploy, release, force-push, rebase, or rewrite history without explicit authorization.
- Graphs, councils, catalogs, and reviewer output are evidence inputs—not authority.
- Advisors and reviewers use the [clean-context delegation contract](skills/shared/CLEAN-CONTEXT-DELEGATION.md) when the host supports isolated workers.
- Third-party source, local changes, and license copies are recorded in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- Generated `.pi/`, `.ua/`, and `.understand-anything/` state is excluded from the package tarball.

## Package shape

```text
extensions/  Pi commands, tools, hooks, and bridges
skills/      Discoverable Agent Skills and bundled references
themes/      Pi TUI themes
tmux/        tx launcher and low-bandwidth tmux profile
licenses/    Preserved third-party license copies
tests/       Manifest, extension, asset, helper, and workflow checks
```

Pi discovers resources through `pi.extensions`, `pi.skills`, and `pi.themes` in `package.json`:

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
      "./extensions/search-hub",
      "./extensions/onklaud",
      "./extensions/mobile-low-redraw",
      "./extensions/s3upload",
      "./extensions/poshify",
      "./extensions/pi-subagents"
    ],
    "skills": ["./skills"],
    "themes": ["./themes"]
  }
}
```

Pi core imports remain optional peer dependencies. `@narumitw/pi-goal`, `pi-posher`, and `pi-subagents` are pinned and bundled runtime dependencies. Review `~/.pi/agent/extensions/pi-posher/poshifiers.json` because its user-owned defaults can run external formatting, linting, and audit commands after edits; configure autonomous goals, subagent tools, and models with the same care.

The root `.npmrc` intentionally disables npm's automatic peer installation for git-package checkouts. Pi already provides those host packages; installing duplicate copies adds unnecessary dependencies and can introduce unrelated audit findings.

## Update or remove

```bash
pi update git:github.com/TrebuchetDynamics/pi-toolset
pi remove git:github.com/TrebuchetDynamics/pi-toolset
```

Run `/reload` after either command in an open session.

## Development

Read [`AGENTS.md`](AGENTS.md), then validate changes with:

```bash
npm test
npm run test:behavioral
git diff --check
npm pack --dry-run
```

Audit the nested Stitch tool separately when it changes:

```bash
npm --prefix skills/frontend/stitch-react-components audit --omit=dev --audit-level=moderate
```

## License and provenance

Package-local code and documentation are MIT-licensed. Bundled third-party resources retain their own terms; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`licenses/`](licenses/).
