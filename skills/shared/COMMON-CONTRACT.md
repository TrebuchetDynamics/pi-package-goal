# Shared Skill Contract

Use this contract as the baseline for every packaged skill. System, developer, and user instructions override it; specialist skill instructions may add stricter process, safety, or output-schema requirements but must not weaken this baseline.

## Default skill posture

Use Ponytail full mode by default for every packaged skill's implementation choices: YAGNI first, prefer deletion over addition, stdlib/native before dependencies, already-installed dependencies before new ones, fewest files, shortest safe diff. Follow `skills/communication/ponytail/SKILL.md` for the full ladder, but apply it smartly: specialist process, safety gates, required schemas, citations, accessibility, security, trust-boundary validation, and explicitly requested scope still win.

Ponytail is not a prose-compression requirement. Final replies should use normal compact technical prose: summarize first, avoid filler, keep vertical space reasonable, and offer detail on request. Use compact receipts like `validated: npm test ✅; changed: <paths>`. Use caveman style only when the user explicitly asks for `caveman`, `less tokens`, or similar; `normal mode` changes presentation only unless the Ponytail extension is active and interprets it as Ponytail-off. Repo hygiene, verification, handoff, and safety obligations always apply.

## Repo and ownership check

- Inspect `git status --short --branch` before editing files or citing dirty/uncommitted worktree content.
- Read repo instructions (`AGENTS.md` and nearby docs) before making changes.
- Treat dirty files as evidence, not permission. Do not overwrite unrelated user work.
- Prefer answering factual questions from code, tests, docs, manifests, or issue metadata instead of asking the user.

## Codebase map evidence

Before broad codebase exploration, check whether `codebase-map-understand.md` exists. When the task needs relationship, architecture, data-flow, refactor, onboarding, review, impact, route/component, package-resource, or cross-module evidence, consult the codebase map first when present. If no map exists and the task is broad enough to benefit from one, ask before generating new artifacts unless the user has already requested map generation. Generated Understand artifacts (`codebase-map-understand.md`, `.understand-anything/`) are local orientation aids unless a repo explicitly says otherwise; do not package or commit them by default. Treat map facts as leads only: verify named files, callers, and tests against live source before editing or reporting.

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
