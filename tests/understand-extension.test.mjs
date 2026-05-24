import assert from "node:assert/strict";
import { buildSkillInvocation, generateAgentMapMarkdown, getUnderstandPaths, normalizeAgentOutputArg, parseUnderstandCommand, splitFirstArg } from "../extensions/understand.js";

assert.deepEqual(splitFirstArg(" chat how does auth work? "), {
  first: "chat",
  rest: "how does auth work?",
});

assert.deepEqual(parseUnderstandCommand("understand", "src/frontend --language zh"), {
  type: "skill",
  skillName: "understand",
  args: "src/frontend --language zh",
});

assert.deepEqual(parseUnderstandCommand("understand", "chat how does payment work?"), {
  type: "skill",
  skillName: "understand-chat",
  args: "how does payment work?",
});

assert.deepEqual(parseUnderstandCommand("understand-dashboard", ""), {
  type: "skill",
  skillName: "understand-dashboard",
  args: "",
});

assert.deepEqual(parseUnderstandCommand("understand", "update"), {
  type: "update",
  args: "",
});

assert.deepEqual(parseUnderstandCommand("understand", "agent and codebase-map-understand.md"), {
  type: "agent",
  args: "and codebase-map-understand.md",
});

assert.equal(normalizeAgentOutputArg("@frontend"), "frontend-codebase-map-understand.md");
assert.equal(normalizeAgentOutputArg("@packages/api/"), "api-codebase-map-understand.md");
assert.equal(normalizeAgentOutputArg("and codebase-map-understand.md"), "codebase-map-understand.md");

const paths = getUnderstandPaths({ UA_DIR: "/tmp/ua", UA_REPO_URL: "git@example.com:ua.git" }, "/home/example");
assert.equal(paths.repoDir, "/tmp/ua");
assert.equal(paths.repoUrl, "git@example.com:ua.git");
assert.equal(paths.skillsRoot, "/tmp/ua/understand-anything-plugin/skills");
assert.equal(paths.pluginLink, "/home/example/.understand-anything-plugin");

const invocation = buildSkillInvocation({
  skillName: "understand",
  skillPath: "/tmp/ua/understand-anything-plugin/skills/understand/SKILL.md",
  skillContent: "---\nname: understand\n---\n\n# Understand\n",
  args: "src",
});
assert.match(invocation, /^<skill name="understand" location="\/tmp\/ua\/understand-anything-plugin\/skills\/understand\/SKILL\.md">/);
assert.match(invocation, /References are relative to \/tmp\/ua\/understand-anything-plugin\/skills\/understand\./);
assert.match(invocation, /User: src$/);

const markdown = generateAgentMapMarkdown({
  version: "1",
  project: {
    name: "Demo",
    description: "Demo project",
    languages: ["TypeScript"],
    frameworks: ["Pi"],
    analyzedAt: "2026-05-24T00:00:00.000Z",
    gitCommitHash: "abc123",
  },
  nodes: [
    { id: "file:src/index.ts", type: "file", name: "src/index.ts", filePath: "src/index.ts", summary: "Main entrypoint", tags: ["entry"], complexity: "simple" },
    { id: "function:start", type: "function", name: "start", filePath: "src/index.ts", lineRange: [1, 10], summary: "Starts the app", tags: [], complexity: "complex" },
  ],
  edges: [
    { source: "file:src/index.ts", target: "function:start", type: "contains", direction: "forward", weight: 1 },
  ],
  layers: [{ id: "app", name: "App", description: "Application layer", nodeIds: ["file:src/index.ts"] }],
  tour: [{ order: 1, title: "Start", description: "Read the entrypoint", nodeIds: ["file:src/index.ts"] }],
}, { cwd: "/repo", graphPath: "/repo/.understand-anything/knowledge-graph.json", outputPath: "/repo/codebase-map-understand.md" });
assert.match(markdown, /# Codebase Map from Understand-Anything/);
assert.match(markdown, /Demo project/);
assert.match(markdown, /codebase-map-understand\.md/);
assert.match(markdown, /Most important \/ complex nodes/);

console.log("understand-extension ok");
