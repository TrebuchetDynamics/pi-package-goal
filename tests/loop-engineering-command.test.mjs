import assert from "node:assert/strict";
import registerLoopEngineering from "../extensions/loop-engineering/index.js";
import {
  buildLoopEngineeringObjective,
  DEFAULT_LEVEL,
  DEFAULT_PATTERN,
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_TOOL,
  parseLoopEngineeringArgs,
} from "../lib/loop-engineering/command.js";

assert.equal(DEFAULT_TOKEN_BUDGET, "300k");
assert.equal(DEFAULT_PATTERN, "daily-triage");
assert.equal(DEFAULT_TOOL, "grok");
assert.equal(DEFAULT_LEVEL, "L1");

assert.deepEqual(parseLoopEngineeringArgs(""), {
  action: "design",
  tokenBudget: "300k",
  dryRun: false,
  help: false,
  tool: "grok",
  level: "L1",
  pattern: "daily-triage",
  args: "",
  request: "",
  error: null,
});
assert.deepEqual(parseLoopEngineeringArgs("audit ."), {
  action: "audit",
  tokenBudget: "300k",
  dryRun: false,
  help: false,
  tool: "grok",
  level: "L1",
  pattern: "daily-triage",
  args: ".",
  request: ".",
  error: null,
});
assert.deepEqual(parseLoopEngineeringArgs("init issue-triage --tool codex --tokens 500k"), {
  action: "init",
  tokenBudget: "500k",
  dryRun: false,
  help: false,
  tool: "codex",
  level: "L1",
  pattern: "issue-triage",
  args: "issue-triage",
  request: "issue-triage",
  error: null,
});
assert.deepEqual(parseLoopEngineeringArgs("cost ci-sweeper --level L2"), {
  action: "cost",
  tokenBudget: "300k",
  dryRun: false,
  help: false,
  tool: "grok",
  level: "L2",
  pattern: "ci-sweeper",
  args: "ci-sweeper",
  request: "ci-sweeper",
  error: null,
});
assert.deepEqual(parseLoopEngineeringArgs("goal ."), {
  action: "goal",
  tokenBudget: "300k",
  dryRun: false,
  help: false,
  tool: "grok",
  level: "L1",
  pattern: "daily-triage",
  args: ".",
  request: ".",
  error: null,
});
assert.equal(parseLoopEngineeringArgs("--help").help, true);
assert.equal(parseLoopEngineeringArgs("--dry-run audit .").dryRun, true);
assert.match(parseLoopEngineeringArgs("--tokens 0 audit .").error, /Token budget must be positive/);
assert.match(parseLoopEngineeringArgs("--tool nope init daily-triage").error, /Unknown tool: nope/);
assert.match(parseLoopEngineeringArgs("--level L4 cost daily-triage").error, /Unknown level: L4/);

const audit = buildLoopEngineeringObjective("audit .");
assert.match(audit.goalCommand, /^\/goal --tokens 300k Use Loop Engineering discipline/);
assert.match(audit.goalCommand, /npx @cobusgreyling\/loop-audit '\.' --suggest/);
assert.match(audit.goalCommand, /L1 loop/);
assert.match(audit.goalCommand, /Do not publish, deploy, spend money, rewrite history/);

const init = buildLoopEngineeringObjective("init issue-triage --tool codex --level L2");
assert.match(init.goalCommand, /npx @cobusgreyling\/loop-cost --pattern issue-triage --level L2/);
assert.match(init.goalCommand, /npx @cobusgreyling\/loop-init \. --pattern issue-triage --tool codex/);
assert.match(init.goalCommand, /leave the loop at L2/);

const cost = buildLoopEngineeringObjective("cost ci-sweeper");
assert.match(cost.goalCommand, /npx @cobusgreyling\/loop-cost --pattern ci-sweeper --level L1/);
assert.match(cost.goalCommand, /stop before scaffolding/);

const goal = buildLoopEngineeringObjective("goal .");
assert.match(goal.goalCommand, /npx @cobusgreyling\/goal-audit '\.'/);
assert.match(goal.goalCommand, /Do not replace Pi's \/goal command/);
assert.match(goal.goalCommand, /loop-audit, loop-init, loop-cost, and goal-audit/);

const design = buildLoopEngineeringObjective("1d Run loop-triage. Update STATE.md. No auto-fix in week one.");
assert.match(design.goalCommand, /User loop request:\n1d Run loop-triage/);
assert.match(design.goalCommand, /daily-triage, pr-babysitter, ci-sweeper/);
assert.match(design.goalCommand, /cost\/audit\/goal-audit checks/);

const commands = new Map();
const sentMessages = [];
const notices = [];
registerLoopEngineering({
  registerCommand: (name, definition) => commands.set(name, definition),
  sendUserMessage: (message) => sentMessages.push(message),
});
assert.equal(commands.has("loop-engineering"), true);
assert.equal(commands.has("loop"), true);

await commands.get("loop-engineering").handler("--tokens 0 audit .", { ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "warning");
assert.match(notices.at(-1).message, /Token budget must be positive/);

await commands.get("loop").handler("--dry-run audit .", { ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.deepEqual(sentMessages, []);
assert.equal(notices.at(-1).level, "info");
assert.match(notices.at(-1).message, /^DRY RUN: \/goal --tokens 300k Use Loop Engineering discipline/);

await commands.get("loop").handler("audit .", { ui: { notify: (message, level) => notices.push({ message, level }) } });
assert.equal(sentMessages.length, 1);
assert.match(sentMessages[0], /^\/goal --tokens 300k Use Loop Engineering discipline/);
assert.equal(notices.at(-1).level, "info");
assert.match(notices.at(-1).message, /Starting Loop Engineering audit workflow/);

console.log("loop-engineering-command ok");
