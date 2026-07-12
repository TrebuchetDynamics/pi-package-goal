import assert from "node:assert/strict";
import registerRtkExtension, {
  compareSemver,
  isSupportedRtkVersion,
  localRtkBin,
  compactBuildOutput,
  compactGitOutput,
  compactSearchOutput,
  compactTestOutput,
  compactToolContent,
  normalizeRewriteResult,
  parseRtkCommandArgs,
  parseRtkVersion,
  pathWithLocalBin,
  readRtkConfig,
  rtkCommandCandidates,
  RTK_INSTALL_COMMAND,
  shouldSkipRewrite,
  stripAnsi,
  stripRtkNoise,
  truncateText,
  uniquePaths,
} from "../extensions/rtk/index.js";

assert.deepEqual(uniquePaths(["a", "", "b", "a"]), ["a", "b"]);
assert.equal(localRtkBin("/home/alice"), "/home/alice/.local/bin/rtk");
assert.equal(pathWithLocalBin({ HOME: "/home/alice", PATH: "/usr/bin:/home/alice/.local/bin" }), "/home/alice/.local/bin:/usr/bin");
assert.deepEqual(rtkCommandCandidates({ HOME: "/home/alice" }), ["rtk", "/home/alice/.local/bin/rtk"]);
assert.deepEqual(rtkCommandCandidates({ HOME: "/home/alice", RTK_BIN: "/opt/rtk" }), ["/opt/rtk", "rtk", "/home/alice/.local/bin/rtk"]);
assert.deepEqual(readRtkConfig({ RTK_MODE: "suggest", RTK_COMPACT: "0", RTK_MAX_OUTPUT_CHARS: "5000" }), {
  enabled: true,
  mode: "suggest",
  showNotifications: true,
  guardWhenMissing: true,
  unsafeRewrite: false,
  compactOutput: false,
  compactRead: false,
  stripAnsi: true,
  maxOutputChars: 5000,
  readExactLineLimit: 80,
});

assert.deepEqual(parseRtkVersion("rtk 0.28.2"), [0, 28, 2]);
assert.deepEqual(parseRtkVersion("0.23.0"), [0, 23, 0]);
assert.equal(parseRtkVersion("not rtk"), null);

assert.equal(compareSemver([0, 23, 0], [0, 23, 0]), 0);
assert.equal(compareSemver([0, 22, 9], [0, 23, 0]), -1);
assert.equal(compareSemver([1, 0, 0], [0, 23, 0]), 1);

assert.equal(isSupportedRtkVersion("rtk 0.23.0"), true);
assert.equal(isSupportedRtkVersion("rtk 0.22.9"), false);
assert.equal(isSupportedRtkVersion("unknown"), false);

assert.equal(shouldSkipRewrite(""), true);
assert.equal(shouldSkipRewrite("rtk git status"), true);
assert.equal(shouldSkipRewrite("git status", { RTK_DISABLED: "1" }), true);
assert.equal(shouldSkipRewrite("git status", {}), false);
assert.equal(shouldSkipRewrite("git status && npm test", {}), true);
assert.equal(shouldSkipRewrite("find . -maxdepth 2 -type f -print", {}), true);
assert.equal(shouldSkipRewrite("find . -name '*.js' -exec grep -n TODO {} \\;", {}), true);
assert.equal(shouldSkipRewrite("rg -n TODO . -g '*.js'", {}), true);
assert.equal(shouldSkipRewrite("rm -rf dist", {}), true);
assert.equal(shouldSkipRewrite("git reset --hard HEAD", {}), true);
assert.equal(shouldSkipRewrite("echo $API_KEY", {}), true);
assert.equal(shouldSkipRewrite("git reset --hard HEAD", { RTK_REWRITE_UNSAFE: "1" }), false);
assert.equal(shouldSkipRewrite("git status", { RTK_MODE: "suggest" }), false);

assert.equal(normalizeRewriteResult({ code: 0, stdout: "rtk git status\n", killed: false }, "git status"), "rtk git status");
assert.equal(normalizeRewriteResult({ code: 3, stdout: "rtk npm test\n", killed: false }, "npm test"), "rtk npm test");
assert.equal(normalizeRewriteResult({ code: 1, stdout: "", killed: false }, "echo hi"), null);
assert.equal(normalizeRewriteResult({ code: 0, stdout: "git status\n", killed: false }, "git status"), null);
assert.equal(normalizeRewriteResult({ code: 0, stdout: "rtk git status\n", killed: true }, "git status"), null);

