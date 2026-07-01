import assert from "node:assert/strict";
import registerOnklaud from "../extensions/onklaud/index.js";
import {
  buildOnklaudObjective,
  DEFAULT_TOKEN_BUDGET,
  ONKLAUD_REPO_URL,
  onklaudCompletions,
  parseOnklaudArgs,
} from "../lib/onklaud/command.js";

const defaults = { tokenBudget: "700k", dryRun: false, help: false, yes: false, installDir: "", binDir: "", error: null };

assert.equal(DEFAULT_TOKEN_BUDGET, "700k");
assert.equal(ONKLAUD_REPO_URL, "https://github.com/KorroAi/onklaud-5.git");
assert.deepEqual(parseOnklaudArgs(""), { action: "run", task: "", autonomous: true, ...defaults });
assert.deepEqual(parseOnklaudArgs("status"), { action: "status", task: "", autonomous: false, ...defaults });
assert.deepEqual(parseOnklaudArgs("install --yes --dir ~/ok --bin-dir ~/.local/bin"), { action: "install", task: "", autonomous: false, ...defaults, yes: true, installDir: "~/ok", binDir: "~/.local/bin" });
assert.deepEqual(parseOnklaudArgs("--tokens 300k fix tests"), { action: "run", task: "fix tests", autonomous: false, ...defaults, tokenBudget: "300k" });
assert.deepEqual(parseOnklaudArgs("--dry-run improve this repo"), { action: "run", task: "improve this repo", autonomous: false, ...defaults, dryRun: true });
assert.equal(parseOnklaudArgs("--help").help, true);
assert.match(parseOnklaudArgs("--tokens 0 fix").error, /Token budget must be positive/);
assert.match(parseOnklaudArgs("--mode auto").error, /Unknown option: --mode/);
assert.deepEqual(onklaudCompletions("st"), [{ value: "status", label: "status" }]);

const explicit = buildOnklaudObjective("--tokens 500k fix auth bug");
assert.equal(explicit.action, "run");
assert.equal(explicit.task, "fix auth bug");
assert.match(explicit.goalCommand, /^\/goal --tokens 500k Use Onklaud 5 as an advisory council/);
assert.match(explicit.goalCommand, /Task: fix auth bug/);
assert.match(explicit.goalCommand, /onklaud status/);
assert.match(explicit.goalCommand, /onklaud loop --type code/);
assert.match(explicit.goalCommand, /Pi owns all file edits, tests, validation, commits, and pushes/);
assert.match(explicit.goalCommand, /Do not send secrets/);

const autonomous = buildOnklaudObjective("");
assert.equal(autonomous.autonomous, true);
assert.match(autonomous.goalCommand, /No task was provided/);
assert.match(autonomous.goalCommand, /Make major safe development progress autonomously/);
assert.match(autonomous.goalCommand, /codebase-map-understand\.md/);

const commands = new Map();
const sentMessages = [];
const notices = [];
const execCalls = [];
registerOnklaud({
  registerCommand: (name, definition) => commands.set(name, definition),
  sendUserMessage: (message) => sentMessages.push(message),
  exec: async (cmd, args, options) => {
    execCalls.push({ cmd, args, options });
    return { code: 0, stdout: cmd === "onklaud" ? "onklaud healthy" : "ok", stderr: "" };
  },
});
assert.equal(commands.has("onklaud"), true);
assert.deepEqual(commands.get("onklaud").getArgumentCompletions("st"), [{ value: "status", label: "status" }]);

await commands.get("onklaud").handler("--tokens 0 fix", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Token budget must be positive/);

await commands.get("onklaud").handler("status", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) }, signal: "signal" });
assert.deepEqual(execCalls.at(-1).args, ["status"]);
assert.equal(notices.at(-1).message, "onklaud healthy");

await commands.get("onklaud").handler("install --dry-run --dir /tmp/onklaud-test --bin-dir /tmp/bin", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.match(notices.at(-1).message, /DRY RUN:/);
assert.match(notices.at(-1).message, /https:\/\/github\.com\/KorroAi\/onklaud-5\.git/);
assert.match(notices.at(-1).message, /\/tmp\/onklaud-test/);

await commands.get("onklaud").handler("install --dir /tmp/onklaud-test", { hasUI: true, ui: { confirm: async () => false, notify: (message, level) => notices.push({ message, level }) } });
assert.match(notices.at(-1).message, /cancelled/);

await commands.get("onklaud").handler("--dry-run fix bug", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(sentMessages.length, 0);
assert.match(notices.at(-1).message, /^DRY RUN: \/goal --tokens 700k Use Onklaud 5/);

await commands.get("onklaud").handler("fix bug", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(sentMessages.length, 1);
assert.match(sentMessages[0], /^\/goal --tokens 700k Use Onklaud 5/);
assert.match(notices.at(-1).message, /Starting Onklaud-backed autonomous workflow/);

console.log("onklaud-extension-command ok");
