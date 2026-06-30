---
name: grill-me
description: Stress-test a plan or design in self-answer-first mode. Use when the user wants plan gaps, fewer unnecessary questions, hard decision pressure, or says "grill me". Do not use for glossary/ADR critique; use grill-with-docs.
---

# Grill Me

Stress-test the plan until only real owner decisions remain. Answer easy questions from evidence; ask one hard question only when the agent cannot safely decide.

## Quick start

1. Restate the plan or assumption being tested in one sentence.
2. List the hidden gaps internally: requirement gaps, design branches, risks, validation, rollout/order, and ownership.
3. Inspect available evidence before asking: docs, code, tests, git state, prior messages, and `codebase-map-understand.md` for cross-module plans.
4. Self-answer every easy question with evidence or a reversible default.
5. Ask one hard owner-decision question, with your recommended answer and consequence. If no hard question remains, state the assumptions and proceed.

## Operational basis

Use repo evidence before user questions:

- `git status --short --branch` and dirty-file ownership from the shared contract;
- README, task docs, issue/plan text, manifests, and relevant tests;
- live source for claims about current behavior;
- `codebase-map-understand.md` when the plan spans modules, then verify named files;
- `grill-with-docs` instead when the uncertainty is project language, glossary terms, ADRs, or documented decisions.

## Workflow

For each branch of the plan:

1. Name the branch and what it unlocks.
2. Separate evidence questions from owner decisions.
3. Resolve evidence questions by inspection or by a safe default.
4. Challenge the plan on blast radius, validation signal, ordering, rollback, data/security risk, and product intent.
5. Ask only the smallest remaining owner-decision or pivot question.
6. After the answer, summarize the resolved decision and move to the next dependent branch.

Do not ask checklist-style questions. Do not ask users to confirm facts the repo can answer. Do not brainstorm alternatives when one boring reversible default works.

## Skill contract

### Entry protocol

- Trivial: proceed directly and state the assumptions.
- Medium ambiguity: choose the safest baseline and ask only the missing hard question.
- High ambiguity/risk: stop on the owner decision, risk acceptance, irreversible direction, or pivot.

### Topology check

Before asking, confirm whether state/ownership, validation, blast radius, and ordering are clear. If one is unclear and evidence cannot answer it, that is the next question.

### Verification gate

A useful grilling pass ends with at least one of: a resolved assumption set, one answered hard question, a named pivot, a blocker with evidence, or a handoff to `grill-with-docs`, `prototype`, `tdd`, or implementation.

### Red lines

Do not make product decisions for the owner, approve irreversible or risky changes, edit docs/code as part of grilling, or continue past an unresolved hard decision.

### Output contract

Use this compact shape when asking:

```text
Decision branch: <branch>
Question: <one hard decision>
Recommended answer: <default and why>
Consequence: <what accepting it unlocks or risks>
Evidence checked: <files/docs/tests/commands or none>
```

## Example

User: `grill me on this migration plan`

Agent: inspect the plan and repo evidence, self-answer rollout/test questions where possible, then ask the first irreversible sequencing or risk-acceptance question with a recommended answer.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
