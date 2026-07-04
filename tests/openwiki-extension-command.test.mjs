import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerOpenWiki from "../extensions/openwiki/index.js";
import {
  openWikiCliArgs,
  openWikiCompletions,
  OPENWIKI_EXPLANATION,
  OPENWIKI_REPO_URL,
  parseOpenWikiArgs,
} from "../extensions/openwiki/command.js";

const defaults = { dryRun: false, help: false, yes: false, installDir: "", binDir: "", modelId: "", error: null };

assert.equal(OPENWIKI_REPO_URL, "https://github.com/langchain-ai/openwiki.git");
assert.deepEqual(parseOpenWikiArgs(""), { action: "explain", request: "", ...defaults });
assert.deepEqual(parseOpenWikiArgs("status"), { action: "status", request: "", ...defaults });
assert.deepEqual(parseOpenWikiArgs("install --yes --dir ~/ow --bin-dir ~/.local/bin"), { action: "install", request: "", ...defaults, yes: true, installDir: "~/ow", binDir: "~/.local/bin" });
assert.deepEqual(parseOpenWikiArgs("init --yes --model-id anthropic:claude-sonnet"), { action: "init", request: "", ...defaults, yes: true, modelId: "anthropic:claude-sonnet" });
assert.deepEqual(parseOpenWikiArgs("update --yes focus API docs"), { action: "update", request: "focus API docs", ...defaults, yes: true });
assert.deepEqual(parseOpenWikiArgs("run summarize docs"), { action: "run", request: "summarize docs", ...defaults });
assert.deepEqual(parseOpenWikiArgs("summarize docs"), { action: "run", request: "summarize docs", ...defaults });
assert.equal(parseOpenWikiArgs("--help").help, true);
assert.match(parseOpenWikiArgs("run").error, /requires a message/);
assert.match(parseOpenWikiArgs("--mode nope").error, /Unknown option/);
assert.match(parseOpenWikiArgs("run --yes hello").error, /--yes is only valid/);
assert.match(parseOpenWikiArgs("init --dir ~/ow").error, /--dir and --bin-dir/);
assert.deepEqual(openWikiCliArgs(parseOpenWikiArgs("init --model-id gpt-5 docs")), ["--init", "--model-id", "gpt-5", "docs"]);
assert.deepEqual(openWikiCliArgs(parseOpenWikiArgs("update changed routes")), ["--update", "changed routes"]);
assert.deepEqual(openWikiCliArgs(parseOpenWikiArgs("run summarize docs")), ["-p", "summarize docs"]);
assert.deepEqual(openWikiCompletions("st"), [{ value: "status", label: "status" }]);
assert.match(OPENWIKI_EXPLANATION, /external OpenWiki CLI/);
assert.match(OPENWIKI_EXPLANATION, /~\/\.openwiki\/\.env/);

const commands = new Map();
const notices = [];
const execCalls = [];
registerOpenWiki({
  registerCommand: (name, definition) => commands.set(name, definition),
  exec: async (cmd, args, options) => {
    execCalls.push({ cmd, args, options });
    return { code: 0, stdout: cmd.includes("openwiki") || cmd === "openwiki" ? "OpenWiki help" : "ok", stderr: "" };
  },
});
assert.equal(commands.has("openwiki"), true);
assert.deepEqual(commands.get("openwiki").getArgumentCompletions("up"), [{ value: "update --yes", label: "update --yes" }]);

const ctx = { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }), confirm: async () => false }, signal: "signal" };
await commands.get("openwiki").handler("explain", ctx);
assert.match(notices.at(-1).message, /OpenWiki is a thin Pi extension/);
await commands.get("openwiki").handler("--help", ctx);
assert.match(notices.at(-1).message, /Usage:/);
await commands.get("openwiki").handler("run", ctx);
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /requires a message/);

await commands.get("openwiki").handler("status", ctx);
assert.deepEqual(execCalls.at(-1).args, ["--help"]);
assert.equal(notices.at(-1).level, "info");
assert.match(notices.at(-1).message, /OpenWiki available/);

await commands.get("openwiki").handler("init --dry-run docs", ctx);
assert.match(notices.at(-1).message, /^DRY RUN:/);
assert.match(notices.at(-1).message, /--init/);
assert.match(notices.at(-1).message, /docs/);

await commands.get("openwiki").handler("init", ctx);
assert.match(notices.at(-1).message, /cancelled/);

await commands.get("openwiki").handler("update --yes focus docs", ctx);
assert.deepEqual(execCalls.at(-1).args, ["--update", "focus docs"]);
assert.equal(notices.at(-1).level, "info");

const installDir = await mkdtemp(join(tmpdir(), "openwiki-install-"));
const binDir = join(installDir, "bin");
const installCommands = new Map();
const installExecs = [];
registerOpenWiki({
  registerCommand: (name, definition) => installCommands.set(name, definition),
  exec: async (cmd, args) => {
    installExecs.push({ cmd, args });
    if (cmd === "git" && args.includes("rev-parse")) return { code: 1, stdout: "", stderr: "not a repo" };
    return { code: 0, stdout: "ok", stderr: "" };
  },
});
await installCommands.get("openwiki").handler(`install --dry-run --dir ${installDir} --bin-dir ${binDir}`, ctx);
assert.match(notices.at(-1).message, /DRY RUN:/);
assert.match(notices.at(-1).message, /langchain-ai\/openwiki/);

await installCommands.get("openwiki").handler(`install --yes --dir ${installDir} --bin-dir ${binDir}`, ctx);
assert.equal(notices.at(-1).level, "info");
assert.match(notices.at(-1).message, /Installed OpenWiki/);
assert.ok(installExecs.some((call) => call.cmd === "git" && call.args.includes("clone")));
assert.ok(installExecs.some((call) => call.cmd === "corepack" && call.args.includes("install")));
assert.ok(installExecs.some((call) => call.cmd === "corepack" && call.args.includes("build")));
const wrapper = await readFile(join(binDir, "openwiki"), "utf8");
assert.match(wrapper, /dist\/cli\.js/);
await rm(installDir, { recursive: true, force: true });

const failingCommands = new Map();
registerOpenWiki({
  registerCommand: (name, definition) => failingCommands.set(name, definition),
  exec: async () => {
    throw new Error("not found");
  },
});
await failingCommands.get("openwiki").handler("status", ctx);
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Run \/openwiki install --yes/);

console.log("openwiki-extension-command ok");
