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
const npmLog = path.join(fixture, "npm.log");
const omnirouteLog = path.join(fixture, "omniroute.log");
const serverMarker = path.join(fixture, "server.ready");
fs.mkdirSync(agentDir, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(
  path.join(agentDir, "models.json"),
  `${JSON.stringify({ providers: { existing: { models: [{ id: "keep-me" }] } } }, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(agentDir, "settings.json"),
  `${JSON.stringify({ theme: "keep-me" }, null, 2)}\n`,
);
fs.writeFileSync(path.join(binDir, "pi"), "#!/bin/sh\nexit 0\n", {
  mode: 0o755,
});
fs.writeFileSync(
  path.join(binDir, "omniroute"),
  '#!/bin/sh\nprintf \'%s|%s\\n\' "$OMNIROUTE_CHAT_MAX_HEAVY_IN_FLIGHT" "$*" >> "$OMNIROUTE_LOG"\ntouch "$SERVER_MARKER"\n',
  { mode: 0o755 },
);
fs.writeFileSync(
  path.join(binDir, "npm"),
  '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$NPM_LOG"\n',
  { mode: 0o755 },
);

let requireDaemonStart = false;
const server = http.createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/v1/models") {
    if (requireDaemonStart && !fs.existsSync(serverMarker)) {
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "daemon stopped" }));
      return;
    }
    response.end(
      JSON.stringify({
        data: [
          {
            id: "auto/coding:free",
            context_length: 1048576,
            capabilities: { reasoning: true, tool_calling: true },
          },
        ],
      }),
    );
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
    NPM_LOG: npmLog,
    OMNIROUTE_LOG: omnirouteLog,
    SERVER_MARKER: serverMarker,
  };
  const args = [
    script,
    "--config-only",
    "--base-url",
    `http://127.0.0.1:${port}/v1`,
  ];

  await execFileAsync("sh", args, { cwd: root, env });
  const config = JSON.parse(
    fs.readFileSync(path.join(agentDir, "models.json"), "utf8"),
  );
  assert.equal(config.providers.existing.models[0].id, "keep-me");
  assert.equal(
    config.providers.omniroute.baseUrl,
    `http://127.0.0.1:${port}/v1`,
  );
  assert.equal(config.providers.omniroute.apiKey, "fixture-key");
  assert.equal(config.providers.omniroute.models[0].id, "auto/coding:free");
  assert.equal(config.providers.omniroute.models[0].contextWindow, 1048576);
  assert.equal(config.providers.omniroute.models[0].maxTokens, 16384);
  assert.deepEqual(config.providers.omniroute.models[0].input, ["text"]);
  assert.equal(
    fs.statSync(path.join(agentDir, "models.json")).mode & 0o777,
    0o600,
  );
  const modelBackups = fs
    .readdirSync(agentDir)
    .filter((name) => name.startsWith("models.json.bak."));
  assert.equal(modelBackups.length, 1);
  assert.equal(
    fs.statSync(path.join(agentDir, modelBackups[0])).mode & 0o777,
    0o600,
  );
  const settings = JSON.parse(
    fs.readFileSync(path.join(agentDir, "settings.json"), "utf8"),
  );
  assert.equal(settings.theme, "keep-me");
  assert.equal(settings.defaultProvider, "omniroute");
  assert.equal(settings.defaultModel, "auto/coding:free");
  assert.equal(
    fs.statSync(path.join(agentDir, "settings.json")).mode & 0o777,
    0o600,
  );
  const settingsBackups = fs
    .readdirSync(agentDir)
    .filter((name) => name.startsWith("settings.json.bak."));
  assert.equal(settingsBackups.length, 1);
  assert.equal(
    fs.statSync(path.join(agentDir, settingsBackups[0])).mode & 0o777,
    0o600,
  );
  await execFileAsync("sh", args, { cwd: root, env });
  assert.equal(
    fs
      .readdirSync(agentDir)
      .filter((name) => name.startsWith("models.json.bak.")).length,
    1,
  );
  assert.equal(
    fs
      .readdirSync(agentDir)
      .filter((name) => name.startsWith("settings.json.bak.")).length,
    1,
  );
  requireDaemonStart = true;
  await execFileAsync(
    "sh",
    [script, "--base-url", `http://127.0.0.1:${port}/v1`],
    { cwd: root, env },
  );
  assert.match(
    fs.readFileSync(omnirouteLog, "utf8"),
    /^2\|serve --daemon --no-open$/m,
    "local daemon must allow two structurally heavy Pi requests",
  );
  assert.equal(
    fs.existsSync(npmLog),
    false,
    "an existing OmniRoute install must not be rewritten by npm",
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  assert.ok(pkg.files.includes("install-omniroute-pi.sh"));
} finally {
  server.close();
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("install-omniroute-pi ok");
