import { spawn } from "node:child_process";
import { splitCommandArgs } from "../../lib/pi-bridge/command-grammar.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_PROVIDERS = ["openai-codex"];
const REACHABLE_STATUS_CODES = new Set([200, 400, 401, 405]);

function normalizePort(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

export function parseProviders(raw) {
  const providers = String(raw ?? "")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
  return providers.length ? [...new Set(providers)] : [...DEFAULT_PROVIDERS];
}

export function readHeadroomConfig(env = process.env) {
  return {
    enabled: env.HEADROOM_ENABLED === "1" && env.HEADROOM_DISABLED !== "1",
    host: env.HEADROOM_HOST || DEFAULT_HOST,
    port: normalizePort(env.HEADROOM_PORT),
    providers: parseProviders(env.HEADROOM_PROVIDERS),
  };
}

export function proxyBaseUrl(config) {
  return `http://${config.host}:${config.port}`;
}

export function healthUrl(config) {
  return `${proxyBaseUrl(config)}/v1/models`;
}

export function parseHeadroomVersion(raw) {
  return String(raw ?? "").match(/(\d+\.\d+\.\d+)/)?.[1] ?? null;
}

export function parseHeadroomArgs(args = "") {
  return { action: splitCommandArgs(args)[0] || "status" };
}

export async function isProxyReachable(config, fetchImpl = fetch, timeoutMs = 1_500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(healthUrl(config), { signal: controller.signal });
    return Boolean(response?.ok || REACHABLE_STATUS_CODES.has(response?.status));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function notify(ctx, message, level = "info") {
  if (ctx?.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

async function headroomVersion(pi) {
  try {
    const result = await pi.exec?.("headroom", ["--version"], { timeout: 3_000 });
    return result?.code === 0 ? parseHeadroomVersion(result.stdout) : null;
  } catch {
    return null;
  }
}

function formatStatus({ config, reachable, version }) {
  if (!config.enabled) return "Headroom routing disabled; set HEADROOM_ENABLED=1 to route providers through the local proxy.";
  if (!reachable) return `Headroom proxy not reachable at ${proxyBaseUrl(config)}; Pi provider routing unchanged.`;
  return `Headroom active at ${proxyBaseUrl(config)} (${version ?? "version unknown"}); routing: ${config.providers.join(", ")}.`;
}

function startProxy(config, spawnImpl = spawn) {
  const child = spawnImpl("headroom", ["proxy", "--host", config.host, "--port", String(config.port)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref?.();
}

export default async function registerHeadroom(pi, options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const spawnImpl = options.spawnImpl ?? spawn;
  const config = readHeadroomConfig(env);

  if (config.enabled && await isProxyReachable(config, fetchImpl)) {
    for (const provider of config.providers) {
      pi.registerProvider?.(provider, { baseUrl: proxyBaseUrl(config) });
    }
  }

  pi.registerCommand("headroom", {
    description: "Check or start the local headroom compression proxy",
    handler: async (args, ctx) => {
      const liveConfig = readHeadroomConfig(env);
      const { action } = parseHeadroomArgs(args);

      if (action === "help") {
        notify(ctx, "Usage: /headroom status | stats | start | help. Set HEADROOM_ENABLED=1 to enable provider routing.", "info");
        return;
      }

      if (action === "start") {
        startProxy(liveConfig, spawnImpl);
        notify(ctx, `Starting headroom proxy at ${proxyBaseUrl(liveConfig)}; set HEADROOM_ENABLED=1 and restart Pi to route providers.`, "info");
        return;
      }

      if (action === "stats") {
        try {
          const result = await pi.exec?.("headroom", ["perf"], { timeout: 5_000 });
          notify(ctx, result?.code === 0 ? result.stdout.trim() || "No headroom perf data yet." : "headroom perf failed; is headroom installed?", result?.code === 0 ? "info" : "warning");
        } catch (error) {
          notify(ctx, `headroom perf error: ${error.message}`, "warning");
        }
        return;
      }

      const reachable = liveConfig.enabled && await isProxyReachable(liveConfig, fetchImpl);
      const version = reachable ? await headroomVersion(pi) : null;
      notify(ctx, formatStatus({ config: liveConfig, reachable, version }), reachable ? "info" : "warning");
    },
  });
}
