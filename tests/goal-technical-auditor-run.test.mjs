import assert from "node:assert/strict";
import {
  RUN_ENTRY_TYPE,
  applyRunEvent,
  completionBlocker,
  createAuditRun,
  formatRunStatus,
  nextRunAction,
  renderAuditLedger,
  restoreAuditRun,
} from "../extensions/goal-technical-auditor/lib/run.js";

const base = createAuditRun({
  id: "run-1",
  cwd: "/repo",
  branch: "feature/audit",
  upstream: "origin/feature/audit",
  scope: "extensions",
  objective: "audit extensions",
  tokenBudget: "700k",
  ledgerPath: "/repo/docs/audits/extensions-2026-07-13-goal-technical-auditor.md",
  now: 1,
});
assert.equal(base.phase, "preflight");
assert.equal(nextRunAction(base), "submit preflight evidence and validation commands");
assert.throws(() => applyRunEvent(base, { type: "finding_started", findingId: "F-1" }), /preflight/);

const audited = applyRunEvent(
  applyRunEvent(base, {
    type: "preflight_recorded",
    baselineCommit: "aaa111",
    latestGreenCommit: "aaa111",
    focusedValidationCommands: ["node test.mjs"],
    projectValidationCommands: ["npm test"],
    receipts: [{ command: "npm test", code: 0 }],
    now: 2,
  }),
  {
    type: "audit_recorded",
    findings: [{
      id: "F-1",
      title: "Premature completion",
      severity: "High",
      evidence: "extensions/goal/index.js:224-241",
      recommendation: "Gate completion",
      safe: true,
    }],
    now: 3,
  },
);
assert.equal(audited.phase, "implementing");
assert.equal(audited.findings[0].status, "pending");
assert.match(completionBlocker(audited), /F-1/);

const active = applyRunEvent(audited, { type: "finding_started", findingId: "F-1", sliceBaseCommit: "aaa111", now: 4 });
const failedOnce = applyRunEvent(active, { type: "finding_validation_failed", receipts: [{ command: "npm test", code: 1 }], now: 5 });
assert.equal(failedOnce.findings[0].attempts, 1);
assert.equal(failedOnce.findings[0].status, "active");
const failedTwice = applyRunEvent(failedOnce, { type: "finding_validation_failed", receipts: [{ command: "npm test", code: 1 }], stashRef: "stash@{0}", now: 6 });
assert.equal(failedTwice.findings[0].status, "failed");
assert.match(completionBlocker(failedTwice), /failed/);
const deferred = applyRunEvent(active, { type: "finding_deferred", findingId: "F-1", status: "deferred", reason: "owner chose later", stashRef: "stash@{1}", now: 6 });
assert.equal(deferred.findings[0].status, "deferred");
assert.equal(deferred.findings[0].stashRef, "stash@{1}");

const fixed = applyRunEvent(active, { type: "finding_fixed", receipts: [{ command: "npm test", code: 0 }], commit: "bbb222", now: 7 });
const reauditing = applyRunEvent(fixed, { type: "reaudit_requested", now: 8 });
const cleanAudit = applyRunEvent(reauditing, { type: "audit_recorded", findings: [], now: 9 });
assert.equal(cleanAudit.phase, "final_validation");
const verified = applyRunEvent(cleanAudit, { type: "final_validation_passed", receipts: [{ command: "npm test", code: 0 }], ledgerCommit: "ccc333", now: 10 });
assert.equal(verified.phase, "delivery_pending");
assert.match(completionBlocker(verified), /delivery_pending/);
const delivered = applyRunEvent(verified, { type: "push_succeeded", remote: "origin", branch: "feature/audit", now: 11 });
assert.equal(completionBlocker(delivered), null);
assert.equal(delivered.phase, "ready_to_complete");

const ledger = renderAuditLedger(delivered);
assert.match(ledger, /# Goal Technical Auditor Ledger/);
assert.match(ledger, /F-1/);
assert.match(ledger, /bbb222/);
assert.match(ledger, /npm test/);
assert.match(formatRunStatus(delivered), /ready_to_complete/);

const restored = restoreAuditRun([
  { type: "custom", customType: RUN_ENTRY_TYPE, data: { run: base } },
  { type: "custom", customType: RUN_ENTRY_TYPE, data: { run: delivered } },
]);
assert.equal(restored.phase, "ready_to_complete");

const failingBaseline = applyRunEvent(base, {
  type: "preflight_recorded",
  baselineCommit: "aaa111",
  latestGreenCommit: "aaa111",
  focusedValidationCommands: [],
  projectValidationCommands: ["npm test"],
  receipts: [{ command: "npm test", code: 1 }],
});
const noAuditFindings = applyRunEvent(failingBaseline, { type: "audit_recorded", findings: [] });
assert.equal(noAuditFindings.phase, "implementing");
assert.equal(noAuditFindings.findings[0].id, "M0-1");

console.log("goal-technical-auditor-run ok");
