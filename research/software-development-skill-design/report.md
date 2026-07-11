# Very recent guidance for better software-development agent skills

## Method and limits

Research question: **What very recent evidence can improve reusable agent skills for software development in `pi-package-goal`?**

On 2026-07-11, I ran a Comprehensive ResearchForge sweep with 28 query variants. An initial `--sources all` run timed out after completing 25 queries and produced substantial cross-domain noise. I therefore completed all 28 queries with the focused CS-oriented sources OpenAlex, Crossref, Semantic Scholar, and arXiv. The focused sweep retrieved 1,839 records and deduplicated them to 1,364 DOI/identifier records; OpenAlex, Crossref, and arXiv completed every query, while Semantic Scholar completed 8 and rate-limited 20. Citation expansion succeeded through OpenAlex for five direct seed papers. I also generated an OSS search plan, inspected current Pi skill documentation, `skills/pi/write-a-skill/SKILL.md`, the shared package contract, package validation code, and a deterministic structural audit of the 72 bundled `SKILL.md` files.

This is metadata/abstract-level synthesis. No full text was downloaded, no screening decisions were self-approved, and no scientific claim was finalized beyond what retrieved abstracts visibly report. Most direct work is from 2026 preprints, so the findings are strong design signals rather than settled consensus.

## Bottom line

The newest evidence argues against making skills broader or more numerous by default. Better software-development skills are **narrow, compatible with the current project, cheap to load, easy to route, secure to inspect, and evaluated against real tasks both with and without the skill**.

This repository already has a strong authoring contract and safety baseline. Its biggest missing proof is behavioral: package tests show that resources are well-formed, but there is no local paired benchmark showing that representative skills improve task outcomes, avoid routing collisions, and justify their token cost.

## Main themes and actionable tips

### 1. Prove marginal utility; do not assume a skill helps

*SWE-Skills-Bench: Do Agent Skills Actually Help in Real-World Software Engineering?* (DOI `10.48550/arxiv.2603.15401`, arXiv, 2026) pairs 49 public skills with pinned repositories and about 565 task instances across six software-engineering subdomains. Its abstract reports that 39 of 49 skills produced no pass-rate improvement, average gain was only +1.2%, token overhead reached 451% with unchanged pass rates, and three skills degraded performance because version-mismatched guidance conflicted with project context.

**Tip:** for each high-value skill, run the same pinned task with and without the skill. Record acceptance-test result, tool trajectory, tokens/cost, retries, and unsafe or misleading guidance. A skill that does not improve a representative task should be narrowed, pruned, or removed.

### 2. Optimize utility and cost together; pruning is a feature

*SkillMOO: Multi-Objective Optimization of Agent Skills for Software Engineering* (DOI `10.48550/arxiv.2604.09297`, arXiv, 2026) evaluates 16 SkillsBench SE tasks and 38 skill edits. Its abstract reports that pruning and substitution dominated successful edits and reports cost reductions up to 31.7% under its benchmark conditions.

**Tip:** review skills for the smallest useful instruction set. Move rarely needed material to `references/`; delete generic advice the base model already knows; keep only project-specific procedure, safety gates, exact commands, and verification rules in standing skill text.

### 3. Test routing as the catalog grows

*More Skills, Worse Agents? Skill Shadowing Degrades Performance When Expanding Skill Libraries* (arXiv `2605.24050`, 2026) reports degradation up to 21% when scaling to 202 skills and attributes the primary loss to wrong-skill selection rather than context overhead. *Skill Is Not Document: A Query-Conditional Benchmark and Two-Stage Retriever for LLM Agent Skill Routing* (arXiv `2606.03565`, 2026) further argues that skill retrieval must account for whether selected skills work together, not only independent relevance.

**Tip:** maintain a small routing fixture: realistic user prompts, expected skill, allowed companion skills, and forbidden near-neighbors. Test additions against the whole catalog. Give neighboring skills explicit anti-triggers only where overlap exists; merge or retain compatibility shims when that produces a clearer route.

This matters locally because the package exposes 72 skills, including intentionally adjacent families such as `tdd` / `test-driven-development`, architecture aliases, and many frontend design specializations.

### 4. Keep four comprehension anchors

*Toward User Comprehension Supports for LLM Agent Skill Specifications* (arXiv `2605.19362`, 2026) rule-coded 878 cybersecurity skill specifications. Its abstract reports examples in only 19.0% and all four anchors in 2.3%: operational basis, output contract, boundary disclosure, and example capability demonstration.

**Tip:** every non-trivial first-party skill should make those four anchors easy to find. This repository's `write-a-skill` already requires them; turn that guidance into a lightweight validation/review check rather than relying only on author memory.

A local heading/phrase audit found visible example markers in 16/72 skills, output markers in 23/72, validation markers in 13/72, and boundary/safety markers in 24/72. These counts are triage signals only: imported skills and differently named sections can satisfy the intent without matching the heuristic.

### 5. Evaluate the whole trajectory, not only the final test

