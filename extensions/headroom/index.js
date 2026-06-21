import { splitCommandArgs } from "../../lib/pi-bridge/command-grammar.js";
import { spawn } from "node:child_process";

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PROVIDERS = ["openai-codex"];
const HEALTH_TIMEOUT_MS = 1_500;

export function normalizePort(value, fallback = DEFAULT_PORT) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

export function parseProviders(raw) {
  const list = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? [...new Set(list)] : [...DEFAULT_PROVIDERS];
}

export function readHeadroomConfig(env = process.env) {
  return {
    enabled: env.HEADROOM_DISABLED !== "1",
    host: env.HEADROOM_HOST || DEFAULT_HOST,
    port: normalizePort(env.HEADROOM_PORT),
    providers: parseProviders(env.HEADROOM_PROVIDERS),
    showNotifications: env.HEADROOM_NOTIFY !== "0",
  };
}

export function proxyBaseUrl(config) {
  return `http://${config.host}:${config.port}`;
}

export function healthUrl(config) {
  return `${proxyBaseUrl(config)}/v1/models`;
}

export function parseHeadroomVersion(raw) {
  const m = String(raw ?? "").match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

export function parseHeadroomCommandArgs(args = "") {
  try {
    const parts = splitCommandArgs(args);
    return { action: parts[0] || "status" };
  } catch {
    return { action: "status" };
  }
}

export function formatStatus(state, config) {
  if (!config.enabled) {
    return "Headroom disabled (HEADROOM_DISABLED=1); no provider routing applied.";
  }
  if (state.reachable) {
    return `Headroom active at ${proxyBaseUrl(config)} (${state.version ?? "version unknown"}); routing: ${state.routedProviders.join(", ") || "none"}.`;
  }
  return `Headroom proxy not reachable at ${proxyBaseUrl(config)}; Pi running normally (no routing). Start it: headroom proxy --port ${config.port} (or /headroom start).`;
}

export async function isProxyReachable(config, timeoutMs = HEALTH_TIMEOUT_MS, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(healthUrl(config), { signal: controller.signal });
    return Boolean(res && (res.ok || res.status === 400 || res.status === 401 || res.status === 405));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function headroomVersion(pi) {
  try {
    const r = await pi.exec("headroom", ["--version"], { timeout: 3_000 });
    return r.code === 0 ? parseHeadroomVersion(r.stdout) : null;
  } catch {
    return null;
  }
}

function report(ctx, message, level = "info", config = null) {
  if (ctx?.hasUI && (config === null || config.showNotifications)) {
    ctx.ui.notify(message, level);
  }
  console.log(message);
}

async function getState(pi, config) {
  const reachable = await isProxyReachable(config).catch(() => false);
  const version = reachable ? await headroomVersion(pi) : null;
  return { reachable, version, routedProviders: reachable ? config.providers : [] };
}

function startProxyDetached(config) {
  const child = spawn("headroom", ["proxy", "--port", String(config.port), "--host", config.host], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {}); // suppress unhandled error if headroom is not installed
  child.unref();
}

export default async function registerHeadroomExtension(pi) {
  const config = readHeadroomConfig();

  if (config.enabled) {
    const reachable = await isProxyReachable(config).catch(() => false);
    if (reachable) {
      for (const provider of config.providers) {
        try {
          pi.registerProvider(provider, { baseUrl: proxyBaseUrl(config) });
        } catch (error) {
          console.warn(`[headroom] failed to route provider ${provider}; leaving default`, error);
        }
      }
    }
  }

  pi.registerCommand("headroom", {
    description: "Check the headroom compression proxy, report routing, and view savings",
    handler: async (args, ctx) => {
      const liveConfig = readHeadroomConfig();
      const { action } = parseHeadroomCommandArgs(args);

      if (action === "help") {
        report(
          ctx,
          [
            "Headroom Pi integration:",
            "/headroom status — proxy reachability, version, routed providers",
            "/headroom stats — token savings (headroom perf)",
            "/headroom start — launch `headroom proxy` in the background, then re-check",
            "Env: HEADROOM_DISABLED=1, HEADROOM_PORT=8787, HEADROOM_HOST=127.0.0.1, HEADROOM_PROVIDERS=openai-codex, HEADROOM_NOTIFY=0",
          ].join("\n"),
          "info",
          liveConfig
        );
        return;
      }

      if (action === "start") {
        startProxyDetached(liveConfig);
        report(
          ctx,
          `Starting headroom proxy on ${proxyBaseUrl(liveConfig)} ... run /headroom status in a moment. Provider routing applies on next Pi start.`,
          "info",
          liveConfig
        );
        return;
      }

      if (action === "stats") {
        try {
          const r = await pi.exec("headroom", ["perf"], { timeout: 5_000 });
          report(ctx, r.code === 0 ? r.stdout.trim() || "No headroom perf data yet." : "headroom perf failed; is headroom installed?", "info", liveConfig);
        } catch (error) {
          report(ctx, `headroom perf error: ${error.message}`, "warning", liveConfig);
        }
        return;
      }

      const state = await getState(pi, liveConfig);
      report(ctx, formatStatus(state, liveConfig), state.reachable ? "info" : "warning", liveConfig);
    },
  });
}
