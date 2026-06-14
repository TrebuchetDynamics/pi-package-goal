# Clean-Context Advisor + Reviewer Pattern — Design

Date: 2026-06-13
Status: Approved scope; pending spec review

## Background

A widely-shared Reddit post ("My powerful Pi agent Setup", r/PiCodingAgent) describes a
context-discipline-first agent build. Its three load-bearing ideas are forking
(`pi-fork`), never-forget memory (`pi-observational-memory`), and two clean-context
subagents copied from Claude Code: an **advisor** (architecture/product strategy) and a
**reviewer** (code quality, security, UX).

The package already covers the post's codemapper (`/understand`) and token-optimizer
(`rtk`) ideas, and has review-adjacent skills (`autoreview`, `lgtm`, `grill-me`,
`grill-with-docs` council mode). It does **not** make the advisor/reviewer roles
first-class, and the existing `council-review` runs "local role lenses" inside the main
context. A commenter on the post captured the gap precisely: *"in same session models
tend to pushback their decisions."* The value of an advisor/reviewer comes from
**unbiased, clean context**, not from role-play in the working window.

This design adds that pattern as bundled guidance, without taking on the heavier lifts
(no bundled fork/subagent extension, no observational-memory). It works standalone and
gets *better* when the host exposes a fork/subagent/task tool.

## Goals

- Make **advisor** and **reviewer** first-class, capability-aware delegation roles.
- Treat context isolation as the default behavior; degrade honestly when unavailable.
- Reuse existing review/council machinery instead of duplicating it.
- Stay within "sharpen existing skills, no new heavy extension" scope.

## Non-goals

- No bundled `pi-fork` / `pi-minimal-subagent` extension or new dependency.
- No observational-memory / custom compaction.
- No new slash command or extension. No standalone skill with its own command surface.
- No change to how `autoreview`'s external helper script works.

## Architecture

One new shared reference, cross-linked from the skills that already do plan-time or
change-time review. The shared reference is the single source of truth for the roles and
the dispatch/degradation mechanics; existing skills link to it rather than restating it.

### Component 1 — `skills/shared/CLEAN-CONTEXT-DELEGATION.md` (new)

A shared contract peer to `COMMON-CONTRACT.md`, with these sections:

1. **Two roles**
   - **Advisor** — strategic/architecture/product second opinion on a *plan or decision,
     before execution*. Use for high-leverage or cross-cutting decisions; skip for small
     reversible choices.
   - **Reviewer** — code quality / security / UX second opinion on *changes, after
     execution*. Use before completion/ship on non-trivial diffs.

2. **Clean-context briefing rule (the core lesson)**
   - Brief the delegate with the objective + artifact (plan, or diff + intent) +
     constraints.
   - Do **not** include the main agent's own justification chain or preferred answer —
     that is exactly what biases the delegate toward agreement.
   - State what verdict you need back (e.g., "name the top risk and one alternative").

3. **Consuming the verdict**
   - Advisory only; never blind-apply. Verify codebase claims against live source
     (inherits `COMMON-CONTRACT.md` verification rules and codebase-map guidance).
   - On disagreement between delegate and main agent, surface the trade-off; ask the
     smallest owner-decision question only if evidence does not resolve it.

4. **Capability degradation**
   - **If the host exposes a clean-context dispatch tool** (fork, subagent, or task
     tool): spawn one delegate with a clean context and the briefing above.
   - **Otherwise**: run a single role-lens pass in the current context **and say so** —
     explicitly label it as an in-context lens lacking context isolation, so the user
     knows it is the weaker fallback. This reuses the `council-review.md` local-lens
     framing.
   - Never claim a clean-context second opinion was obtained when it was an in-context
     lens.

5. **Scope guardrails**
   - Reviewer does not run nested reviewers or reviewer panels by default (consistent
     with `autoreview`). Panels remain opt-in.
   - Delegation is opt-in / risk-justified, not mandatory on every action.

6. **Shared contract link** back to `COMMON-CONTRACT.md`.

### Component 2 — Cross-links from existing skills (sharpening, no duplication)

Each edit is a short pointer to the new shared contract plus a one-line role mapping.

- `skills/planning/goal/references/operating-contract.md`: at the plan/slice checkpoint,
  note the optional **advisor**; before the completion audit, note the optional
  **reviewer**. Both link to the shared contract. Keep advisory/optional framing —
  must not turn the goal loop into a mandatory two-delegate gate.
- `skills/delivery/autoreview/SKILL.md`: frame autoreview as the **reviewer** role; add a
  one-line note that a clean-context fork/subagent is the preferred dispatch when the host
  exposes one, with the external helper as the concrete implementation. Do not change the
  helper protocol.
- `skills/planning/grill-with-docs/references/council-review.md`: cross-link the
  **advisor** role and clarify that clean-context dispatch is the upgrade over in-session
  local lenses (the local-lens mode stays as the documented fallback).
- `skills/planning/lgtm/SKILL.md`: one-line cross-link on consuming a reviewer/advisor
  verdict as advisory input, not authority.
- `README.md`: one row in the "What you get" table (and, if it fits cleanly, the
  entrypoint table) pointing to the advisor/reviewer pattern.

## Data flow

```
plan/decision ──▶ [advisor: clean context | labeled in-context lens] ──▶ verdict (advisory)
                                                                            │ verify vs source
                                                                            ▼
                                                          main agent decides / asks owner
changes (diff) ──▶ [reviewer: clean context | autoreview helper | labeled lens] ──▶ findings
                                                                            │ verify, fix, retest
                                                                            ▼
                                                          completion audit / ship
```

## Error handling / failure modes

- No dispatch tool available → in-context lens, explicitly labeled. Never silently
  presented as a clean-context opinion.
- Delegate returns speculative or unverifiable claims → reject with a concise reason
  (inherits `autoreview` discipline).
- Delegate disagrees with main agent → surface trade-off; owner-decision question only if
  unresolved by evidence.
- Over-delegation risk → guardrail that delegation is opt-in / risk-justified.

## Testing

Follow the package's existing asset/skill test style (Node `*.test.mjs` under `tests/`,
wired into `npm test`). Add `tests/clean-context-delegation.test.mjs` asserting:

- `skills/shared/CLEAN-CONTEXT-DELEGATION.md` exists and has the required section
  headings (two roles, clean-context briefing, consuming the verdict, capability
  degradation, scope guardrails, shared-contract link).
- The cross-linking skills (`goal` operating-contract, `autoreview`, `council-review`,
  `lgtm`) each contain a working relative link to the new contract.
- The README references the pattern.
- Validate the new test is added to the `test:package` (or an appropriate) script in
  `package.json` so `npm test` runs it.

Run `npm test` and confirm green before completion.

## Open questions

None blocking. Wording of cross-links to be finalized during implementation to match each
skill's existing tone.
