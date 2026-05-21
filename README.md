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

## Development-loop instructions and tips

`/development-loop` sends the agent a scoped iteration prompt, watches for final markers, logs progress, and queues follow-up iterations until the loop stops.

Useful commands:

```text
/development-loop adapters
/development-loop init
/development-loop start --iterations=3 providers
/development-loop start --iterations=5 --commit --push fix flaky tests
/development-loop status
/development-loop stop
/development-loop restart --iterations=2 tighten docs
```

Tips:

- Start small: `--iterations=1` or `--iterations=3` is usually enough.
- Use `/development-loop init` to create `.pi/development-loop.json` for project defaults.
- Leave `--commit` and `--push` off unless you want the loop to handle git delivery.
- Keep one objective per run; stop and restart when the objective changes.
- If validation is red or credentials are needed, the loop should report `blocked`.
- Progress logs go to `.pi/development-loop/logs.jsonl` by default.

Each iteration must end with:

```text
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done
```

### Project-local configuration for any repo

Create `.pi/development-loop.json` when a repo needs its own adapter name, default objective, skills, or validation commands:

```json
{
  "adapter": "docs-loop",
  "defaultTopic": "improve documentation with tests",
  "skills": ["tdd", "verification-before-completion"],
  "preflightCommands": ["git status --short --branch"],
  "validationCommands": ["npm test", "git diff --check"],
  "maxIterations": 3,
  "commit": false,
  "push": false
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
