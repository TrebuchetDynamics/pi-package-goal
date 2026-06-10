import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { commandOutput, createRepoBackedSkillBridge, pathExists } from "../../lib/pi-bridge/lifecycle.js";
import { parseActionCommand, splitCommandArgs, splitFirstArg as splitBridgeArgs } from "../../lib/pi-bridge/command-grammar.js";
import { homedir } from "node:os";

const DEFAULT_REPO_URL = "https://github.com/safishamsi/graphify.git";
const DEFAULT_COMMAND_NAME = "graphify";

export function getGraphifyPaths(env = process.env, home = homedir()) {
  const repoDir = env.GRAPHIFY_DIR?.trim() || join(home, ".graphify", "repo");
  const repoUrl = env.GRAPHIFY_REPO_URL?.trim() || DEFAULT_REPO_URL;
  const repoRef = env.GRAPHIFY_REF?.trim() || "";
  const skillPath = join(repoDir, "graphify", "skill-pi.md");
  return { repoDir, repoUrl, repoRef, skillPath };
}

export { splitFirstArg as splitBridgeArgs } from "../../lib/pi-bridge/command-grammar.js";

export function parseBridgeCommand(args = "") {
  return parseActionCommand(args, ["help", "ignore", "install", "status", "update"]);
}

export function buildSkillInvocation({ commandName = DEFAULT_COMMAND_NAME, skillPath, skillContent, args = "" }) {
  const userArgs = String(args ?? "").trim();
  const invocation = userArgs ? `/${commandName} ${userArgs}` : `/${commandName}`;
  return [
    `<skill name="graphify" location="${skillPath}">`,
    `User invoked ${invocation}. Follow the Graphify Pi skill below exactly.`,
    `Pi bridge policy: default graph builds and updates in Pi are pure AST/local/no-LLM. For bare path invocations such as /graphify ., /graphify src, or /graphify . --update, run Graphify's no-LLM code path (graphify update <path>, using --force when needed) and do not run semantic extraction, do not dispatch subagents, and do not ask for or suggest API keys. Only use semantic/LLM extraction when the user explicitly asks for semantic, docs, PDFs, images, video, deep mode, or an LLM/backend.`,
    `Pi bridge policy: default graph builds and updates must not mutate the target repo's git hooks. Existing-graph read commands (query, path, explain) may use direct CLI fast paths. Install hooks only for /graphify install or when the user explicitly passes --install-hooks.`,
    `Pi bridge policy: when Graphify detects a large corpus and lists top first-level subdirectories, do not ask the user which one to run. Automatically continue with the listed top subdirectories as a multi-path run, preserving their order, unless the user already named a narrower path or explicitly asked to choose manually.`,
    `Pi bridge policy: if pure AST mode omits markdown or other prose files, report that as an intentional no-LLM tradeoff rather than a failure.`,
    "",
    skillContent.trimEnd(),
    "</skill>",
    userArgs ? `\nUser: ${invocation}` : `\nUser: ${invocation}`,
  ].join("\n").trimEnd();
}

async function isInstalled(paths = getGraphifyPaths()) {
  return pathExists(paths.skillPath);
}

const graphifyLifecycle = createRepoBackedSkillBridge({
  bridgeName: "Graphify",
  isInstalled,
  installPromptTitle: "Install Graphify Pi skill?",
  installPromptMessage: (paths) => `Clone ${paths.repoUrl} to ${paths.repoDir} so /graphify can load upstream graphify/skill-pi.md?`,
  installCancelledMessage: "Graphify install cancelled.",
  notInstalledMessage: (paths) => `Graphify is not installed. Run /graphify install first, or clone ${paths.repoUrl} to ${paths.repoDir}.`,
  buildInvocation: ({ commandName, skillPath, skillContent, args }) => buildSkillInvocation({ commandName, skillPath, skillContent, args }),
});

