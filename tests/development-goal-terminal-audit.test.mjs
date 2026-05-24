import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const jitiEntry = "/home/xel/.nvm/versions/node/v22.21.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs";
const { createJiti } = require(jitiEntry);
const jiti = createJiti(import.meta.url, { interopDefault: true });
const auditMod = await jiti.import(path.join(root, "lib", "goal", "terminal-audit.ts"));

assert.equal(typeof auditMod.terminalAuditEvent, "function");

assert.deepEqual(auditMod.terminalAuditEvent({
  queueEmpty: true,
  requireReviewOnEmptyQueue: true,
}), {
  event: "loop_finished",
  decision: "stop",
  finalStatus: "review_needed",
  reason: "empty_queue_review_needed",
});

assert.deepEqual(auditMod.terminalAuditEvent({
  worktreeRisk: {
    action: "stop",
    finalStatus: "review_needed",
    reasons: ["untracked files 89 exceeds max 50"],
  },
}), {
  event: "loop_finished",
  decision: "stop",
  finalStatus: "review_needed",
  reason: "unsafe_dirty_worktree",
  blockerState: "untracked files 89 exceeds max 50",
});

assert.deepEqual(auditMod.terminalAuditEvent({
  report: {
    decision: "blocked",
    finalStatus: "blocked",
    validated: false,
    deliveryEvidence: {
      blockerState: "TEST_TOKEN missing",
    },
  },
}), {
  event: "loop_blocked",
  decision: "blocked",
  finalStatus: "blocked",
  reason: "blocked",
  blockerState: "TEST_TOKEN missing",
});

assert.deepEqual(auditMod.terminalAuditEvent({
  report: {
    decision: "stop",
    finalStatus: "review_needed",
    validated: true,
    deliveryEvidence: {
      summary: "human review required",
    },
  },
}), {
  event: "loop_finished",
  decision: "stop",
  finalStatus: "review_needed",
  reason: "review_needed",
  summary: "human review required",
});
