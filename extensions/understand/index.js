import { lstat, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { createRepoBackedSkillBridge, pathExists } from "../_shared/pi-bridge/lifecycle.js";
import { splitCommandArgs, splitFirstArg } from "../_shared/pi-bridge/command-grammar.js";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  buildRefactorGrillPrompt,
  extractRefactorCandidateChoices,
  formatRefactorCommandMessage,
  grillRefactorCandidate,
  ignoreRefactorCandidate,
  parseRefactorInstruction,
  writeRefactorPlan,
} from "./lib/refactor-workflow.js";


export {
  appendRefactorIgnoreNote,
  buildRefactorGrillPrompt,
  collectLiveRefactorEvidence,
  extractRefactorCandidateChoices,
  formatRefactorCommandMessage,
  generateRefactorMarkdown,
  parseRefactorArgs,
  parseRefactorInstruction,
  summarizePreviousRefactorPlan,
} from "./lib/refactor-workflow.js";

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

const META_COMMANDS = new Set(["help", "install", "status", "update", "agent", "compare", "refactor"]);
const DIRECT_META_COMMANDS = new Map([
  ["understand-agent", "agent"],
  ["understand-compare", "compare"],
  ["understand-refactor", "refactor"],
]);

export function getUnderstandPaths(env = process.env, home = homedir()) {
  const repoDir = env.UA_DIR?.trim() || join(home, ".understand-anything", "repo");
  const repoUrl = env.UA_REPO_URL?.trim() || DEFAULT_REPO_URL;
  const repoRef = env.UA_REF?.trim() || "";
  const pluginDir = join(repoDir, "understand-anything-plugin");
  const skillsRoot = join(pluginDir, "skills");
  const pluginLink = join(home, ".understand-anything-plugin");
  return { repoDir, repoUrl, repoRef, pluginDir, skillsRoot, pluginLink };
}