*AgentLens: Production-Assessed Trajectory Reviews for Coding Agent Evaluation* (arXiv `2607.06624`, 2026) evaluates instruction following, tool use, verification, mistake recovery, and communication alongside formal checks. *Skill Coverage: A Test Adequacy Metric for Agent Skills* (arXiv `2606.20659`, 2026) proposes checking which natural-language constraints were actually exercised and followed.

**Tip:** a representative skill scenario should inspect:

- correct activation and non-activation;
- required repo/context inspection;
- tool choice and ordering;
- observance of approval gates and red lines;
- recovery from one realistic failure;
- runnable verification evidence;
- concise, accurate final handoff.

For critical skills, map each red line and verification rule to at least one scenario. Final tests passing are necessary but do not prove the skill was followed safely.

### 6. Treat every skill, example, and helper as supply-chain code

*Supply-Chain Poisoning Attacks Against LLM Coding Agent Skill Ecosystems* (DOI `10.48550/arxiv.2604.03081`, arXiv, 2026) generated 1,070 adversarial skills across four frameworks and five models. Its abstract reports 11.6%–33.5% bypass rates for payloads embedded in examples/templates, with 2.5% evading both static detection and alignment. *Agent Skills Enable a New Class of Realistic and Trivially Simple Prompt Injections* (DOI `10.48550/arxiv.2510.26328`, arXiv, 2025) reports malicious instructions hidden in long skill files and referenced scripts, including unsafe approval carry-over.

**Tip:** security review must include Markdown examples, templates, references, and helper scripts—not just executable package dependencies. Preserve provenance and licenses, inspect shell/network/file-write behavior, and never broaden a prior narrow approval. The current shared contract already handles much of this; add adversarial fixtures for imported skills rather than more policy prose.

### 7. Detect version drift as contract breakage

The SWE-Skills-Bench abstract directly links some regressions to version-mismatched guidance. The sweep also retrieved *Skill Drift Is Contract Violation: Proactive Maintenance for LLM Agent Skill Libraries* (arXiv `2605.10990`, 2026), which frames changing APIs, packages, and configuration as broken skill contracts.

**Tip:** tag version-sensitive commands and APIs, then validate them through harmless `--help`/`version` checks or pinned fixtures. Avoid hard-coded version advice when repository discovery can determine the current command. Deprecate stale guidance instead of layering exceptions onto it.

## What this repository should change first

1. **Build a tiny paired evaluation set, not a framework.** Start with 6–10 representative first-party skills and one pinned scenario each. Compare skill-on versus skill-off and save acceptance, routing, trajectory, and token receipts.
2. **Add catalog routing fixtures.** Cover known neighbor groups and false-positive prompts before adding more skills.
3. **Triage the longest entry files.** The local audit found 13 skills over 300 lines and 9 over 500. Move rare material to references and test whether pruning preserves task success.
4. **Add a four-anchor review for non-trivial first-party skills.** Exempt tiny compatibility/communication shims where the extra sections would add noise.
5. **Add drift and adversarial checks for imported skills.** Check referenced commands, suspicious instructions in code fences/templates, helper-script behavior, provenance, and licenses.
6. **Only then improve individual prose.** Broad rewrites without paired evaluation risk spending tokens without improving outcomes.

## What is already good

- `skills/pi/write-a-skill/SKILL.md` already encodes trigger precision, anti-triggers, four anchors, progressive disclosure, provenance, security review, and realistic validation.
- `skills/shared/COMMON-CONTRACT.md` already provides repo hygiene, verification evidence, human gates, and safe handoffs.
- Package validation and third-party notices provide a useful structural and provenance baseline.

The next improvement should therefore be executable evaluation evidence, not another layer of authoring advice.

## Claim hygiene

All numeric claims above are attributed to named papers, source/venue, year, and the conditions visible in retrieved abstracts. They should not be generalized to Pi or this package until reproduced locally. In particular, the reported benchmark gains, regressions, bypass rates, and routing losses depend on specific skill sets, models, harnesses, tasks, and evaluation protocols.

## Evidence gaps and failures

- Most direct papers are 2026 preprints; independent replication and peer-reviewed consensus are limited.
- No human-approved full-text screening or extraction was performed.
- No local paired benchmark currently demonstrates which package skills improve outcomes.
- Semantic Scholar rate-limited 20 focused queries; the other three focused sources completed all 28.
- The all-sources run timed out after 25 queries and contained substantial off-topic records; the focused scholarly run is the synthesis basis.
- The structural local audit is heuristic and must not be used as an automatic compliance verdict.
- The OSS artifact is a search plan only; no repository passed license, maintenance, security, or integration review.

## Recommended next step

**Disposition (2026-07-10): intentionally deferred by owner.** Behavioral proof is not required for the current package roadmap. Preserve the evaluation artifacts for possible future use, but do not spend provider funds or claim behavioral gains.

If this work is explicitly reopened, create one minimal evaluation slice for the highest-risk/highest-value skill family—likely coding diagnosis/TDD or skill authoring itself—using pinned tasks, expected routing, deterministic acceptance checks, and a skill-on/skill-off comparison. Use that result to decide whether to prune, split, merge, or revise; do not bulk-edit all 72 skills first.
