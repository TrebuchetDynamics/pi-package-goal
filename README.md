# pi-package-goal

A Pi package that bundles curated agent skills, Pi UX extensions, a theme, and `/understand` bridge commands.

Use it when you want Pi to:

- keep a clear objective in view while it works;
- use safer commit/push discipline;
- switch into focused engineering workflows like TDD, diagnosis, review, or prototyping;
- build or review Pi package resources; and
- map a codebase with [Understand-Anything](https://github.com/Lum1104/Understand-Anything).

## What you get

| Area | What it helps with | Start with |
| --- | --- | --- |
| Goal discipline | Keep a session pointed at one objective and finish only after evidence is checked. | `goal` |
| Safe delivery | Polish obvious issues, validate, commit only safe work, and push. | `git-commit-push` |
| Engineering loops | Debug, test-drive, prototype, review, improve architecture, or audit prompt caching. | `diagnose`, `tdd`, `prototype`, `prompt-cache-auditor` |
| Planning and handoff | Turn context into PRDs/issues, triage work, summarize for the next agent. | `to-prd`, `to-issues`, `triage`, `handoff` |
| Pi ecosystem work | Scout, build, or review Pi skills/extensions/packages. | `pi-ecosystem-scout`, `pi-extensions-helper`, `write-a-skill` |
| Visual theme | Use a complete neon-inspired TUI token map with top-level HTML export colors. | `trebuchet-neon` |
| Codebase understanding | Run Understand-Anything from Pi and generate agent-readable maps, compare maps, and refactor plans. | `/understand` |

## Install

Install Pi from [pi.dev](https://pi.dev), then check that the command works:

```bash
pi --version
```

Install this package globally:

```bash
pi install git:github.com/TrebuchetDynamics/pi-package-goal
```

Or install it only for the current project/team repo:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-package-goal
```

After installing or updating, reload your open Pi session:

```text
/reload
```

## First commands to try

Skills are loaded on demand. Ask naturally, or use `/skill:<name>` when skill commands are enabled.

```text
/skill:goal improve the README until a new user can install and choose a skill
/skill:git-commit-push audit
/skill:tdd add coverage for the parser edge case
/skill:diagnose debug the failing npm test
/understand
/understand agent
```

## Included tmux helpers

This package also includes a portable tmux profile under `tmux/`:

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

The `tx` and `autofolderrefactor` commands are declared in `package.json` as package bins. To install the command globally from a checkout:

```bash
sh skills/candidates-folder-refactor/scripts/install.sh
autofolderrefactor 10
```

```json
{ "bin": { "tx": "./tmux/tx", "autofolderrefactor": "./skills/candidates-folder-refactor/scripts/autofolderrefactor" } }
```

Run `tx init` to create an example config, `tx add <alias> [dir]` to add sessions, and `tx doctor` to validate the setup.

## Included extensions

### `/understand`

`/understand` bridges Pi to the upstream [Understand-Anything](https://github.com/Lum1104/Understand-Anything) project.

On first use it prompts to clone Understand-Anything into `~/.understand-anything/repo`, then dispatches to the upstream workflows. It honors `UA_DIR` and `UA_REPO_URL`, matching the upstream installer defaults.

Common commands:

| Command | Use it for |
| --- | --- |
| `/folder-refactor <folder>` | Start a guarded folder refactor with deterministic scan/state/audit tools that block lazy completion reports. |
| `/rtk status` | Check whether [rtk-ai/rtk](https://github.com/rtk-ai/rtk) is installed and active for Pi bash command rewriting. |
| `/rtk install` | After confirmation, install the upstream `rtk` binary so this package's Pi extension can rewrite eligible bash tool calls through `rtk rewrite`. |
| `autofolderrefactor ignore [folder]` | Scan all folders first and establish `.refactorignore` entries for generated/artifact/vendor/clone trees. |
| `autofolderrefactor N [folder]` | Fully automatic loop: scan candidates, pick top #1, run the guarded share-code + folder-refactor prompt, validate from the repo/module root, commit validated slices, cooldown landed candidates, and repeat N times. Focuses on proven shared-code reuse/contracts, honors `.refactorignore`, and transitions to visibility-driven bug finding when candidates are exhausted/low. |
| `/understand` | Build or refresh the current repo's knowledge graph. |
| `/understand src/frontend --language zh` | Understand a specific path with upstream options. |
| `/understand dashboard` | Open the upstream dashboard workflow. |
| `/understand chat How does auth work?` | Ask about the generated graph. |
| `/understand diff` | Summarize recent graph/code changes. |
| `/understand agent` | Write `codebase-map-understand.md` for future agents. |
| `/understand agent @frontend` | Write `frontend-codebase-map-understand.md`. |
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
/understand-compare
/understand-refactor
```

Notes:

- `/understand agent` reads `.understand-anything/knowledge-graph.json` and writes `codebase-map-understand.md` by default.
- `/understand compare <folder-a> <folder-b>` requires both folders to already contain `.understand-anything/knowledge-graph.json`.
- `/understand refactor [@folder] [focus] [output.md]` uses the current repo graph by default; with `@folder`, it reads `folder/.understand-anything/knowledge-graph.json`, defaults the plan name from that folder, and if no graph exists, starts `/understand <folder>` directly to build a folder-only graph first.
- Refactor mode reads an existing output plan before overwriting it, combines that continuity with graph hotspots, live file checks, related-test discovery, and before/during/after bug-search checkpoints, displays the generated plan inline, then immediately starts `grill-with-docs` on the top candidate so the refactor workflow can proceed or ask for owner steering. Follow-ups remain available: `/understand-refactor grill N`, `/understand-refactor ignore N`, or `/understand-refactor regenerate with focus <area>`.
- Compare and refactor modes only generate deterministic Markdown files. Ask the LLM to reason over those files when you want analysis.

### RTK bash command compression

This package includes `extensions/rtk.js`, a Pi extension for [rtk-ai/rtk](https://github.com/rtk-ai/rtk). When the `rtk` binary is available in `PATH`, eligible Pi `bash` tool calls are rewritten through `rtk rewrite` before execution, for example `git status` can become `rtk git status`. The extension fails open: missing, old, or broken RTK leaves commands unchanged.

Setup options:

```text
/rtk status
/rtk install
```

Or install RTK yourself, then reload Pi:

```bash
brew install rtk
# or
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
```

Use `RTK_DISABLED=1` to bypass rewriting for a Pi process.

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

## Provider bridge pattern

This package documents provider bridge patterns but intentionally does not bundle Grok/OpenCode-style provider bridges by default.

Borrowed design rules:

- provider bridges should expose a `/provider-name status` command with auth source, registered models, smoke-test command, and limitations;
- dynamic `pi.registerProvider()` and CLI-backed `streamSimple` are valid extension shapes when the API is understood;
- upstream CLI tools must be denied or disabled so Pi owns file reads, writes, shell commands, and other tool execution;
- credential-file reuse, proxy headers, OAuth refresh helpers, paid calls, and unofficial endpoints need explicit owner/legal/security approval before bundling; and
- prompt-bridged tool calls are less reliable than native provider tool calling and should fail closed if the upstream CLI attempts to act directly.

## Included skills

### Goal and delivery

| Skill | When to use it |
| --- | --- |
| `goal` | Start or continue a bounded objective inside the conversation; no-arg `goal` auto-discovers useful repo work. |
| `git-commit-push` | Ship completed work with safe polish, validation, intentional staging, commit, and push. |
| `autoreview` | Run a structured closeout review before shipping. |
| `lgtm` | Continue after you approve the agent's latest plan or recommendation. |
| `caveman` | Switch to terse, low-token communication. |

### Engineering workflows

| Skill | When to use it |
| --- | --- |
| `tdd` | Add behavior test-first with a red-green-refactor loop. |
| `diagnose` | Reproduce and fix broken, flaky, or slow behavior. |
| `prompt-cache-auditor` | Audit and fix LLM prompt-cache misses, cache-key bugs, and provider cache verification gaps. |
| `prototype` | Try a disposable design, state model, UI, or logic option before committing. |
| `skill-folder-refactor` | Refactor one folder into clearer subfolders while preserving behavior and reusing shared code. |
| `share-code` | Refactor a bounded folder to extract proven shared code and use the new seams to expose bugs. |
| `candidates-folder-refactor` | Rank noisy folders/subfolders as the top candidates to hand to `skill-folder-refactor`. |
| `improve-codebase-architecture` | Produce evidence-backed HTML architecture reviews, then explore deeper seams for testability and AI navigation. |
| `grill-me` | Stress-test a plan and ask only hard owner-decision questions. |
| `grill-with-docs` | Stress-test a plan against project docs and record decisions. |
| `zoom-out` | Step back from the local task and reassess direction. |

### Planning, triage, and writing

| Skill | When to use it |
| --- | --- |
| `to-prd` | Turn current context into a product requirements document. |
| `to-issues` | Break a plan into independently grabbable implementation issues. |
| `triage` | Create, classify, and prepare issues for workflow. |
| `handoff` | Summarize current context for another agent or later session. |
| `writing-shape` | Shape rough notes or drafts into a publishable article. |

### Pi, browser, and review ecosystem

| Skill | When to use it |
| --- | --- |
| `pi-ecosystem-scout` | Look for existing Pi packages, extensions, skills, prompts, and patterns before building. |
| `pi-extensions-helper` | Build, debug, package, or review Pi extensions and package resources. |
| `write-a-skill` | Create a new agent skill with the expected structure. |
| `modern-web-guidance` | Check current web-platform guidance before browser UI or frontend work. |
| `chrome-extensions` | Build, debug, review, or publish Chrome extensions. |
| `greploop` | Use Greptile-driven PR/MR/CL cleanup when explicitly requested and available. |

## Safe delivery with `git-commit-push`

Use `git-commit-push` when implementation work appears complete and you want safe polish plus delivery guarded by real git and validation evidence.

The skill:

1. reads repo instructions and git state;
2. reviews changed/untracked files for secrets, local state, generated junk, and unrelated work;
3. fixes obvious safe hygiene/validation issues in scope;
4. runs requested or inferred validation, including `git diff --check`;
5. commits only safe in-scope changes;
6. pushes to the current upstream; and
7. reports final markers:

```text
GIT_COMMIT_PUSH_VALIDATED: yes|no
GIT_COMMIT_PUSH_DECISION: shipped|blocked|review_needed
```

It does not deploy, publish, force-push, rewrite history, rebase, or merge remote changes unless explicitly asked.

## Package shape

This package ships curated skills, package-local Pi extensions, and a theme. Package resources are declared in `package.json` with `pi.extensions`, `pi.skills`, and `pi.themes`:

```json
{
  "pi": {
    "extensions": [
      "./extensions/understand.js",
      "./extensions/folder-refactor.js",
      "./extensions/rtk.js"
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
```

Preserve third-party notices and license copies when updating bundled skills.
