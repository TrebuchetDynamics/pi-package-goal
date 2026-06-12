---
name: lgtm
description: Use when the user says "lgtm", "looks good to me", "sounds good", "approved", "go ahead", accepts a recommendation, or gives ambiguous approval that should choose the best safe continuation.
---

# LGTM

Treat the user's approval as permission to continue with the most recent concrete recommendation or plan you proposed. If the approval is ambiguous, infer the best safe continuation from the prior assistant message instead of re-asking by default.

## What To Do

1. Identify the recommendation, option, design, or plan the user's approval most likely accepts.
2. Resolve ambiguity with the Approval Resolution Protocol below.
3. Treat the resolved recommendation as selected.
4. Continue with the next planned action without asking the same approval question again.
5. Briefly state what was accepted, then act with the relevant specialist skill or workflow.

## Approval Resolution Protocol

Use this protocol as the module interface for approval handling: approval phrase plus recent assistant context goes in; one accepted action, one blocker, or one clarifying question comes out.

Prefer the first matching safe candidate:

1. An explicit `If you say lgtm` action from the latest assistant message.
2. A `Recommended next action` from a Goal slice result.
3. A `Top recommendation` from an architecture review.
4. The #1 candidate from a `candidates-folder-refactor` report.
5. The latest named option or plan the assistant explicitly recommended.
6. If multiple plausible candidates remain, choose the safest bounded continuation: the smallest reversible action with the clearest validation path and no red-line side effects.

Ask only when no safe bounded action can be inferred, when the inferred action would cross a guardrail below, or when ownership/product intent is genuinely unclear. When asking, include your recommended interpretation so the user can approve it directly.

If the approved recommendation came from a Goal slice result, treat `Recommended next action` / `If you say lgtm` as the approved plan and continue that exact next action without restating the whole goal.

If the approved recommendation came from an architecture review, preserve the review's evidence base: treat approval of `Top recommendation` as selecting that candidate, carry any codebase map query/results from the review, inspect the exact live files before editing, and either make the smallest safe mechanical cleanup with validation or enter the architecture grilling loop for design-bearing refactors.

If the approved recommendation came from `candidates-folder-refactor`, treat `lgtm` as selecting the #1 top candidate and immediately run `/folder-refactor <candidate #1>` so the extension invokes `skill-folder-refactor` with scan/audit/state guardrails. Carry the candidate metrics, suggested boundary, inspected paths, and validation hints as handoff evidence. Do not ask the owner to pick again unless #1 is blocked by a red line.

Examples:

- Assistant: "Recommended: create a root README and keep app/README Flutter-local. Approve?"
- User: "lgtm"
- You: "Accepted: create the root README and keep app/README Flutter-local. I’ll write it now."
- Assistant: "Option A is safest; Option B is faster but riskier. Recommended next action: implement Option A."
- User: "sounds good"
- You: "Accepted: Option A, the safest bounded continuation. I’ll implement it now."

## Guardrails

Do not use `lgtm` as approval for:

- destructive actions
- spending money
- publishing secrets or private data
- production deployments
- irreversible Git history changes
- broad scope not already proposed

For those, ask for explicit confirmation naming the risky action.

If there is no clear prior recommendation after applying the Approval Resolution Protocol, ask one clarifying question: "What should I treat as approved?" If `codebase-map-understand.md` exists and approval is for codebase-wide exploration/refactor/review, use codebase map to recover the relevant candidate context before acting.

## Common Mistakes

- Do not reinterpret `lgtm` as a new request.
- Do not restart brainstorming after approval.
- Do not ask "do you want me to proceed?" when the user already approved.
- Do not expand scope beyond the accepted recommendation.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
