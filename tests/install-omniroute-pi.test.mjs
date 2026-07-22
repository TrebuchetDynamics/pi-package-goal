import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const script = path.join(root, "install-omniroute-pi.sh");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-pi-install-"));
const agentDir = path.join(fixture, "agent");
const binDir = path.join(fixture, "bin");
fs.mkdirSync(agentDir, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(
  path.join(agentDir, "models.json"),
  `${JSON.stringify({ providers: { existing: { models: [{ id: "keep-me" }] } } }, null, 2)}\n`,
);
fs.writeFileSync(path.join(agentDir, "settings.json"), `${JSON.stringify({ theme: "keep-me" }, null, 2)}\n`);
fs.writeFileSync(path.join(binDir, "pi"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

let combo;
let comboCreates = 0;
let comboUpdates = 0;

async function requestJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

const server = http.createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/v1/models") {
    response.end(JSON.stringify({
      data: [{
        id: "pi-auto",
        context_length: 1048576,
        capabilities: { reasoning: true, tool_calling: true },
      }],
    }));
    return;
  }
  if (request.url === "/api/combos" && request.method === "GET") {
    response.end(JSON.stringify({ combos: combo ? [combo] : [] }));
    return;
  }
  if (request.url === "/api/combos" && request.method === "POST") {
    comboCreates += 1;
    combo = { id: "combo-1", ...await requestJson(request) };
    response.statusCode = 201;
    response.end(JSON.stringify(combo));
    return;
  }
  if (request.url === "/api/combos/combo-1" && request.method === "PATCH") {
    comboUpdates += 1;
    combo = { ...combo, ...await requestJson(request) };
    response.end(JSON.stringify(combo));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not found" }));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

try {
  const env = {
    ...process.env,
    HOME: fixture,
    PATH: `${binDir}:${process.env.PATH}`,
    PI_CODING_AGENT_DIR: agentDir,
    OMNIROUTE_PI_API_KEY: "fixture-key",
  };
  const args = [
    script,
    "--config-only",
    "--base-url",
    `http://127.0.0.1:${port}/v1`,
  ];

  await execFileAsync("sh", args, { cwd: root, env });
  const config = JSON.parse(fs.readFileSync(path.join(agentDir, "models.json"), "utf8"));
  assert.equal(config.providers.existing.models[0].id, "keep-me");
  assert.equal(config.providers.omniroute.baseUrl, `http://127.0.0.1:${port}/v1`);
  assert.equal(config.providers.omniroute.apiKey, "fixture-key");
  assert.equal(config.providers.omniroute.models[0].id, "pi-auto");
  assert.equal(config.providers.omniroute.models[0].contextWindow, 1048576);
  assert.deepEqual(config.providers.omniroute.models[0].input, ["text"]);
  assert.equal(fs.statSync(path.join(agentDir, "models.json")).mode & 0o777, 0o600);
  const modelBackups = fs.readdirSync(agentDir).filter((name) => name.startsWith("models.json.bak."));
  assert.equal(modelBackups.length, 1);
  assert.equal(fs.statSync(path.join(agentDir, modelBackups[0])).mode & 0o777, 0o600);
  const settings = JSON.parse(fs.readFileSync(path.join(agentDir, "settings.json"), "utf8"));
  assert.equal(settings.theme, "keep-me");
  assert.equal(settings.defaultProvider, "omniroute");
  assert.equal(settings.defaultModel, "pi-auto");
  assert.equal(fs.statSync(path.join(agentDir, "settings.json")).mode & 0o777, 0o600);
  const settingsBackups = fs.readdirSync(agentDir).filter((name) => name.startsWith("settings.json.bak."));
  assert.equal(settingsBackups.length, 1);
  assert.equal(fs.statSync(path.join(agentDir, settingsBackups[0])).mode & 0o777, 0o600);
  assert.equal(comboCreates, 1);
  assert.equal(comboUpdates, 0);
  assert.equal(combo.name, "pi-auto");
  assert.equal(combo.strategy, "lkgp");
  assert.deepEqual(combo.models.map((item) => item.model), ["mcode/mimo-auto", "oc/big-pickle"]);

  await execFileAsync("sh", args, { cwd: root, env });
  assert.equal(fs.readdirSync(agentDir).filter((name) => name.startsWith("models.json.bak.")).length, 1);
  assert.equal(fs.readdirSync(agentDir).filter((name) => name.startsWith("settings.json.bak.")).length, 1);
  assert.equal(comboCreates, 1);
  assert.equal(comboUpdates, 0);

  combo = { ...combo, strategy: "priority", models: combo.models.slice(0, 1) };
  await execFileAsync("sh", args, { cwd: root, env });
  assert.equal(comboCreates, 1);
  assert.equal(comboUpdates, 1);
  assert.equal(combo.strategy, "lkgp");
  assert.deepEqual(combo.models.map((item) => item.model), ["mcode/mimo-auto", "oc/big-pickle"]);

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(pkg.files.includes("install-omniroute-pi.sh"));
} finally {
  server.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("install-omniroute-pi ok");
