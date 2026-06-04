import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const STATUS_KEY = "goal-statusline";
const GIT_REFRESH_MS = 5_000;
const PR_REFRESH_MS = 60_000;
const SPEED_RENDER_THROTTLE_MS = 250;

export function getContextZone({ contextWindow = 0, usedTokens = 0 } = {}) {
  if (!contextWindow || contextWindow <= 0) return { label: "NoCtx", color: "dim", usedRatio: 0 };

  const usedRatio = Math.max(0, Math.min(1, usedTokens / contextWindow));
  if (usedRatio < 0.4) return { label: "Plan", color: "success", usedRatio };
  if (usedRatio < 0.7) return { label: "Code", color: "success", usedRatio };
  if (usedRatio < 0.85) return { label: "Dump", color: "warning", usedRatio };
  if (usedRatio < 0.95) return { label: "ExDump", color: "error", usedRatio };
  return { label: "Dead", color: "error", usedRatio };
}

export function getContextSummary({ contextWindow = 0, usedTokens = 0 } = {}) {
  const zone = getContextZone({ contextWindow, usedTokens });
  const remainingTokens = contextWindow > 0 ? Math.max(0, contextWindow - usedTokens) : 0;
  const remainingPercent = contextWindow > 0 ? (remainingTokens / contextWindow) * 100 : 0;
  return { ...zone, contextWindow, usedTokens, remainingTokens, remainingPercent };
}

export function formatGoalStatusLine({
  cwd = "",
  branch,
  changedFiles = 0,
  prNumber,
  context = getContextSummary(),
  speed,
  provider,
  model,
  thinking = "off",
} = {}) {
  const dir = basename(cwd) || cwd || ".";
  const git = `${branch || "no-git"} [${Number.isFinite(changedFiles) ? changedFiles : 0}]${prNumber ? ` PR #${prNumber}` : ""}`;
  const contextText = context.contextWindow > 0
    ? `${formatCount(context.remainingTokens)} (${context.remainingPercent.toFixed(1)}%) ${context.label}`
    : "context n/a";
  const speedText = speed?.tokensPerSecond ? `${formatTokensPerSecond(speed.tokensPerSecond)} tok/s${speed.inProgress ? "…" : ""}` : "-- tok/s";
  const modelText = `${provider ? `${provider}/` : ""}${model || "no-model"}${thinking && thinking !== "off" ? ` [${thinking}]` : ""}`;
  return [dir, git, contextText, speedText, modelText].join(" │ ");
}

export function createEmptyResponseSpeedAggregate() {
  return { totalOutputTokens: 0, totalDurationMs: 0, responseCount: 0 };
}

export function addCompletedResponseSpeed(aggregate, outputTokens, durationMs) {
  if (!Number.isFinite(outputTokens) || !Number.isFinite(durationMs) || outputTokens <= 0 || durationMs <= 0) {
    return aggregate;
  }
  return {
    totalOutputTokens: aggregate.totalOutputTokens + outputTokens,
    totalDurationMs: aggregate.totalDurationMs + durationMs,
    responseCount: aggregate.responseCount + 1,
  };
}

export function getAverageResponseSpeed(completed, current) {
  const hasCurrent = current && current.outputTokens > 0 && current.durationMs > 0;
  const outputTokens = completed.totalOutputTokens + (hasCurrent ? current.outputTokens : 0);
  const durationMs = completed.totalDurationMs + (hasCurrent ? current.durationMs : 0);
  const responseCount = completed.responseCount + (hasCurrent ? 1 : 0);
  const inProgress = Boolean(current?.inProgress);
  const tokensPerSecond = outputTokens > 0 && durationMs > 0 ? outputTokens / (durationMs / 1000) : undefined;
  if (!tokensPerSecond && !inProgress) return undefined;
  return { tokensPerSecond, outputTokens, durationMs, responseCount, inProgress };
}

export function parseGoalStatuslineCommand(args = "") {
  const subcommand = args.trim().toLowerCase() || "toggle";
  if (["on", "enable", "enabled"].includes(subcommand)) return { action: "enable" };
  if (["off", "disable", "disabled"].includes(subcommand)) return { action: "disable" };
  if (["refresh", "reload"].includes(subcommand)) return { action: "refresh" };
  if (["status", "show"].includes(subcommand)) return { action: "status" };
  if (["help", "-h", "--help"].includes(subcommand)) return { action: "help" };
  if (subcommand === "toggle") return { action: "toggle" };
  return { action: "unknown", value: subcommand };
}

