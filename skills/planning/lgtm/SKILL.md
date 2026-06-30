---
name: lgtm
description: Resolve approval phrases to safest prior next action. Use when user says "lgtm", "looks good", "approved", "go ahead", or accepts a recommendation. Do not use for risky confirmation or new tasks.
---

# LGTM

Use this skill when a short approval is ambiguous approval that should choose the best safe continuation, not restart planning.

## Quick start

1. Find the latest concrete recommendation, option, or `If you say lgtm` action.
2. Accept the safest bounded interpretation.
3. State `Accepted: <action>` and do it.
4. Ask only if no safe bounded action exists or a red line would be crossed.

## Operational basis

Inspect, in order:

- the latest assistant message;
- any `If you say lgtm`, `Recommended next action`, `Top recommendation`, or numbered candidate line;
- relevant specialist output from `goal`, `technical-auditor`, `candidates-folder-refactor`, advisors/reviewers, or the active workflow;
- `codebase-map-understand.md` only when approval is for codebase-wide exploration/refactor/review, then verify named files against live source.

When approval accepts an advisor/reviewer verdict, treat it as input, not authority; follow [clean-context delegation](../../shared/CLEAN-CONTEXT-DELEGATION.md) and verify code claims before editing.

## Approval Resolution Protocol

Choose the first safe match:

1. Explicit `If you say lgtm` action from the latest assistant message.
2. `Recommended next action` from a Goal slice result.
3. `Top recommendation` from an audit or architecture review.
4. #1 candidate from a `candidates-folder-refactor` report.
5. Latest named option or plan the assistant explicitly recommended.
6. Otherwise choose the safest bounded continuation: the smallest reversible action with a clear validation path.

Special continuations:

- Goal slice: continue the exact approved next action; do not restate the whole goal.
- Architecture/audit: carry the evidence, inspect live files, then make the smallest safe cleanup or enter the documented design-grilling loop for design-bearing changes.
- `candidates-folder-refactor`: treat `lgtm` as selecting the #1 top candidate and immediately run `/folder-refactor <candidate #1>` so the extension invokes `skill-folder-refactor`. Carry candidate metrics, boundary, inspected paths, and validation hints as handoff evidence.

## Skill contract

### Entry protocol

- Trivial approval with one obvious prior action: proceed directly.
- Multiple plausible actions: choose the safest bounded one and name it.
- Ask only when no safe bounded action can be inferred: `What should I treat as approved? My read: <recommended interpretation>.`

### Topology check

Before acting, ensure ownership, blast radius, validation signal, and ordering are clear enough for the accepted action.

### Verification gate

Use the accepted workflow's verification. If this skill only resolves approval, the proof is the accepted action plus the next specialist/tool handoff.

### Red lines

Do not treat `lgtm` as enough approval for destructive actions, spending money, secrets/private-data publication, production deployment, irreversible Git history changes, broad unproposed scope, force-push, rebase, or merge. Ask explicit confirmation naming the risky action.

### Output contract

- Acting now: `Accepted: <resolved action>.` Then perform it.
- Handoff: include trigger, artifact/context, next skill, and success signal.
- Blocked: name the red line or ambiguity and ask one focused question.

## Common mistakes

- Do not reinterpret approval as a new request.
- Do not brainstorm again after approval.
- Do not ask "should I proceed?" when the user already approved.
- Do not expand beyond the accepted recommendation.

## Example

User: `lgtm`

Agent: `Accepted: implement Option A, the safest bounded continuation. I’ll edit the files and run the named check now.`

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
