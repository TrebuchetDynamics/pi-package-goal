import assert from "node:assert/strict";
import { emptyGoalCommandAction } from "../extensions/goal/lib/command.js";

assert.equal(emptyGoalCommandAction(null), "start-skill");
assert.equal(emptyGoalCommandAction({ status: "complete" }), "start-skill");
assert.equal(emptyGoalCommandAction({ status: "active" }), "show-status");
assert.equal(emptyGoalCommandAction({ status: "paused" }), "show-status");
assert.equal(emptyGoalCommandAction({ status: "budget_limited" }), "show-status");

console.log("goal-extension-command ok");
