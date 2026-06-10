import { splitCommandArgs } from "../../lib/pi-bridge/command-grammar.js";

const REWRITE_TIMEOUT_MS = 2_000;
const MIN_SUPPORTED_RTK = [0, 23, 0];
export const RTK_INSTALL_COMMAND = "brew install rtk";

export function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

export function localRtkBin(home = process.env.HOME) {
  return home ? `${home}/.local/bin/rtk` : "";
}

export function pathWithLocalBin(env = process.env) {
  const localBin = env.HOME ? `${env.HOME}/.local/bin` : "";
  return uniquePaths([localBin, ...String(env.PATH ?? "").split(":")]).join(":");
}

export function rtkCommandCandidates(env = process.env) {
  return uniquePaths(["rtk", localRtkBin(env.HOME)]);
}

export function parseRtkVersion(raw) {
  const match = String(raw ?? "").trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

export function isSupportedRtkVersion(raw) {
  const parsed = parseRtkVersion(raw);
  if (!parsed) return false;
  return compareSemver(parsed, MIN_SUPPORTED_RTK) >= 0;
}

export function shouldSkipRewrite(command, env = process.env) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("rtk ")) return true;
  if (env.RTK_DISABLED === "1") return true;
  return false;
}

export function normalizeRewriteResult(result, originalCommand) {
  if (!result || result.killed) return null;
  if (result.code !== 0 && result.code !== 3) return null;
  const rewritten = String(result.stdout ?? "").trim();
  if (!rewritten || rewritten === originalCommand) return null;
  return rewritten;
}

export function parseRtkCommandArgs(args = "") {
  const parts = splitCommandArgs(args);
  return { action: parts[0] ?? "status" };
}

async function execRtk(pi, args, options = {}) {
  const env = { ...process.env, PATH: pathWithLocalBin(process.env), ...(options.env ?? {}) };
  return pi.exec(options.rtkCommand ?? "rtk", args, { timeout: REWRITE_TIMEOUT_MS, ...options, env });
}

async function findUsableRtk(pi) {
  for (const candidate of rtkCommandCandidates()) {
    const version = await execRtk(pi, ["--version"], { rtkCommand: candidate }).catch(() => ({ code: 1, stdout: "" }));
    if (version.code !== 0) continue;
    return { command: candidate, version: String(version.stdout ?? "").trim() };
  }
  return null;
}

async function checkRtk(pi) {
  const found = await findUsableRtk(pi);
  if (!found) {
    return { ok: false, reason: "rtk binary not found; /rtk install places it in ~/.local/bin", version: "", command: "" };
  }

  if (!isSupportedRtkVersion(found.version)) {
    return { ok: false, reason: `rtk is too old; need >= ${MIN_SUPPORTED_RTK.join(".")}`, version: found.version, command: found.command };
  }

  const gain = await execRtk(pi, ["gain"], { rtkCommand: found.command });
  if (gain.code !== 0) {
    return { ok: false, reason: "rtk exists but does not look like rtk-ai/rtk; `rtk gain` failed", version: found.version, command: found.command };
  }

  return { ok: true, reason: "rtk-ai/rtk available", version: found.version, command: found.command };
}

async function rewriteCommand(pi, command, signal) {
  const found = await findUsableRtk(pi);
  if (!found) return null;
  const result = await execRtk(pi, ["rewrite", command], { signal, rtkCommand: found.command });
  return normalizeRewriteResult(result, command);
}

function report(ctx, message, level = "info") {
  if (ctx?.hasUI) ctx.ui.notify(message, level);
  console.log(message);
}

function formatStatus(status) {
  if (status.ok) return `RTK enabled for Pi bash tool calls (${status.version}, ${status.command}). Set RTK_DISABLED=1 to bypass.`;
  return `RTK not active: ${status.reason}. Review and run manually: ${RTK_INSTALL_COMMAND}`;
}

async function handleRtkCommand(pi, args, ctx) {
  const parsed = parseRtkCommandArgs(args);

  if (parsed.action === "help") {
    report(ctx, [
      "RTK Pi integration commands:",
      "/rtk status — check whether rtk-ai/rtk is available",
      "/rtk install — show the manual rtk-ai/rtk install command; remote installers are not executed by this extension",
      "RTK rewrites eligible bash tool calls through `rtk rewrite`; it never blocks commands.",
    ].join("\n"));
    return;
  }

  if (parsed.action === "install") {
    const before = await checkRtk(pi).catch((error) => ({ ok: false, reason: error.message, version: "" }));
    if (before.ok) {
      report(ctx, formatStatus(before));
      return;
    }

    report(ctx, `Manual RTK install required. Review and run yourself: ${RTK_INSTALL_COMMAND}`, "warning");
    return;
  }

  const status = await checkRtk(pi).catch((error) => ({ ok: false, reason: error.message, version: "" }));
  report(ctx, formatStatus(status), status.ok ? "info" : "warning");
}

export default function registerRtkExtension(pi) {
  pi.registerCommand("rtk", {
    description: "Check or install rtk-ai/rtk for Pi bash command token savings",
    handler: async (args, ctx) => handleRtkCommand(pi, args, ctx),
  });

  pi.on("tool_call", async (event, ctx) => {
    try {
      if (event.toolName !== "bash") return;
      const command = event.input?.command;
      if (typeof command !== "string" || shouldSkipRewrite(command)) return;

      const rewritten = await rewriteCommand(pi, command, ctx.signal);
      if (rewritten) event.input.command = rewritten;
    } catch (error) {
      console.warn("[rtk] rewrite failed; passing through original command", error);
    }
  });
}
