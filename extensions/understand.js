import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";

const DEFAULT_REPO_URL = "https://github.com/Lum1104/Understand-Anything.git";
const SKILL_NAMES = new Set([
  "understand",
  "understand-dashboard",
  "understand-chat",
  "understand-diff",
  "understand-explain",
  "understand-onboard",
  "understand-domain",
  "understand-knowledge",
]);

const SUBCOMMAND_TO_SKILL = new Map([
  ["dashboard", "understand-dashboard"],
  ["chat", "understand-chat"],
  ["diff", "understand-diff"],
  ["explain", "understand-explain"],
  ["onboard", "understand-onboard"],
  ["domain", "understand-domain"],
  ["knowledge", "understand-knowledge"],
]);

const META_COMMANDS = new Set(["help", "install", "status", "update", "agent"]);

export function getUnderstandPaths(env = process.env, home = homedir()) {
  const repoDir = env.UA_DIR?.trim() || join(home, ".understand-anything", "repo");
  const repoUrl = env.UA_REPO_URL?.trim() || DEFAULT_REPO_URL;
  const pluginDir = join(repoDir, "understand-anything-plugin");
  const skillsRoot = join(pluginDir, "skills");
  const pluginLink = join(home, ".understand-anything-plugin");
  return { repoDir, repoUrl, pluginDir, skillsRoot, pluginLink };
}

export function splitFirstArg(args = "") {
  const trimmed = args.trim();
  if (!trimmed) return { first: "", rest: "" };
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { first: match?.[1] ?? "", rest: match?.[2]?.trim() ?? "" };
}

export function parseUnderstandCommand(commandName, args = "") {
  if (commandName !== "understand") {
    if (!SKILL_NAMES.has(commandName)) throw new Error(`Unknown understand command: ${commandName}`);
    return { type: "skill", skillName: commandName, args: args.trim() };
  }

  const { first, rest } = splitFirstArg(args);
  const normalized = first.toLowerCase();

  if (META_COMMANDS.has(normalized)) {
    return { type: normalized, args: rest };
  }

  const subcommandSkill = SUBCOMMAND_TO_SKILL.get(normalized);
  if (subcommandSkill) {
    return { type: "skill", skillName: subcommandSkill, args: rest };
  }

  return { type: "skill", skillName: "understand", args: args.trim() };
}

export function buildSkillInvocation({ skillName, skillPath, skillContent, args = "" }) {
  const skillDir = dirname(skillPath);
  const userArgs = args.trim();
  return [
    `<skill name="${skillName}" location="${skillPath}">`,
    `References are relative to ${skillDir}.`,
    "",
    skillContent.trimEnd(),
    "</skill>",
    userArgs ? `\nUser: ${userArgs}` : "",
  ].join("\n").trimEnd();
}

