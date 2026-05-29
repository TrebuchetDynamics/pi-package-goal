---
name: improve-codebase-architecture
description: Produce evidence-backed architecture-deepening reviews using repo study, CONTEXT.md vocabulary, and ADR decisions. Use when the user wants architecture improvement, refactoring opportunities, tighter seams, better testability, or AI-navigable code.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability: one small interface, one high-leverage implementation, and tests that cross the same seam as callers.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into "component," "service," "API," or "boundary." Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place. (Use this, not "boundary.")
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles (see [LANGUAGE.md](LANGUAGE.md) for the full list):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is _informed_ by the project's domain model. The domain language gives names to good seams; ADRs record decisions the skill should not re-litigate.

## Skill handoffs

- Use evidence from `diagnose` when a bug exposed missing locality, hidden coupling, or no correct test seam; preserve the repro artifact and expected deeper-seam success signal.
- Use failed/frustrating `tdd` planning as input when the public interface is too wide, too shallow, or unstable; preserve the testability artifact.
- Use `grill-with-docs` after selecting a candidate so domain terms and durable decisions land in CONTEXT.md or ADRs.
- Use `prototype` when two possible seams look plausible and a throwaway model can answer which has more leverage.
- Return to `tdd` with the chosen interface, target tests, and success signal so behavior is locked at the new seam.

## Process

### 1. Study the repo before proposing architecture

Start with the repository's own evidence, not generic heuristics. Inspect:

1. repo instructions and git state (`AGENTS.md`, `git status --short --branch`);
2. orientation docs (`README.md`, `CONTEXT.md`, `CONTEXT-MAP.md`, `docs/adr/`, `TODO.md`/plans when present);
3. `codebase-map-understand.md` when present, then the exact files it points to;
4. package/app manifests, validation scripts, and tests for the area;
5. callers and callees around each suspected seam using `rg`, `find`, and targeted reads.

Build working study notes with domain terms, ADR constraints, hot paths, caller/test evidence, validation commands, and candidate friction. Do not write repo files during exploration unless the user asked for durable docs.

Explore organically and record where you feel friction:

- understanding one concept requires bouncing between many small modules;
- a module is shallow — interface nearly as complex as implementation;
- pure functions were extracted for testability, but real bugs hide in orchestration;
- tightly-coupled modules leak across seams;
- tests pierce implementation details or miss the behaviour behind the interface.

For every candidate, verify at least one caller path and one test/validation path. Apply the **deletion test**: would deleting the module concentrate complexity, or just move it? A "yes, concentrates" is the signal you want. Classify the dependency shape with [DEEPENING.md](DEEPENING.md): `in-process`, `local-substitutable`, `ports & adapters`, or `mock`.

Study quality gate before reporting:

- at least two evidence-backed candidates, unless the repo area is too small;
- no candidate without caller evidence, validation evidence, and deletion-test result;
- no stale generated map used without checking the live files it names;
- no production-code edits during exploration.

See [REPO-STUDY.md](REPO-STUDY.md) for the full evidence checklist and confidence rubric.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the OS temp directory so nothing lands in the repo. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `%TEMP%` on Windows), and write to `<tmpdir>/architecture-review-<timestamp>.html` so each run gets a fresh file. Try to open it for the user — `xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows — and always tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals — use Mermaid when relationships are graph-shaped, and hand-built divs/SVG when you want something more editorial. Each candidate gets a **before/after visualisation**.

For each candidate, render a card with:

- **Files** — involved files/modules;
- **Study evidence** — docs, callers, tests, commands, graph facts, and deletion-test result;
- **Dependency category** — `in-process`, `local-substitutable`, `ports & adapters`, or `mock` from [DEEPENING.md](DEEPENING.md);
- **Problem** — one sentence on what hurts;
- **Solution** — one sentence on what changes;
- **Wins** — terse bullets naming locality, leverage, and testability gains;
- **Before / After diagram** — the centrepiece, side-by-side and custom-drawn;
- **Recommendation strength** — `Strong`, `Worth exploring`, or `Speculative`.

End with a **Top recommendation** section: which candidate to tackle first and why.

**Use CONTEXT.md vocabulary for the domain, and [LANGUAGE.md](LANGUAGE.md) vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card. Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, report:

```text
Architecture review generated: <absolute html path>
Evidence base: <docs/tests/commands/maps inspected>
Top recommendation: <candidate>
Next question: Which of these would you like to explore?
```

### 3. Approval continuation

If the user replies with `lgtm`, `go ahead`, `approved`, or similar after the report, treat it as selecting the **Top recommendation** unless they named a different candidate. Do not ask the same exploration question again.

Continue according to the candidate type:

- **Mechanical cleanup** (delete an unused duplicate Module, remove an obsolete export, move code behind an already-chosen seam): restate the accepted candidate, inspect the exact live files and git diff, make the smallest safe edit, then run the focused validation path from the report plus package/project validation when available.
- **Design-bearing refactor** (new Interface, new Adapter, cross-module migration, ADR-sensitive change): restate the accepted candidate and enter the grilling loop before editing production code.
- **Risky or unclear ownership** (dirty unrelated worktree, destructive deletion without caller/test proof, broad migration): stop and report the blocker or ask one hard ownership question.

For mechanical cleanup, the review phase is over once the user approves the candidate; production-code edits are allowed only inside the accepted candidate's blast radius and only with validation evidence.

### 4. Grilling loop

Once the user picks a design-bearing candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened Module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md` — same discipline as `/grill-with-docs` (see [CONTEXT-FORMAT.md](../grill-with-docs/CONTEXT-FORMAT.md)). Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons and self-evident ones. See [ADR-FORMAT.md](../grill-with-docs/ADR-FORMAT.md).
- **Want to explore alternative interfaces for the deepened module?** See [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md).

## Red lines

- Do not produce a generic architecture review without repo evidence.
- Do not include a candidate that only says "make it cleaner" or "split this up" without locality/leverage proof.
- Do not edit production code during the review phase.
- Do not write the HTML report into the repository.

## Shared contract

Follow [the shared skill contract](../COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
