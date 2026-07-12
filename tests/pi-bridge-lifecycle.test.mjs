import assert from "node:assert/strict";
import { commandOutput, createRepoBackedSkillBridge } from "../extensions/_shared/pi-bridge/lifecycle.js";

assert.equal(commandOutput({ stdout: "out\n", stderr: "err\n" }), "out\n\nerr");

let installed = false;
const afterEvents = [];
const execCalls = [];
const sentMessages = [];
const bridge = createRepoBackedSkillBridge({
  bridgeName: "Demo Bridge",
  isInstalled: async () => installed,
  afterInstallOrUpdate: async (_paths, event) => {
    afterEvents.push(event.action);
    installed = true;
  },
  installPromptTitle: "Install demo?",
  installPromptMessage: (paths) => `Clone ${paths.repoUrl} to ${paths.repoDir}?`,
  installCancelledMessage: "Demo install cancelled.",
  notInstalledMessage: (paths) => `Demo missing at ${paths.repoDir}`,
  buildInvocation: ({ skillPath, skillContent, args }) => `${skillPath}\n${skillContent}\nARGS:${args}`,
});

const paths = { repoDir: "/tmp/demo-repo", repoUrl: "https://example.test/demo.git" };
const pi = {
  async exec(command, args, options) {
    execCalls.push({ command, args, timeout: options.timeout });
    if (args.includes("rev-parse")) return { code: 0, stdout: "abc123\n", stderr: "" };
    return { code: 0, stdout: "ok\n", stderr: "" };
  },
  sendUserMessage(content, options) {
    sentMessages.push({ content, options });
  },
};
const ctx = { signal: undefined, hasUI: false, isIdle: () => true };

await bridge.ensureInstalled(pi, ctx, paths, { prompt: false });
assert.deepEqual(execCalls[0], {
  command: "git",
  args: ["clone", "--depth", "1", "https://example.test/demo.git", "/tmp/demo-repo"],
  timeout: 600_000,
});
assert.deepEqual(afterEvents, ["installed"]);

await bridge.update(pi, ctx, paths);
assert.deepEqual(execCalls[1].args, ["-C", "/tmp/demo-repo", "pull", "--ff-only"]);
assert.deepEqual(afterEvents, ["installed", "updated"]);

await bridge.update(pi, ctx, { ...paths, repoRef: "v1.2.3" });
assert.deepEqual(execCalls[2].args, ["-C", "/tmp/demo-repo", "fetch", "--depth", "1", "origin", "v1.2.3"]);
assert.deepEqual(execCalls[3].args, ["-C", "/tmp/demo-repo", "checkout", "--detach", "FETCH_HEAD"]);
assert.deepEqual(afterEvents, ["installed", "updated", "updated"]);

assert.equal(await bridge.checkoutHead(pi, ctx, paths), "abc123");
assert.deepEqual(execCalls[4].args, ["-C", "/tmp/demo-repo", "rev-parse", "--short", "HEAD"]);
assert.equal(execCalls[4].timeout, 30_000);

await bridge.sendSkillInvocation(pi, ctx, paths, {
  skillPath: "/tmp/demo-repo/skill.md",
  skillContent: "# Demo Skill",
  args: "run it",
});
assert.deepEqual(afterEvents, ["installed", "updated", "updated", "present"]);
assert.deepEqual(sentMessages, [{
  content: "/tmp/demo-repo/skill.md\n# Demo Skill\nARGS:run it",
  options: { deliverAs: "followUp" },
}]);

console.log("pi-bridge-lifecycle ok");
