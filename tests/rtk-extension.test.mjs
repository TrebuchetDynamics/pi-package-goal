import assert from "node:assert/strict";
import {
  compareSemver,
  isSupportedRtkVersion,
  localRtkBin,
  normalizeRewriteResult,
  parseRtkCommandArgs,
  parseRtkVersion,
  pathWithLocalBin,
  rtkCommandCandidates,
  shouldSkipRewrite,
  uniquePaths,
} from "../extensions/rtk/index.js";

assert.deepEqual(uniquePaths(["a", "", "b", "a"]), ["a", "b"]);
assert.equal(localRtkBin("/home/alice"), "/home/alice/.local/bin/rtk");
assert.equal(pathWithLocalBin({ HOME: "/home/alice", PATH: "/usr/bin:/home/alice/.local/bin" }), "/home/alice/.local/bin:/usr/bin");
assert.deepEqual(rtkCommandCandidates({ HOME: "/home/alice" }), ["rtk", "/home/alice/.local/bin/rtk"]);

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

assert.equal(normalizeRewriteResult({ code: 0, stdout: "rtk git status\n", killed: false }, "git status"), "rtk git status");
assert.equal(normalizeRewriteResult({ code: 3, stdout: "rtk npm test\n", killed: false }, "npm test"), "rtk npm test");
assert.equal(normalizeRewriteResult({ code: 1, stdout: "", killed: false }, "echo hi"), null);
assert.equal(normalizeRewriteResult({ code: 0, stdout: "git status\n", killed: false }, "git status"), null);
assert.equal(normalizeRewriteResult({ code: 0, stdout: "rtk git status\n", killed: true }, "git status"), null);

assert.deepEqual(parseRtkCommandArgs(""), { action: "status", yes: false });
assert.deepEqual(parseRtkCommandArgs("install --yes"), { action: "install", yes: true });
assert.deepEqual(parseRtkCommandArgs("install -y"), { action: "install", yes: true });

console.log("rtk-extension ok");
