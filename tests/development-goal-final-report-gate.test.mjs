import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const jitiEntry = "/home/xel/.nvm/versions/node/v22.21.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs";
const { createJiti } = require(jitiEntry);
const jiti = createJiti(import.meta.url, { interopDefault: true });
const gateMod = await jiti.import(path.join(root, "lib", "goal", "final-report-gate.ts"));

assert.equal(typeof gateMod.evaluateFinalReportGate, "function");

const invalidContinueReport = [
  "Scope: /repo with adapter generic-git.",
  "Changed files:",
  "- `README.md` — changed docs.",
  "Validation evidence: npm test (pass).",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"continue","summary":"all good","changedFiles":["changed files"],"validationCommands":["npm test"],"nextSteps":["Continue"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: continue",
].join("\n");

assert.deepEqual(gateMod.evaluateFinalReportGate(invalidContinueReport, { usedReportRepairRetry: false }), {
  action: "repair",
  report: {
    decision: "continue",
    finalStatus: undefined,
    validated: true,
    deliveryEvidence: {
      summary: "all good",
      nextSteps: ["Continue"],
      changedFiles: ["changed files"],
      validationCommands: ["npm test"],
      reportQualityWarnings: [
        "missing Blocked Work section",
        "missing Pivoted Work Completed section",
        "relative human-readable changed file \"README.md\"",
        "vague DEV_GOAL_REPORT.changedFiles entry \"changed files\"",
      ],
    },
    quality: {
      valid: false,
      issues: [
        { code: "missing_blocked_work", message: "missing Blocked Work section" },
        { code: "missing_pivoted_work_completed", message: "missing Pivoted Work Completed section" },
        { code: "relative_human_changed_file", message: "relative human-readable changed file \"README.md\"", value: "README.md" },
        { code: "vague_typed_changed_file", message: "vague DEV_GOAL_REPORT.changedFiles entry \"changed files\"", value: "changed files" },
      ],
    },
  },
  deliveryEvidence: {
    summary: "all good",
    nextSteps: ["Continue"],
    changedFiles: ["changed files"],
    validationCommands: ["npm test"],
    reportQualityWarnings: [
      "missing Blocked Work section",
      "missing Pivoted Work Completed section",
      "relative human-readable changed file \"README.md\"",
      "vague DEV_GOAL_REPORT.changedFiles entry \"changed files\"",
    ],
  },
  issueCodes: ["missing_blocked_work", "missing_pivoted_work_completed", "relative_human_changed_file", "vague_typed_changed_file"],
  logEvent: {
    event: "malformed_final_report_repair_requested",
    reason: "malformed_final_report",
    blockerKind: "malformed_final_report",
    reportQualityIssueCodes: ["missing_blocked_work", "missing_pivoted_work_completed", "relative_human_changed_file", "vague_typed_changed_file"],
  },
});

assert.deepEqual(gateMod.evaluateFinalReportGate(invalidContinueReport, { usedReportRepairRetry: true }), {
  action: "block",
  report: gateMod.evaluateFinalReportGate(invalidContinueReport, { usedReportRepairRetry: false }).report,
  deliveryEvidence: gateMod.evaluateFinalReportGate(invalidContinueReport, { usedReportRepairRetry: false }).deliveryEvidence,
  issueCodes: ["missing_blocked_work", "missing_pivoted_work_completed", "relative_human_changed_file", "vague_typed_changed_file"],
  blockerKind: "malformed_final_report",
  blockerState: "missing_blocked_work; missing_pivoted_work_completed; relative_human_changed_file; vague_typed_changed_file",
  logEvent: {
    reason: "malformed_final_report",
    blockerKind: "malformed_final_report",
    blockerState: "missing_blocked_work; missing_pivoted_work_completed; relative_human_changed_file; vague_typed_changed_file",
    reportQualityIssueCodes: ["missing_blocked_work", "missing_pivoted_work_completed", "relative_human_changed_file", "vague_typed_changed_file"],
  },
});

const validReport = [
  "Scope: /repo with adapter generic-git.",
  "Changed files:",
  "- `/repo/README.md` — changed docs.",
  "Validation evidence: npm test (pass).",
  "Blocked Work: none",
  "Pivoted Work Completed: none",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"continue","summary":"Documented reporting","blockedWork":"none","pivotedWorkCompleted":"none","changedFiles":["/repo/README.md"],"validationCommands":["npm test"],"nextSteps":["Continue"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: continue",
].join("\n");

const accepted = gateMod.evaluateFinalReportGate(validReport, { usedReportRepairRetry: false });
assert.equal(accepted.action, "accept");
assert.equal(accepted.report.quality.valid, true);
assert.deepEqual(accepted.issueCodes, []);
assert.deepEqual(accepted.deliveryEvidence.changedFiles, ["/repo/README.md"]);

const doneWithActionableNextStep = [
  "Scope: /repo with adapter generic-git.",
  "Changed files:",
  "- `/repo/progress.json` — queued the next row.",
  "Validation evidence: npm test (pass).",
  "Blocked Work: none",
  "Pivoted Work Completed: none",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"done","summary":"Queued next row","goalAchieved":true,"goalEvidence":"Progress row was queued in /repo/progress.json and validated with npm test.","blockedWork":"none","pivotedWorkCompleted":"none","changedFiles":["/repo/progress.json"],"validationCommands":["npm test"],"nextSteps":["Build row: Internal session search tool package rehome"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: done",
].join("\n");

const actionableDone = gateMod.evaluateFinalReportGate(doneWithActionableNextStep, { usedReportRepairRetry: false });
assert.equal(actionableDone.action, "repair");
assert.deepEqual(actionableDone.issueCodes, ["done_with_actionable_next_step"]);

const doneMissingGoalProof = [
  "Scope: /repo with adapter generic-git.",
  "Validation evidence: npm test (pass).",
  "Blocked Work: none",
  "Pivoted Work Completed: none",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"done","summary":"Stable slice shipped","blockedWork":"none","pivotedWorkCompleted":"none","changedFiles":["/repo/progress.json"],"validationCommands":["npm test"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: done",
].join("\n");
const missingGoalProof = gateMod.evaluateFinalReportGate(doneMissingGoalProof, { usedReportRepairRetry: false });
assert.equal(missingGoalProof.action, "repair");
assert.deepEqual(missingGoalProof.issueCodes, ["missing_goal_achieved", "missing_goal_evidence"]);

const blockedWithLocalRepairNextStep = [
  "Scope: /repo with adapter generic-git.",
  "Validation evidence: flutter test selected unit card (fail: expected detail route, got /monitoreo).",
  "Blocked Work: selected-unit detail navigation proof remains incomplete.",
  "Pivoted Work Completed: none.",
  'DEV_GOAL_REPORT: {"validated":false,"decision":"blocked","summary":"Route assertion still fails.","goalAchieved":false,"goalEvidence":"Not achieved; router stayed on /monitoreo instead of /unidades/detail/42.","blockerState":"Same local validation blocker after one repair.","blockedWork":"selected-unit detail navigation proof remains incomplete","pivotedWorkCompleted":"none","validationCommands":["flutter test selected unit card (fail)"],"nextSteps":["Inspect callback/router context boundary in MonitoreoScreen selected VehicleStatusCard action.","Verify callback fires, then fix route push seam."]}',
  "DEV_GOAL_VALIDATED: no",
  "DEV_GOAL_DECISION: blocked",
].join("\n");
const actionableBlocked = gateMod.evaluateFinalReportGate(blockedWithLocalRepairNextStep, { usedReportRepairRetry: false });
assert.equal(actionableBlocked.action, "repair");
assert.deepEqual(actionableBlocked.issueCodes, ["blocked_with_actionable_next_step"]);

const blockedWithProveAndIsolateNextSteps = [
  "Scope: /repo with adapter generic-git.",
  "Validation evidence: selected shell view test (fail: expected detail route, got /monitoreo).",
  "Blocked Work: RN->Flutter parity selected-unit detail navigation proof.",
  "Pivoted Work Completed: none.",
  'DEV_GOAL_REPORT: {"validated":false,"decision":"blocked","summary":"Focused route test still fails.","goalAchieved":false,"goalEvidence":"Objective not achieved; focused widget test still fails expected /unidades/detail/42 actual /monitoreo.","blockerState":"Focused test fails same route no-op after one repair attempt.","blockedWork":"RN->Flutter parity selected-unit detail navigation proof.","pivotedWorkCompleted":"none","validationCommands":["flutter test selected shell view (fail)","git diff --check (pass)"],"nextSteps":["Prove router.push(\'/unidades/detail/42\') works in same test harness.","Then isolate why VehicleStatusCard callback/context does not navigate."]}',
  "DEV_GOAL_VALIDATED: no",
  "DEV_GOAL_DECISION: blocked",
].join("\n");
const actionableProveAndIsolate = gateMod.evaluateFinalReportGate(blockedWithProveAndIsolateNextSteps, { usedReportRepairRetry: false });
assert.equal(actionableProveAndIsolate.action, "repair");
assert.deepEqual(actionableProveAndIsolate.issueCodes, ["blocked_with_actionable_next_step"]);

assert.deepEqual(gateMod.evaluateFinalReportGate("No markers", { usedReportRepairRetry: false }), {
  action: "parse_error",
  error: {
    code: "missing_final_marker",
    message: "missing DEV_GOAL_VALIDATED/DEV_GOAL_DECISION final marker block",
  },
  deliveryEvidence: {
    reportQualityWarnings: [
      "missing Blocked Work section",
      "missing Pivoted Work Completed section",
    ],
  },
});
