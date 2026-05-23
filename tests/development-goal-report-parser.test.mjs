import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const jitiEntry = "/home/xel/.nvm/versions/node/v22.21.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs";
const { createJiti } = require(jitiEntry);
const jiti = createJiti(import.meta.url, { interopDefault: true });
const parserMod = await jiti.import(path.join(root, "extensions", "development-goal-report-parser.ts"));

assert.equal(typeof parserMod.parseFinalReport, "function");
assert.equal(typeof parserMod.parseLoopDeliveryEvidence, "function");

function parseOk(text) {
  const result = parserMod.parseFinalReport(text);
  assert.equal(result.ok, true, result.error?.message || "expected parser success");
  return result.report;
}

function parseError(text) {
  const result = parserMod.parseFinalReport(text);
  assert.equal(result.ok, false, "expected parser error");
  return result.error;
}

assert.deepEqual(parseOk([
  "Scope: /repo with adapter generic-git.",
  "Validation evidence: npm test (pass).",
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: done",
].join("\n")), {
  decision: "done",
  finalStatus: "done",
  validated: true,
  deliveryEvidence: {},
});

assert.deepEqual(parseOk([
  "Scope: /repo with adapter generic-git.",
  "Blocker state: missing TEST_TOKEN.",
  "DEV_GOAL_VALIDATED: no",
  "DEV_GOAL_DECISION: blocked",
].join("\n")), {
  decision: "blocked",
  finalStatus: "blocked",
  validated: false,
  deliveryEvidence: {},
});

assert.deepEqual(parseOk([
  "Scope: /repo with adapter generic-git.",
  "Human review required before more autonomous work.",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"stop","final_status":"review_needed","summary":"Dirty worktree needs review"}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: stop",
].join("\n")), {
  decision: "stop",
  finalStatus: "review_needed",
  validated: true,
  deliveryEvidence: {
    summary: "Dirty worktree needs review",
  },
});

assert.deepEqual(parseError([
  "The prompt tells the assistant to end with:",
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: done",
].join("\n")), {
  code: "assistant_echo",
  message: "final marker block appears to be an instruction echo, not a completed final report",
});

assert.deepEqual(parseError("Validation passed, but the assistant forgot the final marker block."), {
  code: "missing_final_marker",
  message: "missing DEV_GOAL_VALIDATED/DEV_GOAL_DECISION final marker block",
});

assert.deepEqual(parserMod.parseLoopDeliveryEvidence([
  "Summary: Blocked Work: OBI artifact; Flutter validation. Pivoted Work Completed: no new pivot.",
  "Changed files:",
  "- `/home/xel/git/pi-package-development-loop/extensions/development-goal-prompts.ts` — clarified report requirements.",
  "Validation evidence:",
  "- `npm test` (pass)",
  "- `git diff --check` (pass)",
  "Blocked Work: OBI artifact; Flutter validation.",
  "Pivoted Work Completed: no new pivot.",
  "Possible next steps:",
  "- Continue with parser extraction cleanup.",
].join("\n")), {
  summary: "Blocked Work: OBI artifact; Flutter validation. Pivoted Work Completed: no new pivot.",
  blockerState: "OBI artifact; Flutter validation.",
  nextSteps: ["Continue with parser extraction cleanup."],
  changedFiles: ["/home/xel/git/pi-package-development-loop/extensions/development-goal-prompts.ts"],
  validationCommands: ["npm test", "git diff --check"],
});