export function estimateTokens(text = "") {
  const length = String(text).length;
  return length === 0 ? 0 : Math.max(1, length / 4);
}

function formatCount(value) {
  return Math.round(value).toLocaleString();
}

function formatTokensPerSecond(tokensPerSecond) {
  return tokensPerSecond < 100 ? tokensPerSecond.toFixed(1) : Math.round(tokensPerSecond).toString();
}

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
  } catch {
    return "";
  }
}

function runGhPrNumber(cwd) {
  try {
    const output = execFileSync("gh", ["pr", "view", "--json", "number", "--jq", ".number"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3_000,
    }).trim();
    const number = Number(output);
    return Number.isFinite(number) && number > 0 ? number : undefined;
  } catch {
    return undefined;
  }
}

function assistantOutputTokens(message) {
  if (message?.usage?.output) return message.usage.output;
  let characters = 0;
  for (const block of message?.content ?? []) {
    if (block?.type === "text") characters += block.text?.length ?? 0;
    else if (block?.type === "thinking") characters += block.thinking?.length ?? 0;
    else if (block?.type === "toolCall") characters += JSON.stringify(block.arguments ?? {}).length;
  }
  return Math.ceil(characters / 4);
}

function styleLine(line, theme, contextSummary, speed) {
  if (!theme?.fg) return line;
  const color = speed?.tokensPerSecond && speed.tokensPerSecond < 5 ? "warning" : contextSummary.color;
  return theme.fg(color, line);
}