export function formatGraphifyInstallMessage(action, paths, hookOutput = "") {
  const hookText = String(hookOutput ?? "").trim();
  const suffix = hookText ? `\nHook install: ${hookText}` : "\nHook install: completed";
  return `Graphify ${action} at ${paths.repoDir}.${suffix}\nUse /graphify . to build a graph.`;
}

export function graphifyIgnoreTemplate(mode = "default") {
  const normalized = String(mode ?? "").trim().toLowerCase();
  if (["src", "src-only", "source", "source-only"].includes(normalized)) {
    return [
      "# .graphifyignore uses .gitignore syntax, including ! negation.",
      "# Only index src/; ignore everything else.",
      "*",
      "!src/",
      "!src/**",
      "",
    ].join("\n");
  }

  return [
    "# .graphifyignore uses .gitignore syntax, including ! negation.",
    "# If this file exists, it takes priority over .gitignore for this subtree.",
    "node_modules/",
    "dist/",
    "*.generated.py",
    "",
    "# To index only src/, uncomment these lines:",
    "# *",
    "# !src/",
    "# !src/**",
    "",
  ].join("\n");
}

export function formatGraphifyIgnoreMessage(filePath, action, mode = "default") {
  const modeText = ["src", "src-only", "source", "source-only"].includes(String(mode ?? "").trim().toLowerCase())
    ? "src-only template"
    : "default template";
  if (action === "exists") {
    return `.graphifyignore already exists at ${filePath}; leaving it unchanged.`;
  }
  return `Created ${filePath} with Graphify ignore ${modeText}. Edit it like .gitignore, including ! negation.`;
}

