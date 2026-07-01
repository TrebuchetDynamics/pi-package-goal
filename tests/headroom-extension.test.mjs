import assert from "node:assert/strict";
import registerHeadroom, {
  healthUrl,
  isProxyReachable,
  parseHeadroomArgs,
  parseHeadroomVersion,
  parseProviders,
  proxyBaseUrl,
  readHeadroomConfig,
} from "../extensions/headroom/index.js";

assert.deepEqual(parseProviders(undefined), ["openai-codex"]);
assert.deepEqual(parseProviders("anthropic, openai-codex,anthropic"), ["anthropic", "openai-codex"]);

assert.deepEqual(readHeadroomConfig({}), {
  enabled: false,
  host: "127.0.0.1",
  port: 8787,
  providers: ["openai-codex"],
});
assert.deepEqual(readHeadroomConfig({ HEADROOM_ENABLED: "1", HEADROOM_HOST: "0.0.0.0", HEADROOM_PORT: "9000", HEADROOM_PROVIDERS: "anthropic" }), {
  enabled: true,
  host: "0.0.0.0",
  port: 9000,
  providers: ["anthropic"],
});
assert.equal(readHeadroomConfig({ HEADROOM_ENABLED: "1", HEADROOM_DISABLED: "1" }).enabled, false);

const config = readHeadroomConfig({});
assert.equal(proxyBaseUrl(config), "http://127.0.0.1:8787");
assert.equal(healthUrl(config), "http://127.0.0.1:8787/v1/models");
assert.equal(parseHeadroomVersion("headroom, version 0.26.0"), "0.26.0");
assert.equal(parseHeadroomVersion("nope"), null);
assert.deepEqual(parseHeadroomArgs(""), { action: "status" });
assert.deepEqual(parseHeadroomArgs(" stats "), { action: "stats" });

assert.equal(await isProxyReachable(config, async () => ({ ok: true, status: 200 })), true);
assert.equal(await isProxyReachable(config, async () => ({ ok: false, status: 401 })), true);
assert.equal(await isProxyReachable(config, async () => { throw new Error("down"); }), false);

const commands = new Map();
const providers = [];
await registerHeadroom({
  registerCommand: (name, definition) => commands.set(name, definition),
  registerProvider: (provider, options) => providers.push({ provider, options }),
  exec: async () => ({ code: 0, stdout: "headroom, version 0.26.0", stderr: "" }),
}, { env: { HEADROOM_ENABLED: "1" }, fetchImpl: async () => ({ ok: true, status: 200 }) });
assert.equal(commands.has("headroom"), true);
assert.deepEqual(providers, [{ provider: "openai-codex", options: { baseUrl: "http://127.0.0.1:8787" } }]);

const notices = [];
await commands.get("headroom").handler("status", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.match(notices.at(-1).message, /Headroom active/);
assert.equal(notices.at(-1).level, "info");

const disabledProviders = [];
await registerHeadroom({
  registerCommand: () => {},
  registerProvider: (provider, options) => disabledProviders.push({ provider, options }),
}, { env: {}, fetchImpl: async () => ({ ok: true, status: 200 }) });
assert.deepEqual(disabledProviders, []);

await commands.get("headroom").handler("stats", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.match(notices.at(-1).message, /headroom, version 0\.26\.0/);

const spawned = [];
const startCommands = new Map();
await registerHeadroom({
  registerCommand: (name, definition) => startCommands.set(name, definition),
}, {
  env: { HEADROOM_PORT: "9001" },
  fetchImpl: async () => ({ ok: false, status: 503 }),
  spawnImpl: (cmd, args, options) => {
    spawned.push({ cmd, args, options });
    return { unref: () => spawned.push("unref") };
  },
});
await startCommands.get("headroom").handler("start", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(spawned[0].cmd, "headroom");
assert.deepEqual(spawned[0].args, ["proxy", "--host", "127.0.0.1", "--port", "9001"]);
assert.equal(spawned[1], "unref");
assert.match(notices.at(-1).message, /9001/);

console.log("headroom-extension ok");
