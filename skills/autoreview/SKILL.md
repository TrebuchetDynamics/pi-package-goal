---
name: autoreview
description: Run an available structured autoreview helper as a closeout code review. Use when the user asks for autoreview, Codex/Claude/second-model review, PR/branch review, or review before commit/ship.
---

# Auto Review

Run a structured closeout review helper against the current change. This is advisory code review, not approval routing.

Based on the OpenClaw `autoreview` skill; this package bundles the workflow, not the helper script.

## Entry protocol

1. Find an available helper, in order:
   - `.agents/skills/autoreview/scripts/autoreview`
   - `skills/autoreview/scripts/autoreview`
   - `~/.codex/skills/agent-scripts/autoreview/scripts/autoreview`
   - any project-documented `autoreview` helper path
2. If no helper exists, report blocked with the missing helper. Do not invent a reviewer command.
3. Use Codex review by default unless the user explicitly requested another engine.
4. Do not push just to review. Push only when the user requested push, ship, or PR update.

## Contract

- Treat findings as advisory. Never blindly apply them.
- Verify every accepted finding by reading the real code path and adjacent files.
- Read dependency docs/source/types when a finding depends on external behavior.
- Reject speculative edge cases, broad rewrites, and fixes that over-complicate the codebase.
- Prefer small fixes at the right ownership boundary.
- If a review-triggered fix changes code, rerun focused tests and rerun autoreview.
- Stop when the helper exits 0 with no accepted/actionable findings.
- Do not run nested reviewers, built-in `codex review`, or reviewer panels from inside the review.
- Multi-reviewer panels are opt-in only: use them when explicitly requested or risk justifies the spend.

## Pick target

Dirty local work:

```bash
<autoreview-helper> --mode local
```

Use local mode only when the patch is actually staged, unstaged, or untracked in this checkout.

Branch or PR work:

```bash
<autoreview-helper> --mode branch --base origin/main
```

If an open PR exists, prefer its actual base:

```bash
base=$(gh pr view --json baseRefName --jq .baseRefName)
<autoreview-helper> --mode branch --base "origin/$base"
```

Committed single change:

```bash
<autoreview-helper> --mode commit --commit HEAD
```

Use commit mode for already-landed or already-pushed work on `main`; reviewing clean `main` against `origin/main` is usually empty after push.

## Options

- `--parallel-tests "<focused test command>"` can run tests and review together after formatting.
- `--prompt-file` and `--dataset` add review context.
- `--panel` or `--reviewers codex,claude` run opt-in reviewer panels.
- `--model` and `--thinking` set per-engine model/effort when explicitly needed.
- Keep helper mode as `auto` unless target selection needs a precise mode.

## Verification gate

Before final response:

- accepted findings were verified against source;
- rejected findings have a concise reason;
- focused tests/proof ran after any fix;
- final autoreview rerun is clean, or remaining findings are consciously rejected with reasons.

## Final report

Include:

- review command used;
- tests/proof run;
- findings accepted/rejected and why;
- final clean review result, or why remaining findings were intentionally rejected.

Do not run an extra review solely to improve final wording.
