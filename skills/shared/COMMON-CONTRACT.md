# Shared Skill Contract

Use this contract as the baseline for every packaged skill unless a skill's own instructions are stricter.

## Repo and ownership check

- Inspect `git status --short --branch` before editing files or relying on worktree state.
- Read repo instructions (`AGENTS.md` and nearby docs) before making changes.
- Treat dirty files as evidence, not permission. Do not overwrite unrelated user work.
- Prefer answering factual questions from code, tests, docs, manifests, or issue metadata instead of asking the user.

## Graphify codebase evidence

When a task needs codebase-wide relationship, architecture, data-flow, refactor, onboarding, or impact evidence, and `graphify-out/graph.json` exists, query Graphify before broad manual exploration. Treat graph facts as leads only: verify named files, callers, and tests against live source before editing or reporting. Full guidance: [Graphify codebase graph](GRAPHIFY-CODEBASE-GRAPH.md).

## Verification evidence

Before declaring a skill outcome done, name the evidence that proves it: files inspected or changed, commands run, tests passed, issue/PR links, docs updated, graph queries used, or explicit owner decisions. If validation is not applicable, say why.

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
