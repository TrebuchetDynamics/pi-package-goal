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

This package ships the `goal` workflow as a skill rather than a persistent extension. The adaptation is intentionally lightweight:

- no hook installation;
- no SQLite state;
- no filesystem writes;
- no registered slash-command extension;
- no auto-continuation beyond the active Pi turn/session;
- same command vocabulary and completion-audit discipline.

Use this skill when the user wants quick in-conversation goal discipline. If they need persisted state, logs, status UI, or automatic continuation across turns, ask which project-specific runner they want to use.
