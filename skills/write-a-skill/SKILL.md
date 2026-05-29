---
name: write-a-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
---

# Writing Skills

Create skills that load only when useful, give clear workflows, and keep standing context small.

## Repo study before drafting

Before changing a skill, inspect the current skill inventory, `README.md`, `CONTEXT.md`, `THIRD_PARTY_NOTICES.md`, package manifests, validation tests, and any upstream source being adapted. Preserve third-party notices and make the skill fit this repo's package language instead of copying upstream commands that do not exist here.

## Process

1. Gather requirements:
   - Task/domain and exact trigger phrases.
   - Specific use cases and red lines.
   - Whether deterministic scripts or reference docs are needed.
2. Draft the skill:
   - `SKILL.md` with concise entry instructions.
   - Reference files for details that do not need to be always read.
   - Scripts for deterministic operations, validation, or repeated transforms.
3. Review with the user:
   - Does it trigger at the right time?
   - Does the workflow cover real use cases?
   - Is anything too broad, too vague, or too chatty?

## Skill structure

```text
skill-name/
├── SKILL.md
├── references/
│   └── details.md
└── scripts/
    └── helper.js
```

## SKILL.md template

```md
---
name: skill-name
description: Brief capability. Use when [specific triggers].
---

# Skill Name

## Quick start
[Minimal first action]

## Workflow
[Steps/checklists for the main path]

## Skill contract template
[Entry protocol, topology check, verification gate, red lines, output contract]

## References
- [Detailed guidance](references/details.md)
```

## Skill contract template

Use this for non-trivial skills; trim sections that do not apply. Full guidance: [skill-contract.md](references/skill-contract.md).

```md
## Entry protocol
- Trivial: proceed directly.
- Medium ambiguity: propose a baseline and ask only the missing hard question.
- High ambiguity/risk: stop and clarify.

## Topology check
- State/ownership clear?
- Feedback/validation clear?
- Blast radius/deletion impact known?
- Timing/ordering safe?

## Verification gate
[Evidence required before done]

## Red lines
[Actions that require stopping, explicit confirmation, or a blocker report]

## Output contract
[Required final summary, markers, artifacts, or files changed]
```

## Description requirements

The description is the only always-visible part. Keep it under the package budget, write in third person, and include concrete triggers: `description: Extract PDF text/tables. Use when working with PDFs or forms.` Avoid vague text like `Helps with documents.`

## When to split or script

- Split when `SKILL.md` exceeds about 100 lines, details are rarely needed, or domains differ.
- Add scripts for deterministic validation, formatting, extraction, or repeated operations.

## Review checklist

- [ ] Description includes triggers and stays concise.
- [ ] `SKILL.md` is compact; details live in `references/`.
- [ ] Contract names ambiguity handling, topology, verification, red lines, and output.
- [ ] Terminology, examples, and scripts are concrete and safe.

## Shared contract

Follow [the shared skill contract](../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
