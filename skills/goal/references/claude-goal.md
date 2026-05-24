# Claude Goal Adaptation Notes

Source: <https://github.com/jthack/claude-goal>
Snapshot inspected: `cacea1bbe7c5221a2197559313e1e464d48a3c90`
License: MIT, Joseph Thacker. Full license copy is in `licenses/jthack-claude-goal-LICENSE`.

## Source behavior

`claude-goal` provides a Claude Code `/goal` skill and helper script that:

- stores per-session goal state in local SQLite;
- supports `status`, `pause`, `resume`, `clear`, and `complete` controls;
- records soft token budgets and elapsed time;
- wraps the objective in `<objective>`;
- requires a completion audit before marking complete;
- uses a Claude Code Stop hook to keep working while a goal is active;
- caps runaway automatic continuation.

## Pi adaptation

This package already has a persisted `/development-goal` extension for durable automatic continuation. The `goal` skill is intentionally lighter:

- no hook installation;
- no SQLite state;
- no filesystem writes;
- no auto-continuation beyond the active Pi turn/session;
- same command vocabulary and completion-audit discipline.

Use `/development-goal` when the user wants persisted Goal Run state, logs, status UI, or automatic continuation across turns. Use this skill when the user wants a quick in-conversation goal discipline.
