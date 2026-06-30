import { splitCommandArgs } from "../../lib/pi-bridge/command-grammar.js";

const REWRITE_TIMEOUT_MS = 2_000;
const STATUS_TTL_MS = 30_000;
const MIN_SUPPORTED_RTK = [0, 23, 0];
const DEFAULT_MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_READ_EXACT_LINE_LIMIT = 80;
export const RTK_INSTALL_COMMAND = "brew install rtk";

const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

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
  return uniquePaths([env.RTK_BIN, "rtk", localRtkBin(env.HOME)]);
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

export function readRtkConfig(env = process.env) {
  const mode = env.RTK_MODE === "suggest" ? "suggest" : "rewrite";
  return {
    enabled: env.RTK_DISABLED !== "1",
    mode,
    showNotifications: env.RTK_NOTIFY !== "0",
    guardWhenMissing: env.RTK_GUARD_MISSING !== "0",
    unsafeRewrite: env.RTK_REWRITE_UNSAFE === "1",
    compactOutput: env.RTK_COMPACT !== "0",
    compactRead: env.RTK_COMPACT_READ === "1",
    stripAnsi: env.RTK_STRIP_ANSI !== "0",
    maxOutputChars: normalizePositiveInt(env.RTK_MAX_OUTPUT_CHARS, DEFAULT_MAX_OUTPUT_CHARS),
    readExactLineLimit: normalizePositiveInt(env.RTK_READ_EXACT_LINES, DEFAULT_READ_EXACT_LINE_LIMIT),
  };
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function shouldSkipRewrite(command, env = process.env, config = readRtkConfig(env)) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed) return true;
  if (!config.enabled) return true;
  if (trimmed === "rtk" || trimmed.startsWith("rtk ")) return true;
  if (config.unsafeRewrite) return false;
  if (/[\n\r]/.test(trimmed)) return true;
  if (/^(?:find|rg|grep)\b/.test(trimmed)) return true;
  if (/(^|\s)(?:rm|mv|cp|chmod|chown|sudo)\b/.test(trimmed)) return true;
  if (/\b(?:git\s+(?:reset|clean|checkout|switch|restore|rebase|merge|push)|npm\s+publish)\b/.test(trimmed)) return true;
  if (/[|;&<>`]|\$\(/.test(trimmed)) return true;
  if (/\b(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY)\b/i.test(trimmed)) return true;
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

export function stripAnsi(text) {
  return String(text ?? "").replace(ANSI_PATTERN, "");
}

export function truncateText(text, maxChars = DEFAULT_MAX_OUTPUT_CHARS) {
  const value = String(text ?? "");
  if (value.length <= maxChars) return value;
  const head = Math.max(0, Math.floor(maxChars * 0.65));
  const tail = Math.max(0, maxChars - head - 80);
  return `${value.slice(0, head)}\n[RTK compacted output: ${value.length - head - tail} chars omitted]\n${value.slice(-tail)}`;
}

export function compactTestOutput(text, command = "") {
  const commandLooksLikeTest = /(^|\s)(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:test|spec)\b/i.test(command)
    || /(^|\s)(?:vitest|jest|mocha|pytest)\b/i.test(command)
    || /\b(?:cargo\s+test|go\s+test)\b/i.test(command)
    || /(^|\s)node\s+\S*(?:test|spec)\.[cm]?js\b/i.test(command);
  const outputLooksLikeTest = /^(?:PASS|FAIL|ok|not ok)\b/m.test(text) || /^\s*(?:Tests?:|\d+\s+(?:passing|failing|passed|failed))\b/mi.test(text);
  if (!commandLooksLikeTest && !outputLooksLikeTest) return null;
  const lines = text.split(/\r?\n/);
  const important = lines.filter((line) => /\b(?:FAIL|Failed|Error|Exception|AssertionError|panic|not ok|✖|×)\b/i.test(line));
  const passCount = (text.match(/\b(?:PASS|passed|ok)\b/gi) ?? []).length;
  const failCount = (text.match(/\b(?:FAIL|failed|not ok)\b/gi) ?? []).length;
  if (lines.length < 40 && important.length === 0) return null;
  return [
    `[RTK test summary: ${passCount} pass markers, ${failCount} fail markers, ${lines.length} lines]`,
    ...important.slice(0, 80),
  ].join("\n");
}

export function compactBuildOutput(text, command = "") {
  if (!/\b(?:build|compile|tsc|webpack|vite|rollup|cargo|go build|npm run)\b/i.test(command)) return null;
  const lines = text.split(/\r?\n/);
  const important = lines.filter((line) => /\b(?:error|warning|failed|cannot find|not found|exception|traceback|ELIFECYCLE|ERR!)\b/i.test(line));
  if (important.length === 0 || lines.length < 40) return null;
  return [`[RTK build summary: ${important.length} important lines from ${lines.length}]`, ...important.slice(0, 120)].join("\n");
}

export function compactGitOutput(text, command = "") {
  if (!/^\s*git\s+(?:status|log|diff)\b/.test(command)) return null;
  const lines = text.split(/\r?\n/);
  if (/^\s*git\s+status\b/.test(command)) {
    const changes = lines.filter((line) => /^\s*(?:modified:|new file:|deleted:|renamed:|both modified:|\?\?|[ MADRCU?!]{2}\s+)/.test(line));
    if (changes.length === 0 || lines.length < 25) return null;
    return [`[RTK git status summary: ${changes.length} changed paths]`, ...changes.slice(0, 150)].join("\n");
  }
  if (/^\s*git\s+log\b/.test(command)) {
    const commits = lines.filter((line) => /^(?:commit\s+[0-9a-f]{7,40}|[0-9a-f]{7,40}\s+)/i.test(line) || /^\s{4}\S/.test(line));
    if (commits.length === 0 || lines.length < 40) return null;
    return [`[RTK git log summary: ${commits.length} commit/title lines]`, ...commits.slice(0, 120)].join("\n");
  }
  const important = lines.filter((line) => /^(?:diff --git|@@|[+-](?![+-]{2,3}\b))/.test(line));
  if (important.length === 0 || lines.length < 80) return null;
  return [`[RTK git diff summary: ${important.length} diff lines from ${lines.length}]`, ...important.slice(0, 220)].join("\n");
}

export function compactSearchOutput(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 40) return null;
  const groups = new Map();
  for (const line of lines) {
    const match = line.match(/^([^:\n]+):(\d+)(?::|\s)(.*)$/);
    if (!match) return null;
    const file = match[1];
    const entry = `${match[2]}:${match[3]}`;
    const list = groups.get(file) ?? [];
    if (list.length < 5) list.push(entry);
    groups.set(file, list);
  }
  return [
    `[RTK search summary: ${lines.length} matches in ${groups.size} files]`,
    ...[...groups.entries()].slice(0, 80).flatMap(([file, entries]) => [`${file}:`, ...entries.map((entry) => `  ${entry}`)]),
  ].join("\n");
}

export function stripRtkNoise(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^\[rtk\]\s/i.test(line))
    .join("\n");
}

export function compactToolText({ toolName, text, input = {} }, config = readRtkConfig()) {
  let next = String(text ?? "");
  const techniques = [];
  const command = typeof input.command === "string" ? input.command : "";

  if (config.stripAnsi) {
    const stripped = stripAnsi(next);
    if (stripped !== next) {
      next = stripped;
      techniques.push("ansi");
    }
  }

  const withoutRtkNoise = stripRtkNoise(next);
  if (withoutRtkNoise !== next) {
    next = withoutRtkNoise.trimEnd();
    techniques.push("rtk-noise");
  }

  if (toolName === "bash") {
    for (const [name, fn] of [["git", compactGitOutput], ["test", compactTestOutput], ["build", compactBuildOutput]]) {
      const compacted = fn(next, command);
      if (compacted && compacted !== next) {
        next = compacted;
        techniques.push(name);
        break;
      }
    }
  } else if (toolName === "grep") {
    const compacted = compactSearchOutput(next);
    if (compacted && compacted !== next) {
      next = compacted;
      techniques.push("search");
    }
  } else if (toolName === "read") {
    const lineCount = next.split(/\r?\n/).length;
    const ranged = input.offset !== undefined || input.limit !== undefined;
    if (!config.compactRead || ranged || lineCount <= config.readExactLineLimit) {
      return { text: next, techniques };
    }
  }

  if (next.length > config.maxOutputChars) {
    next = truncateText(next, config.maxOutputChars);
    techniques.push("truncate");
  }

  return { text: next, techniques };
}

export function compactToolContent({ toolName, input, content }, config = readRtkConfig()) {
  if (!config.compactOutput || !Array.isArray(content)) return { changed: false, content, metadata: null };
  let changed = false;
  const techniques = new Set();
  let originalChars = 0;
  let compactedChars = 0;
  const nextContent = content.map((block) => {
    if (!block || typeof block !== "object" || block.type !== "text" || typeof block.text !== "string") return block;
    originalChars += block.text.length;
    const compacted = compactToolText({ toolName, text: block.text, input }, config);
    compactedChars += compacted.text.length;
    for (const technique of compacted.techniques) techniques.add(technique);
    if (compacted.text === block.text) return block;
    changed = true;
    return { ...block, text: compacted.text };
  });
  return {
    changed,
    content: nextContent,
    metadata: changed ? {
      applied: true,
      techniques: [...techniques],
      originalCharCount: originalChars,
      compactedCharCount: compactedChars,
      savedCharCount: Math.max(0, originalChars - compactedChars),
    } : null,
  };
}

export function createRtkRuntime() {
  return {
    status: null,
    checkedAt: 0,
    rewriteNotices: new Set(),
    stats: { rewrites: 0, suggestions: 0, compactions: 0, savedChars: 0, byTool: {} },
  };
}

async function execRtk(pi, args, options = {}) {
  const env = { ...process.env, PATH: pathWithLocalBin(process.env), ...(options.env ?? {}) };
  return pi.exec(options.rtkCommand ?? "rtk", args, { timeout: REWRITE_TIMEOUT_MS, ...options, env });
}

async function findUsableRtk(pi, runtime, { force = false } = {}) {
  const now = Date.now();
  if (!force && runtime.status && now - runtime.checkedAt < STATUS_TTL_MS) return runtime.status.ok ? runtime.status : null;

  for (const candidate of rtkCommandCandidates()) {
    const version = await execRtk(pi, ["--version"], { rtkCommand: candidate }).catch(() => ({ code: 1, stdout: "" }));
    if (version.code !== 0) continue;
    const status = { ok: true, reason: "rtk-ai/rtk available", version: String(version.stdout ?? "").trim(), command: candidate };
    runtime.status = status;
    runtime.checkedAt = now;
    return status;
  }

  runtime.status = { ok: false, reason: "rtk binary not found; /rtk install shows the manual install command", version: "", command: "" };
  runtime.checkedAt = now;
  return null;
}

async function checkRtk(pi, runtime = createRtkRuntime(), { force = true } = {}) {
  const found = await findUsableRtk(pi, runtime, { force });
  if (!found) return runtime.status;

  if (!isSupportedRtkVersion(found.version)) {
    return { ok: false, reason: `rtk is too old; need >= ${MIN_SUPPORTED_RTK.join(".")}`, version: found.version, command: found.command };
  }

  const gain = await execRtk(pi, ["gain"], { rtkCommand: found.command });
  if (gain.code !== 0) {
    return { ok: false, reason: "rtk exists but does not look like rtk-ai/rtk; `rtk gain` failed", version: found.version, command: found.command };
  }

  return { ok: true, reason: "rtk-ai/rtk available", version: found.version, command: found.command };
}

async function rewriteCommand(pi, command, signal, runtime) {
  const found = await findUsableRtk(pi, runtime);
  if (!found) return null;
  const result = await execRtk(pi, ["rewrite", command], { signal, rtkCommand: found.command });
  return normalizeRewriteResult(result, command);
}

function report(ctx, message, level = "info") {
  if (ctx?.hasUI) ctx.ui.notify(message, level);
  console.log(message);
}

function formatStatus(status, config = readRtkConfig()) {
  const mode = config.mode === "suggest" ? "suggestion-only" : "auto-rewrite";
  if (status.ok) return `RTK active (${mode}; ${status.version}, ${status.command}). Output compaction: ${config.compactOutput ? "on" : "off"}. Set RTK_DISABLED=1 to bypass.`;
  return `RTK not active: ${status.reason}. Review and run manually: ${RTK_INSTALL_COMMAND}`;
}

function formatStats(stats) {
  const byTool = Object.entries(stats.byTool).map(([tool, value]) => `${tool}: ${value.compactions} compactions, ${value.savedChars} chars saved`);
  return [
    `RTK session stats: ${stats.rewrites} rewrites, ${stats.suggestions} suggestions, ${stats.compactions} compactions, ${stats.savedChars} chars saved`,
    ...byTool,
  ].join("\n");
}

function recordCompaction(runtime, toolName, metadata) {
  runtime.stats.compactions += 1;
  runtime.stats.savedChars += metadata.savedCharCount;
  const current = runtime.stats.byTool[toolName] ?? { compactions: 0, savedChars: 0 };
  current.compactions += 1;
  current.savedChars += metadata.savedCharCount;
  runtime.stats.byTool[toolName] = current;
}

async function handleRtkCommand(pi, args, ctx, runtime) {
  const parsed = parseRtkCommandArgs(args);
  const config = readRtkConfig();

  if (parsed.action === "help") {
    report(ctx, [
      "RTK Pi integration commands:",
      "/rtk status|show|verify — check rtk availability and active mode",
      "/rtk stats — show rewrite/output compaction savings for this session",
      "/rtk clear-stats — reset session savings counters",
      "/rtk install — show the manual rtk-ai/rtk install command; remote installers are not executed",
      "Environment: RTK_MODE=suggest, RTK_COMPACT=0, RTK_COMPACT_READ=1, RTK_MAX_OUTPUT_CHARS=12000, RTK_DISABLED=1.",
    ].join("\n"));
    return;
  }

  if (parsed.action === "install") {
    const before = await checkRtk(pi, runtime).catch((error) => ({ ok: false, reason: error.message, version: "" }));
    report(
      ctx,
      before.ok ? formatStatus(before, config) : `Manual RTK install required (${before.reason}). Review and run manually: ${RTK_INSTALL_COMMAND}`,
      before.ok ? "info" : "warning",
    );
    return;
  }

  if (parsed.action === "stats") {
    report(ctx, formatStats(runtime.stats));
    return;
  }

  if (parsed.action === "clear-stats") {
    runtime.stats = { rewrites: 0, suggestions: 0, compactions: 0, savedChars: 0, byTool: {} };
    report(ctx, "RTK session stats cleared.");
    return;
  }

  const status = await checkRtk(pi, runtime).catch((error) => ({ ok: false, reason: error.message, version: "" }));
  report(ctx, formatStatus(status, config), status.ok ? "info" : "warning");
}

export default function registerRtkExtension(pi) {
  const runtime = createRtkRuntime();

  pi.registerCommand("rtk", {
    description: "Check rtk-ai/rtk, control rewrite mode, and report output compaction savings",
    handler: async (args, ctx) => handleRtkCommand(pi, args, ctx, runtime),
  });

  pi.on("session_start", async () => {
    runtime.rewriteNotices.clear();
    runtime.stats = { rewrites: 0, suggestions: 0, compactions: 0, savedChars: 0, byTool: {} };
    await findUsableRtk(pi, runtime, { force: true }).catch(() => null);
  });

  pi.on("tool_call", async (event, ctx) => {
    try {
      if (event.toolName !== "bash") return;
      const command = event.input?.command;
      const config = readRtkConfig();
      if (typeof command !== "string" || shouldSkipRewrite(command, process.env, config)) return;

      const rewritten = await rewriteCommand(pi, command, ctx.signal, runtime);
      if (!rewritten) return;

      if (config.mode === "suggest") {
        runtime.stats.suggestions += 1;
        const key = `${command}\n${rewritten}`;
        if (config.showNotifications && ctx.hasUI && !runtime.rewriteNotices.has(key)) {
          runtime.rewriteNotices.add(key);
          ctx.ui.notify(`RTK suggestion: ${rewritten}`, "info");
        }
        return;
      }

      event.input.command = rewritten;
      runtime.stats.rewrites += 1;
      if (config.showNotifications && ctx.hasUI) ctx.ui.notify(`RTK rewrite: ${command} -> ${rewritten}`, "info");
    } catch (error) {
      console.warn("[rtk] rewrite failed; passing through original command", error);
    }
  });

  pi.on("tool_result", async (event) => {
    const config = readRtkConfig();
    if (!config.enabled || !config.compactOutput) return;
    const outcome = compactToolContent({ toolName: event.toolName, input: event.input, content: event.content }, config);
    if (!outcome.changed) return;
    recordCompaction(runtime, event.toolName, outcome.metadata);
    const details = event.details && typeof event.details === "object" && !Array.isArray(event.details) ? event.details : {};
    return {
      content: outcome.content,
      details: { ...details, rtkCompaction: outcome.metadata, metadata: { ...(details.metadata ?? {}), rtkCompaction: outcome.metadata } },
    };
  });
}
