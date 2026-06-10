import assert from "node:assert/strict";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const parserMod = await import(path.join(root, "lib", "goal", "report-parser.ts"));

assert.equal(typeof parserMod.parseFinalReport, "function");
assert.equal(typeof parserMod.parseLoopDeliveryEvidence, "function");
assert.equal(typeof parserMod.validateReportQuality, "function");
assert.equal(typeof parserMod.validateReportQualityIssues, "function");

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
  quality: {
    valid: false,
    issues: [
      { code: "missing_blocked_work", message: "missing Blocked Work section" },
      { code: "missing_pivoted_work_completed", message: "missing Pivoted Work Completed section" },
      { code: "missing_goal_achieved", message: "done report missing goalAchieved/Goal achieved evidence" },
      { code: "missing_goal_evidence", message: "done report missing goalEvidence explaining how the objective was achieved" },
    ],
  },
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
  quality: {
    valid: false,
    issues: [
      { code: "missing_blocked_work", message: "missing Blocked Work section" },
      { code: "missing_pivoted_work_completed", message: "missing Pivoted Work Completed section" },
    ],
  },
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
    reportQualityWarnings: [
      "missing Blocked Work section",
      "missing Pivoted Work Completed section",
    ],
  },
  quality: {
    valid: false,
    issues: [
      { code: "missing_blocked_work", message: "missing Blocked Work section" },
      { code: "missing_pivoted_work_completed", message: "missing Pivoted Work Completed section" },
    ],
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
  "- `/home/xel/git/pi-package-development-loop/extensions/development-goal/prompts.ts` — clarified report requirements.",
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
  blockedWork: "OBI artifact; Flutter validation.",
  pivotedWorkCompleted: "no new pivot.",
  nextSteps: ["Continue with parser extraction cleanup."],
  changedFiles: ["/home/xel/git/pi-package-development-loop/extensions/development-goal/prompts.ts"],
  validationCommands: ["npm test", "git diff --check"],
});