assert.deepEqual(parseRtkCommandArgs(""), { action: "status" });
assert.deepEqual(parseRtkCommandArgs("install"), { action: "install" });
assert.doesNotMatch(RTK_INSTALL_COMMAND, /refs\/heads\/master|\|\s*sh/);

assert.equal(stripAnsi("\u001b[31mred\u001b[0m"), "red");
assert.equal(stripRtkNoise("ok\n[rtk] rewrite failed; passing through original command\nnext"), "ok\nnext");
assert.match(truncateText("x".repeat(200), 120), /RTK compacted output/);

const noisyGitStatus = ["On branch main", "Changes not staged for commit:", ...Array.from({ length: 30 }, (_, i) => ` modified: file-${i}.js`)].join("\n");
assert.match(compactGitOutput(noisyGitStatus, "git status --short"), /RTK git status summary/);

const noisySearch = Array.from({ length: 45 }, (_, i) => `src/file-${i % 3}.js:${i + 1}:TODO item`).join("\n");
assert.match(compactSearchOutput(noisySearch), /45 matches in 3 files/);

const noisyTest = ["PASS unit", ...Array.from({ length: 45 }, () => "ok"), "FAIL integration", "AssertionError: nope"].join("\n");
assert.match(compactTestOutput(noisyTest, "npm test"), /RTK test summary/);
const sourceListingWithPassFail = ["const noisyTest = ['PASS unit', 'FAIL integration'];", ...Array.from({ length: 45 }, (_, index) => `${index}: ok`)];
assert.equal(compactTestOutput(sourceListingWithPassFail.join("\n"), "perl -ne print"), null);
assert.equal(compactTestOutput(sourceListingWithPassFail.join("\n"), "git diff -- tests/rtk-extension.test.mjs"), null);

const noisyBuild = ["vite building", ...Array.from({ length: 45 }, () => "chunk"), "error TS1234: nope"].join("\n");
assert.match(compactBuildOutput(noisyBuild, "npm run build"), /RTK build summary/);

const compacted = compactToolContent({
  toolName: "grep",
  input: {},
  content: [{ type: "text", text: noisySearch }],
});
assert.equal(compacted.changed, true);
assert.equal(compacted.metadata.applied, true);
assert.equal(compacted.metadata.techniques.includes("search"), true);

const readExact = compactToolContent({
  toolName: "read",
  input: { path: "small.js" },
  content: [{ type: "text", text: "a\n".repeat(20) }],
}, readRtkConfig({ RTK_COMPACT_READ: "1" }));
assert.equal(readExact.changed, false);

const rtkNoiseCompacted = compactToolContent({
  toolName: "bash",
  input: { command: "echo ok" },
  content: [{ type: "text", text: "ok\n[rtk] rewrite failed; passing through original command\n" }],
});
assert.equal(rtkNoiseCompacted.changed, true);
assert.equal(rtkNoiseCompacted.metadata.techniques.includes("rtk-noise"), true);
assert.equal(rtkNoiseCompacted.content[0].text, "ok");

let registeredRtk;
const notices = [];
const originalLog = console.log;
console.log = () => {};
try {
  registerRtkExtension({
    registerCommand: (name, definition) => {
      if (name === "rtk") registeredRtk = definition;
    },
    on: () => {},
    exec: async () => ({ code: 1, stdout: "", stderr: "missing rtk" }),
  });
  await registeredRtk.handler("install", { hasUI: true, ui: { notify: (message, level) => notices.push({ message, level }) } });
} finally {
  console.log = originalLog;
}
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Manual RTK install required/);
assert.match(notices.at(-1).message, /brew install rtk/);

{
  let toolCallHandler;
  const calls = [];
  registerRtkExtension({
    registerCommand() {},
    on(name, handler) {
      if (name === "tool_call") toolCallHandler = handler;
    },
    async exec(command, args) {
      calls.push([command, ...args]);
      if (args[0] === "--version") return { code: 0, stdout: "rtk 0.22.9", stderr: "" };
      if (args[0] === "rewrite") return { code: 0, stdout: "rtk git status", stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    },
  });
  const event = { toolName: "bash", input: { command: "git status" } };
  await toolCallHandler(event, { signal: undefined, hasUI: false });
  assert.equal(event.input.command, "git status");
  assert.equal(calls.some((call) => call.includes("rewrite")), false);
}

console.log("rtk-extension ok");
