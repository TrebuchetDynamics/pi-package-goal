# pi-package-goal

A Pi package that bundles curated agent skills for goal discipline, safe git delivery, engineering workflows, Pi ecosystem work, and modern web guidance, plus a `/understand` bridge extension for [Understand-Anything](https://github.com/Lum1104/Understand-Anything).

## Quick start

### Step 1: Install Pi

Install Pi from [pi.dev](https://pi.dev), then confirm the `pi` command works:

```bash
pi --version
```

### Step 2: Install this package

Global install:

```bash
pi install git:github.com/TrebuchetDynamics/pi-package-goal
```

Project-local install, for a team repo:

```bash
pi install -l git:github.com/TrebuchetDynamics/pi-package-goal
```

After installing or updating, run this inside Pi:

```text
/reload
```

### Step 3: Use the bundled skills and extension

Pi loads skills on demand. You can invoke them naturally or with `/skill:<name>` when skill commands are enabled.

Examples:

```text
/skill:goal keep working until the README install flow is clear
/skill:git-commit-push audit
/skill:git-commit-push commit and push the current safe changes
/skill:tdd add coverage for the parser edge case
/skill:diagnose debug the failing npm test
```

The package also registers `/understand`. On first use it prompts to clone `Lum1104/Understand-Anything` into `~/.understand-anything/repo`, then loads the upstream Understand-Anything skills under the hood.

```text
/understand
/understand src/frontend --language zh
/understand dashboard
/understand chat How does the payment flow work?
/understand diff
/understand agent
/understand agent codebase-map-understand.md
/understand agent @frontend
/understand explain src/auth/login.ts
/understand onboard
/understand domain
/understand knowledge ~/path/to/wiki
/understand update
```

## Included extension

- `/understand` — bridge command that installs/updates the upstream Understand-Anything checkout and dispatches to its real skill workflows.
- Direct aliases: `/understand-dashboard`, `/understand-chat`, `/understand-diff`, `/understand-explain`, `/understand-onboard`, `/understand-domain`, `/understand-knowledge`.

The extension honors `UA_DIR` and `UA_REPO_URL`, matching the upstream installer defaults. `/understand agent` reads `.understand-anything/knowledge-graph.json` and writes `codebase-map-understand.md` by default for future LLM agents. `/understand agent @frontend` writes `frontend-codebase-map-understand.md`.

## Included skills

Delivery and goal discipline:

- `goal` — in-conversation objective tracking with completion audit.
- `git-commit-push` — audits worktree changes, runs validation, commits safe in-scope work, and pushes only after evidence is green.
- `autoreview` — structured closeout review using an available external helper.
- `lgtm` and `caveman` — approval handling and terse communication modes.

Engineering workflows:

- `tdd`, `diagnose`, `improve-codebase-architecture`, `prototype`, `grill-me`, `grill-with-docs`.
- `to-prd`, `to-issues`, `triage`, `handoff`, `writing-shape`, `zoom-out`.

Pi and web ecosystem:

- `pi-ecosystem-scout`, `pi-extensions-helper`, `write-a-skill`.
- `modern-web-guidance`, `chrome-extensions`.
- `greploop` for explicit Greptile-driven review cleanup.

## Git Commit Push skill

Use `git-commit-push` when implementation work appears complete and you want delivery guarded by real git and validation evidence.

The skill:

1. inspects repo instructions and git state;
2. reviews changed/untracked files for secrets, local state, generated junk, and unrelated work;
3. runs requested or inferred validation, including `git diff --check`;
4. commits only safe in-scope changes;
5. pushes to the current upstream; and
6. reports final markers:

```text
GIT_COMMIT_PUSH_VALIDATED: yes|no
GIT_COMMIT_PUSH_DECISION: shipped|blocked|review_needed
```

It does not deploy, publish, force-push, rewrite history, rebase, or merge remote changes unless explicitly asked.

## Package shape

This package ships curated skills and one Pi extension.

Package resources are declared in `package.json` with both `pi.extensions` and `pi.skills`:

```json
{
  "pi": {
    "extensions": ["./extensions/understand.js"],
    "skills": ["./skills"]
  }
}
```

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
