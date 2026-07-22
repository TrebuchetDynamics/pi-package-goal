# UI Vault diagnosis rubric

Use this rubric after inspecting the target and before querying the catalog.

## Evidence order

1. **Rendered appearance** — authoritative for visible hierarchy, layout, responsive behavior, interaction feedback, and visual coherence.
2. **DOM/CSS** — verifies semantics, structure, styles, states, and likely causes.
3. **Local source** — verifies ownership, routes, components, tokens, dependencies, and implementation constraints.

List inspected and unavailable evidence. Never infer an unseen viewport, interaction, state, accessibility-tree result, or performance metric.

## Scoring

For every applicable criterion record:

- **Score:** `0` broken or absent; `1` weak; `2` acceptable; `3` strong; `N/A` not assessed.
- **Confidence:** high, medium, or low.
- **Evidence:** screenshot region, observed behavior, DOM/CSS fact, source path, or measured result.

Only scores `0` and `1` with medium or high confidence are eligible for recommendations. Never turn `N/A` or low-confidence findings into recommendations. Do not calculate an overall or aggregate score.

## Universal criteria

| Criterion | Inspect | Do not infer |
|---|---|---|
| Purpose and primary action | Whether the page's job and main action are immediately clear | Product strategy not present in the target |
| Hierarchy and scanability | Heading order, emphasis, grouping, reading path, competing elements | Visual weight from class names without a render |
| Layout and responsiveness | Alignment, measure, spacing rhythm, overflow, tested viewport behavior | Mobile or wide-screen behavior not observed |
| Interaction and states | Affordances, focus, hover/press, loading, empty, error, success | States that were not rendered, exercised, or present in source |
| Accessibility fundamentals | Semantics, labels, keyboard path, focus visibility, contrast evidence, reduced motion | Screen-reader or contrast outcomes without inspection or measurement |
| Performance and motion restraint | Measured loading/runtime evidence, asset weight, known blocking work, motion purpose | Performance problems from visual complexity alone |
| Visual coherence and brand fit | Type, color, icon, surface, imagery, and motion consistency | A different aesthetic merely because the catalog contains one |

## Page-type overlays

Apply one overlay. If classification is ambiguous, use only the universal criteria and disclose `universal-only`.

### Landing page

- Value proposition clarity
- CTA path and competing actions
- Trust and proof
- Section sequence and narrative rhythm

### Dashboard

- Information density and prioritization
- Comparison and data readability
- Navigation and orientation
- Loading, empty, error, and stale-data states

### Commerce

- Product and price clarity
- Decision support and comparison
- Trust, delivery, returns, and risk communication
- Cart or checkout friction

### Form or multi-step flow

- Progress and completion expectations
- Labels, instructions, and input affordances
- Validation and error recovery
- Back, cancel, save, and interruption behavior

### Content page

- Reading measure and typography
- Content hierarchy and navigation
- Discovery and related-content paths
- Image, video, and embedded-media treatment

## Gap routing

First decide whether semantic HTML, native controls, existing components, or CSS can solve the gap. Mark those findings `No resource needed`.

Use the catalog only when a resource materially helps:

| Diagnosed need | Category slug |
|---|---|
| Complex component behavior | `component-libraries` |
| Purposeful motion or scroll storytelling | `animation-scroll` |
| Concept-justified 3D or shader treatment | `3d-shader-webgl`, `3d-models-scroll` |
| Inconsistent or unsuitable iconography | `icons`, `app-icon-design` |
| Product demonstration or promo media | `mockup-video-tools` |
| Visual-direction research | `design-inspiration-galleries`, `framer-templates` |
| Open-source implementation reference | `github-design-repos` |
| Weak palette or typography system | `color-typography` |
| Purposeful cursor or microinteraction treatment | `cursor-microinteraction` |
| Missing illustrative storytelling | `illustration-packs` |
| iOS onboarding or Liquid Glass need | `onboarding-liquid-glass` |

`claude-skills-design` remains searchable but is not routed from webpage findings because it changes the agent workflow rather than the selected page.

Motion, 3D, shaders, custom cursors, and heavy media require explicit page fit plus reduced-motion and performance consideration.

## Recommendation gate

For each eligible gap:

1. Prefer a native or existing-stack fix.
2. If a resource materially helps, search with the category, current stack, and desired effect.
3. Inspect at most eight results and shortlist at most two resources.
4. Verify link, maintenance, pricing, and license when network access exists; otherwise label the result `snapshot-only`.
5. Rank by user impact, confidence, stack fit, accessibility/performance safety, then effort and risk.
6. Return only three to five `P1`–`P3` recommendations. Explain each priority in one sentence.
