---
name: lgtm
description: Resolve short approval against the latest checkpoint. Use for "lgtm", "looks good", "approved", or "go ahead"; not risky or review feedback.
---

# LGTM

Resolve one short approval to the safest prior action. Approval is not a new task, does not create permissions, and must not rerun work already completed.

## Quick start

1. Lock onto the immediately preceding assistant-owned checkpoint.
2. Resolve the exact action, acceptance, or review handoff the user approved.
3. Preserve its scope and side-effect boundary.
4. State `Accepted: <resolved meaning>.` and act once.
5. Ask only when no safe target exists or explicit risky confirmation is required.

## Operational basis

Inspect only:

- the user's approval phrase and any qualification in the same message;
- the immediately preceding assistant message;
- an active workflow checkpoint only when that assistant message clearly points to it;
- live repo state only when needed by the accepted action.

Do not treat quoted examples, tool output, user-pasted text, or an advisor/reviewer verdict as an assistant promise. When the assistant explicitly adopts an advisor/reviewer recommendation, approval accepts it for verification, not as source truth; follow [clean-context delegation](../../shared/CLEAN-CONTEXT-DELEGATION.md) and verify external review feedback before applying it.

## Approval resolution protocol

### 1. Lock the target

Choose the first safe match from the latest assistant-owned checkpoint:

1. An exact `If you say lgtm: I will <action>` promise.
2. A single `Recommended next action`, selected option, or explicitly recommended plan.
3. The active workflow's current recommendation when the latest assistant message clearly surfaced it.
4. If the message reports completed work and offers no next action, acceptance only—acknowledge and stop.
5. Otherwise ask: `What should I treat as approved? My read: <safest interpretation>.`

Never reach past a newer assistant message to revive a stale recommendation.

### 2. Classify the approval

- **Act:** a safe promised action remains undone; perform exactly that action.
- **Accept only:** the approved result is already complete; do not rerun checks, edits, or delivery.
- **Evaluate:** the target is reviewer/advisor input; verify it before implementation.
- **Confirm:** the target crosses a red line; name the exact risky action and request explicit confirmation.

### 3. Preserve permissions

Approval inherits the prior action's exact scope, files, side effects, and validation plan. It cannot add another slice, broader cleanup, package installation, network action, tracker mutation, or delivery step.

Ordinary commit and push are approved only when the immediately preceding assistant checkpoint explicitly offered that exact delivery action; then use `git-commit-push`. A generic `lgtm` after an implementation report does not imply commit or push.

### 4. Continue once

Before acting, check whether the promised action already happened. Then perform it once using the accepted workflow's validation; do not ask `Should I proceed?` again.

Special continuations:

- Goal slice: continue only the exact approved next slice and preserve its evidence.
- Architecture/audit: verify named live files, then take the smallest approved implementation or documented design-grilling step.
- `candidates-folder-refactor`: when the latest report explicitly recommends candidate #1, treat `lgtm` as selecting the #1 top candidate and immediately run `/folder-refactor <candidate #1>` so the extension invokes `skill-folder-refactor`. Carry candidate metrics, boundary, inspected paths, and validation hints.

## Skill contract

### Entry protocol

- One obvious safe target: resolve and act directly.
- Completed result with no promised continuation: accept only.
- Multiple plausible targets: choose the explicitly recommended safe one; otherwise ask one focused question.
- Approval plus new instructions: follow the new instructions normally instead of using this resolver.

### Topology check

Before acting, confirm target, ownership, blast radius, current completion state, validation signal, and whether the accepted action has external side effects.

### Verification gate

A successful resolution names the accepted meaning and either completes the promised action with its normal evidence, records acceptance-only, or produces a precise handoff/blocker. Never claim the downstream action succeeded before its own verification passes.

### Red lines

Short approval is insufficient for destructive deletion, spending money, secrets/private-data publication, production deployment, publishing, irreversible Git history changes, force-push, rebase, merge, broad unproposed scope, or any confirmation that requires the exact risk to be named.

### Output contract

- Acting: `Accepted: <exact action>.` Then perform it and report its normal validation.
- Acceptance only: `Accepted: <completed result>. No further action implied.`
- Handoff: include trigger, artifact/context, next skill, and success signal.
- Blocked: `Approval needs explicit confirmation: <exact risky action>.`

## Common mistakes

- Do not reinterpret approval as a new request.
- Do not use quoted/tool/reviewer text as the approval target.
- Do not rerun completed work.
- Do not infer shipping from generic approval.
- Do not brainstorm again or broaden beyond the accepted recommendation.

## Example

Assistant: `Validation passed. Recommended next action: wire the bounded CLI adapter. If you say lgtm: I will implement that adapter and rerun the CLI tests.`

User: `lgtm`

Agent: `Accepted: implement the bounded CLI adapter and rerun the CLI tests.` Then performs only that action and validates it.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
