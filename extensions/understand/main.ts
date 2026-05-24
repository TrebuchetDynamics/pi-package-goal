import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

type UnderstandCommand = "run" | "install" | "update" | "status" | "help";

type ParsedCommand = {
  command: UnderstandCommand;
  argumentsText: string;
};

type UiLikeContext = {
  cwd?: string;
  ui?: { notify?: (message: string, level?: string) => void };
  sessionManager?: { getCwd?: () => string };
  isIdle?: () => boolean;
};

type ExecResult = {
  code?: number;
  stdout?: string;
  stderr?: string;
};

type UnderstandInstall = {
  repoUrl: string;
  repoDir: string;
  pluginRoot: string;
  skillsRoot: string;
  understandSkillPath: string;
  skillsTargetDir: string;
  pluginLink: string;
  cloned: boolean;
  updated: boolean;
  linkedSkills: string[];
  warnings: string[];
};

type UnderstandPaths = {
  repoUrl: string;
  repoDir: string;
  pluginRoot: string;
  skillsRoot: string;
  understandSkillPath: string;
  skillsTargetDir: string;
  pluginLink: string;
};

const COMMANDS = new Set<UnderstandCommand>(["run", "install", "update", "status", "help"]);
const DEFAULT_REPO_URL = "https://github.com/Lum1104/Understand-Anything.git";
const UNIVERSAL_PLUGIN_LINK = ".understand-anything-plugin";
const UNDERSTAND_SKILL_NAME = "understand";

export default function understandExtension(pi: ExtensionAPI) {
  const command = {
    description: "Install/update Understand-Anything and run its /understand skill",
    getArgumentCompletions: (prefix: string) => ["install", "update", "status", "help"]
      .filter((value) => value.startsWith(prefix))
      .map((value) => ({ value, label: value })),
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };
  pi.registerCommand("understand", command);
}

async function runCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) {
  const parsed = parseArgs(args);
  switch (parsed.command) {
    case "help":
      publish(pi, ctx, helpText());
      return;
    case "status":
      publish(pi, ctx, formatStatus(resolveUnderstandPaths()));
      return;
    case "install":
    case "update": {
      const install = await ensureUnderstandAnything(pi);
      publish(pi, ctx, formatInstallResult(install, false));
      return;
    }
    case "run":
    default: {
      const install = await ensureUnderstandAnything(pi);
      const queued = queueUnderstandRun(pi, ctx, install, parsed.argumentsText);
      publish(pi, ctx, `${formatInstallResult(install, false)}\n${queued ? "Queued Understand-Anything run." : "Install complete, but this Pi runtime cannot queue an agent run."}`);
      return;
    }
  }
}

async function ensureUnderstandAnything(pi: ExtensionAPI, paths = resolveUnderstandPaths()): Promise<UnderstandInstall> {
  const warnings: string[] = [];
  let cloned = false;
  let updated = false;

  if (fs.existsSync(path.join(paths.repoDir, ".git"))) {
    await requireSuccessfulGit(pi, ["-C", paths.repoDir, "pull", "--ff-only"], `update ${paths.repoDir}`);
    updated = true;
  } else {
    fs.mkdirSync(path.dirname(paths.repoDir), { recursive: true });
    await requireSuccessfulGit(pi, ["clone", paths.repoUrl, paths.repoDir], `clone ${paths.repoUrl}`);
    cloned = true;
  }

  if (!fs.existsSync(paths.understandSkillPath)) {
    throw new Error(`Understand-Anything skill not found after install: ${paths.understandSkillPath}`);
  }

  ensureSymlink(paths.pluginRoot, paths.pluginLink, warnings);
  const linkedSkills = linkSkills(paths.skillsRoot, paths.skillsTargetDir, warnings);

  return { ...paths, cloned, updated, linkedSkills, warnings };
}

