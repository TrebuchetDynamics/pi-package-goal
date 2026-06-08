---
name: pi-ecosystem-scout
description: Scout existing Pi ecosystem packages, extensions, skills, prompts, themes, tools, and integration patterns before building. Use when creating, choosing, packaging, or extending Pi resources.
---

# Pi Ecosystem Scout

Use this before building new Pi infrastructure from scratch.

## Purpose

Check whether the Pi ecosystem already has a useful package, extension, skill, theme, or reference pattern. Prefer adapting maintained community patterns over inventing a private one-off.

## Skill composition

- Hand `build` or `adapt` decisions to `pi-extensions-helper` with trigger, selected candidate/source artifact, next skill, and expected package validation signal.
- Use `autoreview` before recommending installation of a third-party package with broad filesystem or shell access; success signal is no accepted safety findings.
- Use `grill-me` when the scout result leaves a product choice: reuse, adapt, exclude, or build.
- If a selected package changes the local repo, finish through `git-commit-push` so notices, licenses, and validation are audited.

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

1. Classify the requested Pi work: extension, skill, prompt, theme, provider, package, SDK/RPC, safety, or UI. If `graphify-out/graph.json` exists, query Graphify for local package/resource relationships that should constrain the scout.
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
5. For `adapt`, translate the external pattern into a local requirement before editing. Do not add source-specific files, notices, or references unless you copy code/text or bundle a resource.
6. If building, include package metadata, tests, and a short README from the start.

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
- Preserve licenses and attribution when copying code, text, or bundled resources; pattern-only inspiration belongs in the scout report, not package notices.
- Prefer the smallest reversible, test-backed patch after a scout result; avoid broad harness adoption unless the user explicitly asks.
- Do not treat awesome-pi-agent as authoritative API documentation; it is an index.

## Shared contract

Follow [the shared skill contract](../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
