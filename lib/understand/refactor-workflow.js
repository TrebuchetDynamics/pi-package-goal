import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { popTrailingToken, splitCommandArgs } from "../pi-bridge/command-grammar.js";

export { splitCommandArgs as splitArgs } from "../pi-bridge/command-grammar.js";

function normalizeFolderToken(folder) {
  const withoutAt = String(folder ?? "").replace(/^@/, "").trim();
  const withoutDotSuffix = withoutAt.replace(/[\\/]\.$/, "");
  const cleaned = withoutDotSuffix.replace(/[\\/]+$/, "");
  return cleaned || withoutAt || "project";
}

function folderBasename(folder) {
  return basename(normalizeFolderToken(folder)) || "project";
}

function truncateText(value, maxLength = 220) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function tableRow(values) {
  return `| ${values.map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
}

function edgeLine(edge, byId) {
  const source = byId.get(edge.source)?.name ?? edge.source;
  const target = byId.get(edge.target)?.name ?? edge.target;
  const description = edge.description ? ` — ${truncateText(edge.description, 180)}` : "";
  return `- **${source}** --${edge.type ?? "related"}→ **${target}**${description}`;
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

function isPathInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveContainedOutputPath(cwd, outputArg) {
  const outputPath = isAbsolute(outputArg) ? resolve(outputArg) : resolve(cwd, outputArg);
  if (!isPathInside(resolve(cwd), outputPath)) {
    throw new Error(`Understand refactor output path must stay inside the current repo: ${outputArg}`);
  }
  return outputPath;
}

function resolveFolderArg(cwd, folder) {
  const cleaned = folder.replace(/^@/, "");
  return isAbsolute(cleaned) ? cleaned : resolve(cwd, cleaned);
}

export function parseRefactorArgs(args = "") {
  const { tokens, token: outputToken } = popTrailingToken(splitCommandArgs(args), (token) => /\.md$/i.test(token));
  const targetIndex = tokens.findIndex((token) => token.startsWith("@"));
  const targetPath = targetIndex === -1 ? undefined : normalizeFolderToken(tokens.splice(targetIndex, 1)[0]);
  const result = {
    focus: tokens.join(" ").trim(),
    output: outputToken || (targetPath ? `${folderBasename(targetPath)}-refactor-plan-understand-refactor.md` : "refactor-plan-understand-refactor.md"),
  };
  if (targetPath) result.targetPath = targetPath;
  return result;
}

export function parseRefactorInstruction(args = "") {
  const tokens = splitCommandArgs(args);
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

export function buildRefactorMissingGraphMessage({ graphPath, refactorArgs = "", understandArgs = "" } = {}) {
  const trimmedArgs = String(refactorArgs ?? "").trim();
  const trimmedUnderstandArgs = String(understandArgs ?? "").trim();
  const understandCommand = trimmedUnderstandArgs ? `/understand ${trimmedUnderstandArgs}` : "/understand";
  const rerunCommand = trimmedArgs ? `/understand-refactor ${trimmedArgs}` : "/understand-refactor";
  return [
    `No Understand-Anything graph found at ${graphPath}.`,
    `Starting \`${understandCommand}\` now to build ${trimmedUnderstandArgs ? "the folder-scoped graph" : "the graph"} directly.`,
    `After /understand saves the graph, rerun \`${rerunCommand}\` to generate the refactor plan.`,
  ].join(" ");
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
  const chatPrompt = `Use ${outputRel}, the previous-plan continuity section, the current Understand graph, and the live file/test evidence to grill the selected refactor candidate: <candidate>. Stress-test domain terms, bug risks before/during/after the refactor, tests, and small validation-backed slices before editing code. Focus: ${focusText}.`;

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
    "2. **Pre-refactor bug search** — inspect existing behavior, TODO/FIXME/error paths, callers, and current tests for likely bugs before changing code; turn confirmed bugs into focused regression tests or explicit bug notes.",
    "3. **Add or tighten behavior tests** — lock observable behavior through the public interface before moving code; create a focused test if no related test was found.",
    "4. **Deepen the module** — move repeated orchestration or branching behind one smaller interface; avoid new pass-through wrappers.",
    "5. **During-refactor bug search** — after each small move, compare behavior against the baseline, run focused validation, and stop to diagnose any new or suspicious failure before continuing.",
    "6. **Delete replaced shallow paths** — remove tests or modules that only exercise implementation details after the deeper interface is covered.",
    "7. **Post-refactor bug search** — rerun baseline and focused validation, inspect the diff for accidental behavior changes, and add regressions for any bug found before broad validation.",
    "",
    "## Bug search checkpoints",
    "",
    "- **Before refactor:** establish a baseline, inspect known-risk branches and error paths, search nearby TODO/FIXME notes, and document any suspected existing bugs separately from refactor intent.",
    "- **During refactor:** keep changes small, run focused validation after each slice, compare outputs against baseline behavior, and diagnose suspicious failures immediately instead of batching them.",
    "- **After refactor:** rerun the baseline plus focused/broad validation, review public behavior changes in the diff, and create regression tests or bug notes for anything discovered.",
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
    "Success signal: a docs-backed, testable refactor slice with bug-search checkpoints or an explicit decision to ignore this candidate.",
    "",
    `Use \`${outputRel}\`, the current repository docs, tests, and live code to start the refactor workflow for candidate \`${candidate}\` now. Explicitly search for bugs before, during, and after the refactor. If an owner decision, missing requirement, or steer-direction gap blocks safe progress, ask one question at a time and provide your recommended answer. If there is no blocker, choose the first safe validation-backed slice and begin it.`,
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

  const numbered = choices.map((choice, index) => `${index + 1}. \`${choice}\` — ${index === 0 ? "starting automatically with `grill-with-docs`; " : ""}reply \`grill ${index + 1}\` to switch/start here, or \`ignore ${index + 1}\` to skip it.`);
  return [
    "Starting candidate 1 automatically with `grill-with-docs` so the refactor workflow can begin immediately.",
    ...numbered,
    "Reply `regenerate with focus <area>` to narrow the plan.",
    "Use steering replies to redirect the active `grill-with-docs` refactor run if it chooses the wrong slice or needs owner input.",
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


export async function readRefactorPlan(ctx, output = "refactor-plan-understand-refactor.md") {
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

export async function grillRefactorCandidate(pi, ctx, instruction, sendBundledSkillInvocation) {
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

export async function ignoreRefactorCandidate(ctx, instruction) {
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

export async function writeRefactorPlan(ctx, args) {
  const parsed = parseRefactorArgs(args);
  const projectRoot = parsed.targetPath ? resolveFolderArg(ctx.cwd, parsed.targetPath) : ctx.cwd;
  const graphPath = resolve(projectRoot, ".understand-anything", "knowledge-graph.json");
  const outputPath = resolveContainedOutputPath(ctx.cwd, parsed.output);

  let graph;
  try {
    graph = JSON.parse(await readFile(graphPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        written: false,
        needsGraphRefresh: true,
        graphPath,
        outputPath,
        projectRoot,
        targetPath: parsed.targetPath,
        focus: parsed.focus,
        refactorArgs: args.trim(),
        understandArgs: parsed.targetPath ?? "",
        message: buildRefactorMissingGraphMessage({ graphPath, refactorArgs: args, understandArgs: parsed.targetPath }),
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

  const liveEvidence = await collectLiveRefactorEvidence(graph, { cwd: projectRoot, focus: parsed.focus });
  const markdown = generateRefactorMarkdown(graph, { cwd: ctx.cwd, graphPath, outputPath, focus: parsed.focus, liveEvidence, previousPlan });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return {
    written: true,
    outputPath,
    graphPath,
    projectRoot,
    targetPath: parsed.targetPath,
    focus: parsed.focus,
    liveEvidenceCount: Object.keys(liveEvidence).length,
    previousPlanRead: Boolean(previousPlan.trim()),
    markdown,
    message: `Wrote Understand-Anything refactor plan to ${outputPath}`,
  };
}
