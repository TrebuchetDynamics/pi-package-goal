---
name: nack
description: Re-check a prior assistant claim. Use when user says "nack", "not convinced", or "check again"; not for review feedback.
---

# NACK

Negative acknowledgement: treat the user's pushback as a request to re-check, not as hostility or approval.

## Quick start

1. Identify the exact prior claim, recommendation, or action being challenged.
2. Re-check the strongest evidence available: prior context, docs, live files, tests, or commands.
3. Report whether the answer changes, stands, or is blocked by missing evidence.
4. If a safe correction is obvious, make the smallest correction and verify it.

## Operational basis

Inspect only what bears on the challenged point:

- the latest user pushback and the assistant message it targets;
- repo instructions and `git status --short --branch` before edits;
- named files/docs/tests/commands behind the original claim;
- `codebase-map-understand.md` only for cross-module or architecture claims, then verify named files in live source.

Use `receiving-code-review` instead for external reviewer feedback. Use `grill-me` or `grill-with-docs` for full plan stress tests.

## Workflow

1. State `Rechecking: <specific claim>`.
2. Look for disconfirming evidence first.
3. Decide:
   - `Changed:` original claim was wrong or too strong; correct it.
   - `Stands:` original claim still holds; cite the evidence briefly.
   - `Blocked:` the evidence needed is unavailable; ask one focused question or name the command/approval needed.
4. Continue only with the corrected safe next action.

## Skill contract

### Entry protocol

- Clear target: re-check directly.
- Ambiguous target: re-check the latest substantive assistant claim.
- Multiple risky interpretations: ask which claim/action to challenge.

### Topology check

Before editing, confirm ownership, blast radius, validation signal, and whether the correction changes prior user intent.

### Verification gate

A useful NACK pass includes the challenged claim, evidence checked, verdict, and any validation for changes made.

### Red lines

Do not treat pushback as approval to broaden scope, rewrite history, deploy, spend money, expose secrets, or make destructive changes. Do not argue from confidence; use evidence.

### Output contract

```text
Rechecking: <claim/action>
Verdict: Changed|Stands|Blocked — <one-line reason>
Evidence: <files/commands/context checked>
Next: <small safe action or question>
```

## Example

User: `nack, not convinced. check again`

Agent: re-checks the latest recommendation against the repo, then either corrects it or says why it still stands with evidence.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
