import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import registerGoalTechnicalAuditor from "../extensions/goal-technical-auditor/index.js";
import { buildGoalTechnicalAuditorObjective, DEFAULT_TOKEN_BUDGET, formatScopeForObjective, goalTechnicalAuditorCompletions, interpretScopeOrPrompt, parseGoalTechnicalAuditorArgs, parseGoalTechnicalAuditorCommand, validateGoalTechnicalAuditorLaunch, validateScopeInsideCwd } from "../extensions/goal-technical-auditor/lib/command.js";

assert.equal(DEFAULT_TOKEN_BUDGET, "700k");
assert.deepEqual(parseGoalTechnicalAuditorArgs(""), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("skills"), { scope: "skills", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--tokens 500k extensions"), { scope: "extensions", tokenBudget: "500k", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("lib --tokens=1M"), { scope: "lib", tokenBudget: "1M", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--tokens 0 extensions"), { scope: "extensions", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "", error: "Token budget must be positive." });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--dry-run --tokens 500k extensions"), { scope: "extensions", tokenBudget: "500k", dryRun: true, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("--focus bug-hunt-refactor lib"), { scope: "lib", tokenBudget: "700k", dryRun: false, help: false, focus: "bug-hunt-refactor", prompt: "", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("bug hunt"), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: "bug-hunt-refactor", prompt: "bug hunt", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs('"bug hunt"'), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: "bug-hunt-refactor", prompt: "bug hunt", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("audit current repo"), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "audit current repo", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("audit lib"), { scope: ".", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "audit lib", error: null });
assert.deepEqual(parseGoalTechnicalAuditorArgs("lib"), { scope: "lib", tokenBudget: "700k", dryRun: false, help: false, focus: null, prompt: "", error: null });
assert.deepEqual(interpretScopeOrPrompt(["hunt", "bugs", "in", "repo"]), { scope: ".", focus: null, prompt: "hunt bugs in repo" });
assert.equal(parseGoalTechnicalAuditorArgs("--help").help, true);
assert.match(parseGoalTechnicalAuditorArgs("--focus cleanup").error, /Unknown focus: cleanup/);
assert.match(parseGoalTechnicalAuditorArgs("--mode audit-only").error, /Unknown option: --mode/);
assert.deepEqual(parseGoalTechnicalAuditorCommand("status"), { action: "status" });
assert.deepEqual(parseGoalTechnicalAuditorCommand("resume"), { action: "resume" });
assert.deepEqual(parseGoalTechnicalAuditorCommand("abort"), { action: "abort" });
assert.match(parseGoalTechnicalAuditorCommand("status now").error, /does not accept arguments/);
assert.equal(parseGoalTechnicalAuditorCommand("skills").action, "start");
assert.equal(parseGoalTechnicalAuditorCommand("skills").objective.scope, "skills");
assert.match(parseGoalTechnicalAuditorCommand('"unterminated').error, /Unclosed quote/);
const controlCompletions = goalTechnicalAuditorCompletions("").map((item) => item.value);
assert.equal(controlCompletions.includes("status"), true);
assert.equal(controlCompletions.includes("resume"), true);
assert.equal(controlCompletions.includes("abort"), true);
assert.equal(formatScopeForObjective("."), "the current Pi working directory (`.`)");
assert.equal(formatScopeForObjective("skills/engineering"), "folder/path `skills/engineering`");

const fixtureCwd = await mkdtemp(join(tmpdir(), "goal-technical-auditor-scope-"));
try {
  await mkdir(join(fixtureCwd, "skills"));
  await mkdir(join(fixtureCwd, "extensions"));
  assert.equal(validateScopeInsideCwd(fixtureCwd, "."), null);
  assert.equal(validateScopeInsideCwd(fixtureCwd, "skills"), null);
  assert.match(validateScopeInsideCwd(fixtureCwd, "../outside"), /Scope must stay inside the current working directory/);
  assert.equal(validateGoalTechnicalAuditorLaunch(fixtureCwd, { scope: "skills", prompt: "" }), null);
  assert.match(validateGoalTechnicalAuditorLaunch(fixtureCwd, { scope: "missing", prompt: "" }), /Scope path does not exist: missing/);
  assert.equal(validateGoalTechnicalAuditorLaunch(fixtureCwd, { scope: ".", prompt: "audit missing" }), null);
  assert.deepEqual(goalTechnicalAuditorCompletions("e", fixtureCwd), [{ value: "extensions/", label: "extensions/" }]);
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
assert.match(objective.goalCommand, /all safe audit recommendations are fixed/);
assert.match(objective.goalCommand, /Do not stop after only the top recommendation/);
assert.match(objective.goalCommand, /pause for grill-with-docs before editing production code/);
assert.match(objective.goalCommand, /rerun technical-auditor Full mode on the same scope/);
assert.match(objective.goalCommand, /every audit recommendation from every pass/);
assert.match(objective.goalCommand, /Continue autonomously while safe useful recommendations remain/);
assert.match(objective.goalCommand, /Do not publish, deploy, spend money, rewrite history, force-push, expose secrets/);
assert.match(objective.goalCommand, /technical_auditor_checkpoint/);
assert.match(objective.goalCommand, /Do not call goal_complete directly/);
assert.match(objective.goalCommand, /one finding at a time/);

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

let registeredDefinition;
let registeredHandler;
const sentMessages = [];
const notices = [];
registerGoalTechnicalAuditor({
  registerCommand: (_name, definition) => {
    registeredDefinition = definition;
    registeredHandler = definition.handler;
  },
  sendUserMessage: (message, options) => sentMessages.push({ message, options }),
});
assert.deepEqual(registeredDefinition.getArgumentCompletions("e", { cwd: process.cwd() }), [{ value: "extensions/", label: "extensions/" }]);

await registeredHandler("--tokens 0 .", { cwd: process.cwd(), ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.deepEqual(notices, [{ message: "Token budget must be positive.", level: "warning" }]);

notices.length = 0;
await registeredHandler("--dry-run --tokens 300k extensions", { cwd: process.cwd(), ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "info");
assert.match(notices.at(-1).message, /^DRY RUN: \/goal-technical-auditor/);
assert.match(notices.at(-1).message, /scope: folder\/path `extensions`/);
assert.match(notices.at(-1).message, /focus: none/);
assert.match(notices.at(-1).message, /tokens: 300k/);
assert.match(notices.at(-1).message, /command: \/goal --tokens 300k Run technical-auditor Full mode for folder\/path `extensions`/);

notices.length = 0;
await registeredHandler("../outside", { cwd: process.cwd(), ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Scope must stay inside the current working directory/);

notices.length = 0;
await registeredHandler("definitely-missing-goal-audit-scope", { cwd: process.cwd(), ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Scope path does not exist: definitely-missing-goal-audit-scope/);

notices.length = 0;
await registeredHandler("--tokens 300k .", {
  cwd: process.cwd(),
  isIdle: () => false,
  ui: { notify: (message, level) => notices.push({ message, level }) },
});
assert.equal(sentMessages.length, 1);
assert.match(sentMessages[0].message, /^\/goal --tokens 300k /);
assert.deepEqual(sentMessages[0].options, { deliverAs: "followUp" });

console.log("goal-technical-auditor-command ok");
