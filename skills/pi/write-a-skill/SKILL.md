---
name: write-a-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
---

# Writing Skills

Create skills as small runtime contracts: when to load, what to inspect, what to do, what not to do, and what proves success.

## Repo study before drafting

Before changing a skill, inspect the current skill inventory, `README.md`, `CONTEXT.md`, `THIRD_PARTY_NOTICES.md`, package manifests, validation tests, and any upstream source being adapted. When `codebase-map-understand.md` exists, consult the codebase map for package/skill relationships that can focus the repo study, then verify named files directly. Preserve third-party notices and make the skill fit this repo's package language instead of copying upstream commands that do not exist here.

## Research-backed rules

- **Trigger precision beats breadth.** Add concrete triggers and anti-triggers so the skill does not shadow neighbors.
- **Four anchors for non-trivial skills:** operational basis, output contract, boundary disclosure, and one tiny example or expected outcome.
- **Progressive disclosure by default.** Keep `SKILL.md` short; move rare details, long examples, and source notes to `references/`.
- **Executable beats inspirational.** Prefer ordered steps, exact commands, schemas, and stop conditions over advice prose.
- **Govern imports like code.** Record source, license, local changes, security assumptions, and validation receipts for third-party or generated skills.

## Process

1. Gather requirements:
   - Task/domain, exact trigger phrases, and anti-triggers.
   - Real use cases, expected artifacts, and red lines.
   - Whether deterministic scripts or reference docs are needed.
2. Check fit:
   - Existing skill can be updated instead of adding a new one?
   - Description overlaps another skill? Narrow, merge, or add anti-triggers.
   - Any executable helper, dependency, or third-party source needs license/security review?
3. Draft the skill:
   - `SKILL.md` with compact entry instructions and a contract.
   - Reference files for details that do not need to be always read.
   - Scripts only for deterministic validation, extraction, formatting, or repeated transforms.
4. Review and validate:
   - Does it trigger at the right time and avoid nearby skills?
   - Can an agent follow it without inventing missing inputs or commands?
   - Run package validation (`npm test` when shipping) and one realistic scenario/review.

## Behavioral evaluation

For a non-trivial new or changed skill, prepare one pinned realistic scenario. When an approved runner is available, record a skill-on/skill-off comparison using the same model and harness, deterministic acceptance checks, a token/cost receipt, and brief trajectory notes. If the comparison cannot run, label the improvement unreplicated instead of claiming it works.

Do not invoke a paid or live model API without explicit approval, and never put live model calls in tests or CI.

## Example

User: “Create a release-readiness skill that must never publish.” Agent: inspect neighboring skills and package commands, draft a no-publish boundary plus deterministic checks, then label behavior unreplicated until an approved paired run exists.

## Atomic fix skill pattern

For narrow defect or optimization skills, prefer the upstream prompt-cache pattern: **Target → Symptom → Fix → Verify**. Make applicability deterministic, keep one bug per skill, cite the source/version being adapted, and require a concrete post-fix assertion instead of prose confidence.

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
description: Brief capability. Use when [specific triggers]. Do not use for [nearby non-goals].
---

# Skill Name

## Quick start
[Minimal first action]

## Operational basis
[Files/tools/state the agent must inspect before acting]

## Workflow
[Steps/checklists for the main path]

## Skill contract
[Entry protocol, topology check, verification gate, red lines, output contract]

## Example
User: [one realistic request]
Agent: [first action or final artifact shape]

## References
- [Detailed guidance](references/details.md)
```

For non-trivial skills, use and trim [the contract template](references/skill-contract.md) instead of duplicating its detailed guidance here.

## Description requirements

The description is the only always-visible part. Keep it under the package budget, write in third person, and include concrete triggers: `description: Extract PDF text/tables. Use when working with PDFs or forms.` Avoid vague text like `Helps with documents.`

Before finalizing, compare the description against nearby skill descriptions. If five or more meaningful trigger words overlap, narrow the trigger, add an anti-trigger, or merge with the existing skill.

## When to split, script, or reference

- Split when use cases have different triggers, tools, or safety gates.
- Do not split only because `SKILL.md` grew; first move rare details to `references/`.
- Add scripts for deterministic validation, formatting, extraction, or repeated operations.
- Avoid new runtime dependencies unless the package manifest already allows them.

## Review checklist

- [ ] Description includes triggers, anti-triggers if needed, and stays concise.
- [ ] Nearby skills were checked for trigger shadowing.
- [ ] `SKILL.md` is compact; details live in `references/`.
- [ ] Contract names ambiguity handling, topology, verification, red lines, and output.
- [ ] Non-trivial skill includes the four anchors and one tiny example.
- [ ] Third-party provenance, notices, and license copies are preserved.
- [ ] Terminology, examples, and scripts are concrete and safe.
- [ ] Validation commands and one realistic invocation/review are recorded.
- [ ] Behavioral claims have a paired receipt, or are explicitly labeled unreplicated.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
