# Skill Contract Reference

Use a skill contract when a skill does more than a single obvious action. The contract prevents token-heavy standing prompts by making the workflow explicit only after the skill is loaded.

## Entry protocol

Classify the request before doing work:

- **Trivial** — low-risk, local, obvious edits or answers. Proceed directly; do not run a planning ceremony.
- **Medium ambiguity** — one structural assumption is missing. Propose a baseline interpretation and ask only the hard missing question.
- **High ambiguity/risk** — owner decision, irreversible side effect, security risk, unknown blast radius, or conflicting instructions. Stop and clarify.

Do not hand the user a blank questionnaire. If you ask, include your recommended answer and the consequence of accepting it.

## Topology check

For non-trivial work, verify the shape before implementation:

1. **State/ownership** — where truth lives, who can mutate it, and which invariants must hold.
2. **Feedback/validation** — what proves the work succeeded: tests, logs, UI evidence, review, or user decision.
3. **Blast radius/deletion impact** — what breaks if the touched module, file, command, or dependency changes.
4. **Timing/ordering** — async ordering, concurrency, retries, migrations, external calls, and race risks.

If a topology item is unknown and important, either inspect source evidence or report the uncertainty before continuing.

## Verification gate

Every skill should define what evidence is required before saying done. Prefer public behavior evidence over implementation evidence:

- exact commands and outcomes;
- changed files or generated artifacts;
- screenshots, transcripts, API responses, or logs when relevant;
- known limits when full validation is impossible.

## Red lines

Name actions that require stopping, explicit confirmation, or a blocker report. Common red lines:

- deleting files/data, overwriting existing work, dropping dependencies;
- deploying, publishing, pushing, migrations, schema changes, or external API side effects;
- unknown state ownership, unknown blast radius, security exposure, or timing/race hazard;
- conflicts with project instructions, ADRs, licenses, or user policy.

## Output contract

Specify the final shape so automation and humans can trust the result. Examples:

```md
End with:
- Files changed
- What was modified
- Validation run
- Follow-up needed
```

or:

```md
End with machine-readable markers:
SKILL_VALIDATED: yes|no
SKILL_DECISION: continue|blocked|done
```

Keep the output contract short and enforceable. Put examples in references when they are long.
