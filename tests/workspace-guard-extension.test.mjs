import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import workspaceGuard, {
  DEFAULT_BASH_TIMEOUT_SECONDS,
  classifyWritePath,
} from "../extensions/workspace-guard/index.js";

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-guard-"));
try {
  fs.mkdirSync(path.join(fixture, "src"));
  assert.equal(classifyWritePath("src/app.js", fixture).allowed, true);
  assert.equal(
    classifyWritePath("/home/user/outside.js", fixture).allowed,
    false,
  );
  assert.equal(classifyWritePath(".git/config", fixture).allowed, false);
  assert.equal(classifyWritePath(".pi/settings.json", fixture).allowed, false);
  assert.equal(classifyWritePath(".env.local", fixture).allowed, false);
  assert.equal(
    classifyWritePath("node_modules/pkg/index.js", fixture).allowed,
    false,
  );
  assert.equal(
    classifyWritePath(path.join(os.tmpdir(), "agent-output.txt"), fixture)
      .allowed,
    true,
  );
  assert.equal(
    classifyWritePath("nested/.pi/state.json", fixture).allowed,
    false,
  );
  assert.equal(classifyWritePath(".aws/credentials", fixture).allowed, false);
  assert.equal(
    classifyWritePath(path.join(os.tmpdir(), ".ssh", "config"), fixture)
      .allowed,
    false,
  );

  fs.symlinkSync(process.cwd(), path.join(fixture, "linked"));
  assert.equal(
    classifyWritePath("linked/escape.js", fixture).allowed,
    false,
    "symlink escapes must be blocked",
  );
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

const handlers = new Map();
const commands = new Map();
const pi = {
  on(event, handler) {
    handlers.set(event, handler);
  },
  registerCommand(name, options) {
    commands.set(name, options);
  },
};
workspaceGuard(pi);
assert.ok(commands.has("workspace-guard"));
const ctx = { cwd: "/tmp/project", ui: { notify() {} } };
const bashEvent = { toolName: "bash", input: { command: "npm test" } };
await handlers.get("tool_call")(bashEvent, ctx);
assert.equal(bashEvent.input.timeout, DEFAULT_BASH_TIMEOUT_SECONDS);
const blocked = await handlers.get("tool_call")(
  { toolName: "write", input: { path: "/home/user/.ssh/config" } },
  ctx,
);
assert.equal(blocked.block, true);
assert.match(blocked.reason, /outside workspace/i);

console.log("workspace-guard-extension ok");
