# Proposal: txservice — network control for tx, terminals, and Pi agents

**Goal:** a local service (`txservice`) that exposes tx/tmux sessions and Pi
agents over HTTP + streaming events, so a Flutter app can list sessions, drive
terminals, and chat with Pi agents from a phone/desktop.

## Why a service, not a server inside tx

`tx` is a 960-line bash CLI. Adding HTTP/WS/JSON to bash means a rewrite, and a
CLI shouldn't own a long-running process lifecycle. Keep `tx` a CLI; add a thin
`txservice` beside it. It shells out to `tx`/`tmux` (unchanged) and spawns
`pi --mode rpc` per agent session.

## Key building blocks (already exist, zero new infra)

- **Pi RPC mode** (`pi --mode rpc`): JSONL protocol over stdio — `prompt`
  commands in, agent events (text deltas, tool calls) out. This is the control
  surface for agents. Node users can also embed `AgentSession` directly
  (`@earendil-works/pi-coding-agent`), which is even cleaner: no subprocess
  protocol to maintain.
- **tx**: alias → tmux session mapping (`tx ls`, start/attach/kill).
- **tmux**: `capture-pane` for output snapshots, `pipe-pane` (v2) for live
  output streaming, `send-keys` for input.
- **Node 22**: already a hard requirement (install.sh bootstraps it).

## Architecture

```
Flutter app ──HTTP/SSE──▶ txservice (Node 22, node:http only)
                              ├── tx / tmux   → terminal sessions
                              └── pi --mode rpc (or AgentSession) → agents
```

- **Transport:** plain `node:http` + Server-Sent Events for streams. No new
  dependencies (no express, no ws). REST for commands, SSE for event streams.
- **Auth:** bearer token; binds `127.0.0.1` by default; LAN bind is an explicit
  opt-in flag with a warning. No TLS in v1 (local-only), TLS only if LAN.
- **Pi integration:** spawn one `pi --mode rpc` per agent session, proxy its
  JSONL. Prompts go in via REST, events fan out over SSE.

## v1 API surface

Terminals:

```
GET    /sessions                 # tx aliases + tmux running state
POST   /sessions/:alias/start    # tx start (attach-capable session)
POST   /sessions/:alias/kill     # tx kill
GET    /sessions/:alias/pane     # tmux capture-pane snapshot
POST   /sessions/:alias/keys     # tmux send-keys
```

Agents:

```
POST   /pi/sessions              # spawn a Pi agent (name, provider/model)
POST   /pi/sessions/:id/prompt   # send a message (streamingBehavior: steer)
GET    /pi/sessions/:id/events   # SSE stream of agent events
DELETE /pi/sessions/:id          # stop the agent
```

## v1 scope (deliberately minimal)

- Session list/start/kill + output snapshots + send-keys (no full terminal
  emulator yet).
- Agent chat with streaming responses (RPC events → SSE).
- Single user, single machine, token auth.

## v2 (later, only if needed)

- Live terminal streaming via `tmux pipe-pane` + xterm-style rendering in the
  app.
- Pi agent _in_ a tmux session (drive `pi` inside the pane for full UX).
- TLS / client certs, multi-machine fleet control, OmniRoute dashboard view.

## Repo layout

```
pi-toolset/
  txservice/            # Node 22 service, no runtime deps
    server.mjs          # http + SSE router
    tmux.mjs            # tx/tmux shell-out wrappers
    pi-agent.mjs        # pi --mode rpc (or AgentSession) lifecycle
  package.json          # add bin: { "txservice": "./txservice/server.mjs" }
pi-control/             # NEW repo: Flutter app
  lib/                  # screens: sessions, terminal, agent chat
```

## Security stance

- Bind localhost only; token auth on everything; never expose to the public
  internet. `pi --mode rpc` and tmux give full shell access, so the token is a
  shell-equivalent credential.

## Open decisions for approval

1. **Service location:** inside pi-toolset (ships with the package) vs. a new
   `txservice` repo. I recommend pi-toolset — it already owns tx and the
   installer.
2. **Pi driver:** subprocess `pi --mode rpc` (decoupled, protocol-maintained)
   vs. embedded `AgentSession` (no protocol parsing, but tight coupling to the
   installed Pi package). I recommend subprocess RPC in v1 for a clean
   contract; both are cheap to swap.
3. **Flutter scope:** start with terminal control only, agent chat only, or
   both (recommended: both, they share the sessions list).
4. **Live terminal streaming:** defer to v2 (recommended) or include via
   `pipe-pane` in v1.

## Effort estimate

- txservice v1: ~300–400 lines Node, no deps.
- Flutter app v1: sessions list + terminal control + agent chat, ~1–2 weeks
  for a competent Flutter dev.
- Integration test: reuse the debian:12 sandbox pattern; Flutter app against a
  real txservice on the host.

---

**Recommended path:** approve options 1–4 as marked → I build txservice v1 in
pi-toolset (no deps, Node 22), sandbox-test it like install.sh, then scaffold
the Flutter app repo.
