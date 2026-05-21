# pi-package-development-loop

A Pi package that bundles a reusable development-loop extension with a curated set of high-signal engineering, Pi ecosystem, and modern web skills.

## Quick start

### Step 1: Install the Pi agent

Install Pi from [pi.dev](https://pi.dev), then confirm the `pi` command works:

```bash
pi --version
```

### Step 2: Install this package

Global install:

```bash
pi install git:github.com/TrebuchetDynamics/pi-package-development-loop
```

Project-local install, for a team repo:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-package-development-loop
```

After installing or updating, run this inside Pi:

```text
/reload
```

### Step 3: Start `/development-loop`

From the project you want to improve:

```text
/development-loop adapters
/development-loop start --iterations=3 improve the README
/development-loop status
```

Short alias:

```text
/dev-loop status
```

## Update or remove

Refresh the installed package when the repository changes:

```bash
pi update git:github.com/TrebuchetDynamics/pi-package-development-loop
```

Remove it if you no longer want the extension and bundled skills:

```bash
pi remove git:github.com/TrebuchetDynamics/pi-package-development-loop
```

Run `/reload` after either command in an open Pi session.

## Development-loop instructions and tips

`/development-loop` sends the agent a scoped iteration prompt, watches for final markers, logs progress, and queues follow-up iterations until the loop stops.

Useful commands:

```text
/development-loop adapters
/development-loop help
/development-loop init
/development-loop init --dry-run --iterations=5 --push --validation "npm test" --validation "git diff --check" --skill=grill-me release checks
/development-loop init --iterations=5 --push --validation "npm test" --validation "git diff --check" --skill=grill-me release checks
/development-loop start --iterations=3 providers
/development-loop start --iterations=5 --commit --push fix flaky tests
/development-loop status
/development-loop stop
/development-loop restart --iterations=2 tighten docs
```

Tips:

- Start small: `--iterations=1` or `--iterations=3` is usually enough.
- `/development-loop init` is non-interactive: it writes safe defaults without adapter, validation, or commit prompts.
- Existing `.pi/development-loop.json` files are protected by default; use `--force` only when you intentionally want an atomic replacement.
- Broad objectives inspect repo-local skills plus TODO.md, progress.json, plans, roadmaps, and similar task files.
- Leave `--commit` and `--push` off unless you want the loop to handle git delivery; `--push` implies commit.
- Keep one objective per run; stop and restart when the objective changes.
- `DEV_LOOP_DECISION: continue` starts the next iteration automatically; you should not need to press Enter for queued follow-up text.
- If validation is red or credentials are needed, the loop should report `blocked`.
- Progress logs go to `.pi/development-loop/logs.jsonl` by default.

### Status bar integration

`/development-loop` publishes a compact powerline-friendly status through the `development-loop` status key, for example `● run · loop 2/3 · generic-git · git:manual · release checks`. If you use [`pi-powerline-footer`](https://github.com/nicobailon/pi-powerline-footer), you can promote it into a dedicated segment:

```json
{
  "powerline": {
    "customItems": [
      {
        "id": "dev-loop",
        "statusKey": "development-loop",
        "position": "secondary",
        "prefix": "loop",
        "color": "accent"
      }
    ]
  }
}
```

### Steer an active loop

When a development loop is active, plain text becomes a steering request for the current or next safe slice. For example, type `focus release checks next` to update the objective without stopping the loop.

Slash commands still run as commands, and prompts sent by the extension are not rewritten.

Each iteration must end with:

```text
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done
```

### Project-local configuration for any repo

Create `.pi/development-loop.json` when a repo needs its own adapter name, default objective, skills, validation commands, iteration count, git delivery policy, stop conditions, or log path.

`/development-loop init` accepts the same basic knobs used by `start` plus config-only fields:

- `--adapter <name>`
- `--topic <text>` or trailing topic text
- `--iterations <n>` / `--max-iterations <n>` / `-n <n>`
- `--commit`, `--no-commit`, `--push`, `--no-push`
- `--validation <command>` or `--test <command>`; repeat for multiple checks
- `--preflight <command>`; repeat for multiple preflight checks
- `--skill <name-or-note>`; repeat for skills such as `greploop`, `grill-me`, `tdd`, or repo-local workflow skills
- `--stop-condition <text>`; repeat for custom blockers
- `--log-path <path>`
- `--dry-run` / `--preview` to preview the generated config without writing files
- `--force` to replace an existing config atomically

Example config:

```json
{
  "adapter": "docs-loop",
  "defaultTopic": "improve documentation with tests",
  "skills": ["tdd", "verification-before-completion"],
  "preflightCommands": ["git status --short --branch"],
  "validationCommands": ["npm test", "git diff --check"],
  "stopConditions": ["validation fails twice with the same blocker"],
  "maxIterations": 3,
  "commit": false,
  "push": false,
  "logPath": ".pi/development-loop/logs.jsonl"
}
```

Run `/development-loop adapters` to confirm which adapter and config Pi will use.

## Included extensions

- `/development-loop` — visible, adapter-aware project loop for iterative work in any codebase, with built-in defaults and project-local configuration.
- `/dev-loop` — short alias for the same extension.

## Included skills

### Development workflow

- `tdd` — red-green-refactor delivery.
- `diagnose` — disciplined bug and performance diagnosis.
- `improve-codebase-architecture` — architecture deepening review.
- `grill-with-docs` — plan interrogation tied to domain docs and ADRs.
- `prototype` — throwaway prototypes for design uncertainty.
- `zoom-out` — source-backed broader codebase understanding.
- `handoff` — continuation handoff for future sessions.
- `caveman` — ultra-compressed status communication.
- `write-a-skill` — skill authoring guidance.
- `greploop` — Greptile review loop for PR/MR/CL cleanup when review automation, required CLI auth, and git delivery are intentionally enabled.

### Web and browser

- `modern-web-guidance` — Chrome team modern web-platform guidance.
- `chrome-extensions` — Manifest V3 Chrome extension guidance.

### Pi ecosystem

- `pi-ecosystem-scout` — check the Pi ecosystem before reinventing extensions, packages, skills, themes, or tools.

## Development

```bash
npm test
```

The validation script checks:

- Pi package manifest shape.
- Extension load via Pi-bundled `jiti`.
- `/development-loop` and `/dev-loop` command registration.
- E2E smoke coverage for starting and completing one development-loop extension run.
- Skill frontmatter and expected bundle contents.
- README quick-start structure.
- Third-party notices and license copies.

## Attribution

See `THIRD_PARTY_NOTICES.md` and `licenses/`.
