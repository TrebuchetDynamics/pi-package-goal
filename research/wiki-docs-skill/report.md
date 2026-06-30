# Wiki-docs skill research

## Method and limits

Question: research how to make a skill called `wiki-docs` that improves and updates full-project documentation, with a Karpathy-style wiki as an example.

Depth: Standard. I ran six query variations across OpenAlex, Crossref, Semantic Scholar, and arXiv with `rforge v0.1.11`, then attempted citation expansion on five seed papers. The sweep retrieved metadata only; no copyrighted full text was downloaded and no human-gated OA approval was run. OpenAlex was rate-limited for all search/citation calls in this second sweep window, so source coverage leans on Crossref, arXiv, and Semantic Scholar.

Source coverage from `rforge search stats --dir .`:

- arXiv: 120 records across 6 files
- Crossref: 120 records across 6 files
- OpenAlex: 6 records across 6 files, all rate-limit/error lines
- Semantic Scholar: 25 records across 6 files
- Total unique DOIs: 250

## Bottom line

A useful `wiki-docs` skill should not blindly rewrite docs. It should maintain a source-backed project wiki by detecting documentation drift, mapping code-to-doc trace links, updating one bounded docs slice at a time, and requiring validation evidence from live files, links, commands, or screenshots where relevant. The Karpathy-style lesson is to produce dense, navigable, agent-readable wiki pages: stable page names, short conceptual sections, links between concepts, code citations, and update receipts.

## Main themes

### 1. Documentation update is a drift/alignment problem

The strongest direct seed is `CoDocBench: A Dataset for Code-Documentation Alignment in Software Maintenance` (DOI `10.1109/msr66628.2025.00077`, MSR, 2025), retrieved from Crossref and arXiv. Nearby results include `Wait, wasn’t that code here before? Detecting Outdated Software Documentation` (DOI `10.1109/icsme58846.2023.00071`, ICSME, 2023) and `Metamon: Finding Inconsistencies between Program Documentation and Behavior using Metamorphic LLM Queries` (DOI `10.1109/llm4code66737.2025.00020`, LLM4Code, 2025).

Skill implication: `wiki-docs` should start by classifying docs work as one of:

- missing page;
- stale page;
- code/doc inconsistency;
- broken links or moved symbols;
- architecture/API drift;
- new user onboarding gap.

Then it should update the smallest page set that resolves that drift. Do not regenerate the entire wiki unless the user explicitly asks for a full rebuild.

### 2. Trace links between code and docs are the safety rail

The sweep found `Information retrieval models for recovering traceability links between code and documentation` (DOI `10.1109/icsm.2000.883003`, ICSM, 2000), `RECOVERY OF TRACEABILITY LINKS BETWEEN SOFTWARE DOCUMENTATION AND SOURCE CODE` (DOI `10.1142/s0218194005002543`, International Journal of Software Engineering and Knowledge Engineering, 2005), and `Recovering Trace Links Between Software Documentation And Code` (DOI `10.1145/3597503.3639130`, ACM, 2024).

Skill implication: every nontrivial wiki update should carry code citations. A page about auth, package resources, or UI layout should name source files, tests, commands, and decisions. The completion audit should reject prose-only updates when live code evidence exists.

### 3. Summarization helps, but source-backed summaries beat model memory

`Automatic Documentation Generation via Source Code Summarization` (DOI `10.1109/icse.2015.288`, ICSE, 2015) and `Source Code based On-demand Class Documentation Generation` (DOI `10.1109/icsme46990.2020.00114`, ICSME, 2020) show the long-running software-engineering thread around generating docs from code. Newer results include `Can Developers Prompt? A Controlled Experiment for Code Documentation Generation` (DOI `10.1109/icsme58944.2024.00058`, ICSME, 2024) and `CodeDocAgent: Leveraging Large Language Models for Accurate and Contextual Code Documentation` (DOI `10.1109/bmsb65076.2025.11165690`, IEEE BMSB, 2025).

Skill implication: `wiki-docs` can ask the model to draft, but only after retrieval. It should read the relevant files first, then summarize. It should explicitly separate facts from interpretation when documenting architecture.

### 4. Living documentation needs continuous update mechanics

The sweep found `From Transient Information to Persistent Documentation: Enhancing Software Documentation` (DOI `10.1109/icsme46990.2020.00108`, ICSME, 2020), `Supporting Automated Documentation Updates in Continuous Software Development with Large Language Models` (DOI `10.5220/0013286800003928`, 2025), and older maintenance-doc papers such as `Context-Aware Software Documentation` (DOI `10.1109/icsme.2018.00090`, ICSME, 2018).

Skill implication: the skill should leave update receipts in the page or report: what changed, source files inspected, what was not checked, and when to revisit. This is especially important for a project wiki that future agents will use as context.

### 5. Wiki structure matters: page graph, tours, and conceptual navigation

