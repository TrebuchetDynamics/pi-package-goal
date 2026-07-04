---
name: wiki-docs
description: Maintain source-backed project docs and LLM wiki knowledge bases. Use for README, architecture/onboarding docs, docs drift, project wiki/entity pages, raw-source-to-wiki compilation, or wiki linting. Do not use for prose polishing, literature search, or code graph generation.
---

# Wiki Docs

Use this to create, audit, or update full-project documentation and dense agent-readable project wikis. Keep it source-backed: docs describe live code, commands, decisions, and raw source material, not model memory.

Research basis: `research/wiki-docs-skill/report.md` found that useful wiki/docs automation is code-documentation alignment plus trace links, not blind full-wiki regeneration. LLM wiki basis: compile new raw sources into persistent Markdown entity pages so knowledge, links, and contradiction notes compound over time.

## Quick start

1. Inspect `git status --short --branch`, repo instructions, README/CONTEXT, existing docs, package manifests, validation scripts, and tests.
2. If `codebase-map-understand.md` exists, use it as a lead source for page candidates and tours; if it does not exist, continue from live files and docs. Never require the map.
3. Classify the docs task: create wiki, update stale page, fill missing page, audit docs drift, document architecture/API behavior, write onboarding/source tour, compile raw sources into wiki pages, or lint an existing wiki.
4. Map existing docs plus the code/source claims they make.
5. Pick one bounded docs slice unless the user explicitly asked for a full rebuild.
6. Read live source for every factual claim before editing.
7. Validate links, examples, commands, and package tests where practical.

## Docs map

Build a compact map before editing:

```text
Docs map:
- existing pages:
- raw/source corpus:
- claimed code areas:
- missing/stale claims:
- source files to verify:
- chosen docs slice:
- validation:
```

Treat generated codebase maps, old docs, comments, and raw articles/PDF extracts as leads only. Cite live source paths and line numbers for architecture, lifecycle, command, API, and behavior claims. For non-code source material, cite the source filename/path and page/section when available.

## LLM wiki/entity page rules

- Dense, skimmable Markdown over long generated prose.
- Stable filenames and headings.
- One concept per page; split pages that start covering two ideas.
- Start each page with “what this is” and “start here”.
- Update existing pages before creating duplicates.
- Cross-link related pages with `[[wiki-links]]` when the target wiki supports them; otherwise normal Markdown links.
- Flag contradictions between new sources and existing pages instead of silently resolving them.
- Include source citations such as `path:line` for code behavior/architecture claims and `raw/<source>:<page-or-section>` for corpus claims.
- Include update triggers: what code, config, or source changes should cause the page to be revisited.
- Prefer small linked pages plus an index over one giant wiki page.

## Workflow

### Create or refresh a project wiki

1. Propose a small page graph, usually `docs/wiki/index.md` plus 2–5 concept pages.
2. Verify repo-specific docs conventions before creating new directories.
3. Write only the first useful page set unless the user explicitly requested full rebuild.
4. Add links from existing docs only when ownership is clear.

### Compile raw sources into an LLM wiki

1. Confirm the folder contract, usually `raw/` for source drops and `wiki/` or `docs/wiki/` for compiled pages.
2. Inventory new and existing sources; do not edit `raw/` except to add user-provided files when asked.
3. For each new source, update related entity pages, create only missing entities, add links, and record contradiction notes.
4. Maintain `index.md` for navigation once the wiki has more than a handful of pages; add `log.md` when ingestion history matters.
5. Run a lint pass after roughly 20 new pages, a major source addition, or any contradiction-heavy update.

Detailed pattern: [LLM wiki pattern notes](references/llm-wiki-pattern.md).

### Update stale documentation

1. Identify stale claim and source evidence.
2. Edit the smallest affected page section.
3. Preserve human-authored tone and intent.
4. Add or update source citations and update triggers.

### Audit docs drift or wiki health

1. List stale, missing, unverified, orphaned, contradiction, duplicate-entity, and broken-link candidates.
2. Rank by user impact and source confidence.
3. Fix one bounded slice or report the ranked plan if the user asked for audit only.

## Validation gate

Before claiming done:

- named files inspected;
- docs pages changed or audited;
- live source citations added for factual code claims;
- wiki links, local Markdown links, orphan pages, duplicate entities, and contradiction notes checked where practical;
- commands/examples run or marked unverified;
- repo docs/package validation run when available, normally `npm test` in this repo.

## Red lines

- Do not rewrite the full docs tree without explicit full-rebuild scope.
- Do not document secrets, credentials, private machine paths, or sensitive internal data.
- Do not treat `codebase-map-understand.md`, generated graphs, raw sources, or model memory as source of truth.
- Do not invent architecture decisions; cite ADRs/live code or label interpretation.
- Do not overwrite a human-authored style or product narrative without preserving intent.
- Do not paste copyrighted source text into wiki pages unless the user owns it or asks for a quoted excerpt with attribution.

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
