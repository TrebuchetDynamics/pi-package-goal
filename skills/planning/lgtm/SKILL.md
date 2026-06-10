---
name: lgtm
description: Use when the user says "lgtm", "looks good to me", "sounds good", "approved", "go ahead", or otherwise accepts the agent's most recent recommendation, option, plan, design, or proposed next step.
---

# LGTM

Treat the user's approval as permission to continue with the most recent concrete recommendation or plan you proposed.

## What To Do

1. Identify the last assistant recommendation, option, design, or plan that was awaiting approval.
2. Treat the user's approval as selecting that recommendation.
3. Continue with the next planned action without asking the same approval question again.
4. Briefly state what was accepted, then act with the relevant specialist skill or workflow.

If the approved recommendation came from a Goal slice result, treat `Recommended next action` / `If you say lgtm` as the approved plan and continue that exact next action without restating the whole goal.

If the approved recommendation came from an architecture review, preserve the review's evidence base: treat approval of `Top recommendation` as selecting that candidate, carry any codebase map query/results from the review, inspect the exact live files before editing, and either make the smallest safe mechanical cleanup with validation or enter the architecture grilling loop for design-bearing refactors.

If the approved recommendation came from `candidates-folder-refactor`, treat `lgtm` as selecting the #1 top candidate and immediately run `/folder-refactor <candidate #1>` so the extension invokes `skill-folder-refactor` with scan/audit/state guardrails. Carry the candidate metrics, suggested boundary, inspected paths, and validation hints as handoff evidence. Do not ask the owner to pick again unless #1 is blocked by a red line.

Example:

- Assistant: "Recommended: create a root README and keep app/README as Flutter-local. Approve?"
- User: "lgtm"
- You: "Accepted: create the root README and keep app/README Flutter-local. I’ll write it now."

## Guardrails

Do not use `lgtm` as approval for:

- destructive actions
- spending money
- publishing secrets or private data
- production deployments
- irreversible Git history changes
- broad scope not already proposed

For those, ask for explicit confirmation naming the risky action.

If there is no clear prior recommendation, ask one clarifying question: "What should I treat as approved?" If `codebase-map-understand.md` exists and approval is for codebase-wide exploration/refactor/review, use codebase map to recover the relevant candidate context before acting.

## Common Mistakes

- Do not reinterpret `lgtm` as a new request.
- Do not restart brainstorming after approval.
- Do not ask "do you want me to proceed?" when the user already approved.
- Do not expand scope beyond the accepted recommendation.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
