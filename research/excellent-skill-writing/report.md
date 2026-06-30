# Excellent agent-skill writing

## Method and limits

Question: how to write excellent agent skills, then improve `skills/pi/write-a-skill/`.

I ran a Standard ResearchForge sweep on 2026-06-30 in `research/excellent-skill-writing/` using five query variants across OpenAlex, Crossref, Semantic Scholar, and arXiv via `rforge search batch --sources scholarly-fast --limit 20 --stats`, then checked local Pi docs and the existing prior report at `research/skill-building-llm-agents/report.md`.

Limits:
- OpenAlex and Semantic Scholar were mostly rate-limited; arXiv and Crossref still returned useful metadata.
- This report uses metadata/abstracts/search records and prior local research, not copyrighted full text.
- Direct skill-library research is very recent, often 2026 preprints; treat claims as design signals, not settled consensus.

## Bottom line

Good skills are not long prompts. They are small, auditable runtime contracts: when to load, what state to inspect, what action sequence to follow, what not to do, what evidence proves success, and how to keep details out of standing context until needed.

For Pi, `write-a-skill` should push authors toward:
1. concrete triggers and anti-triggers to reduce skill shadowing;
2. operational basis, output contract, boundaries, and one worked example;
3. progressive disclosure via references/scripts;
4. provenance and permission gates for imported or executable skills;
5. validation from local package tests plus at least one realistic invocation/review path.

## Findings to apply

### 1. Skill specs need user-comprehension anchors

`Toward User Comprehension Supports for LLM Agent Skill Specifications` (arXiv:2605.19362) reports that among 878 cybersecurity skill specs, operational-basis cues were common, but example/expected-outcome cues were rare and only 2.3% showed all four anchors: operational basis, output contract, boundary disclosure, and example capability demonstration.

Implication: every non-trivial skill should state what it consumes/inspects, what it produces, what it refuses or escalates, and include a tiny example or review prompt.

### 2. Bigger libraries create routing failures

`More Skills, Worse Agents? Skill Shadowing Degrades Performance When Expanding Skill Libraries` (arXiv:2605.24050) frames degradation in large skill libraries as mostly selection failure rather than context overhead.

Implication: descriptions must be specific, overlap must be checked against the inventory, and authors should add anti-triggers or split/merge skills when names and triggers collide.

### 3. Skills should be typed enough to execute

`Skill-as-Pseudocode` (arXiv:2605.27955) argues that free-form Markdown makes agents re-derive input schemas and invocation syntax, while typed contracts plus concrete templates reduce confusion. `SkCC` (arXiv:2605.03353) similarly emphasizes portable, secure skill compilation.

Implication: avoid vague prose. Write entry conditions, required inputs, validation commands, and output shape as contracts/templates.

### 4. Skills need lifecycle and governance

`Agent Skills for Large Language Models` (arXiv:2602.12430) describes skills as packages of instructions/code/resources and highlights architecture, acquisition, deployment, and security. `Harnessing Agent Skills` (DOI:10.2139/ssrn.6871959) frames runtime responsibilities across supply chain, mediation, execution control, and evidence/feedback.

Implication: imported or generated skills need provenance, license checks, permission gates, and validation receipts. Treat skills as package artifacts, not disposable prompts.

### 5. Verification loops matter

`Iterative Audit Convergence in LLM-Managed Multi-Agent Systems` (DOI:10.3390/software5020026) reports structured iterative audits surfacing consistency defects across prompt/spec files. Prior local research also found recurring evidence for evaluation at the tool/task boundary.

Implication: skill authoring should include a closeout review: package validation, link checks, trigger-shadowing check, and one realistic scenario that would fail if the skill is vague.

## Changes made to `write-a-skill`

The skill was updated to add:
- a research-backed authoring rule set;
- explicit trigger/anti-trigger and shadowing guidance;
- comprehension anchors;
- provenance/security handling for imported skills;
- a realistic validation/review gate;
- a tighter template with examples and anti-triggers.
