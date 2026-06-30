---
name: skill-router
description: Route tasks to the right skill. Use for blank or ambiguous tasks.
---

# Skill Router

Use this as the front door when the user wants the agent to choose the workflow. Do not become a second planning layer: pick one primary skill, carry evidence, and act.

## Quick start

1. Read the user's task after `/skill:skill-router` or infer it from the latest request.
2. If no concrete task is given, route to `autonomous-codebase-improver` and start a safe repo-improvement slice.
3. If a task is given, choose exactly one primary skill from the routing table.
4. Load that skill, hand it the task and evidence, then follow its workflow.
5. Only add a support skill when the primary skill explicitly reaches that seam.

## Routing table

| Task shape | Primary skill |
| --- | --- |
| No task, "do something useful", "improve this repo" | `autonomous-codebase-improver` |
| Broken, failing, flaky, slow, throwing | `diagnose` |
| Find one bug without a specific report | `bug-harvest` |
| New behavior with clear expected output | `tdd` |
| Architecture, refactor, seams, testability | `technical-auditor` Architecture mode |
| One noisy folder split or guarded folder refactor | `skill-folder-refactor` |
| Proven duplication/shared-code cleanup | `share-code` |
| UI, visual design, layouts, accessibility | `ui-design` |
| Pi extension, provider, package resource | `pi-extensions-helper` |
| Skill creation or skill edits | `write-a-skill` |
| Project docs, README, architecture docs, onboarding, wiki | `wiki-docs` |
| Research/survey/literature or OSS study | `research-forge` |
| Commit/push/ship finished work | `git-commit-push` |
| Planning into PRD/issues/triage/handoff | `to-prd`, `to-issues`, `triage`, or `handoff` |
| Over-engineering review or deletion pass | `ponytail-review` or `ponytail-audit` |

## Ambiguity rules

- Pick the smallest reversible workflow with the clearest validation signal.
- Prefer specific skills over broad ones.
- Do not stack skills up front.
- Ask one question only when multiple routes would change product intent, risk, or ownership.

## Handoff shape

```text
skill-router handoff:
- task:
- selected skill:
- evidence:
- success signal:
```

## Red lines

- Do not use routing as approval for destructive actions, deploys, publish, secrets, dependency upgrades, force-push, rebase, or broad rewrites.
- Do not override a specialist skill's stricter red lines.
- Do not route to autonomous code changes when the user asked only for research, review, or explanation.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
