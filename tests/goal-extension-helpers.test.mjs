import assert from "node:assert/strict";
import {
  buildGoalSystemPrompt,
  completionRejection,
  findFinalAssistantMessage,
  isRetryableGoalInterruption,
  parseTokenBudget,
  validateObjective,
} from "../lib/goal/extension-helpers.js";

assert.deepEqual(parseTokenBudget("--tokens 1.5k ship it"), {
  objective: "ship it",
  tokenBudget: 1500,
});
assert.deepEqual(parseTokenBudget("ship it --tokens=2m"), {
  objective: "ship it",
  tokenBudget: 2_000_000,
});
assert.equal(parseTokenBudget("--tokens nope ship").error, "Invalid token budget: nope");

assert.equal(validateObjective("ship it"), null);
assert.match(validateObjective(""), /Usage: \/goal/);

assert.equal(completionRejection("Implemented and verified with npm test."), null);
assert.equal(completionRejection("Not complete: tests still fail."), "summary says the goal is not complete");
assert.equal(completionRejection("   "), "summary is empty");

const prompt = buildGoalSystemPrompt({
  objective: "fix <all> & verify",
  tokenBudget: 1000,
  tokensUsed: 250,
});
assert.match(prompt, /fix &lt;all&gt; &amp; verify/);
assert.match(prompt, /250\/1000 used/);
assert.match(prompt, /goal_complete/);

assert.deepEqual(findFinalAssistantMessage([{ role: "assistant", stopReason: "stop" }, { role: "user" }]), {
  role: "assistant",
  stopReason: "stop",
});
assert.equal(
  isRetryableGoalInterruption({ role: "assistant", stopReason: "error", errorMessage: "WebSocket closed" }),
  true,
);
assert.equal(
  isRetryableGoalInterruption({ role: "assistant", stopReason: "error", errorMessage: "invalid api key" }),
  false,
);

console.log("goal-extension-helpers ok");
