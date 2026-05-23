import type { FinalReport } from "./report-parser.ts";
import type { WorktreeRiskVerdict } from "./worktree-risk.ts";

export type TerminalAuditInput = {
  report?: FinalReport;
  queueEmpty?: boolean;
  requireReviewOnEmptyQueue?: boolean;
  worktreeRisk?: WorktreeRiskVerdict;
};

export type TerminalAuditEvent = {
  event: "loop_finished" | "loop_blocked";
  decision: "stop" | "blocked" | "done";
  finalStatus?: string;
  reason: string;
  summary?: string;
  blockerState?: string;
};

export function terminalAuditEvent(input: TerminalAuditInput): TerminalAuditEvent | undefined {
  if (input.report?.decision === "blocked") {
    return {
      event: "loop_blocked",
      decision: "blocked",
      finalStatus: "blocked",
      reason: "blocked",
      ...reportEvidence(input.report),
    };
  }

  if (input.worktreeRisk?.action === "stop") {
    return {
      event: "loop_finished",
      decision: "stop",
      finalStatus: input.worktreeRisk.finalStatus,
      reason: "unsafe_dirty_worktree",
      blockerState: input.worktreeRisk.reasons.join("; "),
    };
  }

  if (input.queueEmpty && input.requireReviewOnEmptyQueue) {
    return {
      event: "loop_finished",
      decision: "stop",
      finalStatus: "review_needed",
      reason: "empty_queue_review_needed",
    };
  }

  if (input.report?.decision === "stop" && input.report.finalStatus === "review_needed") {
    return {
      event: "loop_finished",
      decision: "stop",
      finalStatus: "review_needed",
      reason: "review_needed",
      ...reportEvidence(input.report),
    };
  }

  if (input.report?.decision === "done") {
    return {
      event: "loop_finished",
      decision: "done",
      finalStatus: "done",
      reason: "done",
      ...reportEvidence(input.report),
    };
  }

  return undefined;
}

function reportEvidence(report: FinalReport): Pick<TerminalAuditEvent, "summary" | "blockerState"> {
  return {
    ...(report.deliveryEvidence.summary ? { summary: report.deliveryEvidence.summary } : {}),
    ...(report.deliveryEvidence.blockerState ? { blockerState: report.deliveryEvidence.blockerState } : {}),
  };
}
