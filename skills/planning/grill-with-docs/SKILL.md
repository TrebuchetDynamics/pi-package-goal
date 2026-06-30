---
name: grill-with-docs
description: Stress-test plans against project language and documented decisions. Use when reviewing a plan against CONTEXT.md, ADRs, domain terms, architecture decisions, or asking for a docs-council critique.
---

# Grill With Docs

Stress-test a plan against the repo's glossary, ADRs, code, and validation reality. This is `grill-me` with documented language and durable decisions in scope.

## Quick start

1. Restate the plan in one sentence and name the current decision branch.
2. Inspect repo instructions, git state, `CONTEXT.md`/`CONTEXT-MAP.md`, ADRs, relevant tests/manifests, live code, and `codebase-map-understand.md when present` for cross-module relationship leads.
3. Classify dirty files as in-scope evidence, unrelated owner work, or blocker before using them.
4. Answer evidence questions from docs/code; ask only one owner-decision question at a time.
5. Put `Recommended answer:` before `Why it matters:`.
6. Update `CONTEXT.md` only after the owner accepts the terminology. Offer ADRs only for hard-to-reverse trade-offs.

## Operational basis

Read before asking:

- `CONTEXT-MAP.md` first in multi-context repos, then the relevant context-local `CONTEXT.md` and ADRs;
- root `CONTEXT.md` and `docs/adr/` in single-context repos;
- README, task docs, manifests, tests, and live code that bear on the plan;
- `codebase-map-understand.md` for relationship/caller/impact leads when the plan spans modules, then verify named files;
- [Council review mode](references/council-review.md) when a docs-council, clean-context advisor, or external-model critique is requested or risk-justified.

Create docs lazily: create `CONTEXT.md` only when the first term is accepted; create `docs/adr/` only when the first ADR is accepted.

## Workflow

Interview the owner by resolving dependencies between decisions one-by-one. For each branch:

1. Identify the dependency: state which prior decision this branch depends on, or say `root branch`.
2. Check glossary fit: conflict with `CONTEXT.md`, term ambiguity, aliases to avoid, and context ownership.
3. Check documented decisions: ADRs, README promises, package/resource boundaries, and existing constraints.
4. Check code reality: tests/manifests/source behavior that confirms or contradicts the plan.
5. Run a docs-council pass when the branch crosses language, architecture, and delivery risk, or when the user asks for council/advisor input.
6. Ask exactly one owner-decision question, then wait.
7. After the answer, restate the resolved decision, apply accepted doc updates, and move to the next dependent branch.

Prefer evidence over questions. Do not proceed to dependent branches until the current decision is answered, evidenced, or blocked.

## Council and delegation

Default council is local docs-council role lenses: language steward, architecture skeptic, and delivery realist. Label it as local/in-context unless a clean-context dispatch tool or approved external LLM was actually used.

When a clean-context advisor tool is available, prefer one advisor delegate for high-leverage plan decisions and brief it without your preferred answer. Follow [clean-context delegation](../../shared/CLEAN-CONTEXT-DELEGATION.md): verdicts are advisory and codebase claims must be verified locally.

Use external LLMs only when explicitly requested/approved. Disclose network/cost/credential implications, do not read credential files, and never imply external models were queried when they were not.

## Updating docs

When a term is accepted, re-check `git status --short --branch`, update the relevant `CONTEXT.md` inline, and keep the entry glossary-shaped using [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md). `CONTEXT.md` is not a spec or scratch pad; do not add general programming concepts or implementation details.

If the user has not accepted the canonical term, keep grilling instead of writing.

Offer an ADR only when all three are true: hard to reverse, surprising without context, and a real trade-off. If accepted, write the smallest ADR using [ADR-FORMAT.md](./ADR-FORMAT.md). Otherwise continue grilling.

## Skill handoffs

- From `technical-auditor` / `improve-codebase-architecture`: preserve selected candidate, evidence base, and success signal; settle terms, seams, and ADR-sensitive decisions before edits.
- To `prototype`: hand off competing state/interface options when a throwaway model answers faster than discussion.
- To `tdd`: hand off accepted behavior, edge scenarios, public interface, and validation target.
- To `goal`: report resolved branch, evidence, doc changes, and next branch.

## Skill contract

### Entry protocol

- Clear plan: scan docs/code, then grill the first load-bearing branch.
- Medium ambiguity: propose the likely context and ask one context/ownership question.
- High risk, production impact, external-model request, or unclear dirty-file ownership: stop and name the blocker or approval needed.

### Topology check

Before each question, verify context ownership, prior-decision dependency, validation path, blast radius, dirty-file classification, and doc-update target.

### Verification gate

Before declaring the grilling useful, report evidence checked and ensure at least one is true: next implementation decision is unblocked; council critiques were synthesized or explicitly skipped; `CONTEXT.md` was updated; an ADR was created or rejected with reason; a blocker/owner decision is named with the exact next question.

### Red lines

Do not ask broad questionnaires, edit production code, write docs for unaccepted decisions, use unrelated dirty files as plan evidence, add implementation details to `CONTEXT.md`, create ADRs for obvious/reversible choices, or run paid/network external LLM calls without explicit approval.

### Output contract

Use this shape for each question:

```text
Decision branch: <what part of the plan this unlocks>
Question: <one hard decision>
Recommended answer: <your best answer and why>
Council synthesis: none | <local docs-council/advisor/external insight summary>
Why it matters: <what this unlocks or prevents>
Evidence checked: <files/docs/tests inspected, graph/map use, dirty-path classification>
Doc impact: none | CONTEXT.md term | ADR candidate
```

## Example

User: `Grill this auth refactor against our docs.`

Agent: read `CONTEXT.md`, ADRs, auth tests/source, and map leads; identify the root branch; ask one decision about ownership/term boundary with a recommended answer and doc impact.

## References

- [Council review mode](references/council-review.md)

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