function truncateText(value, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function tableRow(values) {
  return `| ${values.map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
}

function nodeLine(node, cwd) {
  const location = node.filePath
    ? ` — \`${node.lineRange ? `${node.filePath}:${node.lineRange[0]}-${node.lineRange[1]}` : node.filePath}\``
    : "";
  const tags = Array.isArray(node.tags) && node.tags.length ? ` _${node.tags.slice(0, 4).join(", ")}_` : "";
  return `- **${node.name ?? node.id}** (${node.type ?? "node"}, ${node.complexity ?? "unknown"})${location}${tags}: ${truncateText(node.summary)}`;
}

function sortImportantNodes(nodes) {
  const complexityRank = { complex: 0, moderate: 1, simple: 2 };
  return [...nodes].sort((a, b) => {
    const byComplexity = (complexityRank[a.complexity] ?? 3) - (complexityRank[b.complexity] ?? 3);
    if (byComplexity !== 0) return byComplexity;
    return String(a.name ?? a.id).localeCompare(String(b.name ?? b.id));
  });
}

function formatNodeList(nodes, cwd, max = 12) {
  if (!nodes.length) return "- None found in the graph.";
  return nodes.slice(0, max).map((node) => nodeLine(node, cwd)).join("\n");
}

function edgeLine(edge, byId) {
  const source = byId.get(edge.source)?.name ?? edge.source;
  const target = byId.get(edge.target)?.name ?? edge.target;
  const description = edge.description ? ` — ${truncateText(edge.description, 180)}` : "";
  return `- **${source}** --${edge.type ?? "related"}→ **${target}**${description}`;
}

export function normalizeAgentOutputArg(args = "") {
  const trimmed = args.trim();
  if (!trimmed) return "codebase-map-understand.md";
  const target = trimmed.replace(/^and\s+/i, "").trim();
  if (!target) return "codebase-map-understand.md";

  if (target.startsWith("@")) {
    const folder = target.slice(1).replace(/[\\/]+$/, "").trim();
    const folderName = basename(folder) || "codebase";
    return `${folderName}-codebase-map-understand.md`;
  }

  return target;
}

function formatAnalyzedAt(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function generateAgentMapMarkdown(graph, { cwd = process.cwd(), graphPath = ".understand-anything/knowledge-graph.json", outputPath = "codebase-map-understand.md" } = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const layers = Array.isArray(graph?.layers) ? graph.layers : [];
  const tour = Array.isArray(graph?.tour) ? graph.tour : [];
  const project = graph?.project ?? {};
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const fileNodes = nodes.filter((node) => node.type === "file" || node.filePath);
  const complexNodes = sortImportantNodes(nodes.filter((node) => node.complexity === "complex"));
  const entryLikeNodes = sortImportantNodes(nodes.filter((node) => {
    const haystack = `${node.name ?? ""} ${node.filePath ?? ""} ${(node.tags ?? []).join(" ")}`.toLowerCase();
    return /(^|[/\\])(index|main|app|server|cli|program)\.[a-z0-9]+$/.test(node.filePath ?? "") || /entry|route|endpoint|server|cli|app/.test(haystack);
  }));
  const importantEdges = edges
    .filter((edge) => ["calls", "routes", "depends_on", "imports", "configures", "serves", "triggers", "flow_step"].includes(edge.type))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 18);

  const graphRel = isAbsolute(graphPath) ? relative(cwd, graphPath) || graphPath : graphPath;
  const outputRel = isAbsolute(outputPath) ? relative(cwd, outputPath) || outputPath : outputPath;
  const analyzedAt = formatAnalyzedAt(project.analyzedAt);

  const lines = [
    "# Codebase Map from Understand-Anything",
    "",
    "This file is a compact, agent-readable summary generated from Understand-Anything's knowledge graph. Keep it checked in only if your team wants future agents to start from this map.",
    "",
    "## Project",
    "",
    `- **Name:** ${project.name ?? "Unknown"}`,
    `- **Description:** ${truncateText(project.description ?? "No project description in graph.", 500)}`,
    `- **Languages:** ${(project.languages ?? []).join(", ") || "unknown"}`,
    `- **Frameworks:** ${(project.frameworks ?? []).join(", ") || "unknown"}`,
    `- **Analyzed at:** ${analyzedAt}`,
    `- **Git commit:** ${project.gitCommitHash ?? "unknown"}`,
    `- **Graph source:** \`${graphRel}\``,
    `- **This file:** \`${outputRel}\``,
    "",
    "## Size and shape",
    "",
    tableRow(["Thing", "Count"]),
    tableRow(["---", "---:"]),
    tableRow(["Nodes", nodes.length]),
    tableRow(["Edges", edges.length]),
    tableRow(["Layers", layers.length]),
    tableRow(["Tour steps", tour.length]),
    "",
    "### Node types",
    "",
    countBy(nodes, (node) => node.type).map(([type, count]) => `- ${type}: ${count}`).join("\n") || "- None",
    "",
    "### Edge types",
    "",
    countBy(edges, (edge) => edge.type).map(([type, count]) => `- ${type}: ${count}`).join("\n") || "- None",
    "",
    "## Architectural layers",
    "",
    layers.length ? layers.map((layer) => `- **${layer.name ?? layer.id}** (${layer.nodeIds?.length ?? 0} nodes): ${truncateText(layer.description, 260)}`).join("\n") : "- No layers found in the graph.",
    "",
    "## Start here",
    "",
    formatNodeList(entryLikeNodes, cwd, 10),
    "",
    "## Most important / complex nodes",
    "",
    formatNodeList(complexNodes, cwd, 15),
    "",
    "## High-signal relationships",
    "",
    importantEdges.length ? importantEdges.map((edge) => edgeLine(edge, byId)).join("\n") : "- No high-signal relationships found in the graph.",
    "",
    "## Guided reading order",
    "",
    tour.length ? tour.slice(0, 12).map((step) => `1. **${step.title ?? `Step ${step.order ?? "?"}`}**: ${truncateText(step.description, 300)}`).join("\n") : "- No tour found in the graph.",
    "",
    "## File hotspots",
    "",
    formatNodeList(sortImportantNodes(fileNodes), cwd, 20),
    "",
    "## Notes for future agents",
    "",
    "- Prefer this Markdown file for quick orientation.",
    "- Use the full JSON graph when you need exact node IDs, line ranges, or relationship details.",
    "- Re-run `/understand` after major code changes, then re-run `/understand agent` to refresh this file.",
    "",
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isInstalled(paths = getUnderstandPaths()) {
  return pathExists(join(paths.skillsRoot, "understand", "SKILL.md"));
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

async function linkPluginRoot(paths) {
  try {
    await lstat(paths.pluginLink);
    return;
  } catch {
    await symlink(paths.pluginDir, paths.pluginLink, "dir");
  }
}

async function cloneUnderstandAnything(pi, ctx, paths) {
  await mkdir(dirname(paths.repoDir), { recursive: true });
  await runGit(pi, ["clone", "--depth", "1", paths.repoUrl, paths.repoDir], ctx);
  await linkPluginRoot(paths);
}

async function updateUnderstandAnything(pi, ctx, paths) {
  if (!(await isInstalled(paths))) {
    await cloneUnderstandAnything(pi, ctx, paths);
    return "installed";
  }
  await runGit(pi, ["-C", paths.repoDir, "pull", "--ff-only"], ctx);
  await linkPluginRoot(paths);
  return "updated";
}

async function ensureInstalled(pi, ctx, paths = getUnderstandPaths(), { prompt = true } = {}) {
  if (await isInstalled(paths)) {
    await linkPluginRoot(paths);
    return;
  }

  if (prompt) {
    if (!ctx.hasUI) {
      throw new Error(
        `Understand-Anything is not installed. Run /understand install first, or clone ${paths.repoUrl} to ${paths.repoDir}.`,
      );
    }
    const ok = await ctx.ui.confirm(
      "Install Understand-Anything?",
      `Clone ${paths.repoUrl} to ${paths.repoDir} so /understand can load the upstream skills?`,
    );
    if (!ok) throw new Error("Understand-Anything install cancelled.");
  }

  await cloneUnderstandAnything(pi, ctx, paths);
}

async function sendSkillInvocation(pi, ctx, paths, skillName, args) {
  await ensureInstalled(pi, ctx, paths);
  const skillPath = join(paths.skillsRoot, skillName, "SKILL.md");
  const skillContent = await readFile(skillPath, "utf8");
  const message = buildSkillInvocation({ skillName, skillPath, skillContent, args });
  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
  } else {
    pi.sendUserMessage(message, { deliverAs: "followUp" });
  }
}

async function postMessage(pi, content, details = {}) {
  pi.sendMessage({ customType: "understand", content, display: true, details });
}

function helpText(paths = getUnderstandPaths()) {
  return `Understand-Anything bridge\n\n` +
    `Slash commands:\n` +
    `  /understand [path|flags]          Analyze the current project\n` +
    `  /understand dashboard            Open the dashboard\n` +
    `  /understand chat <question>       Ask about the graph\n` +
    `  /understand diff                  Analyze current changes\n` +
    `  /understand agent [output.md]     Write an agent-readable Markdown map\n` +
    `  /understand explain <target>      Explain a file/function\n` +
    `  /understand onboard               Generate onboarding guide\n` +
    `  /understand domain                Extract business domain graph\n` +
    `  /understand knowledge <wiki>      Analyze a knowledge base\n\n` +
    `Direct aliases also exist: /understand-dashboard, /understand-chat, /understand-diff, /understand-explain, /understand-onboard, /understand-domain, /understand-knowledge.\n\n` +
    `Management:\n` +
    `  /understand install               Clone upstream Understand-Anything\n` +
    `  /understand update                git pull --ff-only upstream checkout\n` +
    `  /understand status                Show checkout status\n\n` +
    `Upstream: ${paths.repoUrl}\n` +
    `Checkout: ${paths.repoDir}\n` +
    `Plugin link: ${paths.pluginLink}`;
}

async function statusText(pi, ctx, paths) {
  if (!(await isInstalled(paths))) {
    return `Understand-Anything is not installed. Run /understand install to clone ${paths.repoUrl} to ${paths.repoDir}.`;
  }
  const result = await runGit(pi, ["-C", paths.repoDir, "rev-parse", "--short", "HEAD"], ctx, 30_000);
  const head = result.stdout.trim();
  return `Understand-Anything installed at ${paths.repoDir}\nHEAD: ${head}\nSkills: ${paths.skillsRoot}\nPlugin link: ${paths.pluginLink}`;
}

async function writeAgentMap(ctx, args) {
  const graphPath = resolve(ctx.cwd, ".understand-anything", "knowledge-graph.json");
  const outputArg = normalizeAgentOutputArg(args);
  const outputPath = isAbsolute(outputArg) ? outputArg : resolve(ctx.cwd, outputArg);

  let graph;
  try {
    graph = JSON.parse(await readFile(graphPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        written: false,
        message: `No Understand-Anything graph found at ${graphPath}. Run /understand first, then /understand agent.`,
      };
    }
    throw error;
  }

  const markdown = generateAgentMapMarkdown(graph, { cwd: ctx.cwd, graphPath, outputPath });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return {
    written: true,
    outputPath,
    graphPath,
    message: `Wrote agent-readable codebase map to ${outputPath}`,
  };
}

function registerUnderstandCommand(pi, name, paths) {
  const description = name === "understand"
    ? "Run Understand-Anything analysis and related graph workflows"
    : `Run the upstream ${name} Understand-Anything workflow`;

  pi.registerCommand(name, {
    description,
    handler: async (args, ctx) => {
      const parsed = parseUnderstandCommand(name, args);

      if (parsed.type === "help") {
        await postMessage(pi, helpText(paths));
        return;
      }

      if (parsed.type === "status") {
        await postMessage(pi, await statusText(pi, ctx, paths));
        return;
      }

      if (parsed.type === "install") {
        await ensureInstalled(pi, ctx, paths, { prompt: false });
        await postMessage(pi, `Installed Understand-Anything at ${paths.repoDir}. Run /reload to expose upstream /skill:understand commands directly, or keep using /understand.`);
        return;
      }

      if (parsed.type === "update") {
        const action = await updateUnderstandAnything(pi, ctx, paths);
        await postMessage(pi, `${action === "installed" ? "Installed" : "Updated"} Understand-Anything at ${paths.repoDir}.`);
        return;
      }

      if (parsed.type === "agent") {
        const result = await writeAgentMap(ctx, parsed.args);
        await postMessage(pi, result.message, result);
        return;
      }

      await sendSkillInvocation(pi, ctx, paths, parsed.skillName, parsed.args);
    },
  });
}

export default function understandAnythingExtension(pi) {
  const paths = getUnderstandPaths();

  pi.on("resources_discover", async () => {
    if (await isInstalled(paths)) return { skillPaths: [paths.skillsRoot] };
    return undefined;
  });

  registerUnderstandCommand(pi, "understand", paths);
  for (const name of SKILL_NAMES) {
    if (name !== "understand") registerUnderstandCommand(pi, name, paths);
  }
}
