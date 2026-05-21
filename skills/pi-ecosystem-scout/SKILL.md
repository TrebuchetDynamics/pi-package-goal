---
name: pi-ecosystem-scout
description: Use when creating, choosing, packaging, or extending Pi extensions, skills, prompt templates, themes, package bundles, session tools, notification tools, status bars, subagent/task orchestration, remote execution, browser tooling, or ecosystem integrations.
---

# Pi Ecosystem Scout

Use this before building new Pi infrastructure from scratch.

## Purpose

Check whether the Pi ecosystem already has a useful package, extension, skill, theme, or reference pattern. Prefer adapting maintained community patterns over inventing a private one-off.

## Sources

Primary index:

- `https://github.com/qualisero/awesome-pi-agent`

High-value categories from that index:

- Extension collections: `agent-stuff`, `pi-agent-extensions`, `shitty-extensions`, `rhubarb-pi`, `pi-extensions`.
- Safety and permissions: protected paths, safe git, security filters, checkpoints.
- Session and handoff: session pickers, handoff, context dashboards, session analytics.
- UI/status: powerline footers, usage bars, notifications, custom TUI canvases.
- Remote/subagent: SSH remote execution, task tools, session-control, worker orchestration.
- Browser and screenshots: browser tools, screenshot pickers, GUI/canvas helpers.

## Workflow

1. Classify the requested Pi work: extension, skill, prompt, theme, provider, package, SDK/RPC, safety, or UI.
2. Search local docs first if the Pi package is installed:
   - `docs/extensions.md`
   - `docs/packages.md`
   - `docs/tui.md`
   - `examples/extensions/`
3. Check the awesome-pi-agent category that matches the request.
4. Pick one of these outcomes:
   - `reuse`: install or reference an existing package.
   - `adapt`: borrow the pattern, keep local ownership clear.
   - `exclude`: existing tool is stale, unsafe, too broad, or conflicts with project constraints.
   - `build`: no suitable existing pattern found.
5. If building, include package metadata, tests, and a short README from the start.

## Report Format

```text
Pi ecosystem scout:
- request:
- category:
- sources checked:
- candidates:
- decision: reuse|adapt|exclude|build
- why:
- next step:
```

## Guardrails

- Do not install third-party Pi packages without explicit user approval.
- Review code before recommending install; Pi packages run with full system access.
- Preserve licenses and attribution when copying or adapting code or skills.
- Do not treat awesome-pi-agent as authoritative API documentation; it is an index.
