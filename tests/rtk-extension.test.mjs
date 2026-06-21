import assert from "node:assert/strict";
import {
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
assert.match(truncateText("x".repeat(200), 120), /RTK compacted output/);

const noisyGitStatus = ["On branch main", "Changes not staged for commit:", ...Array.from({ length: 30 }, (_, i) => ` modified: file-${i}.js`)].join("\n");
assert.match(compactGitOutput(noisyGitStatus, "git status --short"), /RTK git status summary/);

const noisySearch = Array.from({ length: 45 }, (_, i) => `src/file-${i % 3}.js:${i + 1}:TODO item`).join("\n");
assert.match(compactSearchOutput(noisySearch), /45 matches in 3 files/);

const noisyTest = ["PASS unit", ...Array.from({ length: 45 }, () => "ok"), "FAIL integration", "AssertionError: nope"].join("\n");
assert.match(compactTestOutput(noisyTest, "npm test"), /RTK test summary/);

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

console.log("rtk-extension ok");
