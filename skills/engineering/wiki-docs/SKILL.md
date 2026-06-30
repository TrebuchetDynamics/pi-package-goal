---
name: wiki-docs
description: Update source-backed docs. Use for README, architecture, onboarding, or wiki work.
---

# Wiki Docs

Use this to create, audit, or update full-project documentation and dense agent-readable project wikis. Keep it source-backed: docs describe live code, commands, and decisions, not model memory.

Research basis: `research/wiki-docs-skill/report.md` found that useful wiki/docs automation is code-documentation alignment plus trace links, not blind full-wiki regeneration.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, README/CONTEXT, existing docs, package manifests, validation scripts, and tests.
2. If `codebase-map-understand.md` exists, use it as a lead source for page candidates and tours; if it does not exist, continue from live files and docs. Never require the map.
3. Classify the docs task: create wiki, update stale page, fill missing page, audit docs drift, document architecture/API behavior, or write an onboarding/source tour.
4. Map existing docs plus the code claims they make.
5. Pick one bounded docs slice unless the user explicitly asked for a full rebuild.
6. Read live source for every factual claim before editing.
7. Validate links, examples, commands, and package tests where practical.

## Docs map

Build a compact map before editing:

```text
Docs map:
- existing pages:
- claimed code areas:
- missing/stale claims:
- source files to verify:
- chosen docs slice:
- validation:
```

Treat generated codebase maps, old docs, and comments as leads only. Cite live source paths and line numbers for architecture, lifecycle, command, API, and behavior claims.

## Karpathy-style wiki page rules

- Dense, skimmable Markdown over long generated prose.
- Stable filenames and headings.
- Concept-first pages, not API dumps.
- Start each page with “what this is” and “start here”.
- Cross-link related pages.
- Include source citations such as `path:line` for behavior and architecture claims.
- Include update triggers: what code or config changes should cause the page to be revisited.
- Prefer small linked pages over one giant wiki page.

## Workflow

### Create or refresh a project wiki

1. Propose a small page graph, usually `docs/wiki/index.md` plus 2–5 concept pages.
2. Verify repo-specific docs conventions before creating new directories.
3. Write only the first useful page set unless the user explicitly requested full rebuild.
4. Add links from existing docs only when ownership is clear.

### Update stale documentation

1. Identify stale claim and source evidence.
2. Edit the smallest affected page section.
3. Preserve human-authored tone and intent.
4. Add or update source citations and update triggers.

### Audit docs drift

1. List stale, missing, unverified, and broken-link candidates.
2. Rank by user impact and source confidence.
3. Fix one bounded slice or report the ranked plan if the user asked for audit only.

## Validation gate

Before claiming done:

- named files inspected;
- docs pages changed or audited;
- live source citations added for factual code claims;
- local Markdown links checked where practical;
- commands/examples run or marked unverified;
- repo docs/package validation run when available, normally `npm test` in this repo.

## Red lines

- Do not rewrite the full docs tree without explicit full-rebuild scope.
- Do not document secrets, credentials, private machine paths, or sensitive internal data.
- Do not treat `codebase-map-understand.md`, generated graphs, or model memory as source of truth.
- Do not invent architecture decisions; cite ADRs/live code or label interpretation.
- Do not overwrite a human-authored style or product narrative without preserving intent.

## Output contract

```text
Wiki docs pass:
- docs slice:
- pages changed:
- source evidence:
- validation:
- remaining docs gaps:
```

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
