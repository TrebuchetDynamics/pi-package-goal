# UI Vault diagnosis pipeline design

**Date:** 2026-07-22
**Status:** Approved
**Scope:** `skills/frontend/ui-vault/`

## Context

The current `ui-vault` skill inspects one selected webpage, searches a pinned 196-resource catalog from `en970/ui-vault`, and proposes three to five improvements. Its catalog retrieval is deterministic, but the preceding page diagnosis is mostly free-form. Weak or unsupported observations can therefore produce irrelevant resource searches.

This design improves diagnosis accuracy without adding browser automation, runtime dependencies, or implementation behavior.

## Goals

- Combine all available evidence while prioritizing the rendered page.
- Diagnose visual quality, usability, accessibility, and technical performance only where evidence supports a conclusion.
- Apply universal checks plus checks tailored to the page type.
- Show complete rubric results, then limit recommendations to the top three to five.
- Trace every recommendation from target evidence to a diagnosed gap and, when applicable, an exact UI Vault catalog item.
- Preserve the skill's proposal-only boundary.

## Non-goals

- Selecting a browser tab automatically.
- Adding Playwright, Lighthouse, axe, or another browser framework.
- Installing dependencies or implementing proposed changes.
- Producing an exhaustive recommendation for every weak score.
- Treating the pinned catalog's pricing, popularity, maintenance, or licensing claims as current without verification.
- Generating a single aggregate quality score.

## Architecture

The skill remains a portable Markdown workflow with a standard-library catalog search helper.

```text
target → evidence → page type → hybrid rubric → confirmed gaps
       → native fix or catalog query → verified shortlist → ranked proposal
```

### 1. Evidence intake

Accept a screenshot or rendered capture, a live URL with readable DOM/CSS, or a local route/file. Combine available inputs in this order:

1. Rendered appearance for user-visible behavior.
2. DOM/CSS for structure and computed causes.
3. Local source for component ownership, tokens, dependencies, routes, and implementation constraints.

The report includes an evidence matrix naming what was inspected and what was unavailable. The skill never invents evidence for an inaccessible viewport, interaction, state, or metric.

### 2. Page classification

Choose one overlay:

- landing page;
- dashboard;
- commerce;
- form or multi-step flow;
- content page.

When the page type is ambiguous, apply only the universal rubric and disclose that no overlay was used.

### 3. Hybrid diagnosis

Apply the universal rubric and the selected overlay. Each criterion records:

- **Score:** `0` broken or absent, `1` weak, `2` acceptable, `3` strong, or `N/A` not assessed.
- **Confidence:** high, medium, or low.
- **Evidence:** a screenshot region, DOM/CSS fact, source location, or measured result.

Only findings scored `0` or `1` with medium or high confidence may generate recommendations. Low-confidence findings remain visible in the diagnosis but cannot enter the recommendation pipeline.

### 4. Gap routing

Classify each eligible gap as either:

- **Foundation/native fix:** the existing stack, semantic HTML, CSS, or platform behavior is sufficient; or
- **Catalog candidate:** a library, asset, pattern source, or specialist tool may materially help.

Native fixes outrank new dependencies. A catalog resource is not required merely because the skill has a catalog.

### 5. Catalog matching

Route eligible catalog gaps to one or more existing category slugs, then query the bundled snapshot with the page stack and desired effect. Inspect no more than eight search results per query and shortlist at most two resources per gap.

Shortlisted resources must be compatible with the existing stack. When network access is available, re-check the link, maintenance state, pricing, and license. Otherwise label the resource `snapshot-only`.

### 6. Ranking

Rank recommendations qualitatively as `P1`, `P2`, or `P3` using, in order:

1. user impact;
2. evidence confidence;
3. existing-stack fit;
4. accessibility and performance safety;
5. implementation effort and risk.

Return only the top three to five recommendations. Explain each priority in one sentence rather than calculating a misleading numeric total.

## Diagnosis rubric

The implementation should keep the rubric in one compact `references/diagnosis-rubric.md` file.

### Universal criteria

1. Purpose and primary action
2. Information hierarchy and scanability
3. Layout and responsive behavior
4. Interaction feedback and UI states
5. Accessibility fundamentals
6. Performance and motion restraint
7. Visual coherence and brand fit

### Landing-page overlay

- Value proposition clarity
- CTA path and competing actions
- Trust and proof
- Section sequence and narrative rhythm

### Dashboard overlay

- Information density and prioritization
- Comparison and data readability
- Navigation and orientation
- Loading, empty, error, and stale-data states

### Commerce overlay

