import assert from "node:assert/strict";
import {
  buildSkillInvocation,
  formatGraphifyInstallMessage,
  getGraphifyPaths,
  isHelpArg,
  parseBridgeCommand,
  splitBridgeArgs,
} from "../extensions/graphify.js";

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
assert.match(invocation, /# \/graphify/);
assert.match(invocation, /User: \/graphify \. --no-viz/);

const installMessage = formatGraphifyInstallMessage("installed", getGraphifyPaths({}, "/home/alice"), "installed at .git/hooks/post-commit");
assert.match(installMessage, /Graphify installed at \/home\/alice\/\.graphify\/repo\./);
assert.match(installMessage, /Hook install: installed at \.git\/hooks\/post-commit/);
assert.match(installMessage, /Use \/graphify \. to build a graph\./);

console.log("graphify-extension ok");