export default function goalStatuslineExtension(pi) {
  let enabled = false;
  let currentCtx;
  let gitInfo = { branch: undefined, changedFiles: 0, prNumber: undefined };
  let lastGitRefresh = 0;
  let lastPrRefresh = 0;
  let speedAggregate = createEmptyResponseSpeedAggregate();
  let responseStartMs;
  let liveOutputTokenEstimate = 0;
  let liveSpeed;
  let lastSpeedRender = 0;

  pi.registerFlag?.("goal-statusline", {
    description: "Enable the opt-in goal statusline HUD on startup",
    type: "boolean",
    default: false,
  });

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    enabled = Boolean(pi.getFlag?.("goal-statusline"));
    if (enabled) mount(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx?.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
    currentCtx = undefined;
    resetSpeed();
  });

  pi.on("model_select", async () => {
    resetSpeed();
    updateStatus();
  });

  pi.on("thinking_level_select", async () => {
    resetSpeed();
    updateStatus();
  });

  pi.on("message_start", async (event) => {
    if (event.message.role !== "assistant") return;
    responseStartMs = Date.now();
    liveOutputTokenEstimate = 0;
    liveSpeed = getAverageResponseSpeed(speedAggregate, { outputTokens: 0, durationMs: 0, inProgress: true });
    updateStatus();
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant" || responseStartMs === undefined) return;
    const streamEvent = event.assistantMessageEvent;
    if (["text_delta", "thinking_delta", "toolcall_delta"].includes(streamEvent?.type)) {
      liveOutputTokenEstimate += estimateTokens(streamEvent.delta);
    }
    liveSpeed = getAverageResponseSpeed(speedAggregate, {
      outputTokens: Math.round(liveOutputTokenEstimate),
      durationMs: Date.now() - responseStartMs,
      inProgress: true,
    });
    requestThrottledUpdate();
  });

  pi.on("message_end", async (event) => {
    if (event.message.role === "assistant") {
      const durationMs = responseStartMs === undefined ? 0 : Date.now() - responseStartMs;
      speedAggregate = addCompletedResponseSpeed(speedAggregate, assistantOutputTokens(event.message), durationMs);
      liveSpeed = getAverageResponseSpeed(speedAggregate);
      responseStartMs = undefined;
      liveOutputTokenEstimate = 0;
    }
    refreshGit(currentCtx?.cwd, { forceGit: false });
    updateStatus();
  });

  pi.on("tool_result", async (_event, ctx) => {
    currentCtx = ctx;
    refreshGit(ctx.cwd, { forceGit: true });
    updateStatus();
  });

  pi.registerCommand("goal-statusline", {
    description: "Toggle or refresh the opt-in goal statusline HUD",
    handler: async (args, ctx) => {
      currentCtx = ctx;
      const command = parseGoalStatuslineCommand(args);
      if (command.action === "enable" || command.action === "toggle" && !enabled) {
        enabled = true;
        mount(ctx);
        ctx.ui.notify("goal-statusline enabled", "info");
        return;
      }
      if (command.action === "disable" || command.action === "toggle" && enabled) {
        enabled = false;
        unmount(ctx);
        ctx.ui.notify("goal-statusline disabled", "info");
        return;
      }
      if (command.action === "refresh") {
        refreshGit(ctx.cwd, { forceGit: true, forcePr: true });
        updateStatus();
        ctx.ui.notify("goal-statusline refreshed", "info");
        return;
      }
      if (command.action === "status") {
        ctx.ui.notify(`goal-statusline ${enabled ? "enabled" : "disabled"}: ${buildLine(ctx)}`, "info");
        return;
      }
      if (command.action === "help") {
        ctx.ui.notify("Usage: /goal-statusline [on|off|status|refresh|help]", "info");
        return;
      }
      ctx.ui.notify(`Unknown /goal-statusline subcommand: ${command.value}. Try /goal-statusline help`, "warning");
    },
  });

  function mount(ctx) {
    if (!ctx.hasUI) return;
    refreshGit(ctx.cwd, { forceGit: true, forcePr: true });
    updateStatus(ctx);
  }

  function unmount(ctx) {
    if (ctx?.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  function requestThrottledUpdate() {
    const now = Date.now();
    if (now - lastSpeedRender < SPEED_RENDER_THROTTLE_MS) return;
    lastSpeedRender = now;
    updateStatus();
  }

  function resetSpeed() {
    speedAggregate = createEmptyResponseSpeedAggregate();
    responseStartMs = undefined;
    liveOutputTokenEstimate = 0;
    liveSpeed = undefined;
    lastSpeedRender = 0;
  }

  function refreshGit(cwd, options = {}) {
    if (!cwd) return;
    const now = Date.now();
    if (!options.forceGit && now - lastGitRefresh < GIT_REFRESH_MS) return;
    lastGitRefresh = now;

    const previousBranch = gitInfo.branch;
    const branch = runGit(cwd, ["branch", "--show-current"]) || runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const porcelain = runGit(cwd, ["status", "--porcelain"]);
    gitInfo = {
      ...gitInfo,
      branch: branch || undefined,
      changedFiles: porcelain ? porcelain.split("\n").filter((line) => line.trim()).length : 0,
    };

    const branchChanged = previousBranch !== gitInfo.branch;
    if (branchChanged) {
      gitInfo.prNumber = undefined;
      lastPrRefresh = 0;
    }
    if (options.forcePr || branchChanged || now - lastPrRefresh > PR_REFRESH_MS) {
      lastPrRefresh = now;
      gitInfo.prNumber = gitInfo.branch ? runGhPrNumber(cwd) : undefined;
    }
  }

  function buildLine(ctx = currentCtx) {
    const usage = ctx?.getContextUsage?.();
    const context = getContextSummary({
      contextWindow: ctx?.model?.contextWindow ?? 0,
      usedTokens: usage?.tokens ?? 0,
    });
    return formatGoalStatusLine({
      cwd: ctx?.cwd,
      branch: gitInfo.branch,
      changedFiles: gitInfo.changedFiles,
      prNumber: gitInfo.prNumber,
      context,
      speed: liveSpeed,
      provider: ctx?.model?.provider,
      model: ctx?.model?.id?.replace(/^models\//, ""),
      thinking: pi.getThinkingLevel?.() ?? "off",
    });
  }

  function updateStatus(ctx = currentCtx) {
    if (!enabled || !ctx?.hasUI) return;
    const usage = ctx.getContextUsage?.();
    const context = getContextSummary({ contextWindow: ctx.model?.contextWindow ?? 0, usedTokens: usage?.tokens ?? 0 });
    ctx.ui.setStatus(STATUS_KEY, styleLine(buildLine(ctx), ctx.ui.theme, context, liveSpeed));
  }
}