- Product and price clarity
- Decision support and comparison
- Trust, delivery, returns, and risk communication
- Cart or checkout friction

### Form/flow overlay

- Progress and completion expectations
- Labels, instructions, and input affordances
- Validation and error recovery
- Back, cancel, save, and interruption behavior

### Content-page overlay

- Reading measure and typography
- Content hierarchy and navigation
- Discovery and related-content paths
- Image, video, and embedded-media treatment

## Gap-to-category routing

The rubric includes a compact routing table. Initial mappings are:

| Diagnosed need | UI Vault categories |
|---|---|
| Component behavior or missing complex control | `component-libraries` |
| Purposeful motion or scroll storytelling | `animation-scroll` |
| 3D or shader treatment justified by the page concept | `3d-shader-webgl`, `3d-models-scroll` |
| Inconsistent or unsuitable iconography | `icons`, `app-icon-design` |
| Product demonstration or promo media | `mockup-video-tools` |
| Reference research for a weak visual direction | `design-inspiration-galleries`, `framer-templates` |
| Open-source implementation reference | `github-design-repos` |
| Weak palette or typography system | `color-typography` |
| Purposeful cursor or microinteraction treatment | `cursor-microinteraction` |
| Missing illustrative storytelling | `illustration-packs` |
| iOS onboarding or Liquid Glass-specific need | `onboarding-liquid-glass` |

The `claude-skills-design` category remains searchable but is not routed from webpage findings because it improves the agent workflow rather than the selected page. Motion, 3D, shaders, cursors, and heavy media require an explicit fit explanation plus reduced-motion and performance consideration.

## Output contract

The revised report contains:

```markdown
## UI Vault diagnosis

**Target:** <page>
**Page type:** <overlay or universal-only>

### Evidence
| Source | Inspected | Limits |

### Rubric
| Criterion | Score | Confidence | Evidence |

### Prioritized improvements
| Priority | Diagnosed gap | Proposed change | Resource or native fix | Fit | Cost/risk | Verification |

### Foundation-only fixes
<important fixes requiring no UI Vault resource>

### Next step
<smallest accepted implementation slice; no edits performed>
```

Every recommendation must trace to one rubric row. Every resource recommendation must name an exact bundled catalog item. Important foundation fixes remain visible in their own section and do not consume one of the three to five prioritized recommendation slots.

## Failure handling

- **No rendered evidence:** mark visual criteria `N/A`; do not infer appearance from class names alone.
- **Inaccessible or authenticated URL:** ask for a screenshot or local source.
- **Ambiguous page type:** use the universal rubric only.
- **Rendered/source conflict:** rendered behavior wins for the user-visible diagnosis; note the discrepancy and use source only to investigate the cause.
- **No catalog fit:** return the native fix and state `no resource needed`.
- **No network:** retain snapshot results and label their external facts `snapshot-only`.
- **Unsupported performance concern:** mark it `N/A`; do not convert it into a recommendation.

## Validation strategy

### Deterministic checks

Retain tests for:

- category listing;
- category filtering;
- result limits;
- invalid-category rejection;
- pinned catalog category and resource counts;
- package skill inventory and packaged resources.

Run `npm test`, `git diff --check`, and `npm pack --dry-run` before completion.

### Pinned behavioral scenario

Use one fixed review scenario:

- A pricing-page screenshot and matching local source show weak heading hierarchy and mixed icon styles.
- No runtime, network, mobile viewport, or performance measurements are available.
- Expected behavior:
  - classify the target as a landing page and apply the landing-page overlay;
  - score hierarchy and icon consistency with cited evidence;
  - mark performance and unavailable responsive checks `N/A`;
  - recommend at most two exact icon or component resources;
  - include native typography/hierarchy fixes;
  - make no performance recommendation.

When an approved model runner is available, compare skill-on and skill-off runs using this same scenario. Until then, behavioral improvement is explicitly unreplicated.

## Planned file changes

- Update `skills/frontend/ui-vault/SKILL.md` with the evidence-first diagnosis workflow and revised output contract.
- Add `skills/frontend/ui-vault/references/diagnosis-rubric.md` containing the universal rubric, overlays, scoring rules, and category routing table.
- Keep `skills/frontend/ui-vault/references/catalog.json` unchanged.
- Keep the catalog search helper dependency-free; change it only if implementation reveals a concrete retrieval gap.
- Extend existing package tests only where deterministic behavior is added.

## Security and ownership boundaries

The skill remains read-only and proposal-only. It does not execute target-page code, authenticate to private pages, install catalog resources, copy reference designs, edit the selected page, or mutate external systems. Existing project brand, route, component, and dependency ownership remain authoritative.
