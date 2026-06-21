# Headroom Pi Extension — Design (replaces rtk)

Date: 2026-06-21
Status: Draft for review

## Goal

Replace the bundled `rtk` Pi extension with a `headroom` Pi extension that reduces
token usage by routing Pi's LLM traffic through a locally-running
[headroom](https://github.com/chopratejas/headroom) compression proxy. Unlike rtk
(which rewrote individual bash commands and heuristically compacted tool output),
headroom compresses the **whole context** in transit at the proxy layer.

Scope also includes removing every `rtk` reference from the package and replacing
it with the headroom equivalent.

## Non-goals

- Bundling the `headroom` binary or the `headroom-ai` npm SDK as a dependency. The
  extension talks to an already-installed local proxy over HTTP and otherwise shells
  out to the `headroom` CLI (mirroring how the rtk extension shelled out to `rtk`).
- Per-tool-output compression inside the extension. The proxy does compression;
  the extension only routes and reports.
- Wiring Claude Code (handled separately via `headroom wrap claude`, already done
  on the maintainer's machine; documented in README).
- Auto-starting a background daemon without user action.

## Background findings (validated 2026-06-21)

- **headroom is not a hook/rewriter.** It runs as a proxy/wrapper. `headroom wrap`
  supports claude/codex/cursor/aider/etc. but **not** pi; `headroom init` supports
  claude/codex/copilot/openclaw but **not** pi. So pi must use raw `headroom proxy`
  + a base-URL override.
- **Pi is not an MCP client.** No `pi mcp`, no `mcpServers`, zero MCP references in
  `@earendil-works/pi-coding-agent`. headroom's MCP server cannot integrate with Pi.
- **Pi default provider is `openai-codex` (gpt-5.5), a ChatGPT OAuth subscription.**
- **The headroom proxy transparently forwards ChatGPT OAuth.** `proxy_routes.py`
  detects `is_chatgpt_auth`, preserves the OAuth bearer + `chatgpt-account-id`
  header, and forwards to `https://chatgpt.com/backend-api/codex/responses`. It
  exposes `/v1/messages` (Anthropic), `/v1/chat/completions`, `/v1/responses`,
  `/v1/codex/responses`, and `/backend-api/codex/responses`, plus `/v1/retrieve`.
- **Pi's codex provider posts to `chatgpt.com/backend-api` + `/codex/responses`**,
  which matches a proxy route. So `pi.registerProvider("openai-codex", { baseUrl })`
  pointed at the proxy is expected to route correctly while preserving OAuth.
- **Pi provider override semantics:** `pi.registerProvider(name, { baseUrl })` with
  no `models` preserves all existing models and OAuth credentials, swapping only the
  endpoint (per `docs/custom-provider.md`).

## Design

### Behavior

1. **Provider routing (load time).** The extension factory checks proxy health; if
   the proxy is reachable, it calls
   `pi.registerProvider("openai-codex", { baseUrl: "http://127.0.0.1:8787" })` (and
   any additionally-configured providers). If the proxy is **not** reachable, it
   registers nothing — **fail-open**, so Pi behaves exactly as it does today and is
   never broken by headroom being down.
2. **Health check.** A short-timeout HTTP GET to a proxy liveness path (e.g. `/` or
   `/v1/models`). Cached briefly to avoid repeated probes.
3. **`/headroom` command:**
   - `status` (default): proxy reachable?, version (`headroom --version`), which
     providers are routed, active port, and how to start the proxy if down.
   - `stats`: token savings via `headroom perf`.
   - `start`: launch `headroom proxy` detached (records pid/log path), then re-check
     health. This is the only way the extension starts a process, and only on
     explicit user request.
   - `help`: list subcommands + env vars.

### Configuration (environment variables)

| Var | Default | Meaning |
|-----|---------|---------|
| `HEADROOM_DISABLED` | unset | `1` disables all routing/health behavior |
| `HEADROOM_PORT` | `8787` | proxy port |
| `HEADROOM_HOST` | `127.0.0.1` | proxy host |
| `HEADROOM_PROVIDERS` | `openai-codex` | comma-separated provider names to route |
| `HEADROOM_NOTIFY` | `1` | `0` silences UI notifications |

### Failure semantics

- Fail-open everywhere: any error in health check, registration, or command handling
  logs a warning and leaves Pi unchanged. Routing is only applied when the proxy is
  confirmed reachable.

## Components & file layout

Mirror the rtk extension's split (thin Pi adapter + pure, tested helpers):

- `extensions/headroom/index.js` — default export `registerHeadroomExtension(pi)`;
  thin adapter wiring `session_start`, `registerProvider`, and the `/headroom`
  command to pure helpers.
- Pure helpers (exported for tests): `readHeadroomConfig(env)`, `proxyBaseUrl(config)`,
  `parseHeadroomVersion(raw)`, `parseProviders(env)`, `formatStatus(...)`,
  `parseHeadroomCommandArgs(args)`. Reuse `lib/pi-bridge/command-grammar.js` for arg
  splitting (as rtk did).
- `tests/headroom-extension.test.mjs` — unit tests over the pure helpers, mirroring
  `tests/rtk-extension.test.mjs`.

## Delivery (both)

1. **Package extension** (canonical, tested) — replaces `extensions/rtk` in the repo.
2. **Standalone local copy** for the maintainer's live Pi (which loads the package
   from the GitHub remote and won't see repo edits until push + `pi update`): write a
   self-contained `~/.pi/agent/extensions/headroom.ts` equivalent so Pi gets it
   immediately. (The old `~/.pi/agent/extensions/rtk.ts` was already removed.)

## Proxy lifecycle

Detect + `/headroom start`. The extension never auto-spawns the proxy on load; it
detects and, if down, notifies once with the start instruction and offers
`/headroom start`.

## rtk removal across the package

Replace/remove rtk in:
- `package.json` — `pi.extensions`: `./extensions/rtk` → `./extensions/headroom`;
  `scripts.test:extensions`: `rtk-extension.test.mjs` → `headroom-extension.test.mjs`.
- `extensions/rtk/` — delete.
- `tests/rtk-extension.test.mjs` — delete (replaced by `headroom-extension.test.mjs`).
- `tests/validate-package.mjs`, `tests/development-goal-lib-architecture.test.mjs` —
  update any rtk assertions.
- `README.md`, `CONTEXT.md`, `codebase-map-understand.md` — replace rtk docs with
  headroom docs (incl. Claude `headroom wrap claude` note and Pi proxy setup).
- `THIRD_PARTY_NOTICES.md` and `licenses/` — remove `rtk-ai-rtk-LICENSE` and
  `MasuRii-pi-rtk-optimizer-LICENSE`; add a headroom attribution if we copy/adapt any
  of its text. (headroom is referenced as an external tool, not vendored, so likely
  just a notice line, not a bundled license — confirm during implementation.)
- `.understand-anything/` generated artifacts — regenerated, not hand-edited.

## Testing strategy

- **Unit (TDD):** pure helpers — config parsing, provider list parsing, URL build,
  version parse, status formatting, command arg parsing. No network.
- **Smoke (manual / `pi -e`):** start `headroom proxy`; load the extension; run a
  tiny `pi --print` codex prompt; confirm a response comes back (auth preserved) and
  `headroom perf` shows traffic. This validates the codex baseUrl/path assumption.
- `npm test` (package validate + extension tests) green; `git diff --check` clean.

## Risks

1. **Codex baseUrl/path composition.** Highest risk. The proxy has matching routes,
   but the exact base Pi uses for `openai-codex` must line up. Mitigation: smoke test
   early; if Pi appends a path the proxy doesn't expose, add the route mapping via the
   override or fall back to documenting `pi --provider <api-key-provider>` routing.
2. **OAuth header forwarding through localhost.** Proxy code forwards bearer +
   `chatgpt-account-id`; validate no header stripping breaks auth.
3. **Live-Pi delivery lag.** The standalone local copy mitigates the push/update lag;
   keep it in sync with the package version or document regeneration.
4. **Proxy must be running.** Fail-open design ensures Pi still works when it isn't;
   `/headroom status` makes the state obvious.

## Open questions

None blocking. Codex routing specifics are resolved by the smoke test in the plan.