function resolveUnderstandPaths(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): UnderstandPaths {
  const repoUrl = env.UA_REPO_URL || DEFAULT_REPO_URL;
  const repoDir = path.resolve(env.UA_DIR || path.join(home, ".understand-anything", "repo"));
  const pluginRoot = path.join(repoDir, "understand-anything-plugin");
  const skillsRoot = path.join(pluginRoot, "skills");
  return {
    repoUrl,
    repoDir,
    pluginRoot,
    skillsRoot,
    understandSkillPath: path.join(skillsRoot, UNDERSTAND_SKILL_NAME, "SKILL.md"),
    skillsTargetDir: path.resolve(env.UA_SKILLS_DIR || path.join(home, ".agents", "skills")),
    pluginLink: path.resolve(env.UA_PLUGIN_LINK || path.join(home, UNIVERSAL_PLUGIN_LINK)),
  };
}

async function requireSuccessfulGit(pi: ExtensionAPI, args: string[], label: string) {
  const result = await runProcess(pi, "git", args);
  if ((result.code ?? 1) !== 0) {
    const stderr = (result.stderr || result.stdout || "unknown git error").trim().split(/\r?\n/)[0];
    throw new Error(`Understand-Anything ${label} failed: ${stderr}`);
  }
}

async function runProcess(pi: ExtensionAPI, command: string, args: string[]): Promise<ExecResult> {
  if (typeof pi.exec === "function") return await pi.exec(command, args);
  return await new Promise((resolve) => {
    childProcess.execFile(command, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const rawCode = (error as { code?: unknown } | null)?.code;
      const code = typeof rawCode === "number" ? rawCode : error ? 1 : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

function ensureSymlink(target: string, linkPath: string, warnings: string[]) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const existing = safeLstat(linkPath);
  if (existing) {
    if (!existing.isSymbolicLink()) {
      warnings.push(`left existing non-symlink in place: ${linkPath}`);
      return;
    }
    const current = fs.readlinkSync(linkPath);
    if (path.resolve(path.dirname(linkPath), current) === target) return;
    fs.rmSync(linkPath, { force: true });
  }
  fs.symlinkSync(target, linkPath, "dir");
}

function linkSkills(skillsRoot: string, targetDir: string, warnings: string[]): string[] {
  fs.mkdirSync(targetDir, { recursive: true });
  const linked: string[] = [];
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillSource = path.join(skillsRoot, entry.name);
    if (!fs.existsSync(path.join(skillSource, "SKILL.md"))) continue;
    const skillLink = path.join(targetDir, entry.name);
    const existing = safeLstat(skillLink);
    if (existing) {
      if (!existing.isSymbolicLink()) {
        warnings.push(`left existing non-symlink skill in place: ${skillLink}`);
        continue;
      }
      const current = fs.readlinkSync(skillLink);
      if (path.resolve(path.dirname(skillLink), current) === skillSource) {
        linked.push(entry.name);
        continue;
      }
      fs.rmSync(skillLink, { force: true });
    }
    fs.symlinkSync(skillSource, skillLink, "dir");
    linked.push(entry.name);
  }
  return linked.sort();
}

function queueUnderstandRun(pi: ExtensionAPI, ctx: UiLikeContext, install: UnderstandInstall, argumentsText: string): boolean {
  const sendUserMessage = (pi as { sendUserMessage?: (content: string, options?: { deliverAs?: "followUp" }) => void }).sendUserMessage;
  if (typeof sendUserMessage !== "function") return false;
  const prompt = buildUnderstandPrompt(install, argumentsText, contextCwd(ctx));
  const options = ctx.isIdle?.() === false ? { deliverAs: "followUp" as const } : undefined;
  sendUserMessage.call(pi, prompt, options);
  return true;
}

function buildUnderstandPrompt(install: UnderstandInstall, argumentsText: string, cwd: string): string {
  const args = argumentsText.trim() || ".";
  return [
    "Run Understand-Anything now.",
    "",
    `Project root: ${cwd}`,
    `Understand-Anything repo: ${install.repoDir}`,
    `Plugin root: ${install.pluginRoot}`,
    `Skill file to read completely: ${install.understandSkillPath}`,
    `Treat $ARGUMENTS for that skill as: ${args}`,
    "",
    "Instructions:",
    "- Read the installed SKILL.md file completely before acting.",
    "- Follow that skill's own preflight, build, graph generation, and dashboard instructions.",
    "- If required tools such as pnpm or Node are missing, report the exact missing prerequisite and stop.",
  ].join("\n");
}

function formatInstallResult(install: UnderstandInstall, includeStatus: boolean): string {
  const action = install.cloned ? "cloned" : install.updated ? "updated" : "installed";
  const lines = [
    `Understand-Anything ${action}.`,
    `repo: ${install.repoDir}`,
    `plugin: ${install.pluginRoot}`,
    `skill: ${install.understandSkillPath}`,
    `skills linked: ${install.linkedSkills.length ? install.linkedSkills.join(", ") : "none"}`,
  ];
  if (includeStatus) lines.push(...formatStatusLines(resolveUnderstandPaths()));
  if (install.warnings.length) lines.push(`warnings: ${install.warnings.join("; ")}`);
  return lines.join("\n");
}

function formatStatus(paths: UnderstandPaths): string {
  return ["Understand-Anything status:", ...formatStatusLines(paths)].join("\n");
}

function formatStatusLines(paths: UnderstandPaths): string[] {
  return [
    `repo: ${fs.existsSync(path.join(paths.repoDir, ".git")) ? paths.repoDir : "missing"}`,
    `plugin: ${fs.existsSync(path.join(paths.pluginRoot, "package.json")) ? paths.pluginRoot : "missing"}`,
    `understand skill: ${fs.existsSync(paths.understandSkillPath) ? paths.understandSkillPath : "missing"}`,
    `skills target: ${paths.skillsTargetDir}`,
  ];
}

function helpText(): string {
  return [
    "Understand commands:",
    "- /understand [args] — install/update Understand-Anything, then run its understand skill with args",
    "- /understand install — clone/update and link Understand-Anything skills without starting analysis",
    "- /understand update — same as install; uses git pull --ff-only when already installed",
    "- /understand status — show detected Understand-Anything checkout and skill paths",
    "- /understand help — show this help",
    "",
    "Install defaults: clone https://github.com/Lum1104/Understand-Anything.git to ~/.understand-anything/repo, link ~/.understand-anything-plugin, and link skills into ~/.agents/skills. Override with UA_REPO_URL, UA_DIR, UA_PLUGIN_LINK, or UA_SKILLS_DIR.",
  ].join("\n");
}

function parseArgs(raw: string | undefined): ParsedCommand {
  const trimmed = (raw || "").trim();
  if (!trimmed) return { command: "run", argumentsText: "" };
  const tokens = tokenizeArgs(trimmed);
  const first = tokens[0] as UnderstandCommand | undefined;
  if (first === "help" || first === undefined || first === "--help" as UnderstandCommand || first === "-h" as UnderstandCommand) {
    return { command: "help", argumentsText: tokens.slice(1).join(" ") };
  }
  if (COMMANDS.has(first)) {
    tokens.shift();
    return { command: first, argumentsText: tokens.join(" ") };
  }
  return { command: "run", argumentsText: trimmed };
}

function tokenizeArgs(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function publish(pi: ExtensionAPI, ctx: UiLikeContext, text: string) {
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "understand", content: text, display: true });
  }
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) ctx.ui.notify(message, level);
  else console.log(message);
}

function contextCwd(ctx: UiLikeContext): string {
  return ctx.sessionManager?.getCwd?.() || ctx.cwd || process.cwd();
}

function safeLstat(file: string): fs.Stats | undefined {
  try {
    return fs.lstatSync(file);
  } catch {
    return undefined;
  }
}

export const __test__ = {
  buildUnderstandPrompt,
  ensureUnderstandAnything,
  linkSkills,
  parseArgs,
  resolveUnderstandPaths,
};
