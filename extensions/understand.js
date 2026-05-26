import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

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
  ["understand-compare", "compare"],
  ["understand-refactor", "refactor"],
]);

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

export function splitArgs(args = "") {
  const tokens = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  for (const match of args.matchAll(pattern)) {
    tokens.push((match[1] ?? match[2] ?? match[3] ?? "").replace(/\\(["'\\])/g, "$1"));
  }
  return tokens;
}

function folderBasename(folder) {
  const cleaned = folder.replace(/^@/, "").replace(/[\\/]+$/, "").trim();
  return basename(cleaned) || "project";
}

export function parseCompareArgs(args = "") {
  const tokens = splitArgs(args);
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

export function parseRefactorArgs(args = "") {
  const tokens = splitArgs(args);
  const outputToken = tokens.length && /\.md$/i.test(tokens.at(-1)) ? tokens.pop() : undefined;
  return {
    focus: tokens.join(" ").trim(),
    output: outputToken || "refactor-plan-understand-refactor.md",
  };
}

export function parseRefactorInstruction(args = "") {
  const tokens = splitArgs(args);
  const first = tokens[0]?.toLowerCase();

  if (first === "grill" || first === "ignore") {
    const outputToken = tokens.length > 2 && /\.md$/i.test(tokens.at(-1)) ? tokens.at(-1) : undefined;
    return {
      type: first,
      index: Number.parseInt(tokens[1] ?? "", 10),
      output: outputToken || "refactor-plan-understand-refactor.md",
    };
  }

  if (first === "regenerate" && tokens[1]?.toLowerCase() === "with" && tokens[2]?.toLowerCase() === "focus") {
    return { type: "generate", args: tokens.slice(3).join(" ").trim() };
  }

  return { type: "generate", args: args.trim() };
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
    "- Re-run `/understand` after major code changes, then re-run `/understand agent` to refresh this file.",
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

function nodeDegree(edges, nodeId) {
  return edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
}

function nodeTangleScore(node, edges) {
  const complexityScore = { complex: 8, moderate: 4, simple: 1 }[node.complexity] ?? 2;
  const typeScore = { file: 3, module: 3, concept: 2, function: 1 }[node.type] ?? 1;
  const degree = nodeDegree(edges, node.id);
  return complexityScore + typeScore + degree * 2;
}

function nodeMatchesFocus(node, terms) {
  if (!terms.length) return true;
  const haystack = [node.name, node.filePath, node.summary, ...(node.tags ?? [])].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function formatCandidateTable(candidates, edges, cwd, max = 10, liveEvidence = {}) {
  if (!candidates.length) return "- No refactor candidates found in the graph.";
  const rows = [
    tableRow(["Candidate", "Type", "Score", "Confidence", "Evidence"]),
    tableRow(["---", "---", "---:", "---", "---"]),
  ];
  for (const node of candidates.slice(0, max)) {
    const live = liveEvidence[node.id];
    const location = node.filePath ? `\`${node.lineRange ? `${node.filePath}:${node.lineRange[0]}-${node.lineRange[1]}` : node.filePath}\`` : "graph node";
    const liveParts = live?.exists
      ? [`${live.nonEmptyLines} live LOC`, `${live.branchCount} branches`, `${live.importCount} imports`, `${live.testPaths?.length ?? 0} related tests`]
      : [live?.reason ? `live file not confirmed: ${live.reason}` : "live file not inspected"];
    const evidence = `${node.complexity ?? "unknown"} graph complexity, ${nodeDegree(edges, node.id)} relationships, ${location}; ${liveParts.join(", ")}`;
    rows.push(tableRow([node.name ?? node.id, node.type ?? "node", node.__totalScore ?? candidateScore(node, live), confidenceForCandidate(node, live), evidence]));
  }
  return rows.join("\n");
}

function relatedEdgesForNode(edges, nodeId, max = 8) {
  return edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, max);
}

function refactorCandidateNodes(nodes, edges, focus = "") {
  const terms = focus.toLowerCase().split(/\s+/).filter(Boolean);
  const scoped = nodes.filter((node) => nodeMatchesFocus(node, terms));
  const pool = scoped.length ? scoped : nodes;
  return [...pool]
    .filter((node) => node.type === "file" || node.type === "module" || node.type === "concept" || node.complexity === "complex")
    .map((node) => ({ ...node, __score: nodeTangleScore(node, edges) }))
    .sort((a, b) => b.__score - a.__score || String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
}

function stripExtension(path) {
  return basename(path, extname(path)).toLowerCase().replace(/\.(test|spec)$/i, "");
}

function isLikelyTestPath(path) {
  return /(^|[/\\])(__tests__|test|tests|spec)([/\\]|$)|[._-](test|spec)\.[a-z0-9]+$/i.test(path);
}

function analyzeSourceText(text = "") {
  const lines = text.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim()).length;
  const branchCount = (text.match(/\b(if|else if|switch|case|catch|for|while|try)\b|&&|\|\||\?/g) ?? []).length;
  const importCount = (text.match(/^\s*(import\b|from\s+['"]|const\s+\w+\s*=\s*require\(|require\()/gm) ?? []).length;
  const publicSurfaceCount = (text.match(/^\s*(export\b|class\s+\w+|function\s+\w+|[A-Za-z_$][\w$]*\s*\([^)]*\)\s*[{=>])/gm) ?? []).length;
  return { lineCount: lines.length, nonEmptyLines, branchCount, importCount, publicSurfaceCount };
}

function liveEvidenceScore(evidence) {
  if (!evidence?.exists) return 0;
  const testPenalty = evidence.testPaths?.length ? 0 : 3;
  return Math.min(12, Math.floor((evidence.nonEmptyLines ?? 0) / 80) + (evidence.branchCount ?? 0) + Math.min(4, evidence.importCount ?? 0) + testPenalty);
}

function confidenceForCandidate(node, evidence) {
  if (!evidence?.exists) return "graph-only";
  if ((evidence.testPaths?.length ?? 0) > 0 && nodeDegree(evidence.edges ?? [], node.id) >= 2) return "strong";
  if ((evidence.branchCount ?? 0) >= 3 || (evidence.importCount ?? 0) >= 3 || (evidence.testPaths?.length ?? 0) > 0) return "needs-review";
  return "thin";
}

async function listRepoFiles(dir, { root = dir, limit = 2500 } = {}) {
  const out = [];
  const skip = new Set([".git", ".pi", ".understand-anything", "node_modules", "build", "dist", "coverage", ".dart_tool", ".next"]);
  async function walk(current) {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (entry.isDirectory() && skip.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).split("\\").join("/"));
      }
    }
  }
  await walk(dir);
  return out;
}

function relatedTestPaths(candidatePath, repoFiles) {
  if (!candidatePath) return [];
  const stem = stripExtension(candidatePath);
  const leaf = basename(stem).replace(/[_-]?(screen|page|view|component|service|controller|manager|helper|util)$/i, "");
  return repoFiles
    .filter((file) => isLikelyTestPath(file))
    .filter((file) => {
      const testStem = stripExtension(file);
      return testStem.includes(stem) || (!!leaf && leaf.length > 2 && testStem.includes(leaf.toLowerCase()));
    })
    .slice(0, 8);
}

export async function collectLiveRefactorEvidence(graph, { cwd = process.cwd(), focus = "", maxCandidates = 12 } = {}) {
  const { nodes, edges } = graphParts(graph);
  const candidates = refactorCandidateNodes(nodes, edges, focus).slice(0, maxCandidates);
  const repoFiles = await listRepoFiles(cwd);
  const evidence = {};

  for (const node of candidates) {
    const candidatePath = node.filePath;
    if (!candidatePath) {
      evidence[node.id] = { exists: false, reason: "No filePath in graph", edges };
      continue;
    }
    const fullPath = resolve(cwd, candidatePath);
    try {
      const text = await readFile(fullPath, "utf8");
      evidence[node.id] = {
        exists: true,
        filePath: candidatePath,
        ...analyzeSourceText(text),
        testPaths: relatedTestPaths(candidatePath, repoFiles),
        edges,
      };
    } catch (error) {
      evidence[node.id] = { exists: false, filePath: candidatePath, reason: error?.code ?? "read failed", edges };
    }
  }

  return evidence;
}

function candidateScore(node, liveEvidence = {}) {
  return (node.__score ?? nodeTangleScore(node, liveEvidence.edges ?? [])) + liveEvidenceScore(liveEvidence);
}

function sectionAfterHeading(markdown, heading, maxLength = 700) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return undefined;
  const collected = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.trim()) collected.push(line);
    if (collected.join("\n").length >= maxLength) break;
  }
  return truncateText(collected.join(" "), maxLength);
}

export function summarizePreviousRefactorPlan(previousPlan) {
  const trimmed = String(previousPlan ?? "").trim();
  if (!trimmed) return "- No previous refactor plan found at the output path.";

  const topRecommendation = sectionAfterHeading(trimmed, "## Top recommendation");
  const refactorSlices = sectionAfterHeading(trimmed, "## Refactor slices");
  const decisionLines = trimmed
    .split(/\r?\n/)
    .filter((line) => /\b(accepted|rejected|blocked|done|todo|decision|ignore|next)\b|^- \[[ xX]\]/i.test(line))
    .slice(0, 8)
    .map((line) => `  - ${truncateText(line, 180)}`);

  return [
    "- Previous refactor plan was read before regenerating; use it as continuity context, not source of truth.",
    topRecommendation ? `- Previous top recommendation: ${topRecommendation}` : "- Previous top recommendation: not found.",
    refactorSlices ? `- Previous slice outline: ${refactorSlices}` : "- Previous slice outline: not found.",
    decisionLines.length ? ["- Previous notes/decisions detected:", ...decisionLines].join("\n") : "- Previous notes/decisions detected: none.",
  ].join("\n");
}

export function generateRefactorMarkdown(graph, { cwd = process.cwd(), graphPath = ".understand-anything/knowledge-graph.json", outputPath = "refactor-plan-understand-refactor.md", focus = "", liveEvidence = {}, previousPlan = "" } = {}) {
  const { nodes, edges, layers, project } = graphParts(graph);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const candidates = refactorCandidateNodes(nodes, edges, focus)
    .map((node) => ({ ...node, __totalScore: candidateScore(node, liveEvidence[node.id]) }))
    .sort((a, b) => b.__totalScore - a.__totalScore || String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
  const top = candidates[0];
  const graphRel = isAbsolute(graphPath) ? relative(cwd, graphPath) || graphPath : graphPath;
  const outputRel = isAbsolute(outputPath) ? relative(cwd, outputPath) || outputPath : outputPath;
  const focusText = focus?.trim() || "whole graph";
  const topRelationships = top ? relatedEdgesForNode(edges, top.id).map((edge) => edgeLine(edge, byId)).join("\n") : "- None";
  const topLocation = top?.filePath ? `\`${top.lineRange ? `${top.filePath}:${top.lineRange[0]}-${top.lineRange[1]}` : top.filePath}\`` : "No top candidate found.";
  const topLive = top ? liveEvidence[top.id] : undefined;
  const topTests = topLive?.testPaths?.length ? topLive.testPaths.map((file) => `- \`${file}\``).join("\n") : "- No related tests found by deterministic scan; add/locate tests before refactoring.";
  const liveEvidenceWasCollected = Object.keys(liveEvidence).length > 0;
  const previousPlanSummary = summarizePreviousRefactorPlan(previousPlan);
  const previousPlanWasRead = Boolean(String(previousPlan ?? "").trim());
  const chatPrompt = `Use ${outputRel}, the previous-plan continuity section, the current Understand graph, and the live file/test evidence to grill the selected refactor candidate: <candidate>. Stress-test domain terms, tests, risks, and small validation-backed slices before editing code. Focus: ${focusText}.`;

  const lines = [
    "# Understand-Anything Refactor Plan",
    "",
    "This deterministic plan is generated from an existing Understand-Anything knowledge graph plus live repo checks when the command runs inside a checkout. It does not run an LLM. Use the follow-up prompt when you want model reasoning over this file.",
    "",
    "## Inputs",
    "",
    `- **Project:** ${project.name ?? "Unknown"}`,
    `- **Focus:** ${focusText}`,
    `- **Graph source:** \`${graphRel}\``,
    `- **This file:** \`${outputRel}\``,
    `- **Analyzed at:** ${formatAnalyzedAt(project.analyzedAt)}`,
    `- **Git commit:** ${project.gitCommitHash ?? "unknown"}`,
    `- **Live repo evidence:** ${liveEvidenceWasCollected ? "collected from current files/tests" : "not collected; graph-only output"}`,
    `- **Previous plan:** ${previousPlanWasRead ? "read from existing output before regeneration" : "none found at output path"}`,
    "",
    "## Previous plan continuity",
    "",
    previousPlanSummary,
    "",
    "## Likely tangled hotspots",
    "",
    formatCandidateTable(candidates, edges, cwd, 12, liveEvidence),
    "",
    "## Top recommendation",
    "",
    top
      ? `Start with **${top.name ?? top.id}** at ${topLocation}. It has combined score ${top.__totalScore ?? candidateScore(top, topLive)}, ${top.complexity ?? "unknown"} graph complexity, ${nodeDegree(edges, top.id)} graph relationships, and confidence **${confidenceForCandidate(top, topLive)}**.`
      : "No top recommendation could be derived from the graph.",
    "",
    "### Live file/test evidence",
    "",
    topLive?.exists
      ? `- Live file confirmed: \`${topLive.filePath}\` (${topLive.nonEmptyLines} non-empty LOC, ${topLive.branchCount} branch points, ${topLive.importCount} imports, ${topLive.publicSurfaceCount} public-surface hints).`
      : `- Live file not confirmed: ${topLive?.reason ?? "not inspected"}. Verify the graph against current code before refactoring.`,
    "",
    "Related tests to inspect or create:",
    "",
    topTests,
    "",
    "### Relationship evidence",
    "",
    topRelationships,
    "",
    "## Refactor slices",
    "",
    "1. **Characterize the seam** — read the candidate, graph relationships, live file stats, callers, and related tests; confirm the graph is current against live files.",
    "2. **Add or tighten behavior tests** — lock observable behavior through the public interface before moving code; create a focused test if no related test was found.",
    "3. **Deepen the module** — move repeated orchestration or branching behind one smaller interface; avoid new pass-through wrappers.",
    "4. **Delete replaced shallow paths** — remove tests or modules that only exercise implementation details after the deeper interface is covered.",
    "5. **Run focused validation** — run the smallest relevant test command, then broader validation if the seam crosses modules.",
    "",
    "## Architecture layers to inspect",
    "",
    layers.length ? layers.map((layer) => `- **${layer.name ?? layer.id}** (${layer.nodeIds?.length ?? 0} nodes): ${truncateText(layer.description, 220)}`).join("\n") : "- No layers found in the graph.",
    "",
    "## Follow-up LLM prompt",
    "",
    "```text",
    `/understand-chat ${chatPrompt}`,
    "```",
    "",
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
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

async function sendBundledSkillInvocation(pi, ctx, skillName, args) {
  const skillUrl = new URL(`../skills/${skillName}/SKILL.md`, import.meta.url);
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

export function extractRefactorCandidateChoices(markdown, max = 5) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Likely tangled hotspots");
  if (start === -1) return [];
  const choices = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const candidate = cells[0];
    if (!candidate || candidate === "Candidate" || /^-+$/.test(candidate)) continue;
    choices.push(candidate.replace(/^`|`$/g, ""));
    if (choices.length >= max) break;
  }
  return choices;
}

function resolveRefactorChoice(markdown, index) {
  const choices = extractRefactorCandidateChoices(markdown, 50);
  if (!Number.isInteger(index) || index < 1) {
    return { ok: false, message: "Usage: /understand-refactor grill <candidate-number> [plan.md]" };
  }
  const candidate = choices[index - 1];
  if (!candidate) {
    return { ok: false, message: `No refactor candidate ${index} found in the latest plan. Available candidates: ${choices.length || 0}.` };
  }
  return { ok: true, candidate, choices };
}

export function buildRefactorGrillPrompt({ candidate, outputPath = "refactor-plan-understand-refactor.md", cwd = process.cwd() } = {}) {
  const outputRel = isAbsolute(outputPath) ? relative(cwd, outputPath) || outputPath : outputPath;
  return [
    `Selected Understand Refactor candidate: \`${candidate}\``,
    `Artifact: \`${outputRel}\``,
    "Next skill: `grill-with-docs`",
    "Success signal: a docs-backed, testable refactor slice or an explicit decision to ignore this candidate.",
    "",
    `Use \`${outputRel}\`, the current repository docs, tests, and live code to stress-test candidate \`${candidate}\` before editing code. Ask one question at a time and provide your recommended answer for each question.`,
  ].join("\n");
}

export function appendRefactorIgnoreNote(markdown, { index, candidate }) {
  const trimmed = String(markdown ?? "").trimEnd();
  const note = `- Ignored candidate ${index}: \`${candidate}\`.`;
  if (trimmed.includes("\n## Operator notes\n")) {
    return `${trimmed}\n${note}\n`;
  }
  return `${trimmed}\n\n## Operator notes\n\n${note}\n`;
}

function formatRefactorNextActions(markdown) {
  const choices = extractRefactorCandidateChoices(markdown, 5);
  if (!choices.length) {
    return [
      "What do you want to do next?",
      "- Reply `regenerate with focus <area>` to narrow the graph scan.",
      "- Or name a file/module and I will start `grill-with-docs` against the plan before editing code.",
    ].join("\n");
  }

  const numbered = choices.map((choice, index) => `${index + 1}. \`${choice}\` — reply \`grill ${index + 1}\` to start \`grill-with-docs\`, or \`ignore ${index + 1}\` to skip it.`);
  return [
    "What do you want to do next?",
    ...numbered,
    "Reply `regenerate with focus <area>` to narrow the plan.",
    "If you reply `grill N`, I will use `grill-with-docs` on that candidate with this plan as evidence before editing code.",
  ].join("\n");
}

export function formatRefactorCommandMessage(result) {
  if (!result?.written) return result?.message ?? "No refactor plan was generated.";
  return [
    result.message,
    "",
    result.markdown?.trimEnd() ?? "_No refactor plan content available._",
    "",
    "---",
    "",
    formatRefactorNextActions(result.markdown),
  ].join("\n");
}

function helpText(paths = getUnderstandPaths()) {
  return `Understand-Anything bridge\n\n` +
    `Slash commands:\n` +
    `  /understand [path|flags]          Analyze the current project\n` +
    `  /understand dashboard            Open the dashboard\n` +
    `  /understand chat <question>       Ask about the graph\n` +
    `  /understand diff                  Analyze current changes\n` +
    `  /understand agent [output.md]     Write an agent-readable Markdown map\n` +
    `  /understand compare <a> <b> [out] Compare two folders with existing graphs\n` +
    `  /understand refactor [focus] [out] Generate a graph-based refactor plan\n` +
    `  /understand explain <target>      Explain a file/function\n` +
    `  /understand onboard               Generate onboarding guide\n` +
    `  /understand domain                Extract business domain graph\n` +
    `  /understand knowledge <wiki>      Analyze a knowledge base\n\n` +
    `Direct aliases also exist: /understand-dashboard, /understand-chat, /understand-diff, /understand-explain, /understand-onboard, /understand-domain, /understand-knowledge, /understand-compare, /understand-refactor.\n\n` +
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

function resolveFolderArg(cwd, folder) {
  const cleaned = folder.replace(/^@/, "");
  return isAbsolute(cleaned) ? cleaned : resolve(cwd, cleaned);
}

async function readGraphForFolder(folderPath) {
  const graphPath = resolve(folderPath, ".understand-anything", "knowledge-graph.json");
  return { graphPath, graph: JSON.parse(await readFile(graphPath, "utf8")) };
}

async function readRefactorPlan(ctx, output = "refactor-plan-understand-refactor.md") {
  const outputPath = isAbsolute(output) ? output : resolve(ctx.cwd, output);
  try {
    return { ok: true, outputPath, markdown: await readFile(outputPath, "utf8") };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ok: false, outputPath, message: `No Understand refactor plan found at ${outputPath}. Run /understand-refactor first, then /understand-refactor grill 1.` };
    }
    throw error;
  }
}

async function grillRefactorCandidate(pi, ctx, instruction) {
  const plan = await readRefactorPlan(ctx, instruction.output);
  if (!plan.ok) return { action: "grill", dispatched: false, message: plan.message };

  const resolved = resolveRefactorChoice(plan.markdown, instruction.index);
  if (!resolved.ok) return { action: "grill", dispatched: false, outputPath: plan.outputPath, message: resolved.message };

  const prompt = buildRefactorGrillPrompt({ candidate: resolved.candidate, outputPath: plan.outputPath, cwd: ctx.cwd });
  const dispatched = await sendBundledSkillInvocation(pi, ctx, "grill-with-docs", prompt);
  return {
    action: "grill",
    dispatched,
    outputPath: plan.outputPath,
    candidate: resolved.candidate,
    prompt,
    message: dispatched
      ? `Starting grill-with-docs for candidate ${instruction.index}: ${resolved.candidate}`
      : `grill-with-docs skill not found. Copy this prompt:\n\n${prompt}`,
  };
}

async function ignoreRefactorCandidate(ctx, instruction) {
  const plan = await readRefactorPlan(ctx, instruction.output);
  if (!plan.ok) return { action: "ignore", written: false, message: plan.message };

  const resolved = resolveRefactorChoice(plan.markdown, instruction.index);
  if (!resolved.ok) return { action: "ignore", written: false, outputPath: plan.outputPath, message: resolved.message };

  const markdown = appendRefactorIgnoreNote(plan.markdown, { index: instruction.index, candidate: resolved.candidate });
  await writeFile(plan.outputPath, markdown, "utf8");
  return {
    action: "ignore",
    written: true,
    outputPath: plan.outputPath,
    candidate: resolved.candidate,
    message: `Marked refactor candidate ${instruction.index} as ignored in ${plan.outputPath}: ${resolved.candidate}`,
  };
}

async function writeRefactorPlan(ctx, args) {
  const graphPath = resolve(ctx.cwd, ".understand-anything", "knowledge-graph.json");
  const parsed = parseRefactorArgs(args);
  const outputPath = isAbsolute(parsed.output) ? parsed.output : resolve(ctx.cwd, parsed.output);

  let graph;
  try {
    graph = JSON.parse(await readFile(graphPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        written: false,
        message: `No Understand-Anything graph found at ${graphPath}. Run /understand first, then /understand refactor.`,
      };
    }
    throw error;
  }

  let previousPlan = "";
  try {
    previousPlan = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const liveEvidence = await collectLiveRefactorEvidence(graph, { cwd: ctx.cwd, focus: parsed.focus });
  const markdown = generateRefactorMarkdown(graph, { cwd: ctx.cwd, graphPath, outputPath, focus: parsed.focus, liveEvidence, previousPlan });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return {
    written: true,
    outputPath,
    graphPath,
    focus: parsed.focus,
    liveEvidenceCount: Object.keys(liveEvidence).length,
    previousPlanRead: Boolean(previousPlan.trim()),
    markdown,
    message: `Wrote Understand-Anything refactor plan to ${outputPath}`,
  };
}

async function writeCompareMap(ctx, args) {
  const parsed = parseCompareArgs(args);
  if (!parsed.ok) return { written: false, message: parsed.message };

  const folderA = resolveFolderArg(ctx.cwd, parsed.folderA);
  const folderB = resolveFolderArg(ctx.cwd, parsed.folderB);
  const outputPath = isAbsolute(parsed.output) ? parsed.output : resolve(ctx.cwd, parsed.output);

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

function registerUnderstandCommand(pi, name, paths) {
  const description = name === "understand"
    ? "Run Understand-Anything analysis and related graph workflows"
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

      if (parsed.type === "compare") {
        const result = await writeCompareMap(ctx, parsed.args);
        await postMessage(pi, result.message, result);
        return;
      }

      if (parsed.type === "refactor") {
        const instruction = parseRefactorInstruction(parsed.args);
        if (instruction.type === "grill") {
          const result = await grillRefactorCandidate(pi, ctx, instruction);
          await postMessage(pi, result.message, result);
          return;
        }
        if (instruction.type === "ignore") {
          const result = await ignoreRefactorCandidate(ctx, instruction);
          await postMessage(pi, result.message, result);
          return;
        }
        const result = await writeRefactorPlan(ctx, instruction.args);
        await postMessage(pi, formatRefactorCommandMessage(result), result);
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
  registerUnderstandCommand(pi, "understand-compare", paths);
  registerUnderstandCommand(pi, "understand-refactor", paths);
  for (const name of SKILL_NAMES) {
    if (name !== "understand") registerUnderstandCommand(pi, name, paths);
  }
}
