import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAutoAgentArgs,
  buildSkillInvocation,
  buildUnderstandSkillArgs,
  generateAgentMapMarkdown,
  generateCompareMarkdown,
  getUnderstandPaths,
  handleRefactorCommand,
  normalizeAgentOutputArg,
  normalizeSkillArgs,
  parseAgentMapArgs,
  parseCompareArgs,
  parseUnderstandCommand,
  resolveContainedOutputPath as resolveContainedUnderstandOutputPath,
  splitFirstArg,
} from "../extensions/understand/index.js";
import {
  appendRefactorIgnoreNote,
  buildRefactorGrillPrompt,
  collectLiveRefactorEvidence,
  extractRefactorCandidateChoices,
  formatRefactorCommandMessage,
  generateRefactorMarkdown,
  parseRefactorArgs,
  parseRefactorInstruction,
  resolveContainedOutputPath as resolveContainedRefactorOutputPath,
  splitArgs,
  summarizePreviousRefactorPlan,
} from "../lib/understand/refactor-workflow.js";

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

assert.deepEqual(parseUnderstandCommand("understand", "refactor auth flow"), {
  type: "refactor",
  args: "auth flow",
});

assert.deepEqual(parseUnderstandCommand("understand-refactor", "auth flow plan.md"), {
  type: "refactor",
  args: "auth flow plan.md",
});

assert.deepEqual(splitArgs("'project a' \"project b\" out.md"), ["project a", "project b", "out.md"]);
assert.deepEqual(parseCompareArgs("@project-a @project-b"), {
  ok: true,
  folderA: "@project-a",
  folderB: "@project-b",
  output: "project-a-vs-project-b-understand-compare.md",
});

assert.deepEqual(parseRefactorArgs("auth flow plan.md"), {
  focus: "auth flow",
  output: "plan.md",
});
assert.deepEqual(parseRefactorArgs("most tangled part"), {
  focus: "most tangled part",
  output: "refactor-plan-understand-refactor.md",
});
assert.deepEqual(parseRefactorArgs("@internal/channels/telegram/."), {
  focus: "",
  output: "telegram-refactor-plan-understand-refactor.md",
  targetPath: "internal/channels/telegram",
});
assert.deepEqual(parseRefactorArgs("@internal/channels/telegram/. auth flow custom-plan.md"), {
  focus: "auth flow",
  output: "custom-plan.md",
  targetPath: "internal/channels/telegram",
});
assert.deepEqual(parseRefactorInstruction("grill 2 custom-plan.md"), {
  type: "grill",
  index: 2,
  output: "custom-plan.md",
});
assert.deepEqual(parseRefactorInstruction("ignore 3"), {
  type: "ignore",
  index: 3,
  output: "refactor-plan-understand-refactor.md",
});
assert.deepEqual(parseRefactorInstruction("regenerate with focus services state"), {
  type: "generate",
  args: "services state",
});

