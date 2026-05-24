import assert from "node:assert/strict";
import {
  buildSkillInvocation,
  generateAgentMapMarkdown,
  generateCompareMarkdown,
  getUnderstandPaths,
  normalizeAgentOutputArg,
  parseCompareArgs,
  parseUnderstandCommand,
  splitArgs,
  splitFirstArg,
} from "../extensions/understand.js";

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

assert.deepEqual(parseUnderstandCommand("understand", "compare @project-a @project-b"), {
  type: "compare",
  args: "@project-a @project-b",
});

assert.deepEqual(parseUnderstandCommand("understand-compare", "@project-a @project-b"), {
  type: "compare",
  args: "@project-a @project-b",
});

assert.deepEqual(splitArgs("'project a' \"project b\" out.md"), ["project a", "project b", "out.md"]);
assert.deepEqual(parseCompareArgs("@project-a @project-b"), {
  ok: true,
  folderA: "@project-a",
  folderB: "@project-b",
  output: "project-a-vs-project-b-understand-compare.md",
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

const compareMarkdown = generateCompareMarkdown({
  project: {
    name: "Source",
    description: "Source project",
    languages: ["TypeScript"],
    frameworks: ["Pi"],
  },
  nodes: [
    { id: "file:src/index.ts", type: "file", name: "src/index.ts", filePath: "src/index.ts", summary: "Main entrypoint", tags: ["entry"], complexity: "complex" },
  ],
  edges: [{ source: "file:src/index.ts", target: "file:src/index.ts", type: "routes", weight: 0.7 }],
  layers: [{ id: "app", name: "App", description: "Application layer", nodeIds: ["file:src/index.ts"] }],
  tour: [],
}, {
  project: {
    name: "Target",
    description: "Target project",
    languages: ["Python"],
    frameworks: ["FastAPI"],
  },
  nodes: [
    { id: "file:app.py", type: "file", name: "app.py", filePath: "app.py", summary: "App entrypoint", tags: ["entry"], complexity: "moderate" },
  ],
  edges: [{ source: "file:app.py", target: "file:app.py", type: "routes", weight: 0.7 }],
  layers: [{ id: "api", name: "API", description: "API layer", nodeIds: ["file:app.py"] }],
  tour: [],
}, { cwd: "/repo", folderA: "/repo/source", folderB: "/repo/target", outputPath: "/repo/source-vs-target-understand-compare.md" });
assert.match(compareMarkdown, /Understand-Anything Compare: Source vs Target/);
assert.match(compareMarkdown, /Patterns to borrow from Source/);
assert.match(compareMarkdown, /source-vs-target-understand-compare\.md/);

console.log("understand-extension ok");