export function parseUnderstandCommand(commandName, args = "") {
  const directMetaCommand = DIRECT_META_COMMANDS.get(commandName);
  if (directMetaCommand) return { type: directMetaCommand, args: args.trim() };

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

export { splitCommandArgs as splitArgs, splitFirstArg } from "../_shared/pi-bridge/command-grammar.js";

function normalizeFolderToken(folder) {
  const withoutAt = String(folder ?? "").replace(/^@/, "").trim();
  const withoutDotSuffix = withoutAt.replace(/[\\/]\.$/, "");
  const cleaned = withoutDotSuffix.replace(/[\\/]+$/, "");
  return cleaned || withoutAt || "project";
}

function folderBasename(folder) {
  return basename(normalizeFolderToken(folder)) || "project";
}

export function parseCompareArgs(args = "") {
  const tokens = splitCommandArgs(args);
  if (tokens.length < 2) {
    return { ok: false, message: "Usage: /understand compare <folder-a> <folder-b> [output.md]" };
  }

  const [folderA, folderB, output] = tokens;
  return {
    ok: true,
    folderA,
    folderB,
    output: output || `${folderBasename(folderA)}-vs-${folderBasename(folderB)}-understand-compare.md`,
  };
}

export function buildSkillInvocation({ skillName, skillPath, skillContent, args = "" }) {
  const skillDir = dirname(skillPath);
  const userArgs = args.trim();
  const piBridgePolicy = skillName === "understand"
    ? [
        "",
        "Pi bridge policy:",
        "- Treat `.understand-anything/.understandignore` review confirmation as pre-approved; continue automatically instead of stopping for yes/continue.",
        "- If a queued `/understand-agent` follow-up appears while awaiting that confirmation, treat it as the already-approved confirmation signal: do not answer it, do not explain command availability, do not treat it as part of the analysis target, and continue the current analysis.",
      ].join("\n")
    : "";
  return [
    `<skill name="${skillName}" location="${skillPath}">`,
    `References are relative to ${skillDir}.`,
    "",
    skillContent.trimEnd(),
    piBridgePolicy,
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
  return parseAgentMapArgs(args).output;
}

export function parseAgentMapArgs(args = "") {
  const trimmed = args.trim().replace(/^and\s+/i, "").trim();
  if (!trimmed) return { graphRootArg: "", output: "codebase-map-understand.md" };

  const tokens = splitCommandArgs(trimmed);
  const [first, ...rest] = tokens;
  if (first?.startsWith("@")) {
    const folder = first.slice(1).replace(/[\\/]+$/, "").trim();
    if (isCurrentDirectoryToken(folder)) {
      return { graphRootArg: "", output: rest.join(" ") || "codebase-map-understand.md" };
    }
    const folderName = basename(folder) || "codebase";
    return {
      graphRootArg: first,
      output: rest.join(" ") || `${folderName}-codebase-map-understand.md`,
    };
  }

  return { graphRootArg: "", output: trimmed };
}

function isCurrentDirectoryToken(token) {
  const cleaned = String(token ?? "").replace(/^@/, "").replace(/[\\/]+$/, "");
  return cleaned === "." || cleaned === "";
}

function hasProjectRootArg(tokens) {
  return tokens.some((token, index) => {
    if (token.startsWith("--")) return false;
    return tokens[index - 1] !== "--language";
  });
}

export function normalizeSkillArgs(args = "") {
  const trimmed = args.trim();
  const [first, ...rest] = splitCommandArgs(trimmed);
  if (first && isCurrentDirectoryToken(first)) return rest.join(" ");
  return isCurrentDirectoryToken(trimmed) ? "" : trimmed;
}

export function buildUnderstandSkillArgs(args = "", cwd = process.cwd()) {
  const normalized = normalizeSkillArgs(args.replace(/(?:^|\s)--no-agent-map(?=\s|$)/g, " "));
  const tokens = splitCommandArgs(normalized);
  if (hasProjectRootArg(tokens)) return normalized;
  const cwdArg = cwd.includes(" ") ? JSON.stringify(cwd) : cwd;
  return [cwdArg, normalized].filter(Boolean).join(" ");
}

export function buildAutoAgentArgs(understandArgs = "") {
  const tokens = splitCommandArgs(understandArgs).filter((token) => token !== "--no-agent-map");
  const pathToken = tokens.find((token, index) => {
    if (token.startsWith("--")) return false;
    const previous = tokens[index - 1];
    return previous !== "--language";
  });
  if (!pathToken || isCurrentDirectoryToken(pathToken)) return "";
  return `@${pathToken}`;
}

export function buildAutoAgentCommand(understandArgs = "") {
  const agentArgs = buildAutoAgentArgs(understandArgs);
  return `/understand-agent${agentArgs ? ` ${agentArgs}` : ""}`;
}

function shouldAutoWriteAgentMap(parsed) {
  return parsed.type === "skill" && parsed.skillName === "understand" && !splitCommandArgs(parsed.args).includes("--no-agent-map");
}

function formatAnalyzedAt(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function graphParts(graph) {
  return {
    nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph?.edges) ? graph.edges : [],
    layers: Array.isArray(graph?.layers) ? graph.layers : [],
    tour: Array.isArray(graph?.tour) ? graph.tour : [],
    project: graph?.project ?? {},
  };
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
    "- Re-run `/understand` after major code changes; it refreshes this file automatically unless `--no-agent-map` is used.",
    "",
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function topCounts(items, keyFn, max = 10) {
  return countBy(items, keyFn).slice(0, max);
}

function sharedValues(aValues = [], bValues = []) {
  const bSet = new Set(bValues.map((value) => String(value).toLowerCase()));
  return aValues.filter((value) => bSet.has(String(value).toLowerCase()));
}

function uniqueValues(values = [], otherValues = []) {
  const otherSet = new Set(otherValues.map((value) => String(value).toLowerCase()));
  return values.filter((value) => !otherSet.has(String(value).toLowerCase()));
}

function similarNodeNames(aNodes, bNodes, max = 20) {
  const bNames = new Set(bNodes.map((node) => String(node.name ?? "").toLowerCase()).filter(Boolean));
  return aNodes
    .filter((node) => bNames.has(String(node.name ?? "").toLowerCase()))
    .slice(0, max)
    .map((node) => node.name);
}

function formatCountList(items) {
  return items.length ? items.map(([name, count]) => `- ${name}: ${count}`).join("\n") : "- None";
}

function formatPatternCandidates(nodes, max = 12) {
  const candidates = sortImportantNodes(nodes.filter((node) => node.complexity === "complex" || node.type === "concept" || node.type === "module"));
  return formatNodeList(candidates, process.cwd(), max);
}

export function generateCompareMarkdown(graphA, graphB, { cwd = process.cwd(), folderA = "project-a", folderB = "project-b", outputPath = "understand-compare.md" } = {}) {
  const a = graphParts(graphA);
  const b = graphParts(graphB);
  const aName = a.project.name ?? folderBasename(folderA);
  const bName = b.project.name ?? folderBasename(folderB);
  const outputRel = isAbsolute(outputPath) ? relative(cwd, outputPath) || outputPath : outputPath;
  const sharedLanguages = sharedValues(a.project.languages, b.project.languages);
  const sharedFrameworks = sharedValues(a.project.frameworks, b.project.frameworks);
  const sharedNames = similarNodeNames(a.nodes, b.nodes, 25);

  const lines = [
    `# Understand-Anything Compare: ${aName} vs ${bName}`,
    "",
    "This file compares two Understand-Anything knowledge graphs for porting, rewrite planning, and pattern borrowing.",
    "",
    "## Inputs",
    "",
    `- **A:** ${aName} — \`${folderA}\``,
    `- **B:** ${bName} — \`${folderB}\``,
    `- **This file:** \`${outputRel}\``,
    "",
    "## Project summaries",
    "",
    `- **${aName}:** ${truncateText(a.project.description ?? "No description", 500)}`,
    `- **${bName}:** ${truncateText(b.project.description ?? "No description", 500)}`,
    "",
    "## Size and shape",
    "",
    tableRow(["Metric", aName, bName]),
    tableRow(["---", "---:", "---:"]),
    tableRow(["Nodes", a.nodes.length, b.nodes.length]),
    tableRow(["Edges", a.edges.length, b.edges.length]),
    tableRow(["Layers", a.layers.length, b.layers.length]),
    tableRow(["Tour steps", a.tour.length, b.tour.length]),
    "",
    "## Languages and frameworks",
    "",
    `- **Shared languages:** ${sharedLanguages.join(", ") || "none"}`,
    `- **Only ${aName}:** ${uniqueValues(a.project.languages, b.project.languages).join(", ") || "none"}`,
    `- **Only ${bName}:** ${uniqueValues(b.project.languages, a.project.languages).join(", ") || "none"}`,
    `- **Shared frameworks:** ${sharedFrameworks.join(", ") || "none"}`,
    `- **Frameworks only ${aName}:** ${uniqueValues(a.project.frameworks, b.project.frameworks).join(", ") || "none"}`,
    `- **Frameworks only ${bName}:** ${uniqueValues(b.project.frameworks, a.project.frameworks).join(", ") || "none"}`,
    "",
    "## Node type mix",
    "",
    `### ${aName}`,
    "",
    formatCountList(topCounts(a.nodes, (node) => node.type)),
    "",
    `### ${bName}`,
    "",
    formatCountList(topCounts(b.nodes, (node) => node.type)),
    "",
    "## Relationship mix",
    "",
    `### ${aName}`,
    "",
    formatCountList(topCounts(a.edges, (edge) => edge.type)),
    "",
    `### ${bName}`,
    "",
    formatCountList(topCounts(b.edges, (edge) => edge.type)),
    "",
    "## Architecture layers",
    "",
    `### ${aName}`,
    "",
    a.layers.length ? a.layers.map((layer) => `- **${layer.name ?? layer.id}** (${layer.nodeIds?.length ?? 0} nodes): ${truncateText(layer.description, 220)}`).join("\n") : "- No layers found.",
    "",
    `### ${bName}`,
    "",
    b.layers.length ? b.layers.map((layer) => `- **${layer.name ?? layer.id}** (${layer.nodeIds?.length ?? 0} nodes): ${truncateText(layer.description, 220)}`).join("\n") : "- No layers found.",
    "",
    "## Shared vocabulary / likely mapping points",
    "",
    sharedNames.length ? sharedNames.map((name) => `- ${name}`).join("\n") : "- No exact shared node names found. Compare layers and relationship types instead.",
    "",
    `## Patterns to borrow from ${aName}`,
    "",
    formatPatternCandidates(a.nodes),
    "",
    `## Patterns to borrow from ${bName}`,
    "",
    formatPatternCandidates(b.nodes),
    "",
    "## Porting checklist for agents",
    "",
    `- Map ${aName} layers to ${bName} layers before translating files one by one.`,
    "- Compare relationship mix: many `routes`, `configures`, or `depends_on` edges identify framework seams.",
    "- Start with shared node names and entrypoints; then port or steal patterns around those nodes.",
    "- Use each project's full `.understand-anything/knowledge-graph.json` for exact IDs and line ranges.",
    "- Re-run `/understand <folder>` for both projects after large changes, then regenerate this compare file.",
    "",
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

async function isInstalled(paths = getUnderstandPaths()) {
  return pathExists(join(paths.skillsRoot, "understand", "SKILL.md"));
}

async function linkPluginRoot(paths) {
  try {
    await lstat(paths.pluginLink);
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await symlink(paths.pluginDir, paths.pluginLink, "dir");
  }
}

const understandLifecycle = createRepoBackedSkillBridge({
  bridgeName: "Understand-Anything",
  isInstalled,
  afterInstallOrUpdate: linkPluginRoot,
  installPromptTitle: "Install Understand-Anything?",
  installPromptMessage: (paths) => `Clone ${paths.repoUrl} to ${paths.repoDir} so /understand can load the upstream skills?`,
  installCancelledMessage: "Understand-Anything install cancelled.",
  notInstalledMessage: (paths) => `Understand-Anything is not installed. Run /understand install first, or clone ${paths.repoUrl} to ${paths.repoDir}.`,
  buildInvocation: ({ skillName, skillPath, skillContent, args }) => buildSkillInvocation({ skillName, skillPath, skillContent, args }),
});

async function sendSkillInvocation(pi, ctx, paths, skillName, args) {
  await understandLifecycle.sendSkillInvocation(pi, ctx, paths, {
    skillName,
    skillPath: join(paths.skillsRoot, skillName, "SKILL.md"),
    args,
  });
}

async function postMessage(pi, content, details = {}) {
  pi.sendMessage({ customType: "understand", content, display: true, details });
}

const bundledSkillCategories = {
  "grill-with-docs": "planning",
};

async function sendBundledSkillInvocation(pi, ctx, skillName, args) {
  const skillCategory = bundledSkillCategories[skillName];
  const skillUrl = new URL(`../../skills/${skillCategory ? `${skillCategory}/` : ""}${skillName}/SKILL.md`, import.meta.url);
  const skillPath = fileURLToPath(skillUrl);
  let skillContent;
  try {
    skillContent = await readFile(skillUrl, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  const message = buildSkillInvocation({ skillName, skillPath, skillContent, args });
  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
  } else {
    pi.sendUserMessage(message, { deliverAs: "followUp" });
  }
  return true;
}

function helpText(paths = getUnderstandPaths()) {
  return `Understand-Anything bridge\n\n` +
    `Slash commands:\n` +
    `  /understand [path|flags]          Analyze the current project, then write an agent-readable Markdown map\n` +
    `  /understand --no-agent-map        Analyze only; skip the automatic Markdown map\n` +
    `  /understand dashboard            Open the dashboard\n` +
    `  /understand chat <question>       Ask about the graph\n` +
    `  /understand diff                  Summarize recent graph/code changes\n` +
    `  /understand agent [@path] [out]   Write or refresh the agent-readable Markdown map\n` +
    `  /understand compare <a> <b> [out] Compare two folders with existing graphs\n` +
    `  /understand refactor [@folder] [focus] [out] Generate a graph-based refactor plan\n` +
    `  /understand explain <target>      Explain a file/function\n` +
    `  /understand onboard               Generate onboarding guide\n` +
    `  /understand domain                Extract business domain graph\n` +
    `  /understand knowledge <wiki>      Analyze a knowledge base\n\n` +
    `Direct aliases also exist: /understand-dashboard, /understand-chat, /understand-diff, /understand-explain, /understand-onboard, /understand-domain, /understand-knowledge, /understand-agent, /understand-compare, /understand-refactor.\n\n` +
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
  const head = await understandLifecycle.checkoutHead(pi, ctx, paths);
  const ref = paths.repoRef ? `\nPinned ref: ${paths.repoRef}` : "";
  return `Understand-Anything installed at ${paths.repoDir}\nHEAD: ${head}${ref}\nSkills: ${paths.skillsRoot}\nPlugin link: ${paths.pluginLink}`;
}

async function writeAgentMap(ctx, args) {
  const parsed = parseAgentMapArgs(args);
  const graphRoot = parsed.graphRootArg ? resolveFolderArg(ctx.cwd, parsed.graphRootArg) : ctx.cwd;
  const graphPath = resolve(graphRoot, ".understand-anything", "knowledge-graph.json");
  const outputPath = resolveContainedOutputPath(ctx.cwd, parsed.output);

  let graph;
  try {
    graph = JSON.parse(await readFile(graphPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      const runHint = parsed.graphRootArg ? `/understand ${parsed.graphRootArg.slice(1)}` : "/understand";
      return {
        written: false,
        message: `No Understand-Anything graph found at ${graphPath}. Run ${runHint} first, then /understand agent${parsed.graphRootArg ? ` ${parsed.graphRootArg}` : ""}.`,
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

function isPathInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveContainedOutputPath(cwd, outputArg) {
  const outputPath = isAbsolute(outputArg) ? resolve(outputArg) : resolve(cwd, outputArg);
  if (!isPathInside(resolve(cwd), outputPath)) {
    throw new Error(`Understand output path must stay inside the current repo: ${outputArg}`);
  }
  return outputPath;
}

function resolveFolderArg(cwd, folder) {
  const cleaned = folder.replace(/^@/, "");
  return isAbsolute(cleaned) ? cleaned : resolve(cwd, cleaned);
}

async function readGraphForFolder(folderPath) {
  const graphPath = resolve(folderPath, ".understand-anything", "knowledge-graph.json");
  return { graphPath, graph: JSON.parse(await readFile(graphPath, "utf8")) };
}

async function writeCompareMap(ctx, args) {
  const parsed = parseCompareArgs(args);
  if (!parsed.ok) return { written: false, message: parsed.message };

  const folderA = resolveFolderArg(ctx.cwd, parsed.folderA);
  const folderB = resolveFolderArg(ctx.cwd, parsed.folderB);
  const outputPath = resolveContainedOutputPath(ctx.cwd, parsed.output);

  let a;
  let b;
  try {
    [a, b] = await Promise.all([readGraphForFolder(folderA), readGraphForFolder(folderB)]);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        written: false,
        message: `Missing Understand-Anything graph. Run /understand <folder> for both inputs first. Checked ${folderA}/.understand-anything/knowledge-graph.json and ${folderB}/.understand-anything/knowledge-graph.json.`,
      };
    }
    throw error;
  }

  const markdown = generateCompareMarkdown(a.graph, b.graph, { cwd: ctx.cwd, folderA, folderB, outputPath });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return {
    written: true,
    outputPath,
    folderA,
    folderB,
    graphA: a.graphPath,
    graphB: b.graphPath,
    message: `Wrote Understand-Anything compare map to ${outputPath}`,
  };
}

export async function handleRefactorCommand(pi, ctx, paths, args = "") {
  const instruction = parseRefactorInstruction(args);
  if (instruction.type === "grill") {
    const result = await grillRefactorCandidate(pi, ctx, instruction, sendBundledSkillInvocation);
    await postMessage(pi, result.message, result);
    return result;
  }
  if (instruction.type === "ignore") {
    const result = await ignoreRefactorCandidate(ctx, instruction);
    await postMessage(pi, result.message, result);
    return result;
  }
  const result = await writeRefactorPlan(ctx, instruction.args);
  await postMessage(pi, formatRefactorCommandMessage(result), result);
  if (result.needsGraphRefresh) {
    await sendSkillInvocation(pi, ctx, paths, "understand", result.understandArgs ?? "");
    return { ...result, dispatchedUnderstand: true };
  }
  if (result.written) {
    const [candidate] = extractRefactorCandidateChoices(result.markdown, 1);
    if (candidate) {
      const prompt = buildRefactorGrillPrompt({ candidate, outputPath: result.outputPath, cwd: ctx.cwd });
      const dispatched = await sendBundledSkillInvocation(pi, ctx, "grill-with-docs", prompt);
      return { ...result, autoStartedRefactor: dispatched, autoStartedCandidate: candidate, autoStartPrompt: prompt };
    }
  }
  return result;
}

function registerUnderstandCommand(pi, name, paths) {
  const description = name === "understand"
    ? "Run Understand-Anything analysis and related graph workflows"
    : name === "understand-agent"
      ? "Write or refresh the agent-readable Understand-Anything Markdown map"
      : name === "understand-compare"
      ? "Compare two folders with existing Understand-Anything graphs"
      : name === "understand-refactor"
        ? "Generate a deterministic refactor plan from the current Understand-Anything graph"
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
        await understandLifecycle.ensureInstalled(pi, ctx, paths, { prompt: false });
        await postMessage(pi, `Installed Understand-Anything at ${paths.repoDir}. Run /reload to expose upstream /skill:understand commands directly, or keep using /understand.`);
        return;
      }

      if (parsed.type === "update") {
        const action = await understandLifecycle.update(pi, ctx, paths);
        await postMessage(pi, `${action === "installed" ? "Installed" : "Updated"} Understand-Anything at ${paths.repoDir}.`);
        return;
      }

      if (parsed.type === "agent") {
        const result = await writeAgentMap(ctx, parsed.args);
        await postMessage(pi, result.message, result);
        return;
      }

      if (parsed.type === "compare") {
        const result = await writeCompareMap(ctx, parsed.args);
        await postMessage(pi, result.message, result);
        return;
      }

      if (parsed.type === "refactor") {
        await handleRefactorCommand(pi, ctx, paths, parsed.args);
        return;
      }

      const skillArgs = parsed.skillName === "understand"
        ? buildUnderstandSkillArgs(parsed.args, ctx.cwd)
        : normalizeSkillArgs(parsed.args.replace(/(?:^|\s)--no-agent-map(?=\s|$)/g, " "));
      await sendSkillInvocation(pi, ctx, paths, parsed.skillName, skillArgs);
      if (shouldAutoWriteAgentMap(parsed)) {
        pi.sendUserMessage(buildAutoAgentCommand(parsed.args), { deliverAs: "followUp" });
      }
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
  registerUnderstandCommand(pi, "understand-agent", paths);
  registerUnderstandCommand(pi, "understand-compare", paths);
  registerUnderstandCommand(pi, "understand-refactor", paths);
  for (const name of SKILL_NAMES) {
    if (name !== "understand") registerUnderstandCommand(pi, name, paths);
  }
}
