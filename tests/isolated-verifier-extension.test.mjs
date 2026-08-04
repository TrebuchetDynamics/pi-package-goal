import assert from "node:assert/strict";
import isolatedVerifier, {
  buildVerifierArgs,
  parseVerifierOutput,
} from "../extensions/isolated-verifier/index.js";

const args = buildVerifierArgs({
  contract: "Verify package resources and cite evidence.",
  model: { provider: "openai", id: "gpt-test" },
  thinkingLevel: "low",
});
assert.ok(args.includes("--no-extensions"));
assert.ok(args.includes("--no-skills"));
assert.deepEqual(
  args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2),
  ["--tools", "read,grep,find,ls"],
);
assert.equal(args.includes("bash"), false);
assert.equal(args.includes("edit"), false);
assert.equal(args.includes("write"), false);

const parsed = parseVerifierOutput(
  [
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", name: "read" }],
        usage: { input: 5, output: 2, cost: { total: 0.0005 } },
      },
    },
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "VERDICT: pass — package manifest matches." },
        ],
        usage: { input: 12, output: 8, cost: { total: 0.001 } },
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n"),
);
assert.equal(parsed.text, "VERDICT: pass — package manifest matches.");
assert.equal(parsed.usage.input, 17);
assert.equal(parsed.usage.cost.total, 0.0015);

const commands = new Map();
const sent = [];
const notices = [];
const execCalls = [];
const pi = {
  exec: async (command, commandArgs, options) => {
    execCalls.push({ command, commandArgs, options });
    return {
      code: 0,
      stderr: "",
      stdout: `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "VERDICT: pass" }],
          usage: { input: 1, output: 1, cost: { total: 0.0001 } },
        },
      })}\n`,
    };
  },
  registerCommand(name, options) {
    commands.set(name, options);
  },
  sendMessage(message) {
    sent.push(message);
  },
};
const ctx = {
  cwd: "/tmp/project",
  model: { provider: "openai", id: "gpt-test" },
  thinkingLevel: "low",
  ui: {
    notify(message, level) {
      notices.push({ message, level });
    },
  },
};

isolatedVerifier(pi);
assert.ok(commands.has("verify-isolated"));
await commands.get("verify-isolated").handler("", ctx);
assert.equal(execCalls.length, 0, "missing contract must not spend");
await commands.get("verify-isolated").handler("verify package resources", ctx);
assert.equal(execCalls.length, 1);
assert.equal(execCalls[0].command, "pi");
assert.equal(execCalls[0].options.cwd, ctx.cwd);
assert.equal(sent.at(-1).customType, "pi-isolated-verifier");
assert.match(sent.at(-1).content, /VERDICT: pass/);
assert.match(notices[0].message, /Usage:/);

console.log("isolated-verifier-extension ok");
