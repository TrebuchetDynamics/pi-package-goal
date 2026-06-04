import assert from "node:assert/strict";
import goalStatuslineExtension, {
  addCompletedResponseSpeed,
  createEmptyResponseSpeedAggregate,
  formatGoalStatusLine,
  getAverageResponseSpeed,
  getContextSummary,
  getContextZone,
  parseGoalStatuslineCommand,
} from "../extensions/goal-statusline.js";

assert.deepEqual(getContextZone({ contextWindow: 1000, usedTokens: 100 }), {
  label: "Plan",
  color: "success",
  usedRatio: 0.1,
});
assert.equal(getContextZone({ contextWindow: 1000, usedTokens: 800 }).label, "Dump");
assert.equal(getContextZone({ contextWindow: 1000, usedTokens: 970 }).label, "Dead");

const context = getContextSummary({ contextWindow: 200_000, usedTokens: 50_000 });
assert.equal(context.remainingTokens, 150_000);
assert.equal(context.remainingPercent, 75);
assert.equal(context.label, "Plan");

const line = formatGoalStatusLine({
  cwd: "/repo/pi-package-goal",
  branch: "main",
  changedFiles: 3,
  prNumber: 12,
  context,
  speed: { tokensPerSecond: 42.5, inProgress: false },
  provider: "openai",
  model: "gpt-5.5",
  thinking: "high",
});
assert.match(line, /pi-package-goal/);
assert.match(line, /main \[3\] PR #12/);
assert.match(line, /150,000 \(75\.0%\) Plan/);
assert.match(line, /42\.5 tok\/s/);
assert.match(line, /openai\/gpt-5\.5 \[high\]/);

let aggregate = createEmptyResponseSpeedAggregate();
aggregate = addCompletedResponseSpeed(aggregate, 100, 2_000);
aggregate = addCompletedResponseSpeed(aggregate, 50, 1_000);
const speed = getAverageResponseSpeed(aggregate);
assert.equal(speed.tokensPerSecond, 50);
assert.equal(speed.responseCount, 2);

assert.deepEqual(parseGoalStatuslineCommand(""), { action: "toggle" });
assert.deepEqual(parseGoalStatuslineCommand("on"), { action: "enable" });
assert.deepEqual(parseGoalStatuslineCommand("refresh"), { action: "refresh" });
assert.deepEqual(parseGoalStatuslineCommand("bogus"), { action: "unknown", value: "bogus" });

const registered = { commands: [], events: [], flags: [] };
goalStatuslineExtension({
  registerFlag(name) { registered.flags.push(name); },
  getFlag() { return false; },
  on(name) { registered.events.push(name); },
  registerCommand(name) { registered.commands.push(name); },
  getThinkingLevel() { return "off"; },
});
assert.deepEqual(registered.commands, ["goal-statusline"]);
assert.ok(registered.flags.includes("goal-statusline"));
assert.ok(registered.events.includes("message_update"));

console.log("goal-statusline-extension ok");
