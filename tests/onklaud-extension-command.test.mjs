import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
assert.deepEqual(parseOnklaudArgs('gate --domain coding --text "hello world" --json'), { action: "gate", task: "--domain coding --text hello world --json", autonomous: false, ...defaults, passThroughArgs: ["--domain", "coding", "--text", "hello world", "--json"] });
assert.deepEqual(parseOnklaudArgs('ponytail --task "read JSON" --json'), { action: "ponytail", task: "--task read JSON --json", autonomous: false, ...defaults, passThroughArgs: ["--task", "read JSON", "--json"] });
assert.deepEqual(parseOnklaudArgs('pre-check --task "retry logic" --json'), { action: "pre-check", task: "--task retry logic --json", autonomous: false, ...defaults, passThroughArgs: ["--task", "retry logic", "--json"] });
assert.deepEqual(parseOnklaudArgs("fast-gate --syntax-only file.js"), { action: "fast-gate", task: "--syntax-only file.js", autonomous: false, ...defaults, passThroughArgs: ["--syntax-only", "file.js"] });
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
assert.deepEqual(onklaudCompletions("ga"), [{ value: "gate --domain coding --text \"summary\" --json", label: "gate --domain coding --text \"summary\" --json" }]);
assert.deepEqual(onklaudCompletions("po"), [{ value: "ponytail --task \"read JSON\" --json", label: "ponytail --task \"read JSON\" --json" }]);
assert.deepEqual(onklaudCompletions("pre"), [{ value: "pre-check --task \"retry logic\" --json", label: "pre-check --task \"retry logic\" --json" }]);
assert.deepEqual(onklaudCompletions("fa"), [{ value: "fast-gate --syntax-only file.js", label: "fast-gate --syntax-only file.js" }]);

const explicit = buildOnklaudObjective("--tokens 500k fix auth bug");
assert.equal(explicit.action, "run");
assert.equal(explicit.task, "fix auth bug");
assert.match(explicit.goalCommand, /^\/goal --tokens 500k Use Onklaud 5 as an advisory council/);
assert.match(explicit.goalCommand, /Task: fix auth bug/);
assert.match(explicit.goalCommand, /onklaud status/);
assert.match(explicit.goalCommand, /missing an API key/);
assert.match(explicit.goalCommand, /do not run Onklaud loop\/gate/);
assert.match(explicit.goalCommand, /source-backed checkpoint brief/);
assert.match(explicit.goalCommand, /onklaud ponytail --task/);
assert.match(explicit.goalCommand, /onklaud pre-check --task/);
assert.match(explicit.goalCommand, /onklaud fast-gate --syntax-only/);
assert.match(explicit.goalCommand, /onklaud loop --type code/);
assert.match(explicit.goalCommand, /onklaud dual\|review\|full/);
assert.match(explicit.goalCommand, /nonzero `loop`\/`dual`\/`review` result/);
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
assert.deepEqual(execCalls.at(-2).args, ["status"]);
assert.deepEqual(execCalls.at(-1).args, ["ponytail", "--task", "read JSON", "--json"]);
assert.equal(notices.at(-1).message, "onklaud healthy");

const degradedCommands = new Map();
registerOnklaud({
  registerCommand: (name, definition) => degradedCommands.set(name, definition),
  exec: async () => ({ code: 0, stdout: 'OpenRouter key: MISSING\n{"api_key": false, "status": "degraded"}', stderr: "" }),
});
await degradedCommands.get("onklaud").handler("status", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /advisory gates unavailable \(API key missing\)/);
assert.match(notices.at(-1).message, /Configure Onklaud\/OpenRouter credentials/);
assert.match(notices.at(-1).message, /skip Onklaud loop\/gate/);

await commands.get("onklaud").handler('gate --domain coding --text "hello world" --json', { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) }, signal: "signal" });
assert.deepEqual(execCalls.at(-1).args, ["gate", "--domain", "coding", "--text", "hello world", "--json"]);
assert.match(notices.at(-1).message, /onklaud healthy/);

await commands.get("onklaud").handler('--dry-run gate --domain coding --text "hello world" --json', { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.match(notices.at(-1).message, /^DRY RUN: onklaud gate/);

await commands.get("onklaud").handler("gate --draft-file secret.txt", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Unsupported gate option/);

await commands.get("onklaud").handler('ponytail --task "read JSON" --lang js --json', { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) }, signal: "signal" });
assert.deepEqual(execCalls.at(-1).args, ["ponytail", "--task", "read JSON", "--lang", "js", "--json"]);

await commands.get("onklaud").handler('pre-check --task "retry logic" --json', { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) }, signal: "signal" });
assert.deepEqual(execCalls.at(-1).args, ["pre-check", "--task", "retry logic", "--json"]);

await commands.get("onklaud").handler("fast-gate --syntax-only file.js", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) }, signal: "signal" });
assert.deepEqual(execCalls.at(-1).args, ["fast-gate", "--syntax-only", "file.js"]);

await commands.get("onklaud").handler("fast-gate file.js", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /requires --syntax-only or --skip-kimi/);

const oldLauncherCommands = new Map();
registerOnklaud({
  registerCommand: (name, definition) => oldLauncherCommands.set(name, definition),
  exec: async (_cmd, args) => args[0] === "status"
    ? { code: 0, stdout: '{"api_key": true, "status": "operational"}', stderr: "" }
    : { code: 2, stdout: "", stderr: "usage: council.py [-h] {loop,dual,review,gate,full,status} ...\ncouncil.py: error: argument mode: invalid choice: 'ponytail'" },
});
await oldLauncherCommands.get("onklaud").handler("status", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /launcher does not expose zero-cost helpers/);
assert.match(notices.at(-1).message, /\/onklaud install --yes/);
await oldLauncherCommands.get("onklaud").handler('ponytail --task "read JSON" --json', { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /invalid choice: 'ponytail'/);
assert.match(notices.at(-1).message, /launcher does not expose zero-cost helpers/);

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
const existingBinDir = join(existingDir, "bin");
await writeFile(join(existingDir, "keep.txt"), "not onklaud\n");
const installCommands = new Map();
registerOnklaud({
  registerCommand: (name, definition) => installCommands.set(name, definition),
  exec: async (cmd, args) => ({ code: cmd === "git" && args.includes("rev-parse") ? 1 : 0, stdout: "", stderr: "not a repo" }),
});
await installCommands.get("onklaud").handler(`install --yes --dir ${existingDir} --bin-dir ${existingBinDir}`, { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
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
const installProgress = notices.map((notice) => notice.message).join("\n");
assert.match(installProgress, /Onklaud install: repo /);
assert.match(installProgress, /updating existing checkout/);
assert.match(installProgress, /creating Python virtualenv/);
assert.match(installProgress, /installing fpdf2 and pyyaml/);
assert.match(installProgress, /writing launcher/);
const installedWrapper = await readFile(join(sshOriginDir, "bin", "onklaud"), "utf8");
assert.match(installedWrapper, /\.env/);
assert.match(installedWrapper, /set -a/);
assert.match(installedWrapper, /export PATH=.*\.venv\/bin/);
assert.match(installedWrapper, /ponytail_ladder\.py/);
assert.match(installedWrapper, /pre_check\.py/);
assert.match(installedWrapper, /fast_gate\.py/);
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
