# Agentic coding skills for automatic codebase improvement

## Method and limits

Question: research skills useful for agentic coding that can be let loose on a codebase to improve architecture, fix bugs, and design layouts, then use the findings to improve or add packaged skills under `skills/`.

Depth: Standard. I ran six query variations across OpenAlex, Crossref, Semantic Scholar, and arXiv with `rforge v0.1.11`, then ran citation expansion on five seed papers. The sweep retrieved metadata only; I did not download copyrighted full text or run any human-gated OA acquisition. OpenAlex and Semantic Scholar rate-limited some later requests, so the report leans on retrieved metadata, DOI/title evidence, and citation graphs that succeeded.

Source coverage from `rforge search stats --dir .`:

- arXiv: 120 records across 6 files
- Crossref: 108 records across 6 files
- OpenAlex: 82 records across 6 files
- Semantic Scholar: 25 records across 6 files
- Total unique DOIs: 300

## Bottom line

The evidence points to **workflow skills**, not monolithic “autonomous coder” skills: the useful pattern is a gated loop that retrieves repo context, creates or finds a deterministic feedback signal, changes the smallest safe slice, validates, and only then continues. For this package, the best next improvements are: strengthen `goal`/`technical-auditor`/`diagnose` handoffs into an explicit autonomous improvement loop; add narrow skills for agentic refactoring and UI design critique; and encode benchmark hygiene from SWE-bench-style work so agents do not self-report completion from weak evidence.

## Main themes

### 1. Software-engineering agents work best when the environment interface is explicit

`SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering` (DOI `10.48550/arxiv.2405.15793`, arXiv, 2024) and `AutoCodeRover: Autonomous Program Improvement` (DOI `10.1145/3650212.3680384`, ACM, 2024) appeared as high-signal seeds and both had successful citation expansion. Their titles and placement in the SWE-bench/autonomous-program-improvement cluster support a practical skill lesson: codebase automation needs a strong agent-computer interface, not just better prompting.

For `skills/`, this argues for skills that force the agent to name:

- repo entrypoints and touched modules before edits;
- the exact command/test/repro that will prove improvement;
- the tool/interface it will use for navigation, search, edit, and verification;
- what condition stops the loop.

Current package fit: `goal`, `technical-auditor`, `diagnose`, `tdd`, `skill-folder-refactor`, and `git-commit-push` already cover pieces. Missing piece: a single orchestrator skill for “autonomously improve this codebase safely” that composes them with an explicit feedback loop.

### 2. Agentless and low-abstraction baselines are important

`Agentless: Demystifying LLM-based Software Engineering Agents` (DOI `10.48550/arxiv.2407.01489`, arXiv, 2024) and `Demystifying LLM-Based Software Engineering Agents` (DOI `10.1145/3715754`, ACM, 2025) were retrieved in the SWE-bench/agentic-coding sweep. The direct implication for this repo is Ponytail-shaped: do not add multi-agent scaffolding until a simple loop fails.

Skill design rule:

1. Start with one agent, one objective, one validation loop.
2. Add memory only when the context window or long-running state demonstrably fails.
3. Add delegation only when the task has separable review/planning/execution roles.
4. Prefer deterministic tools and repo evidence over self-reflection.

This reinforces existing `ponytail` and `goal` behavior, but suggests adding stronger anti-overengineering text to any future autonomous-improvement skill.

### 3. Debugging and program repair need a repro-first loop

The bug-fixing/APR sweep found:

- `Teaching Large Language Models to Self-Debug` (DOI `10.48550/arxiv.2304.05128`, arXiv, 2023).
- `DebugBench: Evaluating Debugging Capability of Large Language Models` (DOI `10.18653/v1/2024.findings-acl.247`, Findings of ACL, 2024).
- `Debug like a Human: A Large Language Model Debugger via Verifying Runtime Execution Step by Step` (DOI `10.18653/v1/2024.findings-acl.49`, Findings of ACL, 2024).
- `A Systematic Literature Review on Large Language Models for Automated Program Repair` (DOI `10.48550/arxiv.2405.01466`, arXiv, 2024).

