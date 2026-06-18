# Skill building for LLM agents and harnesses

## Method and limits

Question: "skill building for LLM agents and harnesses".

I ran a Standard ResearchForge sweep on 2026-06-17 from `pi-package-goal/research/skill-building-llm-agents/`: 6 query variants across OpenAlex, Crossref, Semantic Scholar, and arXiv, then citation expansion for 5 seed papers. The sweep retrieved metadata, titles, DOIs, and citation graphs only. No copyrighted full text was downloaded or used.

Limits:
- Semantic Scholar rate-limited 5 of 6 query files with HTTP 429; one query still returned 20 records.
- One Crossref query returned a normalization error (`paper title is required`).
- arXiv and OpenAlex were strong for current agent-skill/harness language; Crossref returned more noisy records for general "skill" queries.
- Several very recent arXiv records are 2025–2026 preprints; treat them as emerging directions, not settled evidence.

## Bottom line

The retrieved literature supports a practical definition of LLM-agent "skills" as externalized, reusable behavior modules that combine instructions, tool affordances, examples, memory traces, and evaluation hooks. The strongest recurring pattern is not "more prompts" but skill lifecycle engineering: discover or author skills, compile/package them for a harness, retrieve the right skill at runtime, evaluate execution, and maintain the library as software.

For Pi-like agent harnesses, the evidence points to five design priorities: explicit skill contracts, portability across tool/runtime frameworks, skill-library governance, evaluation against real tool-use tasks, and security controls for third-party or self-generated skills.

## Main themes

### 1. Agent skills sit above raw tool calls

The search directly surfaced papers whose titles distinguish agentic skills from simple tool invocation: *SoK: Agentic Skills - Beyond Tool Use in LLM Agents* (DOI 10.48550/arxiv.2602.20867, arXiv, 2026) and *Agent Skills for Large Language Models: Architecture, Acquisition, Security, and the Path Forward* (arXiv result, no DOI printed in the arXiv file). This supports treating a skill as a higher-level unit: task framing, constraints, procedure, tool policy, examples, and verification criteria.

Implication for harnesses: skill files should not be thin prompt snippets only. They should declare activation scope, required tools, safety gates, expected artifacts, and validation receipts.

### 2. Skill acquisition is increasingly autonomous, but needs governance

Several retrieved records target autonomous skill creation or improvement:
- *CASCADE: Cumulative Agentic Skill Creation through Autonomous Development and Evolution* (DOI 10.48550/arxiv.2512.23880, arXiv, 2025).
- *Agentic Skill Discovery* (arXiv result).
- *Skill-SD: Skill-Conditioned Self-Distillation for Multi-turn LLM Agents* (arXiv result).
- *Reinforcement Learning for Self-Improving Agent with Skill Library* (arXiv result).
- *Memento-Skills: Let Agents Design Agents* (arXiv result).

The pattern is clear: agents can propose, distill, or evolve reusable routines from traces. But self-created skills introduce drift, unsafe affordances, prompt injection surfaces, and duplication. A harness should allow suggestion queues and trace-derived drafts, but require human approval before enabling new executable behavior.

### 3. Reusable skill libraries can regress performance as they grow

The arXiv sweep returned *More Skills, Worse Agents? Skill Shadowing Degrades Performance When Expanding Skill Libraries* (arXiv result). Even without full-text claims, the title flags an important design risk: retrieval collisions and overlapping skills can degrade agent behavior.

Harness implication: a mature skill system needs library-level operations: naming conventions, conflict detection, dependency graphs, deprecation, semantic search tests, and negative examples showing when not to use a skill.

### 4. Portability and compilation are becoming first-class concerns

The sweep returned *SkCC: Portable and Secure Skill Compilation for Cross-Framework LLM Agents* (arXiv result) and *Skill-as-Pseudocode: Refactoring Skill Libraries to Pseudocode for LLM Agents* (arXiv result). These results match a harness need: skills should be portable enough to move between agent runtimes, but precise enough for runtime execution.

Practical pattern: keep a human-readable skill contract, then compile or adapt it into runtime-specific prompt/tool wiring. Do not bake all harness-specific details into the skill's conceptual layer.

### 5. Experience and reflection remain key skill-building mechanisms

