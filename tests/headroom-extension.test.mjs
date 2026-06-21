import assert from "node:assert/strict";
import {
  normalizePort,
  parseProviders,
  readHeadroomConfig,
  proxyBaseUrl,
  healthUrl,
  routedBaseUrl,
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

// parseProviders — empty by default (route nothing unless explicitly opted in)
assert.deepEqual(parseProviders(undefined), []);
assert.deepEqual(parseProviders(""), []);
assert.deepEqual(parseProviders("anthropic, openrouter ,anthropic"), ["anthropic", "openrouter"]);

// readHeadroomConfig defaults
assert.deepEqual(readHeadroomConfig({}), {
  enabled: true,
  host: "127.0.0.1",
  port: 8787,
  providers: [],
  baseUrl: null,
  showNotifications: true,
});

// readHeadroomConfig overrides
assert.deepEqual(
  readHeadroomConfig({
    HEADROOM_DISABLED: "1",
    HEADROOM_PORT: "9000",
    HEADROOM_HOST: "0.0.0.0",
    HEADROOM_PROVIDERS: "openrouter",
    HEADROOM_BASE_URL: "http://127.0.0.1:8787/v1",
    HEADROOM_NOTIFY: "0",
  }),
  { enabled: false, host: "0.0.0.0", port: 9000, providers: ["openrouter"], baseUrl: "http://127.0.0.1:8787/v1", showNotifications: false }
);

// url builders
assert.equal(proxyBaseUrl({ host: "127.0.0.1", port: 8787 }), "http://127.0.0.1:8787");
assert.equal(healthUrl({ host: "127.0.0.1", port: 8787 }), "http://127.0.0.1:8787/v1/models");

// routedBaseUrl — defaults to proxyBaseUrl + /v1; overridden by baseUrl
assert.equal(routedBaseUrl({ host: "127.0.0.1", port: 8787, baseUrl: null }), "http://127.0.0.1:8787/v1");
assert.equal(routedBaseUrl({ host: "127.0.0.1", port: 8787, baseUrl: "http://x:9/v1" }), "http://x:9/v1");

// version
assert.equal(parseHeadroomVersion("headroom, version 0.26.0"), "0.26.0");
assert.equal(parseHeadroomVersion("garbage"), null);

// command args
assert.deepEqual(parseHeadroomCommandArgs(""), { action: "status" });
assert.deepEqual(parseHeadroomCommandArgs("stats"), { action: "stats" });
assert.deepEqual(parseHeadroomCommandArgs("  start  "), { action: "start" });
assert.deepEqual(parseHeadroomCommandArgs("help"), { action: "help" });
assert.deepEqual(parseHeadroomCommandArgs('start "unclosed'), { action: "status" });

// formatStatus
const cfg = { enabled: true, host: "127.0.0.1", port: 8787, providers: ["openrouter"], showNotifications: true };
assert.match(
  formatStatus({ reachable: true, version: "0.26.0", routedProviders: ["openrouter"] }, cfg),
  /active.*0\.26\.0.*openrouter/
);
// reachable with no routed providers shows helpful "none" hint
assert.match(
  formatStatus({ reachable: true, version: "0.26.0", routedProviders: [] }, cfg),
  /none/
);
assert.match(formatStatus({ reachable: false, version: null, routedProviders: [] }, cfg), /not reachable/);
assert.match(formatStatus({ reachable: false }, { ...cfg, enabled: false }), /disabled/);

// isProxyReachable with fake fetch
const okFetch = async () => ({ ok: true, status: 200 });
const unauthFetch = async () => ({ ok: false, status: 401 });
const badRequestFetch = async () => ({ ok: false, status: 400 });
const methodFetch = async () => ({ ok: false, status: 405 });
const notFoundFetch = async () => ({ ok: false, status: 404 });
const downFetch = async () => {
  throw new Error("ECONNREFUSED");
};
assert.equal(await isProxyReachable(cfg, 500, okFetch), true);
assert.equal(await isProxyReachable(cfg, 500, unauthFetch), true);
assert.equal(await isProxyReachable(cfg, 500, badRequestFetch), true);
assert.equal(await isProxyReachable(cfg, 500, methodFetch), true);
assert.equal(await isProxyReachable(cfg, 500, notFoundFetch), false);
assert.equal(await isProxyReachable(cfg, 500, downFetch), false);

console.log("headroom-extension tests passed");
