---
name: grill-with-docs
description: Stress-test plans against project language and documented decisions. Use when reviewing a plan against CONTEXT.md, ADRs, domain terms, or architecture decisions.
---

# Grill With Docs

Stress-test a plan against the repo's domain model and documented decisions until there is shared understanding. Walk the design tree branch-by-branch, resolving dependencies between decisions one-by-one. Ask hard questions one at a time, recommend an answer first, and update docs only when language or decisions crystallise.

## Quick start

1. Restate the plan and the next hard uncertainty.
2. Inspect repo instructions, git state, `CONTEXT.md`/`CONTEXT-MAP.md`, ADRs, relevant tests/manifests, `codebase-map-understand.md when present`, and `graphify-out/graph.json` when present. Query Graphify for relationship evidence when the plan spans modules, then verify named files. Classify dirty files as in-scope evidence, unrelated owner work, or blocker before using them.
3. Answer anything the code/docs can answer; ask the user only owner-decision questions.
4. Ask one question at a time and wait for feedback before continuing. For each question, include your recommended answer.
5. Capture resolved domain terms in `CONTEXT.md` immediately; offer ADRs sparingly for durable trade-offs.

## Entry protocol

- If the plan is clear: begin grilling immediately after the repo/documentation scan.
- If scope is medium-ambiguous: propose the most likely context and ask one clarifying question.
- If scope is high-risk, production-impacting, or ownership of dirty files is unclear: stop and identify the blocker before editing docs.

## Documentation topology

Most repos have one context:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Repos with multiple bounded contexts should have `CONTEXT-MAP.md` at the root pointing to context-local `CONTEXT.md` and `docs/adr/` directories. If `CONTEXT-MAP.md` exists, read it first and choose the relevant context. If unclear, ask which context owns the plan.

Create docs lazily: create `CONTEXT.md` only when the first term is resolved, and create `docs/adr/` only when the first ADR is accepted.

## Grilling loop

Interview relentlessly about every load-bearing aspect of the plan. Walk the design tree branch-by-branch, resolving dependencies between decisions in order. Do not proceed to a dependent branch until the current decision is answered, evidenced, or blocked.

For each branch:

- Identify the dependency: state which prior decision this branch depends on, or say `root branch`.
- Challenge against the glossary: if the plan conflicts with `CONTEXT.md`, call it out immediately.
- Sharpen fuzzy language: propose one canonical term and list aliases to avoid.
- Use concrete scenarios: invent edge cases that test boundaries between concepts.
- Cross-reference code: if the user says behaviour works one way but code says another, surface the contradiction.
- Prefer evidence over questions: inspect files/tests/manifests instead of asking questions the repo can answer.
- Treat dirty worktree content as evidence, not permission: only cite it after classifying ownership and relevance.
- Separate evidence questions from owner decisions: code/docs answer evidence questions; the user answers trade-offs, priorities, and domain intent.
- Ask exactly one owner-decision question at a time and wait for feedback.

Question format:

```text
Decision branch: <what part of the plan this question unlocks>
Question: <one hard decision>
Recommended answer: <your best answer and why>
Why it matters: <what this unlocks or prevents>
Evidence checked: <files/docs/tests inspected, graph query if used, dirty-path classification, or none yet>
Doc impact: none | CONTEXT.md term | ADR candidate
```

After the user answers, restate the resolved decision in one sentence, apply any accepted doc update immediately, then move to the next dependent branch.

## Updating CONTEXT.md

When a term is resolved and accepted, update the relevant `CONTEXT.md` inline; do not batch terms until the end. Use [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md). If the user has not accepted the canonical term, keep grilling instead of writing.

`CONTEXT.md` is a glossary, not a spec or scratch pad. Keep it free of implementation details. Only add domain concepts specific to the project context; do not add general programming concepts.

## ADR discipline

Offer an ADR only when all three are true:

1. **Hard to reverse** — changing later has meaningful cost.
2. **Surprising without context** — a future reader would wonder why.
3. **Real trade-off** — genuine alternatives were considered.

If the user accepts, write the ADR using [ADR-FORMAT.md](./ADR-FORMAT.md). If any criterion is missing, skip the ADR and continue grilling.

## Skill handoffs

- From `improve-codebase-architecture`: preserve the selected candidate, evidence base, and success signal; use grilling to settle domain terms, seams, and ADR-sensitive decisions before production-code edits.
- To `tdd`: hand off the chosen behaviour, public interface, edge scenarios, and validation target.
- To `prototype`: hand off competing interface/state options when a throwaway model can answer the question faster than discussion.
- To `goal`: report compact evidence after each resolved branch so broad plans can continue slice-by-slice.

## Verification gate

Before declaring the grilling useful, report the evidence checked and ensure at least one of these is true:

- the next implementation decision is unblocked and stated plainly;
- `CONTEXT.md` was updated with a resolved term;
- an ADR was created or explicitly rejected with reason;
- a blocker/owner decision is named with the exact question to answer next.

## Red lines

- Do not ask broad questionnaires; ask one hard question at a time.
- Do not edit production code as part of grilling.
- Do not write docs for decisions the user has not accepted.
- Do not use unrelated dirty files as plan evidence or overwrite them while updating docs.
- Do not add implementation details to `CONTEXT.md`.
- Do not create ADRs for obvious, reversible, or non-trade-off choices.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
