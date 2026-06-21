import assert from "node:assert/strict";
import {
  normalizePort,
  parseProviders,
  readHeadroomConfig,
  proxyBaseUrl,
  healthUrl,
  parseHeadroomVersion,
  parseHeadroomCommandArgs,
  formatStatus,
  isProxyReachable,
} from "../extensions/headroom/index.js";

// normalizePort
assert.equal(normalizePort("9000"), 9000);
assert.equal(normalizePort(undefined), 8787);
assert.equal(normalizePort("0"), 8787);
assert.equal(normalizePort("notaport"), 8787);
assert.equal(normalizePort("70000"), 8787);

// parseProviders
assert.deepEqual(parseProviders(undefined), ["openai-codex"]);
assert.deepEqual(parseProviders(""), ["openai-codex"]);
assert.deepEqual(parseProviders("anthropic, openai-codex ,anthropic"), ["anthropic", "openai-codex"]);

// readHeadroomConfig defaults
assert.deepEqual(readHeadroomConfig({}), {
  enabled: true,
  host: "127.0.0.1",
  port: 8787,
  providers: ["openai-codex"],
  showNotifications: true,
});

// readHeadroomConfig overrides
assert.deepEqual(
  readHeadroomConfig({
    HEADROOM_DISABLED: "1",
    HEADROOM_PORT: "9000",
    HEADROOM_HOST: "0.0.0.0",
    HEADROOM_PROVIDERS: "anthropic",
    HEADROOM_NOTIFY: "0",
  }),
  { enabled: false, host: "0.0.0.0", port: 9000, providers: ["anthropic"], showNotifications: false }
);

// url builders
assert.equal(proxyBaseUrl({ host: "127.0.0.1", port: 8787 }), "http://127.0.0.1:8787");
assert.equal(healthUrl({ host: "127.0.0.1", port: 8787 }), "http://127.0.0.1:8787/v1/models");

// version
assert.equal(parseHeadroomVersion("headroom, version 0.26.0"), "0.26.0");
assert.equal(parseHeadroomVersion("garbage"), null);

// command args
assert.deepEqual(parseHeadroomCommandArgs(""), { action: "status" });
assert.deepEqual(parseHeadroomCommandArgs("stats"), { action: "stats" });
assert.deepEqual(parseHeadroomCommandArgs("  start  "), { action: "start" });
assert.deepEqual(parseHeadroomCommandArgs('start "unclosed'), { action: "status" });

// formatStatus
const cfg = { enabled: true, host: "127.0.0.1", port: 8787, providers: ["openai-codex"], showNotifications: true };
assert.match(
  formatStatus({ reachable: true, version: "0.26.0", routedProviders: ["openai-codex"] }, cfg),
  /active.*0\.26\.0.*openai-codex/
);
assert.match(formatStatus({ reachable: false, version: null, routedProviders: [] }, cfg), /not reachable/);
assert.match(formatStatus({ reachable: false }, { ...cfg, enabled: false }), /disabled/);

// isProxyReachable with fake fetch
const okFetch = async () => ({ ok: true, status: 200 });
const unauthFetch = async () => ({ ok: false, status: 401 });
const downFetch = async () => {
  throw new Error("ECONNREFUSED");
};
assert.equal(await isProxyReachable(cfg, 500, okFetch), true);
assert.equal(await isProxyReachable(cfg, 500, unauthFetch), true);
assert.equal(await isProxyReachable(cfg, 500, downFetch), false);

console.log("headroom-extension tests passed");
