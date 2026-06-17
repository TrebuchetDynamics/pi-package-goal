import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerGoalTechnicalAuditor from "../extensions/goal-technical-auditor/index.js";
import { buildGoalTechnicalAuditorObjective, DEFAULT_TOKEN_BUDGET, formatScopeForObjective, interpretScopeOrPrompt, parseGoalTechnicalAuditorArgs, validateScopeInsideCwd } from "../lib/goal-technical-auditor/command.js";

assert.equal(DEFAULT_TOKEN_BUDGET, "700k");
assert.deepEqual(parseGoalTechnicalAuditorArgs(""), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("skills"), { scope: "skills", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--tokens 500k extensions"), { scope: "extensions", tokenBudget: "500k", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("lib --tokens=1M"), { scope: "lib", tokenBudget: "1M", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--tokens 0 extensions"), { scope: "extensions", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "", error: "Token budget must be positive." });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--dry-run --tokens 500k extensions"), { scope: "extensions", tokenBudget: "500k", dryRun: true, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--focus bug-hunt-refactor lib"), { scope: "lib", tokenBudget: "700k", dryRun: false, help: false, focus: "bug-hunt-refactor", prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("bug hunt"), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: "bug-hunt-refactor", prompt: "bug hunt", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("audit current repo"), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "audit current repo", error: null });
assert.deepEqual(interpretScopeOrPrompt(["hunt", "bugs", "in", "repo"]), { scope: ".", focus: null, prompt: "hunt bugs in repo" });
assert.equal(parseGoalTechnicalAuditorArgs("--help").help, true);
assert.match(parseGoalTechnicalAuditorArgs("--focus cleanup").error, /Unknown focus: cleanup/);
assert.match(parseGoalTechnicalAuditorArgs("--mode audit-only").error, /Unknown option: --mode/);
assert.equal(formatScopeForObjective("."), "the current Pi working directory (`.`)");
assert.equal(formatScopeForObjective("skills/engineering"), "folder/path `skills/engineering`");

const fixtureCwd = await mkdtemp(join(tmpdir(), "goal-technical-auditor-scope-"));
try {
  assert.equal(validateScopeInsideCwd(fixtureCwd, "."), null);
  assert.equal(validateScopeInsideCwd(fixtureCwd, "skills"), null);
  assert.match(validateScopeInsideCwd(fixtureCwd, "../outside"), /Scope must stay inside the current working directory/);
} finally {
  await rm(fixtureCwd, { recursive: true, force: true });
}

const defaultObjective = buildGoalTechnicalAuditorObjective("");
assert.equal(defaultObjective.scope, ".");
assert.equal(defaultObjective.scopeLabel, "the current Pi working directory (`.`)");
assert.match(defaultObjective.goalCommand, /^\/goal --tokens 700k Run technical-auditor Full mode for the current Pi working directory \(`\.`\)/);

const objective = buildGoalTechnicalAuditorObjective("--tokens 300k skills/engineering");
assert.equal(objective.scope, "skills/engineering");
assert.equal(objective.scopeLabel, "folder/path `skills/engineering`");
assert.equal(objective.tokenBudget, "300k");
assert.match(objective.goalCommand, /^\/goal --tokens 300k Run technical-auditor Full mode for folder\/path `skills\/engineering`/);
assert.match(objective.goalCommand, /\/skill:technical-auditor/);
assert.match(objective.goalCommand, /Full mode: broad audit plus architecture-deepening review/);
assert.match(objective.goalCommand, /Preflight before audit:/);
assert.match(objective.goalCommand, /git status/);
assert.match(objective.goalCommand, /repo instructions/);
assert.match(objective.goalCommand, /test command/);
assert.match(objective.goalCommand, /codebase map freshness/);
assert.match(objective.goalCommand, /dirty-file ownership/);
assert.match(objective.goalCommand, /inline architecture candidates/);
assert.doesNotMatch(objective.goalCommand, /Bug-Hunt Refactor Focus:/);
assert.doesNotMatch(objective.goalCommand, /HTML|html/);
assert.match(objective.goalCommand, /Continue autonomously while safe useful slices remain/);
assert.match(objective.goalCommand, /Do not publish, deploy, spend money, rewrite history, force-push, expose secrets/);

const promptObjective = buildGoalTechnicalAuditorObjective("bug hunt");
assert.equal(promptObjective.scope, ".");
assert.equal(promptObjective.focus, "bug-hunt-refactor");
assert.match(promptObjective.goalCommand, /Raw prompt: bug hunt/);
assert.match(promptObjective.goalCommand, /Do not treat prompt words as filesystem paths/);

const focusedObjective = buildGoalTechnicalAuditorObjective("--focus bug-hunt-refactor lib");
assert.equal(focusedObjective.focus, "bug-hunt-refactor");
assert.match(focusedObjective.goalCommand, /Bug-Hunt Refactor Focus:/);
assert.match(focusedObjective.goalCommand, /Prefer deleting dead or shallow code/);
assert.match(focusedObjective.goalCommand, /share-code/);
assert.match(focusedObjective.goalCommand, /pre\/during\/post refactor bug hunts/);
assert.match(focusedObjective.goalCommand, /inconsistent edge cases/);
assert.match(focusedObjective.goalCommand, /Avoid speculative utilities/);

let registeredHandler;
const sentMessages = [];
const notices = [];
registerGoalTechnicalAuditor({
  registerCommand: (_name, definition) => {
    registeredHandler = definition.handler;
  },
  sendUserMessage: (message) => sentMessages.push(message),
});
await registeredHandler("--tokens 0 .", { cwd: process.cwd(), ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.deepEqual(notices, [{ message: "Token budget must be positive.", level: "warning" }]);

notices.length = 0;
await registeredHandler("--dry-run --tokens 300k lib", { cwd: process.cwd(), ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "info");
assert.match(notices.at(-1).message, /^DRY RUN: \/goal --tokens 300k Run technical-auditor Full mode for folder\/path `lib`/);

notices.length = 0;
await registeredHandler("../outside", { cwd: process.cwd(), ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Scope must stay inside the current working directory/);

console.log("goal-technical-auditor-command ok");