assert.equal(normalizeAgentOutputArg("@frontend"), "frontend-codebase-map-understand.md");
assert.equal(normalizeAgentOutputArg("@packages/api/"), "api-codebase-map-understand.md");
assert.equal(normalizeAgentOutputArg("@."), "codebase-map-understand.md");
assert.equal(normalizeAgentOutputArg("and codebase-map-understand.md"), "codebase-map-understand.md");
assert.deepEqual(parseAgentMapArgs("@packages/api custom.md"), {
  graphRootArg: "@packages/api",
  output: "custom.md",
});
assert.deepEqual(parseAgentMapArgs("@. custom.md"), {
  graphRootArg: "",
  output: "custom.md",
});
assert.equal(buildAutoAgentArgs("src/frontend --language zh"), "@src/frontend");
assert.equal(buildAutoAgentArgs("--full --language zh"), "");
assert.equal(buildAutoAgentArgs("src --no-agent-map"), "@src");
assert.equal(buildAutoAgentArgs("."), "");
assert.equal(buildAutoAgentArgs("./"), "");
assert.equal(normalizeSkillArgs("."), "");
assert.equal(normalizeSkillArgs("./ --language rust"), "--language rust");
assert.equal(buildUnderstandSkillArgs("", "/repo/tmux"), "/repo/tmux");
assert.equal(buildUnderstandSkillArgs("--full --language zh", "/repo/tmux"), "/repo/tmux --full --language zh");
assert.equal(buildUnderstandSkillArgs("src/frontend --language zh", "/repo/tmux"), "src/frontend --language zh");
assert.equal(buildUnderstandSkillArgs(". --language rust", "/repo/tmux"), "/repo/tmux --language rust");
assert.equal(resolveContainedUnderstandOutputPath("/repo", "reports/map.md"), "/repo/reports/map.md");
assert.throws(() => resolveContainedUnderstandOutputPath("/repo", "../outside.md"), /must stay inside/);
assert.throws(() => resolveContainedUnderstandOutputPath("/repo", "/tmp/outside.md"), /must stay inside/);
assert.equal(resolveContainedRefactorOutputPath("/repo", "plans/refactor.md"), "/repo/plans/refactor.md");
assert.throws(() => resolveContainedRefactorOutputPath("/repo", "../outside.md"), /must stay inside/);

const paths = getUnderstandPaths({ UA_DIR: "/tmp/ua", UA_REPO_URL: "git@example.com:ua.git", UA_REF: "abc123" }, "/home/example");
assert.equal(paths.repoDir, "/tmp/ua");
assert.equal(paths.repoUrl, "git@example.com:ua.git");
assert.equal(paths.repoRef, "abc123");
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
assert.match(invocation, /Treat `\.understand-anything\/\.understandignore` review confirmation as pre-approved/);
assert.match(invocation, /do not interpret `agent` as a target path/);
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

