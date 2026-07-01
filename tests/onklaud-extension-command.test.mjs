import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerOnklaud from "../extensions/onklaud/index.js";
import {
  buildOnklaudObjective,
  DEFAULT_TOKEN_BUDGET,
  ONKLAUD_EXPLANATION,
  ONKLAUD_REPO_URL,
  onklaudCompletions,
  parseOnklaudArgs,
} from "../extensions/onklaud/command.js";

const defaults = { tokenBudget: "700k", dryRun: false, help: false, yes: false, installDir: "", binDir: "", error: null };

assert.equal(DEFAULT_TOKEN_BUDGET, "700k");
assert.equal(ONKLAUD_REPO_URL, "https://github.com/KorroAi/onklaud-5.git");
assert.deepEqual(parseOnklaudArgs(""), { action: "run", task: "", autonomous: true, ...defaults });
assert.deepEqual(parseOnklaudArgs("status"), { action: "status", task: "", autonomous: false, ...defaults });
assert.deepEqual(parseOnklaudArgs("explain"), { action: "explain", task: "", autonomous: false, ...defaults });
assert.deepEqual(parseOnklaudArgs("install --yes --dir ~/ok --bin-dir ~/.local/bin"), { action: "install", task: "", autonomous: false, ...defaults, yes: true, installDir: "~/ok", binDir: "~/.local/bin" });
assert.deepEqual(parseOnklaudArgs("--tokens 300k fix tests"), { action: "run", task: "fix tests", autonomous: false, ...defaults, tokenBudget: "300k" });
assert.deepEqual(parseOnklaudArgs("Autonomous pass SQLX_OFFLINE=true cargo test --quiet"), { action: "run", task: "Autonomous pass SQLX_OFFLINE=true cargo test --quiet", autonomous: false, ...defaults });
assert.deepEqual(parseOnklaudArgs("--tokens 300k fix cargo test --quiet"), { action: "run", task: "fix cargo test --quiet", autonomous: false, ...defaults, tokenBudget: "300k" });
assert.deepEqual(parseOnklaudArgs("--dry-run improve this repo"), { action: "run", task: "improve this repo", autonomous: false, ...defaults, dryRun: true });
assert.equal(parseOnklaudArgs("--help").help, true);
assert.match(ONKLAUD_EXPLANATION, /thin Pi extension/);
assert.match(ONKLAUD_EXPLANATION, /Pi owns edits/);
assert.match(parseOnklaudArgs("--tokens 0 fix").error, /Token budget must be positive/);
assert.match(parseOnklaudArgs("--yes").error, /Install options/);
assert.match(parseOnklaudArgs("--dir ~/ok fix").error, /Install options/);
assert.match(parseOnklaudArgs("--mode auto").error, /Unknown option: --mode/);
assert.deepEqual(onklaudCompletions("st"), [{ value: "status", label: "status" }]);
assert.deepEqual(onklaudCompletions("ex"), [{ value: "explain", label: "explain" }]);

const explicit = buildOnklaudObjective("--tokens 500k fix auth bug");
assert.equal(explicit.action, "run");
assert.equal(explicit.task, "fix auth bug");
assert.match(explicit.goalCommand, /^\/goal --tokens 500k Use Onklaud 5 as an advisory council/);
assert.match(explicit.goalCommand, /Task: fix auth bug/);
assert.match(explicit.goalCommand, /onklaud status/);
assert.match(explicit.goalCommand, /source-backed checkpoint brief/);
assert.match(explicit.goalCommand, /onklaud loop --type code/);
assert.match(explicit.goalCommand, /wrong language\/runtime/);
assert.match(explicit.goalCommand, /times out, or fails/);
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

await commands.get("onklaud").handler("explain", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.match(notices.at(-1).message, /thin Pi extension/);
assert.match(notices.at(-1).message, /Use it when/);

await commands.get("onklaud").handler("--help", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.match(notices.at(-1).message, /Usage:/);
assert.match(notices.at(-1).message, /thin Pi extension/);

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
assert.match(notices.at(-1).message, /queues a \/goal prompt/);
assert.match(notices.at(-1).message, /Pi still owns edits/);

const busyCommands = new Map();
const busySentMessages = [];
registerOnklaud({
  registerCommand: (name, definition) => busyCommands.set(name, definition),
  sendUserMessage: (message, options) => busySentMessages.push({ message, options }),
});
await busyCommands.get("onklaud").handler("fix busy", { isIdle: () => false, hasUI: true, ui: { notify: () => {} } });
assert.equal(busySentMessages.length, 1);
assert.equal(busySentMessages[0].options.deliverAs, "followUp");

const existingDir = await mkdtemp(join(tmpdir(), "onklaud-nonrepo-"));
await writeFile(join(existingDir, "keep.txt"), "not onklaud\n");
const installCommands = new Map();
registerOnklaud({
  registerCommand: (name, definition) => installCommands.set(name, definition),
  exec: async (cmd, args) => ({ code: cmd === "git" && args.includes("rev-parse") ? 1 : 0, stdout: "", stderr: "not a repo" }),
});
await installCommands.get("onklaud").handler(`install --yes --dir ${existingDir}`, { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /not a git repository/);
assert.match(notices.at(-1).message, /--dir <empty-dir>/);
await rm(existingDir, { recursive: true, force: true });

const sshOriginDir = await mkdtemp(join(tmpdir(), "onklaud-ssh-origin-"));
const sshOriginCommands = new Map();
const sshOriginExecs = [];
registerOnklaud({
  registerCommand: (name, definition) => sshOriginCommands.set(name, definition),
  exec: async (cmd, args) => {
    sshOriginExecs.push({ cmd, args });
    if (args.includes("rev-parse")) return { code: 0, stdout: "true\n", stderr: "" };
    if (args.includes("remote")) return { code: 0, stdout: "git@github.com:KorroAi/onklaud-5.git\n", stderr: "" };
    return { code: 0, stdout: "ok", stderr: "" };
  },
});
await sshOriginCommands.get("onklaud").handler(`install --yes --dir ${sshOriginDir} --bin-dir ${join(sshOriginDir, "bin")}`, { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "info");
assert.match(notices.at(-1).message, /Installed Onklaud 5/);
assert.ok(sshOriginExecs.some((call) => call.args.includes("pull")));
await rm(sshOriginDir, { recursive: true, force: true });

const failingStatusCommands = new Map();
registerOnklaud({
  registerCommand: (name, definition) => failingStatusCommands.set(name, definition),
  exec: async () => {
    throw new Error("not found");
  },
});
await failingStatusCommands.get("onklaud").handler("status", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Onklaud status failed: not found/);

console.log("onklaud-extension-command ok");
