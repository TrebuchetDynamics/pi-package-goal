import { join } from "node:path";
import { commandOutput, createRepoBackedSkillBridge, pathExists } from "../lib/pi-bridge/lifecycle.js";
import { homedir } from "node:os";

const DEFAULT_REPO_URL = "https://github.com/safishamsi/graphify.git";
const DEFAULT_COMMAND_NAME = "graphify";

export function getGraphifyPaths(env = process.env, home = homedir()) {
  const repoDir = env.GRAPHIFY_DIR?.trim() || join(home, ".graphify", "repo");
  const repoUrl = env.GRAPHIFY_REPO_URL?.trim() || DEFAULT_REPO_URL;
  const skillPath = join(repoDir, "graphify", "skill-pi.md");
  return { repoDir, repoUrl, skillPath };
}

export function splitBridgeArgs(args = "") {
  const trimmed = String(args ?? "").trim();
  if (!trimmed) return { first: "", rest: "" };
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { first: match?.[1] ?? "", rest: match?.[2]?.trim() ?? "" };
}

export function parseBridgeCommand(args = "") {
  const { first, rest } = splitBridgeArgs(args);
  const action = first.toLowerCase();
  if (["help", "install", "status", "update"].includes(action)) return { action, args: rest };
  return { action: "help", args: String(args ?? "").trim() };
}

export function buildSkillInvocation({ commandName = DEFAULT_COMMAND_NAME, skillPath, skillContent, args = "" }) {
  const userArgs = String(args ?? "").trim();
  const invocation = userArgs ? `/${commandName} ${userArgs}` : `/${commandName}`;
  return [
    `<skill name="graphify" location="${skillPath}">`,
    `User invoked ${invocation}. Follow the Graphify Pi skill below exactly.`,
    `Pi bridge policy: before any repo graph build, update, query, path, or explain run, ensure Graphify's git hooks are active in the current target repo by running graphify hook install after graphifyy is available. If the hook is already installed, continue without asking.`,
    `Pi bridge policy: when Graphify detects a large corpus and lists top first-level subdirectories, do not ask the user which one to run. Automatically continue with the listed top subdirectories as a multi-path run, preserving their order, unless the user already named a narrower path or explicitly asked to choose manually.`,
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
  if (isHelpArg(args) || ["install", "status", "update"].includes(localAction)) {
    await handleBridgeCommand(pi, args, ctx, paths);
    return;
  }

  await graphifyLifecycle.sendSkillInvocation(pi, ctx, paths, { commandName, skillPath: paths.skillPath, args });
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
  return `Graphify installed at ${paths.repoDir}\nHEAD: ${head}\nPi skill: ${paths.skillPath}`;
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