const refactorGraph = {
  project: {
    name: "Refactor Demo",
    description: "Demo project",
    analyzedAt: "2026-05-24T00:00:00.000Z",
    gitCommitHash: "abc123",
  },
  nodes: [
    { id: "file:src/auth.ts", type: "file", name: "src/auth.ts", filePath: "src/auth.ts", summary: "Auth orchestration with several branches", tags: ["auth"], complexity: "complex" },
    { id: "file:src/session.ts", type: "file", name: "src/session.ts", filePath: "src/session.ts", summary: "Session helper", tags: [], complexity: "moderate" },
  ],
  edges: [
    { source: "file:src/auth.ts", target: "file:src/session.ts", type: "depends_on", weight: 0.9 },
    { source: "file:src/session.ts", target: "file:src/auth.ts", type: "calls", weight: 0.7 },
  ],
  layers: [{ id: "auth", name: "Auth", description: "Authentication layer", nodeIds: ["file:src/auth.ts"] }],
  tour: [],
};
const fixtureRoot = await mkdtemp(join(tmpdir(), "understand-refactor-"));
await mkdir(join(fixtureRoot, "src"), { recursive: true });
await mkdir(join(fixtureRoot, "test"), { recursive: true });
await writeFile(join(fixtureRoot, "src", "auth.ts"), "import { session } from './session';\nexport function auth(input) {\n if (!input) return false;\n if (input.admin) return true;\n return session(input);\n}\n");
await writeFile(join(fixtureRoot, "test", "auth.test.ts"), "import { auth } from '../src/auth';\n");
const liveEvidence = await collectLiveRefactorEvidence(refactorGraph, { cwd: fixtureRoot, focus: "auth" });
assert.equal(liveEvidence["file:src/auth.ts"].exists, true);
assert.deepEqual(liveEvidence["file:src/auth.ts"].testPaths, ["test/auth.test.ts"]);
const previousPlan = "## Top recommendation\n\nStart with **old-auth** first.\n\n## Refactor slices\n\n1. Keep the auth seam.\n\n- [x] decision: ignore stale helper\n";
assert.match(summarizePreviousRefactorPlan(previousPlan), /Previous top recommendation: Start with \*\*old-auth\*\*/);
const refactorMarkdown = generateRefactorMarkdown(refactorGraph, { cwd: fixtureRoot, graphPath: join(fixtureRoot, ".understand-anything", "knowledge-graph.json"), outputPath: join(fixtureRoot, "refactor-plan-understand-refactor.md"), focus: "auth", liveEvidence, previousPlan });
assert.match(refactorMarkdown, /# Understand-Anything Refactor Plan/);
assert.match(refactorMarkdown, /Likely tangled hotspots/);
assert.match(refactorMarkdown, /src\/auth\.ts/);
assert.match(refactorMarkdown, /Previous plan continuity/);
assert.match(refactorMarkdown, /old-auth/);
assert.match(refactorMarkdown, /Live file confirmed/);
assert.match(refactorMarkdown, /test\/auth\.test\.ts/);
assert.match(refactorMarkdown, /\/understand-chat Use refactor-plan-understand-refactor\.md/);
assert.match(refactorMarkdown, /selected refactor candidate: <candidate>/);
assert.match(refactorMarkdown, /## Bug search checkpoints/);
assert.match(refactorMarkdown, /Before refactor/);
assert.match(refactorMarkdown, /During refactor/);
assert.match(refactorMarkdown, /After refactor/);
assert.deepEqual(extractRefactorCandidateChoices(refactorMarkdown, 2), ["src/auth.ts"]);

const refactorCommandMessage = formatRefactorCommandMessage({
  written: true,
  message: "Wrote Understand-Anything refactor plan to /tmp/refactor-plan-understand-refactor.md",
  markdown: refactorMarkdown,
});
assert.match(refactorCommandMessage, /# Understand-Anything Refactor Plan/);
assert.match(refactorCommandMessage, /Starting candidate 1 automatically with `grill-with-docs`/);
assert.match(refactorCommandMessage, /reply `grill 1`/);
assert.match(refactorCommandMessage, /`src\/auth\.ts`/);
assert.match(refactorCommandMessage, /regenerate with focus <area>/);

const grillPrompt = buildRefactorGrillPrompt({ candidate: "src/auth.ts", outputPath: join(fixtureRoot, "refactor-plan-understand-refactor.md"), cwd: fixtureRoot });
assert.match(grillPrompt, /Selected Understand Refactor candidate: `src\/auth\.ts`/);
assert.match(grillPrompt, /Next skill: `grill-with-docs`/);
assert.match(grillPrompt, /start the refactor workflow/);
assert.match(grillPrompt, /ask one question at a time/);
assert.match(grillPrompt, /choose the first safe validation-backed slice and begin it/);
assert.match(grillPrompt, /before, during, and after the refactor/);

const ignoredPlan = appendRefactorIgnoreNote(refactorMarkdown, { index: 1, candidate: "src/auth.ts" });
assert.match(ignoredPlan, /## Operator notes/);
assert.match(ignoredPlan, /Ignored candidate 1: `src\/auth\.ts`/);

const missingGraphRoot = await mkdtemp(join(tmpdir(), "understand-refactor-missing-"));
const fakePluginDir = join(missingGraphRoot, "understand-anything-plugin");
const fakeSkillsRoot = join(fakePluginDir, "skills");
await mkdir(join(fakeSkillsRoot, "understand"), { recursive: true });
await writeFile(join(fakeSkillsRoot, "understand", "SKILL.md"), "# Understand\n\nRun analysis.\n");
const fakePaths = {
  repoDir: missingGraphRoot,
  repoUrl: "https://example.test/ua.git",
  pluginDir: fakePluginDir,
  skillsRoot: fakeSkillsRoot,
  pluginLink: join(missingGraphRoot, "understand-plugin-link"),
};
function makePiRecorder() {
  const dispatchedUserMessages = [];
  const postedMessages = [];
  return {
    dispatchedUserMessages,
    postedMessages,
    pi: {
      sendMessage(message) { postedMessages.push(message); },
      sendUserMessage(content, options) { dispatchedUserMessages.push({ content, options }); },
    },
  };
}

{
  await mkdir(join(fixtureRoot, ".understand-anything"), { recursive: true });
  await writeFile(join(fixtureRoot, ".understand-anything", "knowledge-graph.json"), JSON.stringify(refactorGraph), "utf8");
  const recorder = makePiRecorder();
  const refactorResult = await handleRefactorCommand(
    recorder.pi,
    { cwd: fixtureRoot, isIdle: () => true, hasUI: false },
    fakePaths,
    "auth",
  );
  assert.equal(refactorResult.written, true);
  assert.equal(refactorResult.autoStartedRefactor, true);
  assert.equal(refactorResult.autoStartedCandidate, "src/auth.ts");
  assert.equal(recorder.postedMessages.length, 1);
  assert.match(recorder.postedMessages[0].content, /Starting candidate 1 automatically with `grill-with-docs`/);
  assert.equal(recorder.dispatchedUserMessages.length, 1);
  assert.match(recorder.dispatchedUserMessages[0].content, /<skill name="grill-with-docs"/);
  assert.match(recorder.dispatchedUserMessages[0].content, /Selected Understand Refactor candidate: `src\/auth\.ts`/);
  assert.match(recorder.dispatchedUserMessages[0].content, /start the refactor workflow/);
}

{
  const recorder = makePiRecorder();
  const refactorBootstrapResult = await handleRefactorCommand(
    recorder.pi,
    { cwd: missingGraphRoot, isIdle: () => true, hasUI: false },
    fakePaths,
    "auth flow custom-plan.md",
  );
  assert.equal(refactorBootstrapResult.needsGraphRefresh, true);
  assert.equal(refactorBootstrapResult.understandArgs, "");
  assert.equal(recorder.postedMessages.length, 1);
  assert.match(recorder.postedMessages[0].content, /Starting `\/understand` now/);
  assert.match(recorder.postedMessages[0].content, /\/understand-refactor auth flow custom-plan\.md/);
  assert.equal(recorder.dispatchedUserMessages.length, 1);
  assert.match(recorder.dispatchedUserMessages[0].content, /<skill name="understand"/);
  assert.match(recorder.dispatchedUserMessages[0].content, /Run analysis\./);
  assert.equal(recorder.dispatchedUserMessages[0].options, undefined);
}

{
  await mkdir(join(missingGraphRoot, "internal", "channels", "telegram"), { recursive: true });
  const recorder = makePiRecorder();
  const refactorBootstrapResult = await handleRefactorCommand(
    recorder.pi,
    { cwd: missingGraphRoot, isIdle: () => true, hasUI: false },
    fakePaths,
    "@internal/channels/telegram/. auth flow custom-plan.md",
  );
  assert.equal(refactorBootstrapResult.needsGraphRefresh, true);
  assert.equal(refactorBootstrapResult.understandArgs, "internal/channels/telegram");
  assert.equal(refactorBootstrapResult.graphPath, join(missingGraphRoot, "internal", "channels", "telegram", ".understand-anything", "knowledge-graph.json"));
  assert.match(recorder.postedMessages[0].content, /Starting `\/understand internal\/channels\/telegram` now/);
  assert.match(recorder.postedMessages[0].content, /folder-scoped graph/);
  assert.match(recorder.postedMessages[0].content, /\/understand-refactor @internal\/channels\/telegram\/\. auth flow custom-plan\.md/);
  assert.equal(recorder.dispatchedUserMessages.length, 1);
  assert.match(recorder.dispatchedUserMessages[0].content, /User: internal\/channels\/telegram$/);
}

console.log("understand-extension ok");
