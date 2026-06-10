import assert from "node:assert/strict";
import { buildGoalTechnicalAuditorObjective, DEFAULT_TOKEN_BUDGET, formatScopeForObjective, parseGoalTechnicalAuditorArgs } from "../lib/goal-technical-auditor/command.js";

assert.equal(DEFAULT_TOKEN_BUDGET, "200k");
assert.deepEqual(parseGoalTechnicalAuditorArgs(""), { scope: ".", tokenBudget: "200k" });
assert.deepEqual(parseGoalTechnicalAuditorArgs("skills"), { scope: "skills", tokenBudget: "200k" });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--tokens 500k extensions"), { scope: "extensions", tokenBudget: "500k" });
assert.deepEqual(parseGoalTechnicalAuditorArgs("lib --tokens=1M"), { scope: "lib", tokenBudget: "1M" });
assert.equal(formatScopeForObjective("."), "the current Pi working directory (`.`)");
assert.equal(formatScopeForObjective("skills/engineering"), "folder/path `skills/engineering`");

const defaultObjective = buildGoalTechnicalAuditorObjective("");
assert.equal(defaultObjective.scope, ".");
assert.equal(defaultObjective.scopeLabel, "the current Pi working directory (`.`)");
assert.match(defaultObjective.goalCommand, /^\/goal --tokens 200k Run technical-auditor Full mode for the current Pi working directory \(`\.`\)/);

const objective = buildGoalTechnicalAuditorObjective("--tokens 300k skills/engineering");
assert.equal(objective.scope, "skills/engineering");
assert.equal(objective.scopeLabel, "folder/path `skills/engineering`");
assert.equal(objective.tokenBudget, "300k");
assert.match(objective.goalCommand, /^\/goal --tokens 300k Run technical-auditor Full mode for folder\/path `skills\/engineering`/);
assert.match(objective.goalCommand, /\/skill:technical-auditor/);
assert.match(objective.goalCommand, /Full mode: broad audit plus architecture-deepening review/);
assert.match(objective.goalCommand, /Continue autonomously while safe useful slices remain/);
assert.match(objective.goalCommand, /Do not publish, deploy, spend money, rewrite history, force-push, expose secrets/);

console.log("goal-technical-auditor-command ok");
