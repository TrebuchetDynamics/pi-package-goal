import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
    "",
    skillContent.trimEnd(),
    "</skill>",
    userArgs ? `\nUser: ${invocation}` : `\nUser: ${invocation}`,
  ].join("\n").trimEnd();
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isInstalled(paths = getGraphifyPaths()) {
  return pathExists(paths.skillPath);
}

function commandOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

async function runGit(pi, args, ctx, timeout = 600_000) {
  const result = await pi.exec("git", args, { signal: ctx.signal, timeout });
  if (result.code !== 0) {
    const output = commandOutput(result);
    throw new Error(output || `git ${args.join(" ")} failed with exit code ${result.code}`);
  }
  return result;
}

async function cloneGraphify(pi, ctx, paths) {
  await mkdir(dirname(paths.repoDir), { recursive: true });
  await runGit(pi, ["clone", "--depth", "1", paths.repoUrl, paths.repoDir], ctx);
}

async function updateGraphify(pi, ctx, paths) {
  if (!(await isInstalled(paths))) {
    await cloneGraphify(pi, ctx, paths);
    return "installed";
  }
  await runGit(pi, ["-C", paths.repoDir, "pull", "--ff-only"], ctx);
  return "updated";
}

async function ensureInstalled(pi, ctx, paths = getGraphifyPaths(), { prompt = true } = {}) {
  if (await isInstalled(paths)) return;

  if (prompt) {
    if (!ctx.hasUI) {
      throw new Error(`Graphify is not installed. Run /graphify install first, or clone ${paths.repoUrl} to ${paths.repoDir}.`);
    }
    const ok = await ctx.ui.confirm(
      "Install Graphify Pi skill?",
      `Clone ${paths.repoUrl} to ${paths.repoDir} so /graphify can load upstream graphify/skill-pi.md?`,
    );
    if (!ok) throw new Error("Graphify install cancelled.");
  }

  await cloneGraphify(pi, ctx, paths);
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

  await ensureInstalled(pi, ctx, paths);
  const skillContent = await readFile(paths.skillPath, "utf8");
  const message = buildSkillInvocation({ commandName, skillPath: paths.skillPath, skillContent, args });
  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
  } else {
    pi.sendUserMessage(message, { deliverAs: "followUp" });
  }
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
    `  /graphify install            Clone upstream Graphify skill\n` +
    `  /graphify update             git pull --ff-only upstream checkout\n\n` +
    `Upstream: ${paths.repoUrl}\n` +
    `Checkout: ${paths.repoDir}\n` +
    `Skill: ${paths.skillPath}\n\n` +
    `The upstream skill installs/uses the Python CLI package graphifyy when /graphify runs.`;
}

async function statusText(pi, ctx, paths) {
  if (!(await isInstalled(paths))) {
    return `Graphify is not installed. Run /graphify install to clone ${paths.repoUrl} to ${paths.repoDir}.`;
  }
  const result = await runGit(pi, ["-C", paths.repoDir, "rev-parse", "--short", "HEAD"], ctx, 30_000);
  return `Graphify installed at ${paths.repoDir}\nHEAD: ${result.stdout.trim()}\nPi skill: ${paths.skillPath}`;
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
    const action = await updateGraphify(pi, ctx, paths);
    const message = `Graphify ${action} at ${paths.repoDir}. Use /graphify . to build a graph.`;
    await postMessage(pi, message, { action: parsed.action, result: action, paths });
  }
}

export default function registerGraphifyExtension(pi) {
  const paths = getGraphifyPaths();

  pi.registerCommand(DEFAULT_COMMAND_NAME, {
    description: "Load upstream Graphify Pi skill to build/query a project knowledge graph",
    handler: async (args, ctx) => sendGraphifySkillInvocation(pi, ctx, paths, DEFAULT_COMMAND_NAME, args),
  });
}
