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
4. Briefly state what was accepted, then act.

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

If there is no clear prior recommendation, ask one clarifying question: "What should I treat as approved?"

## Common Mistakes

- Do not reinterpret `lgtm` as a new request.
- Do not restart brainstorming after approval.
- Do not ask "do you want me to proceed?" when the user already approved.
- Do not expand scope beyond the accepted recommendation.
