import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const jitiEntry = "/home/xel/.nvm/versions/node/v22.21.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs";
const { createJiti } = require(jitiEntry);
const jiti = createJiti(import.meta.url, { interopDefault: true });
const scopeMod = await jiti.import(path.join(root, "extensions", "development-goal", "scope-expansion.ts"));
const configMod = await jiti.import(path.join(root, "extensions", "development-goal", "config.ts"));
const adapterMod = await jiti.import(path.join(root, "extensions", "development-goal", "adapter.ts"));
const promptsMod = await jiti.import(path.join(root, "extensions", "development-goal", "prompts.ts"));

assert.equal(typeof scopeMod.resolveScopeExpansionPolicy, "function");
assert.equal(typeof scopeMod.decideEmptyQueueAction, "function");

assert.deepEqual(scopeMod.resolveScopeExpansionPolicy({}), {
  allowScopeExpansion: false,
  requireReviewOnEmptyQueue: true,
});

assert.deepEqual(scopeMod.decideEmptyQueueAction({
  queueEmpty: true,
  policy: scopeMod.resolveScopeExpansionPolicy({}),
}), {
  action: "stop",
  decision: "stop",
  finalStatus: "review_needed",
  reason: "empty_queue_review_needed",
});

assert.deepEqual(scopeMod.decideEmptyQueueAction({
  queueEmpty: true,
  policy: scopeMod.resolveScopeExpansionPolicy({ allowScopeExpansion: true }),
}), {
  action: "discover",
});

assert.deepEqual(scopeMod.decideEmptyQueueAction({
  queueEmpty: true,
  objectiveIsBroad: true,
  policy: scopeMod.resolveScopeExpansionPolicy({}),
}), {
  action: "stop",
  decision: "stop",
  finalStatus: "review_needed",
  reason: "broad_objective_empty_queue_review_needed",
});

assert.equal(configMod.normalizeConfig({ allowScopeExpansion: true }).allowScopeExpansion, true);
assert.equal(configMod.normalizeConfig({ requireReviewOnEmptyQueue: false }).requireReviewOnEmptyQueue, false);

const promptRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-goal-scope-policy-"));
fs.mkdirSync(path.join(promptRoot, ".git"));
const resolved = adapterMod.resolveProjectAdapter(promptRoot, "generic-git");
const promptState = {
  active: true,
  adapterName: "generic-git",
  runId: "dl-scope",
  topic: "discover and complete useful work",
  iteration: 1,
  maxIterations: 2,
  startedAt: new Date(0).toISOString(),
  logPath: path.join(promptRoot, ".pi", "development-goal", "logs.jsonl"),
  phase: "running",
  commit: false,
  push: false,
};
const guardedPrompt = promptsMod.buildIterationPrompt(promptState, {
  ...resolved,
  config: { ...resolved.config, allowScopeExpansion: false, requireReviewOnEmptyQueue: true },
}, promptRoot);
assert.match(guardedPrompt, /Scope expansion:/);
assert.match(guardedPrompt, /Do not invent more work when the discovered queue is empty/);
assert.match(guardedPrompt, /DEV_GOAL_DECISION: stop/);

const expandedPrompt = promptsMod.buildIterationPrompt(promptState, {
  ...resolved,
  config: { ...resolved.config, allowScopeExpansion: true, requireReviewOnEmptyQueue: false },
}, promptRoot);
assert.match(expandedPrompt, /Explicit scope expansion is allowed/);
