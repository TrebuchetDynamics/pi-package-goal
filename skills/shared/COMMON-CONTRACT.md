# Shared Skill Contract

Use this contract as the baseline for every packaged skill unless a skill's own instructions are stricter.

## Repo and ownership check

- Inspect `git status --short --branch` before editing files or relying on worktree state.
- Read repo instructions (`AGENTS.md` and nearby docs) before making changes.
- Treat dirty files as evidence, not permission. Do not overwrite unrelated user work.
- Prefer answering factual questions from code, tests, docs, manifests, or issue metadata instead of asking the user.

## Codebase map evidence

Before broad codebase exploration, check whether `codebase-map-understand.md` exists. When the task needs relationship, architecture, data-flow, refactor, onboarding, review, impact, route/component, package-resource, or cross-module evidence, consult the codebase map first when present. If no map exists and the task is broad enough to benefit from one, ask before generating new artifacts unless the user has already requested map generation. Treat map facts as leads only: verify named files, callers, and tests against live source before editing or reporting.

## Bundled resource paths

When a skill references bundled scripts, examples, templates, or other files, resolve those paths relative to that skill's own directory (the parent of `SKILL.md`) and invoke helper commands with absolute paths or package-manager `--prefix` options. Do not assume the user's project cwd contains the skill's `scripts/` or `resources/` folders, and do not install bundled validator dependencies into the user's project unless the skill explicitly says to.

## Verification evidence

Before declaring a skill outcome done, name the evidence that proves it: files inspected or changed, commands run, tests passed, issue/PR links, docs updated, codebase maps used, or explicit owner decisions. If validation is not applicable, say why.

## Handoff shape

When handing to another skill, preserve:

```text
handoff evidence:
- trigger: <why this skill is stopping>
- artifact: <file/command/test/doc/decision produced>
- next skill: <skill to continue with>
- success signal: <what proves the next step worked>
```

## Safety defaults

- Do not perform destructive actions, deploy/publish, spend money, expose secrets, rewrite history, force-push, rebase/merge remote changes, or broaden scope without explicit approval.
- Redact secrets and personal data from reports, handoffs, issues, PRDs, and generated docs.
- If ownership, credentials, legal/licensing, or production impact is unclear, stop with a blocker or ask one focused owner-decision question.
