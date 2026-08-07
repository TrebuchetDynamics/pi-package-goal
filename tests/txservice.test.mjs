import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const server = path.join(root, "txservice", "server.mjs");
const fakePi = path.join(root, "tests", "fixtures", "fake-pi-rpc.mjs");
const token = "test-token";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "txservice-"));
const hasTmux = (() => {
  try {
    execFileSync("tmux", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const port = 18000 + Math.floor(Math.random() * 2000);
const proc = spawn(
  process.execPath,
  [server, "--port", String(port), "--token", token],
  {
    cwd: root,
    env: {
      ...process.env,
      TXSERVICE_PI_CMD: fakePi,
      TX_CONFIG: path.join(tmp, "session.config"),
      TXSERVICE_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const base = `http://127.0.0.1:${port}`;

async function request(method, pathname, { body, bearer = token } = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

async function waitReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("txservice did not become ready");
}

try {
  await waitReady();
  assert.equal(
    (await request("GET", "/sessions", { bearer: null })).status,
    401,
    "token required",
  );
  assert.equal((await request("GET", "/sessions")).status, 200);

  if (hasTmux) {
    fs.writeFileSync(path.join(tmp, "session.config"), `work=${tmp}\n`);
    let res = await request("GET", "/sessions");
    const alias = res.body.find((s) => s.alias === "work");
    assert.ok(alias, "config alias listed");
    assert.equal(alias.dir, tmp);
    assert.equal(alias.running, false);

    res = await request("POST", "/sessions/work/start");
    assert.equal(res.status, 201);
    res = await request("GET", "/sessions");
    assert.equal(res.body.find((s) => s.alias === "work").running, true);

    res = await request("POST", "/sessions/work/keys", {
      body: { keys: "echo txservice-ok", enter: true },
    });
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 300));
    res = await request("GET", "/sessions/work/pane");
    assert.match(res.body.pane, /txservice-ok/, "keys reach the pane");

    res = await request("POST", "/sessions/work/kill");
    assert.equal(res.status, 200);
    res = await request("GET", "/sessions");
    assert.equal(res.body.find((s) => s.alias === "work").running, false);
  }

  // Pi agent lifecycle with the fake RPC binary
  const created = await request("POST", "/pi/sessions", {
    body: { cwd: tmp, name: "test" },
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.ok(id);

  const events = await fetch(`${base}/pi/sessions/${id}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(events.status, 200);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let sawReply = false;
  const readLoop = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n")) {
        if (line.startsWith("data: ") && line.includes("fake reply"))
          sawReply = true;
      }
    }
  })();

  assert.equal(
    (
      await request("POST", `/pi/sessions/${id}/prompt`, {
        body: { message: "hello" },
      })
    ).status,
    202,
  );
  const deadline = Date.now() + 10000;
  while (!sawReply && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(sawReply, true, "agent events stream over SSE");
  await reader.cancel();
  await readLoop;

  assert.equal((await request("DELETE", `/pi/sessions/${id}`)).status, 200);
  assert.equal(
    (
      await request("POST", `/pi/sessions/${id}/prompt`, {
        body: { message: "x" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request("POST", "/pi/sessions", {
        body: { cwd: path.join(tmp, "missing") },
      })
    ).status,
    400,
  );
} finally {
  proc.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("txservice ok");
