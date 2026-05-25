# pi-package-goal

A Pi package that bundles curated agent skills and one `/understand` extension.

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
| Safe delivery | Audit changed files, run validation, commit only safe work, and push. | `git-commit-push` |
| Engineering loops | Debug, test-drive, prototype, review, or improve architecture. | `diagnose`, `tdd`, `prototype` |
| Planning and handoff | Turn context into PRDs/issues, triage work, summarize for the next agent. | `to-prd`, `to-issues`, `triage`, `handoff` |
| Pi ecosystem work | Scout, build, or review Pi skills/extensions/packages. | `pi-ecosystem-scout`, `pi-extensions-helper`, `write-a-skill` |
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

## Included extension: `/understand`

`/understand` bridges Pi to the upstream [Understand-Anything](https://github.com/Lum1104/Understand-Anything) project.

On first use it prompts to clone Understand-Anything into `~/.understand-anything/repo`, then dispatches to the upstream workflows. It honors `UA_DIR` and `UA_REPO_URL`, matching the upstream installer defaults.

Common commands:

| Command | Use it for |
| --- | --- |
| `/understand` | Build or refresh the current repo's knowledge graph. |
| `/understand src/frontend --language zh` | Understand a specific path with upstream options. |
| `/understand dashboard` | Open the upstream dashboard workflow. |
| `/understand chat How does auth work?` | Ask about the generated graph. |
| `/understand diff` | Summarize recent graph/code changes. |
| `/understand agent` | Write `codebase-map-understand.md` for future agents. |
| `/understand agent @frontend` | Write `frontend-codebase-map-understand.md`. |
| `/understand compare ../project-a ../project-b` | Compare two existing graphs and write a deterministic compare map. |
| `/understand refactor "auth flow"` | Generate a deterministic refactor plan from the current graph. |
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
- `/understand refactor [focus] [output.md]` requires the current repo graph and writes `refactor-plan-understand-refactor.md` by default.
- Refactor mode reads an existing output plan before overwriting it, combines that continuity with graph hotspots, live file checks, and related-test discovery, displays the generated plan inline, then asks which candidate to explore with `grill-with-docs`.
- Compare and refactor modes only generate deterministic Markdown files. Ask the LLM to reason over those files when you want analysis.

## Included skills

### Goal and delivery

| Skill | When to use it |
| --- | --- |
| `goal` | Start or continue a bounded objective inside the conversation; no-arg `goal` auto-discovers useful repo work. |
| `git-commit-push` | Ship completed work with worktree audit, validation, intentional staging, commit, and push. |
| `autoreview` | Run a structured closeout review before shipping. |
| `lgtm` | Continue after you approve the agent's latest plan or recommendation. |
| `caveman` | Switch to terse, low-token communication. |

### Engineering workflows

| Skill | When to use it |
| --- | --- |
| `tdd` | Add behavior test-first with a red-green-refactor loop. |
| `diagnose` | Reproduce and fix broken, flaky, or slow behavior. |
| `prototype` | Try a disposable design, state model, UI, or logic option before committing. |
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

Use `git-commit-push` when implementation work appears complete and you want delivery guarded by real git and validation evidence.

The skill:

1. reads repo instructions and git state;
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

This package ships curated skills and one Pi extension. Package resources are declared in `package.json` with both `pi.extensions` and `pi.skills`:

```json
{
  "pi": {
    "extensions": ["./extensions/understand.js"],
    "skills": ["./skills"]
  }
}
```

Package resources live under `extensions/`, `skills/`, `prompts/`, or `themes/`.

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