const reportWithCodeSpansInChangedDescriptions = [
  "Scope: /repo with adapter generic-git.",
  "Changed files:",
  "- /repo/workspace/workspace.go — moved implementation into the `workspace` package.",
  "- /repo/architecture_layout_test.go — removed root `.go` test coverage.",
  "Blocked Work: none.",
  "Pivoted Work Completed: none.",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"continue","blockedWork":"none","pivotedWorkCompleted":"none","changedFiles":["/repo/workspace/workspace.go","/repo/architecture_layout_test.go"],"nextSteps":["Keep going"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: continue",
].join("\n");

assert.deepEqual(parserMod.validateReportQualityIssues(reportWithCodeSpansInChangedDescriptions), []);
assert.equal(parseOk(reportWithCodeSpansInChangedDescriptions).quality.valid, true);

const malformedReportText = [
  "Scope: /repo with adapter generic-git.",
  "Changed files:",
  "- `README.md` — documented the behavior.",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"continue","changedFiles":["changed files"],"nextSteps":["Keep going"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: continue",
].join("\n");

assert.deepEqual(parserMod.validateReportQuality(malformedReportText), [
  "missing Blocked Work section",
  "missing Pivoted Work Completed section",
  "relative human-readable changed file \"README.md\"",
  "vague DEV_GOAL_REPORT.changedFiles entry \"changed files\"",
]);

assert.deepEqual(parserMod.validateReportQualityIssues(malformedReportText), [
  { code: "missing_blocked_work", message: "missing Blocked Work section" },
  { code: "missing_pivoted_work_completed", message: "missing Pivoted Work Completed section" },
  { code: "relative_human_changed_file", message: "relative human-readable changed file \"README.md\"", value: "README.md" },
  { code: "vague_typed_changed_file", message: "vague DEV_GOAL_REPORT.changedFiles entry \"changed files\"", value: "changed files" },
]);

assert.deepEqual(parseOk([
  "Scope: /repo with adapter generic-git.",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"continue","blockedWork":"none","pivotedWorkCompleted":"README template updated","changedFiles":["changed files"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: continue",
].join("\n")), {
  decision: "continue",
  finalStatus: undefined,
  validated: true,
  deliveryEvidence: {
    blockerState: "none",
    blockedWork: "none",
    pivotedWorkCompleted: "README template updated",
    changedFiles: ["changed files"],
    reportQualityWarnings: ["vague DEV_GOAL_REPORT.changedFiles entry \"changed files\""],
  },
  quality: {
    valid: false,
    issues: [
      { code: "vague_typed_changed_file", message: "vague DEV_GOAL_REPORT.changedFiles entry \"changed files\"", value: "changed files" },
    ],
  },
});

const doneWithActionableNextStep = [
  "Scope: /repo with adapter generic-git.",
  "Changed files:",
  "- /repo/progress.json — queued the next row.",
  "Validation evidence: npm test (pass).",
  "Blocked Work: none.",
  "Pivoted Work Completed: none.",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"done","summary":"Queued next row","goalAchieved":true,"goalEvidence":"Progress row was queued in /repo/progress.json and validated with npm test.","blockedWork":"none","pivotedWorkCompleted":"none","changedFiles":["/repo/progress.json"],"validationCommands":["npm test"],"nextSteps":["Build row: Internal session search tool package rehome"]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: done",
].join("\n");

const actionableDoneMessage = 'done decision includes actionable goal next step "Build row: Internal session search tool package rehome"; use continue for remaining goal work or make done nextSteps optional/handoff-only';
const doneWithActionableReport = parseOk(doneWithActionableNextStep);
assert.equal(doneWithActionableReport.quality.valid, false);
assert.deepEqual(doneWithActionableReport.quality.issues, [
  { code: "done_with_actionable_next_step", message: actionableDoneMessage, value: "Build row: Internal session search tool package rehome" },
]);
assert.deepEqual(doneWithActionableReport.deliveryEvidence.reportQualityWarnings, [actionableDoneMessage]);

const doneWithOptionalPrNextStep = [
  "Scope: /repo with adapter generic-git.",
  "Changed files:",
  "- /repo/progress.json — published final progress.",
  "Validation evidence: npm test (pass).",
  "Blocked Work: none.",
  "Pivoted Work Completed: none.",
  "Possible next steps: Optional: open or update a pull request from development to main.",
  'DEV_GOAL_REPORT: {"validated":true,"decision":"done","summary":"Published final progress","goalAchieved":true,"goalEvidence":"Final progress was published in /repo/progress.json and validated with npm test.","blockedWork":"none","pivotedWorkCompleted":"none","changedFiles":["/repo/progress.json"],"validationCommands":["npm test"],"nextSteps":["Optional: open or update a pull request from development to main."]}',
  "DEV_GOAL_VALIDATED: yes",
  "DEV_GOAL_DECISION: done",
].join("\n");

assert.equal(parseOk(doneWithOptionalPrNextStep).quality.valid, true);

const blockedWithLocalRepairNextStep = [
  "Scope: /repo with adapter generic-git.",
  "Validation evidence: flutter test selected unit card (fail: expected detail route, got /monitoreo).",
  "Blocked Work: selected-unit detail navigation proof remains incomplete.",
  "Pivoted Work Completed: none.",
  'DEV_GOAL_REPORT: {"validated":false,"decision":"blocked","summary":"Route assertion still fails.","goalAchieved":false,"goalEvidence":"Not achieved; router stayed on /monitoreo instead of /unidades/detail/42.","blockerState":"Same local validation blocker after one repair.","blockedWork":"selected-unit detail navigation proof remains incomplete","pivotedWorkCompleted":"none","validationCommands":["flutter test selected unit card (fail)"],"nextSteps":["Inspect callback/router context boundary in MonitoreoScreen selected VehicleStatusCard action.","Verify callback fires, then fix route push seam."]}',
  "DEV_GOAL_VALIDATED: no",
  "DEV_GOAL_DECISION: blocked",
].join("\n");
const actionableBlockedMessage = 'blocked decision includes local actionable goal next step "Inspect callback/router context boundary in MonitoreoScreen selected VehicleStatusCard action."; use continue while safe local diagnosis or repair remains';
const blockedWithLocalRepairReport = parseOk(blockedWithLocalRepairNextStep);
assert.equal(blockedWithLocalRepairReport.quality.valid, false);
assert.deepEqual(blockedWithLocalRepairReport.quality.issues, [
  { code: "blocked_with_actionable_next_step", message: actionableBlockedMessage, value: "Inspect callback/router context boundary in MonitoreoScreen selected VehicleStatusCard action." },
]);

const blockedOnCredential = [
  "Scope: /repo with adapter generic-git.",
  "Validation evidence: integration test not run (missing TEST_TOKEN).",
  "Blocked Work: integration validation.",
  "Pivoted Work Completed: none.",
  'DEV_GOAL_REPORT: {"validated":false,"decision":"blocked","summary":"Missing credential.","goalAchieved":false,"goalEvidence":"Not achieved; integration validation needs TEST_TOKEN.","blockerState":"Missing TEST_TOKEN credential.","blockedWork":"integration validation","pivotedWorkCompleted":"none","nextSteps":["Add TEST_TOKEN credential, then run integration validation."]}',
  "DEV_GOAL_VALIDATED: no",
  "DEV_GOAL_DECISION: blocked",
].join("\n");
assert.equal(parseOk(blockedOnCredential).quality.valid, true);

const blockedWithProveAndIsolateNextSteps = [
  "Scope: /repo with adapter generic-git.",
  "Validation evidence: selected shell view test (fail: expected detail route, got /monitoreo).",
  "Blocked Work: RN->Flutter parity selected-unit detail navigation proof.",
  "Pivoted Work Completed: none.",
  'DEV_GOAL_REPORT: {"validated":false,"decision":"blocked","summary":"Focused route test still fails.","goalAchieved":false,"goalEvidence":"Objective not achieved; focused widget test still fails expected /unidades/detail/42 actual /monitoreo.","blockerState":"Focused test fails same route no-op after one repair attempt.","blockedWork":"RN->Flutter parity selected-unit detail navigation proof.","pivotedWorkCompleted":"none","validationCommands":["flutter test selected shell view (fail)","git diff --check (pass)"],"nextSteps":["Prove router.push(\'/unidades/detail/42\') works in same test harness.","Then isolate why VehicleStatusCard callback/context does not navigate."]}',
  "DEV_GOAL_VALIDATED: no",
  "DEV_GOAL_DECISION: blocked",
].join("\n");
const proveAndIsolateReport = parseOk(blockedWithProveAndIsolateNextSteps);
assert.equal(proveAndIsolateReport.quality.valid, false);
assert.deepEqual(proveAndIsolateReport.quality.issues, [
  {
    code: "blocked_with_actionable_next_step",
    message: 'blocked decision includes local actionable goal next step "Prove router.push(\'/unidades/detail/42\') works in same test harness."; use continue while safe local diagnosis or repair remains',
    value: "Prove router.push('/unidades/detail/42') works in same test harness.",
  },
]);

console.log("development-goal-report-parser ok");