The useful skill lesson is not “ask the model to debug itself”; it is “make the model verify each debugging step against execution.” This matches `skills/engineering/diagnose/SKILL.md`, which already says the feedback loop is the skill. Improvement opportunity: make `diagnose` easier to invoke from autonomous codebase improvement, and add a compact “bug-harvest” mode that scans failing tests/TODOs/issues, chooses one reproducible bug, fixes it, and hands off to `git-commit-push`.

### 4. Architecture/refactoring agents need locality, smells, and safety gates

The architecture/refactoring sweep found:

- `Comparative analysis of design pattern implementation validity in LLM-based code refactoring` (DOI `10.1016/j.jss.2025.112519`, Journal of Systems and Software, 2025).
- `AI-Driven Refactoring: A Pipeline for Identifying and Correcting Data Clumps in Git Repositories` (DOI `10.3390/electronics13091644`, Electronics, 2024).
- `Refactoring for software architecture smells` (DOI `10.1145/2975945.2975946`, ACM, 2016).
- `RMove: Recommending Move Method Refactoring Opportunities using Structural and Semantic Representations of Code` (DOI `10.1109/icsme55016.2022.00033`, ICSME, 2022).
- `RefAgent: A Multi-agent LLM-based Framework for Automatic Software Refactoring` (DOI `10.48550/arxiv.2511.03153`, arXiv/preprint, 2025/2026 metadata).

The evidence cluster supports the current `technical-auditor` architecture vocabulary: locality, leverage, seam, callers, validation evidence. It also suggests adding a concrete refactoring skill or mode focused on **one safe refactor at a time**:

- detect one smell or module seam;
- prove caller locality;
- add/confirm tests;
- perform behavior-preserving move/extract/delete;
- run scoped validation and whole-project validation.

Existing `skill-folder-refactor` covers folder topology. Missing piece: smaller cross-folder architecture refactors that are not folder splits.

### 5. UI/design agents need human-in-the-loop critique and visual evidence

The UI/design sweep found:

- `UISGPT: Automated Mobile UI Design Smell Detection with Large Language Models` (DOI `10.3390/electronics13163127`, Electronics, 2024).
- `DesignCoder: Hierarchy-Aware and Self-Correcting UI Code Generation with Large Language Models` (DOI `10.2139/ssrn.6295236`, SSRN/preprint, 2025/2026 metadata).
- `Vibe Design: Human-in-the-loop Agentic Framework for UI Design with Large Language Models` (DOI `10.24251/hicss.2026.530`, HICSS, 2026; related SSRN DOI `10.2139/ssrn.6297816`).
- `Designing with Language: Wireframing UI Design Intent with Generative Large Language Models` (arXiv result without DOI in retrieved metadata).

For `skills/frontend/`, this suggests two changes:

1. Keep `ui-design` as orchestrator, but require visual-state evidence for autonomous design work: affected surface, screenshots or DOM inspection when available, accessibility checks, responsive states, and before/after rationale.
2. Add or strengthen a “UI design smell audit” mode: identify generic AI slop, hierarchy problems, accessibility issues, empty/loading/error state gaps, and visual inconsistency before generating code.

Do not let an autonomous UI skill ship visual claims without visual evidence; source metadata supports human-in-the-loop and self-correcting design, not blind finality.

### 6. Evaluation and benchmark hygiene must be built into completion

The sweep found benchmark/evaluation papers including:

- `Evaluation and Benchmarking of LLM Agents: A Survey` (DOI `10.1145/3711896.3736570`, ACM, 2025).
- `Revisiting SWE-Bench: On the Importance of Data Quality for LLM-Based Code Models` (DOI `10.1109/icse-companion66252.2025.00075`, ICSE Companion, 2025).
- `SWE-Bench+: Enhanced Coding Benchmark for LLMs` (DOI `10.48550/arxiv.2410.06992`, arXiv, 2024).
- `UTBoost: Rigorous Evaluation of Coding Agents on SWE-Bench` (DOI `10.18653/v1/2025.acl-long.189`, ACL, 2025).

