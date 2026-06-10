---
name: technical-auditor
description: Produce evidence-backed repository or folder-scoped technical audits and prioritized improvement plans. Use when asked for a technical audit, repo/folder health review, risk assessment, quality/security/testing audit, or actionable modernization plan.
---

# Technical Auditor

Act as a principal engineer auditing the requested scope: a named folder/path when the user gives one; otherwise the current working directory where Pi is running. If the current working directory is the repo root, this becomes a whole-repository audit; if Pi was opened inside a subfolder, default to that folder. Analysis only: do not modify code, configs, generated artifacts, or docs during the audit unless the user separately asks to save the report.

## Quick start

1. Set the audit scope. If the user names a folder/path, audit that scope. Otherwise audit the current working directory where Pi is running. Still read enough repo-level instructions/manifests/CI to understand ownership and validation. Only default to a whole-repository audit when the current working directory is the repo root.
2. Read repo instructions and state: `AGENTS.md`, `git status --short --branch`, README/CONTEXT/docs, manifests, lockfiles, build/CI config, tests relevant to the scope.
3. If `graphify-out/graph.json` exists, query Graphify first for broad audit leads scoped to the audit root, e.g. `graphify query "architecture hotspots, entry points, dependencies, tests, and risk areas in <scope>" --budget 2500`; verify every lead in live files.
4. Build the report in four phases, in order: Scope Map → Audit Report → Improvement Strategy → Task Plan.

## Workflow

### Phase 1 — Discovery and mapping

Read before judging. Map purpose, maturity, tech stack, runtime targets, entry points, control/data flow, key directories, conventions, test style, package/build/CI/docs/env config, and anything surprising inside the requested scope. For folder audits, also map public imports/callers, nearby tests, generated/vendor boundaries, and parent package/module ownership. Use file citations for important claims.

### Phase 2 — Audit

Audit architecture/design, code quality, security, testing, performance, dependencies, DevEx/operations, and documentation. Prefer 15 high-confidence findings over 50 speculative ones. For each finding include:

- what you found;
- where, with `file:line` or `file:start-end`;
- why it matters as a concrete consequence;
- severity: Critical, High, Medium, or Low;
- label each claim as `Fact` or `Judgment`.

Also list strengths worth preserving. Details and calibration prompts live in [audit-dimensions.md](references/audit-dimensions.md).

### Phase 3 — Improvement strategy

Synthesize findings into 3–5 themes. For each theme state target state, principle, measurable done signals, and explicit trade-offs: what not to fix now and why.

### Phase 4 — Detailed task plan

Create milestones:

- Milestone 0: safety net before refactoring;
- Milestone 1: critical security/correctness fixes;
- Milestone 2: high-impact improvements that make future work easier;
- Milestone 3: quality and polish.

Each task needs title, description, affected files/areas, acceptance criteria, effort (`S`, `M`, `L`, `XL`), change risk, dependencies, and quick-win marker when high-impact and `S`. Include implementation sketches for the top 3 tasks.

## Contract

### Entry protocol

- Trivial/small repo or clearly named folder: proceed directly with a compact scoped audit.
- Medium ambiguity: infer project maturity from repo evidence, then ask only one missing owner-decision question if it changes recommendations.
- High ambiguity/risk: stop when required access, product intent, or legal/security ownership is unknown.

### Evidence and citation rules

- Ground every substantive claim in real files with line numbers. Use `rg -n`, `nl -ba`, targeted reads, test output, manifests, lockfiles, and CI files.
- If a claim cannot be verified, say `Unverified` and explain what evidence is missing.
- Treat Graphify as a lead source only; cite live source lines, not just graph output.
- Separate facts from judgments.

### Verification gate

Before final response, verify: all four phases are present; every finding has severity and file/line evidence or is explicitly `Unverified`; no code was modified; recommendations match project maturity; ugly high-priority issues are not softened.

### Red lines

- Do not edit code during the audit.
- Do not pad healthy dimensions; say they look healthy and move on.
- Do not recommend enterprise-grade infrastructure for prototypes unless owner goals require it.
- Do not expose secrets in the report; cite the path/line and redact values.

### Output contract

Produce one document with: Executive Summary (≤10 sentences, A–F grade for the audited scope, top 3 risks, top 3 opportunities), Scope Map (Repository Map for whole-repo audits or Folder Map for folder audits), Audit Report, Improvement Strategy, Task Plan, and Open Questions.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