export function shouldSkipAutomaticGraphifyUpdate(args = "") {
  const trimmed = String(args ?? "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (/(^|\s)--update(\s|$)/.test(lower)) return true;
  if (/(^|\s)--cluster-only(\s|$)/.test(lower)) return true;
  const { first } = splitBridgeArgs(trimmed);
  return ["add", "explain", "path", "query"].includes(first.toLowerCase());
}

export function getAutomaticUpdateTarget(args = "", cwd = process.cwd()) {
  if (shouldSkipAutomaticGraphifyUpdate(args)) return undefined;
  const { first } = splitBridgeArgs(args);
  if (!first || first.startsWith("-")) return cwd;
  if (/^https?:\/\//i.test(first)) return undefined;
  return resolve(cwd, first);
}

export function appendGraphifyUpdateArg(args = "") {
  const trimmed = String(args ?? "").trim();
  return trimmed ? `${trimmed} --update` : ". --update";
}

export async function applyAutomaticGraphifyUpdate(args = "", cwd = process.cwd(), exists = pathExists) {
  const target = getAutomaticUpdateTarget(args, cwd);
  if (!target) return { args: String(args ?? "").trim(), changed: false, target };

  const repoGraphPath = join(cwd, "graphify-out", "graph.json");
  const targetGraphPath = join(target, "graphify-out", "graph.json");
  const hasExistingGraph = await exists(repoGraphPath) || (targetGraphPath !== repoGraphPath && await exists(targetGraphPath));

  if (!hasExistingGraph) return { args: String(args ?? "").trim(), changed: false, target };
  return { args: appendGraphifyUpdateArg(args), changed: true, target };
}

export function parseGraphifyCliArgs(args = "") {
  return splitCommandArgs(args);
}

export function isGraphifyCliFastPath(args = "") {
  const { first } = splitBridgeArgs(args);
  return ["explain", "path", "query"].includes(first.toLowerCase());
}

export function isExplicitSemanticGraphifyArgs(args = "") {
  let tokens;
  try {
    tokens = parseGraphifyCliArgs(args);
  } catch {
    return true;
  }
  const lowered = tokens.map((token) => token.toLowerCase());
  return lowered.some((token, index) =>
    token === "semantic" ||
    token === "docs" ||
    token === "pdf" ||
    token === "pdfs" ||
    token === "image" ||
    token === "images" ||
    token === "video" ||
    token === "videos" ||
    token === "--wiki" ||
    token === "--obsidian" ||
    token === "--backend" ||
    token.startsWith("--backend=") ||
    token === "--model" ||
    token.startsWith("--model=") ||
    token === "--whisper-model" ||
    token.startsWith("--whisper-model=") ||
    token === "--mode=deep" ||
    (token === "--mode" && lowered[index + 1] === "deep")
  );
}

export function isGraphifyAstOnlyBuildArgs(args = "") {
  if (isExplicitSemanticGraphifyArgs(args)) return false;
  let tokens;
  try {
    tokens = parseGraphifyCliArgs(args);
  } catch {
    return false;
  }
  const first = tokens[0] ?? "";
  if (["add", "explain", "path", "query"].includes(first.toLowerCase())) return false;
  if (/^https?:\/\//i.test(first)) return false;
  const allowedFlags = new Set(["--update", "--force", "--no-cluster", "--no-viz", "--install-hooks"]);
  return tokens.every((token, index) => {
    if (index === 0 && token && !token.startsWith("-")) return true;
    return allowedFlags.has(token);
  });
}

export function shouldInstallGraphifyHooks(args = "") {
  return parseGraphifyCliArgs(args).includes("--install-hooks");
}

export function buildGraphifyAstOnlyUpdateArgs(args = "") {
  const tokens = parseGraphifyCliArgs(args);
  const target = tokens.find((token) => !token.startsWith("-")) ?? ".";
  const updateArgs = ["GRAPHIFY_NO_TIPS=1", "graphify", "update", target, "--force"];
  if (tokens.includes("--no-cluster")) updateArgs.push("--no-cluster");
  if (tokens.includes("--no-viz")) updateArgs.push("--no-viz");
  return updateArgs;
}

export async function runGraphifyAstOnlyBuild(pi, ctx, args = "") {
  if (shouldInstallGraphifyHooks(args)) await installGraphifyHook(pi, ctx);
  const cliArgs = buildGraphifyAstOnlyUpdateArgs(args);
  const result = await pi.exec("env", cliArgs, { signal: ctx.signal, timeout: 300_000 });
  const output = commandOutput(result);
  if (result.code !== 0 || result.killed) {
    throw new Error(output || `env ${cliArgs.join(" ")} failed`);
  }
  await postMessage(pi, output || "Graphify AST-only update completed with no output.", {
    action: "update",
    mode: "ast-only",
    args: cliArgs.slice(3),
    exitCode: result.code,
  });
}

export async function runGraphifyCliFastPath(pi, ctx, args = "") {
  const cliArgs = parseGraphifyCliArgs(args);
  const result = await pi.exec("graphify", cliArgs, { signal: ctx.signal, timeout: 120_000 });
  const output = commandOutput(result);
  if (result.code !== 0 || result.killed) {
    throw new Error(output || `graphify ${cliArgs.join(" ")} failed`);
  }
  await postMessage(pi, output || "Graphify command completed with no output.", {
    action: cliArgs[0],
    args: cliArgs.slice(1),
    exitCode: result.code,
  });
}

export async function createGraphifyIgnore(ctx, args = "") {
  const mode = String(args ?? "").trim() || "default";
  const filePath = join(ctx.cwd, ".graphifyignore");
  try {
    await readFile(filePath, "utf8");
    return { filePath, action: "exists", mode };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await writeFile(filePath, graphifyIgnoreTemplate(mode), "utf8");
  return { filePath, action: "created", mode };
}

async function installGraphifyHook(pi, ctx) {
  const result = await pi.exec("graphify", ["hook", "install"], { signal: ctx.signal, timeout: 120_000 });
  if (result.code !== 0 || result.killed) {
    const output = commandOutput(result);
    throw new Error(output || "graphify hook install failed");
  }
  return commandOutput(result);
}

export function isHelpArg(args = "") {
  const trimmed = String(args ?? "").trim().toLowerCase();
  return trimmed === "help" || trimmed === "--help" || trimmed === "-h";
}

async function sendGraphifySkillInvocation(pi, ctx, paths, commandName, args) {
  const { first } = splitBridgeArgs(args);
  const localAction = first.toLowerCase();
  if (isHelpArg(args) || ["ignore", "install", "status", "update"].includes(localAction)) {
    await handleBridgeCommand(pi, args, ctx, paths);
    return;
  }

  if (isGraphifyCliFastPath(args)) {
    await runGraphifyCliFastPath(pi, ctx, args);
    return;
  }

  const automaticUpdate = await applyAutomaticGraphifyUpdate(args, ctx.cwd);
  if (isGraphifyAstOnlyBuildArgs(automaticUpdate.args)) {
    await runGraphifyAstOnlyBuild(pi, ctx, automaticUpdate.args);
    return;
  }

  await graphifyLifecycle.sendSkillInvocation(pi, ctx, paths, { commandName, skillPath: paths.skillPath, args: automaticUpdate.args });
}

async function postMessage(pi, content, details = {}) {
  pi.sendMessage({ customType: "graphify", content, display: true, details });
}

function helpText(paths = getGraphifyPaths()) {
  return `Graphify bridge\n\n` +
    `Slash command:\n` +
    `  /graphify [args]             Load upstream Graphify Pi skill and run it\n` +
    `  /graphify help               Show this help without cloning upstream\n` +
    `  /graphify status             Show checkout status\n` +
    `  /graphify ignore [src-only]  Create .graphifyignore in the current project\n` +
    `  /graphify install            Clone upstream Graphify skill and install repo hooks\n` +
    `  /graphify update             git pull --ff-only upstream checkout and install repo hooks\n\n` +
    `Upstream: ${paths.repoUrl}\n` +
    `Checkout: ${paths.repoDir}\n` +
    `Skill: ${paths.skillPath}\n\n` +
    `The upstream skill installs/uses the Python CLI package graphifyy when /graphify runs.`;
}

async function statusText(pi, ctx, paths) {
  if (!(await isInstalled(paths))) {
    return `Graphify is not installed. Run /graphify install to clone ${paths.repoUrl} to ${paths.repoDir}.`;
  }
  const head = await graphifyLifecycle.checkoutHead(pi, ctx, paths);
  const ref = paths.repoRef ? `\nPinned ref: ${paths.repoRef}` : "";
  return `Graphify installed at ${paths.repoDir}\nHEAD: ${head}${ref}\nPi skill: ${paths.skillPath}`;
}

async function handleBridgeCommand(pi, args, ctx, paths) {
  const parsed = parseBridgeCommand(args);

  if (parsed.action === "help") {
    await postMessage(pi, helpText(paths), { action: "help", paths });
    return;
  }

  if (parsed.action === "status") {
    const message = await statusText(pi, ctx, paths);
    await postMessage(pi, message, { action: "status", paths });
    return;
  }

  if (parsed.action === "ignore") {
    const result = await createGraphifyIgnore(ctx, parsed.args);
    const message = formatGraphifyIgnoreMessage(result.filePath, result.action, result.mode);
    await postMessage(pi, message, { action: "ignore", ...result });
    return;
  }

  if (parsed.action === "install" || parsed.action === "update") {
    const action = await graphifyLifecycle.update(pi, ctx, paths);
    const hookOutput = await installGraphifyHook(pi, ctx);
    const message = formatGraphifyInstallMessage(action, paths, hookOutput);
    await postMessage(pi, message, { action: parsed.action, result: action, hookOutput, paths });
  }
}

export default function registerGraphifyExtension(pi) {
  const paths = getGraphifyPaths();

  pi.registerCommand(DEFAULT_COMMAND_NAME, {
    description: "Load upstream Graphify Pi skill to build/query a project knowledge graph",
    handler: async (args, ctx) => sendGraphifySkillInvocation(pi, ctx, paths, DEFAULT_COMMAND_NAME, args),
  });
}
