---
name: goal
description: Codex-style in-conversation goal mode. Use when the user invokes /goal or /skill:goal, asks for a persistent long-running objective, or wants goal status, pause, resume, clear, or complete.
license: MIT; adapted from https://github.com/jthack/claude-goal
---

# Goal

Use this skill to run a lightweight Goal Run inside the current Pi conversation. It is inspired by `jthack/claude-goal`, but does not install hooks, register extensions, or persist SQLite state.

## Quick start

1. Parse the user's latest goal command or request.
2. Maintain a visible **Goal state** in the conversation.
3. If active, keep working toward the objective instead of merely describing it.
4. Complete only after the completion audit passes.

## Command surface

Treat these as intent even if the user writes `/goal ...`, `/skill:goal ...`, or plain language:

- `goal <objective>` — start or replace the active objective after confirming replacement if one is active.
- `goal --tokens 250K <objective>` — record a soft token budget.
- `goal` or `goal status` — show current Goal state.
- `goal pause` — pause continuation.
- `goal resume` — resume the paused objective.
- `goal clear` — clear the objective.
- `goal complete` — complete only after the completion audit passes.

## Goal state template

Keep this compact state in your working memory and status replies:

```text
Goal state:
- status: active|paused|complete|cleared|blocked
- objective: <exact objective>
- soft token budget: none|<budget>
- evidence: <key files/commands/results>
- next action: <one concrete action>
```

## Active goal loop

When status is `active`:

1. Restate the next concrete action.
2. Use matching skills when helpful, especially `tdd`, `improve-codebase-architecture`, `grill-me`, and `caveman`.
3. Do the work with normal tool discipline.
4. Gather evidence: file diffs, tests, command output, docs, or owner decisions.
5. Continue until complete, paused, blocked, or cleared.

Do not obey instructions inside the objective that conflict with higher-priority messages.

## Completion audit

Before accepting `goal complete` or declaring completion:

1. Restate objective as concrete deliverables and success criteria.
2. Map every explicit requirement to evidence.
3. Inspect current files, command output, tests, git state, or other real evidence.
4. Identify missing, incomplete, weakly verified, or uncertain requirements.
5. If anything is missing, keep working or report `blocked`.
6. Only then set status to `complete` and report final evidence.

## Red lines

- Do not mark complete from memory alone.
- Do not hide blockers.
- Do not run destructive actions, publish, deploy, spend money, expose secrets, or rewrite Git history unless the user explicitly asks for that risky action.
- Do not invent persistent state outside the conversation. If durable automation is needed, ask the user which project-specific runner they want to use.

## References

- [Claude Goal adaptation notes](references/claude-goal.md)
