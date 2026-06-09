import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendGraphifyUpdateArg,
  applyAutomaticGraphifyUpdate,
  buildSkillInvocation,
  createGraphifyIgnore,
  getAutomaticUpdateTarget,
  formatGraphifyIgnoreMessage,
  formatGraphifyInstallMessage,
  getGraphifyPaths,
  graphifyIgnoreTemplate,
  isGraphifyCliFastPath,
  isGraphifyAstOnlyBuildArgs,
  isExplicitSemanticGraphifyArgs,
  buildGraphifyAstOnlyUpdateArgs,
  isHelpArg,
  parseGraphifyCliArgs,
  runGraphifyAstOnlyBuild,
  runGraphifyCliFastPath,
  shouldSkipAutomaticGraphifyUpdate,
  parseBridgeCommand,
  splitBridgeArgs,
} from "../extensions/graphify/index.js";

assert.deepEqual(getGraphifyPaths({}, "/home/alice"), {
  repoDir: "/home/alice/.graphify/repo",
  repoUrl: "https://github.com/safishamsi/graphify.git",
  skillPath: "/home/alice/.graphify/repo/graphify/skill-pi.md",
});

assert.deepEqual(getGraphifyPaths({ GRAPHIFY_DIR: "/tmp/graphify", GRAPHIFY_REPO_URL: "https://example.test/g.git" }, "/home/alice"), {
  repoDir: "/tmp/graphify",
  repoUrl: "https://example.test/g.git",
  skillPath: "/tmp/graphify/graphify/skill-pi.md",
});

assert.deepEqual(splitBridgeArgs("install now"), { first: "install", rest: "now" });
assert.deepEqual(splitBridgeArgs(""), { first: "", rest: "" });

assert.deepEqual(parseBridgeCommand("install"), { action: "install", args: "" });
assert.deepEqual(parseBridgeCommand("ignore"), { action: "ignore", args: "" });
assert.deepEqual(parseBridgeCommand("ignore src-only"), { action: "ignore", args: "src-only" });
assert.deepEqual(parseBridgeCommand("status"), { action: "status", args: "" });
assert.deepEqual(parseBridgeCommand("update"), { action: "update", args: "" });
assert.deepEqual(parseBridgeCommand("help"), { action: "help", args: "" });
assert.deepEqual(parseBridgeCommand("unknown args"), { action: "help", args: "unknown args" });

assert.equal(isHelpArg("help"), true);
assert.equal(isHelpArg("--help"), true);
assert.equal(isHelpArg("-h"), true);
assert.equal(isHelpArg("."), false);