The query found wiki/living-doc results such as `Lido – Wiki based Living Documentation with Domain Knowledge` (DOI `10.5220/0005643700220026`, 2016), `Using the wiki to deliver paperless software documentation` (DOI `10.1109/ipcc.2011.6087219`, IPCC, 2011), and `JTourBus: Simplifying Program Understanding by Documentation that Provides Tours Through the Source Code` (DOI `10.1109/icsm.2007.4362619`, ICSM, 2007).

Karpathy-style wiki implication: prefer a small graph of dense pages over one giant document:

- `README.md` for orientation and install/run;
- `docs/wiki/index.md` for map and page list;
- concept pages like `architecture.md`, `data-flow.md`, `extension-lifecycle.md`, `skill-lifecycle.md`;
- decision pages when trade-offs matter;
- source-backed “tours” for key flows.

### 6. RAG and knowledge graphs are useful inputs, not final truth

The sweep found `RepoGraph: Enhancing AI Software Engineering with Repository-level Code Graph` (DOI `10.48550/arxiv.2410.14684`, arXiv, 2024), `CodeRAG: Finding Relevant and Necessary Knowledge for Retrieval-Augmented Repository-Level Code Completion` (DOI `10.18653/v1/2025.emnlp-main.1187`, EMNLP, 2025), and `AskGraph: A Dependency-Aware Code Assistant Powered by Code Graphs and LLM-Generated Cypher Queries` (DOI `10.1109/icsme64153.2025.00065`, ICSME, 2025).

Skill implication: if `codebase-map-understand.md` or `.understand-anything/knowledge-graph.json` exists, `wiki-docs` should use it as a lead source for page candidates and tours, but verify every claim against live files. This matches this package’s Understand-artifact discipline.

## Performance claims hygiene

This research does not use performance metrics. If future docs cite productivity, accuracy, hallucination reduction, or benchmark improvements, the exact paper, task, dataset, model, and evaluation setup must be named. Do not claim “wiki-docs improves documentation quality” without a local validation signal such as link checks, stale-reference checks, reviewer acceptance, or test/docs drift closure.

## Evidence gaps

- Search results are metadata-only; no full text or abstracts were parsed.
- OpenAlex was rate-limited during this sweep, so citation expansion used Semantic Scholar fallback.
- Karpathy-style wiki is a practice pattern rather than a formal academic term; the report maps it to living documentation, wiki navigation, traceability, and dense source-backed knowledge pages.
- This report does not yet inspect this repo’s docs to choose exact first wiki pages.

## Implications for a `wiki-docs` skill

### Proposed skill name and location

- `skills/documentation/wiki-docs/SKILL.md` or `skills/engineering/wiki-docs/SKILL.md`.
- Prefer `skills/documentation/` only if adding more docs skills soon; otherwise `skills/engineering/wiki-docs/` keeps package topology smaller.

### Trigger description

Use when asked to create, update, audit, or maintain a project wiki, full-project docs, architecture docs, onboarding docs, README sets, or Karpathy-style agent-readable documentation.

### Workflow shape

1. Inspect repo instructions, `git status`, README/CONTEXT, docs tree, package manifests, tests/CI, and `codebase-map-understand.md` when present.
2. Classify docs task: create wiki, update stale page, fill missing page, audit docs drift, generate source tour, or maintain existing wiki.
3. Build a docs map:
   - current docs pages;
   - code modules they claim to describe;
   - missing high-value pages;
   - stale or unverified claims;
   - broken local links.
4. Pick one bounded docs slice unless the user explicitly asked for a full wiki rebuild.
5. Read live source for every factual claim.
6. Edit docs with code citations and update receipts.
7. Validate links, package docs tests, and any relevant command examples.

### Karpathy-style wiki page rules

- Dense, skimmable Markdown.
- Stable filenames and headings.
- Concept-first pages, not API dumps.
- Every page starts with “what this is” and “start here”.
- Cross-link related pages.
- Include source citations (`path:line`) for architecture and behavior claims.
- Include “Update triggers” so future agents know when the page may be stale.
- Avoid huge generated prose blocks.

### Validation gate

Before claiming docs are updated:

- named files inspected;
- named docs pages changed;
- local Markdown links checked where practical;
- commands/examples verified or marked unverified;
- stale claims removed or explicitly labeled;
- `npm test` or repo docs validation run when available.

### Red lines

- Do not rewrite full docs without explicit full-rebuild scope.
- Do not document secrets, internal credentials, or private paths.
- Do not treat codebase maps or model memory as source of truth.
- Do not invent architecture decisions; cite ADRs or live code, or label as interpretation.
- Do not overwrite human-authored docs tone/style without preserving intent.

### Minimal first implementation slice

Add `wiki-docs` as a skill under `skills/engineering/wiki-docs/` with no scripts. It should route full-project docs updates, require source-backed claims, use `codebase-map-understand.md` as lead evidence when present, and validate through existing repo tests plus link checks where available. Defer deterministic link-check tooling until the first real wiki-docs run proves the need.
