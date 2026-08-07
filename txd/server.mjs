// txd — local HTTP/SSE API for tx/tmux sessions and Pi agents.
// No runtime dependencies: node:http + SSE only. Bind localhost, token auth.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  sessionStates,
  startSession,
  killSession,
  capturePane,
  sendKeys,
} from "./tmux.mjs";
import { PiAgent, agents } from "./pi-agent.mjs";

const usage = `txd - local HTTP/SSE API for tx/tmux sessions and Pi agents

Usage: txd [--host HOST] [--port PORT] [--token TOKEN]

Endpoints (all require Authorization: Bearer <token> except /healthz):
  GET    /healthz
  GET    /sessions                         tx aliases with dir and running state
  POST   /sessions/:alias/start   {"dir": "/path"}   (default: configured dir)
  POST   /sessions/:alias/kill
  GET    /sessions/:alias/pane             tmux capture-pane snapshot
  POST   /sessions/:alias/keys    {"keys": "...", "enter": true}
  POST   /pi/sessions             {"cwd": "/path", "provider": "...", "model": "..."}
  POST   /pi/sessions/:id/prompt  {"message": "..."}
  GET    /pi/sessions/:id/events           SSE stream of agent events
  DELETE /pi/sessions/:id

Environment:
  TXD_HOST    Bind address (default: 127.0.0.1)
  TXD_PORT    Port (default: 8123)
  TXD_TOKEN   Auth token; if unset, generated and stored in
              ~/.config/txd/token (mode 0600)
  TXD_PI_CMD  Command that starts pi (default: pi)
`;

const argv = process.argv.slice(2);
let host = process.env.TXD_HOST || "127.0.0.1";
let port = Number(process.env.TXD_PORT || 8123);
let token = process.env.TXD_TOKEN || "";
let piCmd = process.env.TXD_PI_CMD || "pi";
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case "--host":
      host = argv[++i];
      break;
    case "--port":
      port = Number(argv[++i]);
      break;
    case "--token":
      token = argv[++i];
      break;
    case "-h":
    case "--help":
      process.stdout.write(usage);
      process.exit(0);
    default:
      process.stderr.write(`txd: unknown option: ${argv[i]}\n`);
      process.stderr.write(usage);
      process.exit(2);
  }
}
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  process.stderr.write("txd: invalid port\n");
  process.exit(2);
}

if (!token) {
  const tokenFile = path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "txd",
    "token",
  );
  if (fs.existsSync(tokenFile)) {
    token = fs.readFileSync(tokenFile, "utf8").trim();
  } else {
    token = randomBytes(24).toString("hex");
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
    process.stderr.write(`txd: token written to ${tokenFile}\n`);
  }
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

const ALIAS_RE = /^[A-Za-z0-9_-]+$/;

function sse(req, res, agent) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  const keepalive = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {}
  }, 15000);
  agent.clients.add(res);
  req.on("close", () => {
    agent.clients.delete(res);
    clearInterval(keepalive);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://txd");
  const parts = url.pathname.split("/").filter(Boolean);
  const auth = (req.headers.authorization || "") === `Bearer ${token}`;

  if (url.pathname === "/healthz") return json(res, 200, { ok: true });
  if (!auth) return json(res, 401, { error: "unauthorized" });

  try {
    // Terminal sessions
    if (url.pathname === "/sessions" && req.method === "GET") {
      return json(res, 200, await sessionStates());
    }
    const tmuxMatch = url.pathname.match(
      /^\/sessions\/([^/]+)\/(start|kill|pane|keys)$/,
    );
    if (tmuxMatch) {
      const [, alias, action] = tmuxMatch;
      if (!ALIAS_RE.test(alias))
        return json(res, 400, { error: "invalid alias" });
      if (action === "start") {
        const body = await readBody(req);
        await startSession(alias, body.dir);
        return json(res, 201, { alias, running: true });
      }
      if (action === "kill") {
        await killSession(alias);
        return json(res, 200, { alias, running: false });
      }
      if (action === "pane") {
        return json(res, 200, { alias, pane: await capturePane(alias) });
      }
      if (action === "keys") {
        const body = await readBody(req);
        if (typeof body.keys !== "string")
          return json(res, 400, { error: "keys required" });
        await sendKeys(alias, body.keys, { enter: Boolean(body.enter) });
        return json(res, 200, { ok: true });
      }
    }

    // Pi agents
    if (url.pathname === "/pi/sessions" && req.method === "POST") {
      const body = await readBody(req);
      const cwd = body.cwd || os.homedir();
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        return json(res, 400, { error: "cwd must be an existing directory" });
      }
      const agent = new PiAgent({
        cwd,
        name: body.name,
        provider: body.provider,
        model: body.model,
        piCmd,
      });
      agents.set(agent.id, agent);
      return json(res, 201, { id: agent.id });
    }
    if (url.pathname === "/pi/sessions" && req.method === "GET") {
      return json(res, 200, { sessions: [...agents.keys()] });
    }
    const agentMatch = url.pathname.match(
      /^\/pi\/sessions\/([^/]+)\/(prompt|events)$/,
    );
    if (agentMatch && req.method === "GET" && agentMatch[2] === "events") {
      const agent = agents.get(agentMatch[1]);
      if (!agent) return json(res, 404, { error: "agent not found" });
      return sse(req, res, agent);
    }
    if (agentMatch && req.method === "POST" && agentMatch[2] === "prompt") {
      const agent = agents.get(agentMatch[1]);
      if (!agent) return json(res, 404, { error: "agent not found" });
      const body = await readBody(req);
      if (typeof body.message !== "string" || !body.message) {
        return json(res, 400, { error: "message required" });
      }
      agent.prompt(body.message);
      return json(res, 202, { accepted: true });
    }
    if (
      /^\/pi\/sessions\/[^/]+$/.test(url.pathname) &&
      req.method === "DELETE"
    ) {
      const id = parts[2];
      const agent = agents.get(id);
      if (!agent) return json(res, 404, { error: "agent not found" });
      agent.stop();
      agents.delete(id);
      return json(res, 200, { stopped: id });
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) process.stderr.write(`txd: ${err.stack || err}\n`);
    json(res, status, { error: err.message || "internal error" });
  }
});

server.listen(port, host, () => {
  process.stderr.write(`txd: listening on http://${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const agent of agents.values()) agent.stop();
    server.close(() => process.exit(0));
  });
}