const invocation = buildSkillInvocation({
  skillPath: "/home/alice/.graphify/repo/graphify/skill-pi.md",
  skillContent: "---\nname: graphify\n---\n\n# /graphify\n",
  args: ". --no-viz",
});
assert.match(invocation, /<skill name="graphify" location="\/home\/alice\/\.graphify\/repo\/graphify\/skill-pi\.md">/);
assert.match(invocation, /User invoked \/graphify \. --no-viz/);
assert.match(invocation, /default graph builds and updates in Pi are pure AST\/local\/no-LLM/);
assert.match(invocation, /do not run semantic extraction/);
assert.match(invocation, /do not ask for or suggest API keys/);
assert.match(invocation, /Only use semantic\/LLM extraction when the user explicitly asks/);
assert.match(invocation, /ensure Graphify's git hooks are active/);
assert.match(invocation, /graphify hook install after graphifyy is available/);
assert.match(invocation, /large corpus and lists top first-level subdirectories/);
assert.match(invocation, /Automatically continue with the listed top subdirectories as a multi-path run/);
assert.match(invocation, /# \/graphify/);
assert.match(invocation, /User: \/graphify \. --no-viz/);

const installMessage = formatGraphifyInstallMessage("installed", getGraphifyPaths({}, "/home/alice"), "installed at .git/hooks/post-commit");
assert.match(installMessage, /Graphify installed at \/home\/alice\/\.graphify\/repo\./);
assert.match(installMessage, /Hook install: installed at \.git\/hooks\/post-commit/);
assert.match(installMessage, /Use \/graphify \. to build a graph\./);

const defaultIgnore = graphifyIgnoreTemplate();
assert.match(defaultIgnore, /\.graphifyignore uses \.gitignore syntax/);
assert.match(defaultIgnore, /node_modules\//);
assert.match(defaultIgnore, /dist\//);
assert.match(defaultIgnore, /\*\.generated\.py/);
assert.match(defaultIgnore, /# \*/);
assert.match(defaultIgnore, /# !src\/\*\*/);

const srcOnlyIgnore = graphifyIgnoreTemplate("src-only");
assert.match(srcOnlyIgnore, /^\*/m);
assert.match(srcOnlyIgnore, /^!src\/$/m);
assert.match(srcOnlyIgnore, /^!src\/\*\*$/m);
assert.doesNotMatch(srcOnlyIgnore, /^# \*/m);

assert.match(formatGraphifyIgnoreMessage("/repo/.graphifyignore", "created"), /Created \/repo\/\.graphifyignore/);
assert.match(formatGraphifyIgnoreMessage("/repo/.graphifyignore", "exists"), /already exists/);

assert.equal(shouldSkipAutomaticGraphifyUpdate("query \"How?\""), true);
assert.equal(shouldSkipAutomaticGraphifyUpdate("path A B"), true);
assert.equal(shouldSkipAutomaticGraphifyUpdate(". --update"), true);
assert.equal(shouldSkipAutomaticGraphifyUpdate("."), false);
assert.equal(getAutomaticUpdateTarget("", "/repo"), "/repo");
assert.equal(getAutomaticUpdateTarget("--mode deep", "/repo"), "/repo");
assert.equal(getAutomaticUpdateTarget("src --no-viz", "/repo"), "/repo/src");
assert.equal(getAutomaticUpdateTarget("https://github.com/a/b", "/repo"), undefined);
assert.equal(appendGraphifyUpdateArg(""), ". --update");
assert.equal(appendGraphifyUpdateArg(". --mode deep"), ". --mode deep --update");
assert.deepEqual(parseGraphifyCliArgs("query \"How does auth work?\""), ["query", "How does auth work?"]);
assert.deepEqual(parseGraphifyCliArgs("path AuthModule Database"), ["path", "AuthModule", "Database"]);
assert.deepEqual(parseGraphifyCliArgs("explain 'Graphify Extension'"), ["explain", "Graphify Extension"]);
assert.throws(() => parseGraphifyCliArgs("query \"oops"), /Unclosed quote/);
assert.equal(isGraphifyCliFastPath("query test"), true);
assert.equal(isGraphifyCliFastPath("path A B"), true);
assert.equal(isGraphifyCliFastPath("explain A"), true);
assert.equal(isGraphifyCliFastPath("add https://example.test"), false);
assert.equal(isGraphifyCliFastPath("."), false);
assert.equal(isExplicitSemanticGraphifyArgs("."), false);
assert.equal(isExplicitSemanticGraphifyArgs(". --mode deep"), true);
assert.equal(isExplicitSemanticGraphifyArgs(". --backend ollama"), true);
assert.equal(isExplicitSemanticGraphifyArgs(". --wiki"), true);
assert.equal(isGraphifyAstOnlyBuildArgs(""), true);
assert.equal(isGraphifyAstOnlyBuildArgs("."), true);
assert.equal(isGraphifyAstOnlyBuildArgs("src --update --no-viz"), true);
assert.equal(isGraphifyAstOnlyBuildArgs(". --mode deep"), false);
assert.equal(isGraphifyAstOnlyBuildArgs("query test"), false);
assert.equal(isGraphifyAstOnlyBuildArgs("https://github.com/a/b"), false);
assert.deepEqual(buildGraphifyAstOnlyUpdateArgs(""), ["GRAPHIFY_NO_TIPS=1", "graphify", "update", ".", "--force"]);
assert.deepEqual(buildGraphifyAstOnlyUpdateArgs("src --update --no-cluster"), ["GRAPHIFY_NO_TIPS=1", "graphify", "update", "src", "--force", "--no-cluster"]);

const tmp = await mkdtemp(join(tmpdir(), "graphify-ignore-"));
try {
  const created = await createGraphifyIgnore({ cwd: tmp }, "src-only");
  assert.equal(created.action, "created");
  assert.equal(created.filePath, join(tmp, ".graphifyignore"));
  assert.equal(await readFile(created.filePath, "utf8"), graphifyIgnoreTemplate("src-only"));

  const exists = await createGraphifyIgnore({ cwd: tmp }, "default");
  assert.equal(exists.action, "exists");
  assert.equal(await readFile(created.filePath, "utf8"), graphifyIgnoreTemplate("src-only"));

  const autoNoGraph = await applyAutomaticGraphifyUpdate(".", tmp, async () => false);
  assert.deepEqual(autoNoGraph, { args: ".", changed: false, target: tmp });

  const autoGraph = await applyAutomaticGraphifyUpdate(".", tmp, async (path) => path.endsWith("graphify-out/graph.json"));
  assert.deepEqual(autoGraph, { args: ". --update", changed: true, target: tmp });

  const autoSubdirWithRepoGraph = await applyAutomaticGraphifyUpdate("src", tmp, async (path) => path === join(tmp, "graphify-out", "graph.json"));
  assert.deepEqual(autoSubdirWithRepoGraph, { args: "src --update", changed: true, target: join(tmp, "src") });

  const autoQuery = await applyAutomaticGraphifyUpdate("query test", tmp, async () => true);
  assert.deepEqual(autoQuery, { args: "query test", changed: false, target: undefined });

  const sentMessages = [];
  const execCalls = [];
  await runGraphifyCliFastPath({
    async exec(command, args, options) {
      execCalls.push({ command, args, options });
      return { code: 0, stdout: "answer", stderr: "" };
    },
    sendMessage(message) {
      sentMessages.push(message);
    },
  }, { signal: "signal" }, "query \"How?\"");
  assert.deepEqual(execCalls, [{ command: "graphify", args: ["query", "How?"], options: { signal: "signal", timeout: 120_000 } }]);
  assert.equal(sentMessages[0].content, "answer");
  assert.deepEqual(sentMessages[0].details, { action: "query", args: ["How?"], exitCode: 0 });

  const astOnlyMessages = [];
  const astOnlyExecCalls = [];
  await runGraphifyAstOnlyBuild({
    async exec(command, args, options) {
      astOnlyExecCalls.push({ command, args, options });
      if (command === "graphify") return { code: 0, stdout: "hooks installed", stderr: "" };
      return { code: 0, stdout: "ast updated", stderr: "" };
    },
    sendMessage(message) {
      astOnlyMessages.push(message);
    },
  }, { signal: "signal" }, "src --update");
  assert.deepEqual(astOnlyExecCalls, [
    { command: "graphify", args: ["hook", "install"], options: { signal: "signal", timeout: 120_000 } },
    {
      command: "env",
      args: ["GRAPHIFY_NO_TIPS=1", "graphify", "update", "src", "--force"],
      options: { signal: "signal", timeout: 300_000 },
    },
  ]);
  assert.equal(astOnlyMessages[0].content, "ast updated");
  assert.deepEqual(astOnlyMessages[0].details, { action: "update", mode: "ast-only", args: ["src", "--force"], exitCode: 0 });

  await assert.rejects(
    () => runGraphifyCliFastPath({
      async exec() {
        return { code: 1, stdout: "", stderr: "bad query" };
      },
      sendMessage() {
        throw new Error("should not send on failure");
      },
    }, {}, "query bad"),
    /bad query/,
  );
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log("graphify-extension ok");