Implication: every autonomous improvement skill needs a completion audit that distinguishes proxy signals from real success. The local `/goal` revamp already moved in this direction with `goal_complete` requiring a verification summary. Carry that pattern into new skills: explicit checklist, concrete evidence, no self-approval from “tests pass” unless tests cover the objective.

## Performance claims hygiene

This report does not assert benchmark scores or performance numbers. Retrieved metadata names benchmarks and papers, but without full-text extraction and benchmark tables, safe use is limited to design implications: use deterministic evaluation, beware benchmark contamination/data quality, and require objective-specific validation before claiming completion.

If later work cites success rates from SWE-bench, DebugBench, or UI generation papers, cite the exact paper, metric, model, benchmark split, date/version, and whether the task setting allowed tools, retrieval, retries, or human input.

## Evidence gaps

- Search results are metadata-only; abstracts/full texts were not downloaded.
- OpenAlex rate-limited two search files and three citation-expansion attempts after successful earlier calls.
- Semantic Scholar rate-limited one fallback citation expansion.
- UI/design agent papers are newer and more preprint-heavy than software-engineering agent papers; treat them as weaker evidence until reviewed against full papers.
- The sweep did not inspect package-specific user telemetry or internal Pi session outcomes, so recommendations are literature-informed but not validated against this repo’s skill usage.

## Implications for this package

### Improve existing skills

1. `skills/planning/goal/` and `extensions/goal/`
   - Keep `goal_complete` as the preferred completion path.
   - Add guidance that completion summaries must name validation commands/files, not just say “done.”
   - Consider a goal sub-mode for “autonomous repo improvement” that selects one validated slice at a time.

2. `skills/engineering/diagnose/`
   - Add a “bug-harvest” entry: find one failing command, issue, TODO, or flaky path; build repro; fix; regression-test; hand to delivery.
   - Keep the existing feedback-loop-first doctrine; research supports this as the key differentiator.

3. `skills/engineering/technical-auditor/`
   - Add an “agentic improvement handoff” section: convert top findings into one safe slice with locality/caller/validation evidence.
   - Make architecture refactor candidates explicitly choose “delete / move / extract / adapter” and name the test gate.

4. `skills/frontend/ui-design/`
   - Add design-smell audit checklist: hierarchy, contrast, spacing rhythm, state coverage, accessibility, responsiveness, generic-template smell.
   - Require visual evidence for autonomous layout changes: screenshot, DOM inspection, or explicit limitation if unavailable.

5. `skills/delivery/git-commit-push/`
   - Already aligns well: it demands validation, topic isolation, and final state evidence.
   - Add cross-reference from any autonomous improvement skill so delivery is the final gate.

### Add candidate skills

1. `autonomous-codebase-improver`
   - Orchestrator for safe “let loose” work.
   - Loop: discover repo signals → choose one safe slice → route to `diagnose`/`technical-auditor`/`ui-design`/`tdd` → validate → hand to `git-commit-push`.
   - Hard stop on owner decisions, secrets, deploys, dependency upgrades, broad rewrites.

2. `agentic-refactor`
   - One behavior-preserving refactor at a time.
   - Requires locality proof, caller list, tests, and rollback-friendly diff.
   - Complements `skill-folder-refactor`; does not replace it.

3. `ui-design-smell-audit`
   - Frontend-only audit mode that finds slop and state/accessibility gaps before implementation.
   - Routes to existing frontend skills for fixes.

4. `bug-harvest`
   - Thin wrapper around `diagnose` and `tdd`.
   - Finds one high-confidence bug source from failing tests, issue text, TODO markers, logs, or reproducible command output.

### Minimal next implementation slice

Shortest useful repo change: add an `autonomous-codebase-improver` skill that does not introduce new tooling. It should be an orchestrator only, reusing existing skills:

- Start from `goal` or user objective.
- Inspect `git status`, repo instructions, tests, codebase map if present.
- Pick one slice from evidence.
- Route to exactly one specialist skill.
- Require validation receipts.
- Finish through `git-commit-push`.

This avoids adding an overbuilt multi-agent framework while capturing the research-backed workflow.
