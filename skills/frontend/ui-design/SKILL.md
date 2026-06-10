---
name: ui-design
description: Orchestrate UI/UX skills for frontend design, redesign, audits, design systems, shadcn UI, Stitch-to-React, accessibility, and anti-slop polish.
---

# UI Design Orchestrator

Use this as the front door for UI/UX work. Route to the smallest useful set of design skills, keep them from conflicting, and finish with concrete UI quality evidence.

## Quick start

1. Classify the request: build, redesign, audit, design-system, implementation polish, Stitch handoff, or browser-platform guidance.
2. Pick a primary skill and at most two support skills from the routing table.
3. State the design read, files/surfaces likely affected, and validation evidence before editing.
4. Implement or review using the selected skill rules; do not stack every design skill by default.

## Routing table

| Request shape | Primary skill | Support skills |
| --- | --- | --- |
| Broad UI/UX decision, visual system, colors, typography, layout, accessibility, motion | `ui-ux-pro-max` | `modern-web-guidance` for browser APIs/perf |
| Fresh distinctive web UI, page, component, or app | `frontend-design` | `hallmark` for anti-slop structure; `ui-ux-pro-max` for checks |
| React + TypeScript + Tailwind + shadcn product UI | `frontend-production-shadcn` | `ui-ux-pro-max`; `modern-web-guidance` |
| Landing page, portfolio, or marketing redesign where taste matters | `design-taste-frontend` | `hallmark`; `frontend-design` |
| Anti-AI-slop build, audit, redesign, or study from URL/screenshot | `hallmark` | `design-taste-frontend`; `ui-ux-pro-max` |
| Convert Stitch designs into Vite/React components | `stitch-react-components` | `frontend-production-shadcn`; `ui-ux-pro-max` |
| Browser UX behavior, HTML/CSS/Web APIs, performance, forms, or accessibility details | `modern-web-guidance` | `ui-ux-pro-max` |
| Chrome/browser extension UI or extension APIs | `chrome-extensions` | `modern-web-guidance`; `ui-ux-pro-max` |

## Conflict rules

- Product app/dashboard beats marketing taste: prefer `frontend-production-shadcn` over `design-taste-frontend`.
- Existing brand/system beats novelty: preserve tokens, routes, components, content intent, and accessibility before adding flair.
- Stitch fidelity beats reinvention: for Stitch inputs, use `stitch-react-components` first, then polish.
- Anti-slop does not mean maximalism: choose a clear aesthetic, then execute consistently.
- If two skills disagree, prioritize: accessibility → product intent → existing system → implementation constraints → visual novelty.

## Workflow

1. **Design read**: one line naming surface, audience, vibe, stack, and primary skill.
2. **Repo/UI study**: inspect existing components, routes, tokens, screenshots, tests, design docs, and `graphify-out/graph.json` when present. Query Graphify for route/component/data-flow leads on broad UI changes, then verify named files.
3. **Plan**: list exact files expected to change; ask before destructive route/component removal.
4. **Execute**: load/read the selected skill guidance and apply only relevant checks.
5. **Verify**: run available tests/build/lint; inspect responsive states, focus/keyboard behavior, contrast, loading/error/empty states, and reduced-motion where applicable.
6. **Report**: name selected skills, important design decisions, files changed, and validation results.

## Red lines

- Do not delete or replace a design system, route tree, production page, or component library without explicit approval.
- Do not copy protected site designs, screenshots, or brand assets beyond user-provided/authorized references.
- Do not invent unavailable Stitch/MCP/browser tooling; report the missing tool and offer a local fallback.

## Shared contract

Follow [the shared skill contract](../../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
