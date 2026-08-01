---
name: wayfinder-next
description: Autonomously discover an active Wayfinder map, resume one current-worker claim, or complete one autonomous-ready frontier issue. Use when the user asks to run Wayfinder Next, with or without a map; not for map creation, autonomous HITL answers, or batch execution.
---

# Wayfinder Next

Resolve exactly one existing ticket from a Wayfinder map, then stop. The ticket is either a resumable current-worker claim or a newly claimed autonomous-ready frontier ticket. Read [Wayfinder](../wayfinder/SKILL.md) for the map model and naming rules.

## Entry and permission

The user invokes `/skill:wayfinder-next [map URL or name]` or explicitly asks to run Wayfinder Next. A map argument is optional: without one, discover the tracker and active map from the current repository. Never revive a map from stale conversation context.

That invocation authorizes autonomous tracker/map discovery, read/query operations, and these mutations for one existing ticket only:

- assign an eligible unclaimed AFK ticket, or resume a ticket already assigned to the current tracker identity;
- post its progress or resolution comment;
- close it when its answer is complete and durable;
- append one linked decision gist to the existing map.

For a repository-backed task, the invocation also authorizes an ordinary commit and push of validated changes owned by the selected ticket through `git-commit-push`. Delivery permission is scoped to the selected ticket only; unrelated dirty paths remain untouched. It does not authorize new issue creation, label or dependency changes, branch creation, deployment, release, purchases, secrets, destructive history, force-push, or inventing the human side of a HITL decision.

A direct user answer to a resumed HITL Question continues the same one-ticket run; do not require another `/skill:wayfinder-next` invocation before recording that answer.

## Autonomous discovery

When no map is supplied:

1. Inspect repository instructions and tracker documentation, then run `git remote get-url origin`.
2. Prefer an explicitly documented tracker. Otherwise, infer GitHub Issues from a GitHub `origin`; use another tracker only when repository docs name its read and mutation operations.
3. Verify the tracker CLI/API and current identity with harmless status/read calls. For GitHub, use `gh auth status` and `gh api user`; never start login or request credentials.
4. Query open maps using the native tracker operation. For GitHub, start with open issues labelled `wayfinder:map`; if the label is absent, inspect open issues for the Wayfinder `Destination`, `Decisions so far`, `Not yet specified`, and `Out of scope` body structure.
5. Evaluate candidate maps in this order:
   - an active map named in repository-owned docs or the immediately preceding user message;
   - a map with a resumable current-worker claim;
   - a map with at least one eligible unclaimed AFK frontier ticket;
   - the most recently updated map;
   - lowest stable issue id as the final tie-breaker.
6. Select the first ranked map and continue without confirmation. Never ask the user to choose among discoverable maps or tickets.

If exhaustive discovery finds no map, no resumable claim or eligible ticket, no authenticated mutation path, or no assignee identity, report the exact blocker and smallest owner action, then stop without a generic setup question.

## Select

1. Load the map's Destination and Notes, then query its open child tickets and native blocker state. Do not load every closed ticket.
2. Compute the dependency frontier: open children whose blockers are all closed. Assignment is classified separately.
3. Resolve the authenticated tracker identity before interpreting assignments.
4. Resume owned work first:
   - a **resumable current-worker claim** is a dependency-frontier ticket assigned to the current tracker identity;
   - a ticket assigned to another identity is ineligible;
   - **Current claims outrank unclaimed work.** If several current claims exist, use map order, then oldest creation time;
   - read the selected claim fully and verify it still fits the Destination.
5. For a resumed HITL claim, ask its exact Question in the current conversation and wait. Keep it assigned, set resolution to `awaiting HITL answer`, and do not post a tracker comment merely to say that input is pending. Never tell the user to finish another interactive session when the current identity owns the claim; resume it here.
6. Only when no resumable claim exists, inspect unassigned tickets and keep autonomous-ready work:
   - `research` tickets are eligible;
   - **Task tickets are AFK-eligible by default** when their Question can be completed and verified with current approved tools;
   - classify a task as HITL only from positive HITL evidence: it explicitly requests a human decision, preference, conversation, credentials, provisioning, physical/manual action, or irreversible confirmation;
   - prototype and grilling tickets are HITL. **Unclaimed HITL tickets are ineligible even if the agent can guess an answer.** Do not newly claim a HITL ticket; surface it read-only instead.
7. Inspect repository state and likely task paths before claiming. A task with unresolved overlap against unrelated dirty paths is temporarily ineligible; continue to the next frontier ticket instead of stopping at the first conflict.
8. Pick the first eligible unclaimed AFK frontier ticket using tracker/map order, then oldest creation time as the tie-breaker.
9. Read it fully, refresh assignment and blocker state, then claim it. If another worker won the race, recompute once and choose the next eligible ticket; a second race stops the run.

Selection is complete when one current claim is resumed, one eligible AFK ticket is assigned to the current worker, or exhaustive inspection proves neither exists. Never report `selected: none` while a resumable current-worker claim exists.

## Resolve

Work only the selected ticket's Question:

- Resumed grilling: use `brainstorming` behavior and ask one question at a time. The user speaks for themselves; never self-answer. When their answer is precise enough to resolve the ticket, summarize it faithfully and continue to Record.
- Resumed prototype or HITL task: continue the named interaction/checklist in the current conversation. Pause only for the exact human input or action still required.
- Research: use `research-forge`; cite durable sources in the resolution.
- AFK task: route to the single narrow specialist that matches the task and use its normal validation.
- Repository changes: inspect Git state first, preserve unrelated work, implement through the narrow matching specialist, and validate locally. Then use `git-commit-push` to commit and push only selected-ticket changes; never merge, rebase, force-push, or include unrelated paths.

Do not broaden into implementation of the map's Destination. Do not resolve a second ticket. Newly discovered decisions are follow-up drafts, not permission to create issues.

## Record

Use `triage` for approved tracker operations and prefix every tracker comment with:

```markdown
> *This was generated by AI during triage.*
```

When the answer is complete and durable:

1. Post the answer as the selected ticket's resolution comment, including owner decisions, evidence, validation, and the delivered commit when repository work was required.
2. Close the selected ticket only after required delivery or HITL confirmation is verified.
3. Append one line to the map's Decisions so far: `[ticket name](https://tracker.example/ticket) — one-line gist`.
4. Query the new frontier read-only, then stop.

When awaiting HITL input, ask the exact question and stop without calling the claim blocked. For other blocked or incomplete work, post one progress comment only when it adds durable evidence, leave the ticket open and assigned, and report the exact owner action needed. Never close on partial work.

## Output contract

```text
Wayfinder next:
- map: <name + URL>
- selected: <ticket name + URL, type, selection reason>
- claim: <assigned|resumed|race-lost|blocked>
- work: <specialist, exact HITL question, or evidence>
- resolution: <closed|awaiting HITL answer|left open + reason>
- map update: <linked gist|none>
- surfaced follow-ups: <draft names only|none>
- next frontier: <read-only summary>
- repository state: <clean|changed paths, never shipped implicitly>
```

## Example

User: `/skill:wayfinder-next`

Agent: discovers the active map and sees “Choose where independent production monitoring should run” already assigned to its authenticated tracker identity. It selects and resumes that grilling claim, asks the ticket's exact Question in the current conversation, reports `claim: resumed` and `resolution: awaiting HITL answer`, and does not direct the user to another session or select a second ticket.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repository study, tracker approval, artifact continuity, verification, and delivery boundaries.
