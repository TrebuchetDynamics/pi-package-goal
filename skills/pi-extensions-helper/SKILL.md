---
name: pi-extensions-helper
description: Build, debug, package, or review Pi extensions. Use for custom tools, slash commands, hooks, TUI, providers, resources, sessions, or compaction.
---

# Pi Extensions Helper

Use this before creating or changing a Pi extension.

## Mandatory docs refresh

Read current docs first; Pi extension APIs move quickly.

1. Primary docs: https://pi.dev/docs/latest/extensions
2. Local fallback when available: `docs/extensions.md` under the installed `@earendil-works/pi-coding-agent` package.
3. Example source: `examples/extensions/` under the installed package.
4. For packaged extensions, also read `docs/packages.md`.
5. For custom UI/components, also read `docs/tui.md` and a relevant UI example.

Do not rely on memory when writing API signatures.

## Skill composition

- Start with `pi-ecosystem-scout` when the work may reuse or adapt an existing Pi package, extension, or pattern; hand off the scout decision and candidate artifact.
- Use `tdd` for command parsing, pure helpers, package manifests, and non-interactive extension behavior; success signal is focused tests around public extension behavior.
- Use `diagnose` when extension behavior fails at runtime; build a small repro with `pi -e` or a focused command before changing code.
- Use `prototype` for uncertain TUI/status/widget interactions before committing to package shape; preserve only the learned decision.
- Hand final validation receipts to `git-commit-push`: type/test command, smoke test, manifest check, and `git diff --check`.

## Classify the extension shape

Pick the smallest shape that matches the goal:

- **Event gate**: `pi.on("tool_call" | "input" | "session_before_*" | ...)` to inspect, block, transform, or add context.
- **Tool**: `pi.registerTool()` or `defineTool()` for LLM-callable deterministic actions.
- **Command**: `pi.registerCommand()` for user-invoked slash commands.
- **UI/status**: `ctx.ui.notify`, `setStatus`, `setWidget`, `ui.custom`, renderers, autocomplete.
- **Session/state**: reconstruct state from session/tool result details; avoid branch-hostile globals.
- **Provider/model**: `pi.registerProvider()`, `setModel`, `thinking_level_select`.
- **Package resource**: expose extension path through `package.json` `pi.extensions`.

## Provider/CLI bridge rule

For provider bridge patterns, keep the bridge explicit and user-controlled:

- Register provider bridges with `pi.registerProvider()` and expose a `/provider-name status` command that reports auth source, registered models, smoke-test command, and known limitations.
- If a CLI-backed provider uses `streamSimple`, deny or disable the upstream CLI's native tools; Pi owns tool execution and the bridge should translate model intent back into Pi tool calls only when the protocol is reliable.
- Treat credential-file reuse, proxy headers, OAuth refresh helpers, paid requests, and unofficial endpoints as owner/legal/security decisions before bundling.
- Prefer documenting provider bridge patterns over bundling a new provider when auth semantics, terms of service, or tool-call reliability are unclear.
- Call out prompt-bridged tool calls as less reliable than native provider tool calling; fail closed if the upstream CLI attempts to use its own tools.

## Example lookup

Use examples before inventing patterns:

- Minimal tool: `examples/extensions/hello.ts`
- Blocking dangerous actions: `permission-gate.ts`, `protected-paths.ts`
- Stateful tool: `todo.ts`
- Dynamic tools: `dynamic-tools.ts`
- Structured final tool: `structured-output.ts`
- Output truncation: `truncated-tool.ts`
- Commands/session handoff: `handoff.ts`, `send-user-message.ts`, `reload-runtime.ts`
- Compaction: `custom-compaction.ts`, `trigger-compact.ts`
- Status/widgets: `status-line.ts`, `widget-placement.ts`, `working-indicator.ts`
- Prompt/context: `prompt-customizer.ts`, `claude-rules.ts`
- Providers: `custom-provider-anthropic/`, `custom-provider-gitlab-duo/`
- Dependencies: `with-deps/`

## Implementation guardrails

- For third-party pattern inspiration, write the local design rule first and keep source-specific references out of the package unless copying code/text or bundling a resource.
- Start with the smallest reversible patch that proves the pattern; add broad harness behavior only after explicit user approval.
- Export a default function receiving `ExtensionAPI`; async factory is OK for startup discovery.
- Import Pi core packages as peer deps in packages: `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`.
- Use `StringEnum` for string enum parameters; avoid `Type.Union([Type.Literal(...)])` for Google compatibility.
- If a tool mutates files, wrap read-modify-write with `withFileMutationQueue()` on the resolved absolute target path.
- Truncate large custom tool output; use Pi truncation helpers and tell the model where full output is saved.
- Throw from `execute()` to mark tool errors; returning error-looking content does not set `isError`.
- Honor `ctx.signal` for nested async work and check `ctx.hasUI` before interactive UI.
- Store branch-sensitive state in tool result `details` or custom entries and reconstruct on `session_start` / tree changes.
- Keep guardrail logic in pure helpers with focused tests; make the Pi adapter a thin event/tool/command wrapper.
- Make safety gates fail closed and explain the blocked action plus the safer next tool or workflow.
- Avoid stale `ctx`/`pi` objects after `newSession`, `switchSession`, `fork`, or `reload`; use replacement callback contexts.
- In prompt guidelines, name the tool explicitly; do not write “use this tool”.

## Validation checklist

Before reporting done:

1. Run or type-check the extension if the repo has a command for it.
2. Smoke-test with `pi -e ./path/to/extension.ts` for one-file extensions, or install/load the package path.
3. Test non-interactive behavior if the extension can run without UI.
4. Verify package manifest includes extension files and required peer/runtime dependencies.
5. Run project tests and `git diff --check` before committing.

## Shared contract

Follow [the shared skill contract](../shared/COMMON-CONTRACT.md) for repo study, dirty-worktree hygiene, verification evidence, safe handoffs, and safety defaults.
