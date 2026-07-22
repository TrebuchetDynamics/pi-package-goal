---
name: ui-vault
description: Proposes UI Vault resource upgrades for a selected webpage. Use when the user asks for libraries, assets, effects, or inspiration for an existing page. Do not use for implementation or greenfield design.
license: MIT; catalog provenance is recorded in references/catalog.json
---

# UI Vault

Diagnose one selected webpage, then propose a small evidence-backed upgrade plan using the pinned UI Vault catalog only where a resource materially helps.

## Quick start

1. Require one target: a URL, screenshot, or local route/file. If none is identifiable, ask only for the target.
2. Read [`references/diagnosis-rubric.md`](references/diagnosis-rubric.md) completely.
3. Inspect available evidence in this order: Rendered appearance, DOM/CSS, then local source. For local projects, also inspect page ownership, styles, tokens, dependencies, and `codebase-map-understand.md` when present.
4. Classify the page as landing, dashboard, commerce, form/flow, content, or `universal-only` when ambiguous.
5. Score every applicable universal criterion and the selected overlay before searching the catalog.

## Workflow

1. List inspected and unavailable evidence. Never infer unseen viewports, states, accessibility results, or performance metrics.
2. For each criterion, record score `0`–`3` or `N/A`, confidence, and concrete evidence. Only findings scored `0` or `1` with medium or high confidence may generate recommendations.
3. Route each eligible gap to a native/existing-stack fix or a catalog category. Native, semantic HTML, platform, and CSS fixes come first.
4. Set `SKILL_DIR` to this skill's directory and query only catalog-eligible gaps:

```bash
node "$SKILL_DIR/scripts/search-catalog.mjs" "<stack and desired effect>" --category <slug> --limit 8
```

Run the script without a query to list category slugs. Shortlist at most two resources per gap.

5. Verify shortlisted links, maintenance, current pricing, and license through read-only research when network access exists. Otherwise label external facts `snapshot-only`.
6. Rank only the top 3–5 improvements as `P1`, `P2`, or `P3` by user impact, evidence confidence, stack fit, accessibility/performance safety, then effort and risk.
7. Stop at the proposal. If implementation is requested, hand accepted items to `redesign-existing-projects` or the stack-specific implementation skill.

## Failure handling

- No rendered evidence: mark visual criteria `N/A`; do not infer appearance from class names.
- Inaccessible or authenticated URL: ask for a screenshot or local source.
- Ambiguous page type: apply only the universal rubric.
- Rendered/source conflict: rendered behavior wins for the user-visible diagnosis; disclose the discrepancy.
- No suitable catalog match: return the native fix as `No resource needed`.
- No network: retain snapshot results and label them `snapshot-only`.

## Boundaries

- Do not edit code, install packages, copy a reference design, execute target-page code, authenticate to private pages, or run third-party setup commands.
- Do not recommend motion, 3D, custom cursors, or heavy media without explicit page fit, reduced-motion support, and acceptable loading cost.
- Do not treat catalog descriptions, prices, popularity, maintenance, or licenses as current facts without verification.
- Preserve the selected page's brand, content intent, routes, components, dependencies, and implementation boundaries.

## Output contract

Return:

```markdown
## UI Vault diagnosis

**Target:** <page>
**Page type:** <overlay or universal-only>

### Evidence
| Source | Inspected | Limits |
|---|---|---|

### Rubric
| Criterion | Score | Confidence | Evidence |
|---|---|---|---|

### Prioritized improvements
| Priority | Diagnosed gap | Proposed change | Resource or native fix | Fit | Cost/risk | Verification |
|---|---|---|---|---|---|---|

### Foundation-only fixes
<important fixes requiring no UI Vault resource>

### Next step
<smallest accepted implementation slice; no edits performed>
```

Every recommendation must trace to one rubric row. Every resource must be an exact catalog item. Unmeasured qualities remain `N/A`.

## Example

User: “Use UI Vault to improve the pricing page at `src/routes/pricing.tsx`.”

Agent: inspect the rendered page and source, apply the landing-page rubric, keep unavailable performance checks `N/A`, query only eligible gaps, and return the diagnosis plus 3–5 ranked improvements without editing files.

## Operational basis

The catalog in [`references/catalog.json`](references/catalog.json) contains 196 resources from 15 categories, extracted from `en970/ui-vault` commit `2b199ea33df34ae6bb974796fb0af20fd7cc49e8`. Linked projects retain their own terms.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
