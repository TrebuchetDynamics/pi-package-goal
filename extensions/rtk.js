const REWRITE_TIMEOUT_MS = 2_000;
const INSTALL_TIMEOUT_MS = 120_000;
const MIN_SUPPORTED_RTK = [0, 23, 0];
const RTK_INSTALL_COMMAND = "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh";

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
  const parts = String(args).trim().split(/\s+/).filter(Boolean);
  return {
    action: parts[0] ?? "status",
    yes: parts.includes("--yes") || parts.includes("-y"),
  };
}

async function execRtk(pi, args, options = {}) {
  return pi.exec("rtk", args, { timeout: REWRITE_TIMEOUT_MS, ...options });
}

async function checkRtk(pi) {
  const version = await execRtk(pi, ["--version"]);
  if (version.code !== 0) {
    return { ok: false, reason: "rtk binary not found in PATH", version: "" };
  }

  const versionText = String(version.stdout ?? "").trim();
  if (!isSupportedRtkVersion(versionText)) {
    return { ok: false, reason: `rtk is too old; need >= ${MIN_SUPPORTED_RTK.join(".")}`, version: versionText };
  }

  const gain = await execRtk(pi, ["gain"]);
  if (gain.code !== 0) {
    return { ok: false, reason: "rtk exists but does not look like rtk-ai/rtk; `rtk gain` failed", version: versionText };
  }

  return { ok: true, reason: "rtk-ai/rtk available", version: versionText };
}

async function rewriteCommand(pi, command, signal) {
  const result = await execRtk(pi, ["rewrite", command], { signal });
  return normalizeRewriteResult(result, command);
}

function report(ctx, message, level = "info") {
  if (ctx?.hasUI) ctx.ui.notify(message, level);
  console.log(message);
}

function formatStatus(status) {
  if (status.ok) return `RTK enabled for Pi bash tool calls (${status.version}). Set RTK_DISABLED=1 to bypass.`;
  return `RTK not active: ${status.reason}. Install with /rtk install or run: ${RTK_INSTALL_COMMAND}`;
}

async function handleRtkCommand(pi, args, ctx) {
  const parsed = parseRtkCommandArgs(args);

  if (parsed.action === "help") {
    report(ctx, [
      "RTK Pi integration commands:",
      "/rtk status — check whether rtk-ai/rtk is available",
      "/rtk install [--yes] — install rtk-ai/rtk to ~/.local/bin after confirmation",
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

    if (!parsed.yes) {
      if (!ctx?.hasUI) {
        report(ctx, `Manual RTK install required: ${RTK_INSTALL_COMMAND}`, "warning");
        return;
      }
      const confirmed = await ctx.ui.confirm(
        "Install RTK?",
        `This will run the upstream rtk-ai installer:\n${RTK_INSTALL_COMMAND}\n\nReview source first: https://github.com/rtk-ai/rtk`,
      );
      if (!confirmed) {
        report(ctx, `RTK install skipped. Manual command: ${RTK_INSTALL_COMMAND}`, "warning");
        return;
      }
    }

    report(ctx, "Installing rtk-ai/rtk...");
    const install = await pi.exec("sh", ["-c", RTK_INSTALL_COMMAND], { timeout: INSTALL_TIMEOUT_MS });
    if (install.code !== 0 || install.killed) {
      report(ctx, `RTK install failed. Exit ${install.code}; stderr: ${String(install.stderr ?? "").trim()}`, "error");
      return;
    }

    const after = await checkRtk(pi).catch((error) => ({ ok: false, reason: error.message, version: "" }));
    report(ctx, formatStatus(after), after.ok ? "info" : "warning");
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
