import assert from "node:assert/strict";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const riskMod = await import(path.join(root, "lib", "goal", "worktree-risk.ts"));

assert.equal(typeof riskMod.evaluateWorktreeRisk, "function");

const policy = {
  maxDirtyFiles: 10,
  maxUntrackedFiles: 5,
  maxInsertions: 500,
};

assert.deepEqual(riskMod.evaluateWorktreeRisk({
  changedFiles: 3,
  untrackedFiles: 2,
  insertions: 120,
}, policy), {
  action: "continue",
  reasons: [],
});

assert.deepEqual(riskMod.evaluateWorktreeRisk({
  changedFiles: 3,
  untrackedFiles: 6,
  insertions: 120,
}, policy), {
  action: "stop",
  finalStatus: "review_needed",
  reasons: ["untracked files 6 exceeds max 5"],
});

assert.deepEqual(riskMod.evaluateWorktreeRisk({
  changedFiles: 11,
  untrackedFiles: 2,
  insertions: 120,
}, policy), {
  action: "stop",
  finalStatus: "review_needed",
  reasons: ["changed files 11 exceeds max 10"],
});

assert.deepEqual(riskMod.evaluateWorktreeRisk({
  changedFiles: 3,
  untrackedFiles: 2,
  insertions: 501,
}, policy), {
  action: "stop",
  finalStatus: "review_needed",
  reasons: ["insertions 501 exceeds max 500"],
});

console.log("development-goal-worktree-risk ok");