*ExpeL: LLM Agents Are Experiential Learners* (DOI 10.1609/aaai.v38i17.29936, AAAI, 2024) was retrieved and citation-expanded. *Voyager: An Open-Ended Embodied Agent with Large Language Models* (DOI 10.48550/arxiv.2305.16291, arXiv, 2023) was also retrieved and citation-expanded. These papers are central exemplars of agents improving behavior through experience, reflection, and reusable capabilities rather than one-shot prompting.

Harness implication: logs and execution traces should be structured for later skill extraction: objective, tools used, files touched, errors, fixes, tests, and final validation.

### 6. Memory, planning, and social simulation provide adjacent architecture patterns

*Generative Agents: Interactive Simulacra of Human Behavior* (DOI 10.1145/3586183.3606763, ACM, 2023) was retrieved and citation-expanded. It is not a skill-library paper per se, but it is relevant because it popularized memory/reflection/planning loops for agent behavior. Survey papers such as *A survey on large language model based autonomous agents* (DOI 10.1007/s11704-024-40231-1, Frontiers of Computer Science, 2024) and *The rise and potential of large language model based agents: a survey* (DOI 10.1007/s11432-024-4222-0, Science China Information Sciences, 2024) place skill-like modules among broader agent components: profile, memory, planning, action, and evaluation.

Harness implication: skills should interoperate with memory and planning, but remain separable enough to audit and test.

### 7. Evaluation is shifting toward tool/harness benchmarks

The sweep retrieved *Evaluation and Benchmarking of LLM Agents: A Survey* (DOI 10.1145/3711896.3736570, ACM, 2025), *MCPVerse: An Expansive, Real-World Benchmark for Agentic Tool Use* (DOI 10.48550/arxiv.2508.16260, arXiv, 2025), and *OSWorld-MCP: Benchmarking MCP Tool Invocation In Computer-Use Agents* (DOI 10.48550/arxiv.2510.24563, arXiv, 2025).

For harness work, this suggests skill quality should be measured at the task/tool boundary: did the agent call the right tools, preserve state, avoid unsafe actions, respect approval gates, and produce verifiable artifacts?

### 8. Domain-specific tool augmentation is a strong template

*Augmenting large language models with chemistry tools* (DOI 10.1038/s42256-024-00832-8, Nature Machine Intelligence, 2024) shows the broader pattern of coupling LLMs to domain tools. *OpenAGI: When LLM Meets Domain Experts* (DOI 10.48550/arxiv.2304.04370, arXiv, 2023) similarly points to agent systems that connect LLMs with specialized expertise.

Harness implication: skill packs should be domain packages, not global prompt clutter. A skill bundle can encode domain terms, tool policies, validation commands, and safe handoffs for a bounded area.

## Performance claims hygiene

For agent-skill work, the unsafe claim pattern is "skill X improves agents" without naming the benchmark, task distribution, model, and harness. Use this safer pattern instead:

> Paper X (DOI, venue, year) reports improvement on benchmark/task Y under model/harness Z. Treat transfer to other agents, tools, or repositories as unproven until reproduced locally.

This report does not assert numeric performance improvements because the sweep used metadata/search output and citation graphs, not full-text extraction of benchmark tables.

## Evidence gaps

- Few retrieved records provide stable, peer-reviewed consensus on skill-library maintenance; much of the direct skill-library work is recent arXiv.
- Security and prompt-injection risks for third-party skill bundles appeared in titles but need a dedicated security-focused sweep.
- Evaluation remains fragmented: agent benchmarks, MCP/tool benchmarks, software-agent benchmarks, and domain-tool benchmarks do not yet form one standard harness conformance suite.
- More evidence is needed on negative transfer, skill shadowing, and retrieval conflicts in large skill libraries.
- Human factors are underdeveloped: *Toward User Comprehension Supports for LLM Agent Skill Specifications* appeared in arXiv results, suggesting readability and operator trust are active concerns.

## Implications for Pi / packaged LLM-agent skills

1. Treat each skill as a versioned software artifact: activation conditions, procedure, tools, safety gates, outputs, and verification receipts.
2. Add lifecycle support: propose → review → enable → evaluate → deprecate.
3. Keep skill libraries searchable but bounded; add conflict tests for overlapping triggers.
4. Preserve provenance for generated or imported skills: source repo, license, author, changes, validation commands.
5. Prefer progressive disclosure: short `SKILL.md` contract plus referenced examples/scripts/templates.
6. Support harness portability by separating conceptual skill intent from Pi-specific execution details.
7. Evaluate skills with real harness traces, not prompt-only unit tests: tool calls, files changed, errors handled, approvals respected, and final artifacts produced.
