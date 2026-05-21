# pi-package-development-loop

A Pi package for adapter-aware development loops plus a curated bundle of high-signal engineering and modern web skills.

## Install

```bash
pi install git:github.com/TrebuchetDynamics/pi-package-development-loop
```

For project-local installation:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-package-development-loop
```

After installing or updating, run `/reload` in Pi.

## Included Extension

### `/development-loop`

A visible, adapter-aware project loop that works across Gormes, Navivox, and generic Git projects.

Common commands:

```text
/development-loop adapters
/development-loop init
/development-loop start --iterations=3 providers
/development-loop start --iterations=5 --commit --push fix flaky tests
/development-loop status
/development-loop stop
```

Alias:

```text
/dev-loop status
```

Each iteration asks the agent to finish with:

```text
DEV_LOOP_VALIDATED: yes|no
DEV_LOOP_DECISION: continue|stop|blocked|done
```

Project config override lives at:

```text
.pi/development-loop.json
```

## Included Skills

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
- Skill frontmatter and expected bundle contents.
- Third-party notices and license copies.

## Attribution

See `THIRD_PARTY_NOTICES.md` and `licenses/`.
