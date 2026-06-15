---
name: grill-with-docs
description: Stress-test plans against project language and documented decisions. Use when reviewing a plan against CONTEXT.md, ADRs, domain terms, architecture decisions, or asking for a docs-council critique.
---

# Grill With Docs

Stress-test a plan against the repo's domain model and documented decisions until there is shared understanding. This adapts the upstream Matt Pocock `grill-with-docs` discipline for Pi: relentless one-question-at-a-time interviewing, codebase exploration before asking, inline glossary updates, and sparse ADRs.

## What to do

Interview the owner relentlessly about every load-bearing aspect of the plan. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer first. Ask exactly one question at a time and wait for feedback before continuing. If a question can be answered by exploring the codebase or docs, explore instead of asking.

## Quick start

1. Restate the plan in one sentence, name the current design branch, and identify the next hard uncertainty.
2. Inspect repo instructions, git state, `CONTEXT.md`/`CONTEXT-MAP.md`, ADRs, relevant tests/manifests, and codebase-map-understand.md when present. Query the map for relationship evidence when the plan spans modules, then verify named files. Classify dirty files as in-scope evidence, unrelated owner work, or blocker before using them.
3. Answer anything the code/docs can answer; ask the user only owner-decision questions.
4. If the user asks for a council, or the decision is high-leverage, run a docs-council pass before asking: language steward, architecture skeptic, delivery realist. Use external LLMs only when explicitly requested/approved and available.
5. Ask one question at a time and wait for feedback. Include your recommended answer.
6. Capture accepted domain terms in `CONTEXT.md` immediately; offer ADRs sparingly for durable trade-offs.

## Entry protocol

- Clear plan: begin grilling after the repo/documentation scan.
- Medium ambiguity: propose the most likely context and ask one clarifying question.
- High risk, production impact, or unclear dirty-file ownership: stop and identify the blocker before editing docs.
- Council request: disclose whether this is a local docs-council pass or approved external LLM consultation; never imply external models were queried when they were not.

## Documentation topology

Most repos have a root `CONTEXT.md` and optional `docs/adr/`. Multi-context repos should have `CONTEXT-MAP.md` pointing to context-local `CONTEXT.md` and ADR directories. If `CONTEXT-MAP.md` exists, read it first and choose the relevant context; if unclear, ask which context owns the plan.

Create docs lazily: create `CONTEXT.md` only when the first term is resolved, and create `docs/adr/` only when the first ADR is accepted.

## Grilling loop

Interview relentlessly about every load-bearing aspect of the plan. Walk the design tree branch-by-branch, resolving dependencies between decisions in order. Do not proceed to a dependent branch until the current decision is answered, evidenced, or blocked.

For each branch:

- Identify the dependency: state which prior decision this branch depends on, or say `root branch`.
- Challenge against the glossary: if the plan conflicts with `CONTEXT.md`, call it out immediately.
- Sharpen fuzzy language: propose one canonical term and list aliases to avoid.
- Run council mode when useful: separate language, architecture, and delivery critiques, then synthesize one recommendation with attribution.
- Use concrete scenarios: invent edge cases that test boundaries between concepts.
- Cross-reference code: if user intent conflicts with code behaviour, surface the contradiction.
- Prefer evidence over questions: inspect files/tests/manifests instead of asking questions the repo can answer.
- Treat dirty worktree content as evidence, not permission: only cite it after classifying ownership and relevance.
- Separate evidence questions from owner decisions: code/docs answer evidence questions; the user answers trade-offs, priorities, and domain intent.
- Make progress through the design tree: after each answer, summarize the resolved branch and move to the next dependent branch instead of restarting the interview.
- Ask exactly one owner-decision question at a time and wait for feedback.

Useful challenge shapes adapted from upstream:

- Glossary conflict: "`CONTEXT.md` defines **Cancellation** as an order-level event, but this plan uses it for line-item removal. Which meaning is correct?"
- Fuzzy term split: "You said **account** — do you mean Customer, User, workspace, or billing account? Recommended answer: pick one canonical term and list the others under `_Avoid_`."
- Code contradiction: "The code cancels whole Orders, but the plan says partial cancellation is allowed. Should the code change, or is the plan using the wrong term?"
- Scenario probe: "If a customer edits an order after invoice creation, which context owns the truth, and what event crosses the boundary?"

Question format:

```text
Decision branch: <what part of the plan this question unlocks>
Question: <one hard decision>
Recommended answer: <your best answer and why>
Council synthesis: none | <language/architecture/delivery or external-model insight summary>
Why it matters: <what this unlocks or prevents>
Evidence checked: <files/docs/tests inspected, graph query if used, dirty-path classification, or none yet>
Doc impact: none | CONTEXT.md term | ADR candidate
```

After the user answers, restate the resolved decision in one sentence, apply any accepted doc update immediately, then move to the next dependent branch.

## Updating docs

When a term is resolved and accepted, update the relevant `CONTEXT.md` inline; do not batch terms until the end. Use [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md). If the user has not accepted the canonical term, keep grilling instead of writing.

`CONTEXT.md` is a glossary, not a spec or scratch pad. Keep it free of implementation details. Only add domain concepts specific to the project context; do not add general programming concepts.

Offer an ADR only when all three are true: the decision is hard to reverse, surprising without context, and the result of a real trade-off. If accepted, write it with [ADR-FORMAT.md](./ADR-FORMAT.md); otherwise continue grilling.

## Skill handoffs

- From `improve-codebase-architecture`: preserve selected candidate, evidence base, and success signal; settle domain terms, seams, and ADR-sensitive decisions before code edits.
- To `tdd`: hand off behaviour, public interface, edge scenarios, and validation target.
- To `prototype`: hand off competing interface/state options when a throwaway model can answer faster than discussion.
- To `goal`: report compact evidence after each resolved branch so broad plans can continue slice-by-slice.

## Verification gate

Before declaring the grilling useful, report evidence checked and ensure at least one is true: next implementation decision is unblocked; council critiques were synthesized or explicitly skipped; `CONTEXT.md` was updated; an ADR was created or rejected with reason; a blocker/owner decision is named with the exact next question.

## Red lines

- Do not ask broad questionnaires; ask one hard question at a time.
- Do not edit production code as part of grilling.
- Do not write docs for decisions the user has not accepted.
- Do not use unrelated dirty files as plan evidence or overwrite them while updating docs.
- Do not add implementation details to `CONTEXT.md`.
- Do not create ADRs for obvious, reversible, or non-trade-off choices.
- Do not make paid/network external LLM calls, read credential files, or run council scripts without explicit approval.

## References

- [Council review mode](references/council-review.md)

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
