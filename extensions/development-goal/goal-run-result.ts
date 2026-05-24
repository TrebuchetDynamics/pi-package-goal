import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { likelyBlockerCause, nextSafeBlockerAction } from "./blocker.ts";
import { evaluateFinalReportGate } from "./final-report-gate.ts";
import type { LoopLogRecord } from "./logger.ts";
import {
  hasContextOverflowProviderError,
  hasTransportProviderError,
} from "./provider-error.ts";
import { terminalAuditEvent } from "./terminal-audit.ts";
import {
  CUSTOM_STATE_TYPE,
  hasIterationCap,
} from "./state.ts";
import {
  transitionBlocked,
  transitionContextOverflowWaiting,
  transitionEmptyResponseWaiting,
  transitionIterationReported,
  transitionMaxIterationsReached,
  transitionProviderTransportWaiting,
  transitionReportRepairRetryCleared,
  transitionResponseRetryCountersCleared,
  transitionTerminalDecision,
} from "./goal-run-transitions.ts";
import {
  compactBeforeNextIteration,
  queueNextIteration,
  requestContextOverflowCompaction,
  requestMissingMarkerRecovery,
  requestReportRepair,
  scheduleEmptyResponseRetry,
  scheduleTransportErrorRetry,
  type GoalRunControllerDeps,
  type UiLikeContext,
} from "./goal-run-controller.ts";

type LoopDecision = "continue" | "stop" | "blocked" | "done";

type AssistantMessage = { role?: string; content?: unknown; stopReason?: string };

const EMPTY_RESPONSE_MAX_RETRIES = 2;
const MISSING_MARKER_RECOVERY_MAX_RETRIES = 1;

export function handleGoalRunAssistantResult(pi: ExtensionAPI, ctx: UiLikeContext, messages: AssistantMessage[], assistantText: string, deps: GoalRunControllerDeps): boolean {
  const state = deps.getState();
  if (!state.active || state.phase !== "running") return false;

  const finalReportGate = evaluateFinalReportGate(assistantText, { usedReportRepairRetry: state.usedReportRepairRetry });
  const finalReport = "report" in finalReportGate ? finalReportGate.report : undefined;
  const decision = finalReport?.decision;
  const validated = finalReport?.validated;
  const deliveryEvidence = finalReportGate.deliveryEvidence;

  if (!decision) {
    if (hasContextOverflowProviderError(messages)) {
      const alreadyWaitingForContextOverflowCompaction = state.lastReason === "context_overflow_waiting_for_compaction";
      const waitingState = transitionContextOverflowWaiting(state);
      deps.setState(waitingState);
      deps.appendLoopLog("context_overflow_waiting_for_compaction", { reason: "provider_context_length_exceeded" });
      pi.appendEntry(CUSTOM_STATE_TYPE, waitingState);
      deps.refreshUi(ctx);
      deps.notify(ctx, "Development goal is waiting for compaction after a provider context-overflow error.", "warning");
      if (!alreadyWaitingForContextOverflowCompaction) requestContextOverflowCompaction(pi, ctx, deps);
      return true;
    }

    if (hasTransportProviderError(messages)) {
      const transportRetries = (state.emptyResponseRetries ?? 0) + 1;
      if (transportRetries > EMPTY_RESPONSE_MAX_RETRIES) {
        blockGoalRun(pi, ctx, deps, "provider transport error retry limit reached", "blocked", { blockerKind: "provider_transport_error", blockerState: "provider transport error retry limit reached" });
        return true;
      }
      const waitingState = transitionProviderTransportWaiting(state, transportRetries);
      deps.setState(waitingState);
      deps.appendLoopLog("provider_transport_error_waiting_for_retry", { reason: "provider_transport_error", providerError: "transport" });
      pi.appendEntry(CUSTOM_STATE_TYPE, waitingState);
      deps.refreshUi(ctx);
      deps.notify(ctx, "Development goal is retrying the same iteration after a provider transport error.");
      scheduleTransportErrorRetry(pi, ctx, deps, waitingState.iteration, transportRetries);
      return true;
    }

    if (!assistantText.trim()) {
      const emptyResponseRetries = (state.emptyResponseRetries ?? 0) + 1;
      if (emptyResponseRetries > EMPTY_RESPONSE_MAX_RETRIES) {
        blockGoalRun(pi, ctx, deps, "empty provider response retry limit reached");
        return true;
      }
      const waitingState = transitionEmptyResponseWaiting(state, emptyResponseRetries);
      deps.setState(waitingState);
      deps.appendLoopLog("empty_agent_response_waiting_for_compaction", { reason: "missing_assistant_text" });
      pi.appendEntry(CUSTOM_STATE_TYPE, waitingState);
      deps.refreshUi(ctx);
      deps.notify(ctx, "Development goal is waiting for compaction or retry after an empty provider response.", "warning");
      scheduleEmptyResponseRetry(pi, ctx, deps, waitingState.iteration, emptyResponseRetries);
      return true;
    }

    if ((state.markerRecoveryRetries ?? 0) >= MISSING_MARKER_RECOVERY_MAX_RETRIES) {
      blockGoalRun(pi, ctx, deps, "missing DEV_GOAL_DECISION final marker after recovery request");
      return true;
    }
    requestMissingMarkerRecovery(pi, ctx, deps);
    return true;
  }

  let currentState = state;
  if (currentState.emptyResponseRetries || currentState.markerRecoveryRetries) {
    currentState = transitionResponseRetryCountersCleared(currentState);
    deps.setState(currentState);
  }

  if (finalReportGate.action === "repair") {
    requestReportRepair(pi, ctx, deps, finalReportGate.report, finalReportGate.logEvent);
    return true;
  }

  if (finalReportGate.action === "block") {
    blockGoalRun(pi, ctx, deps, "malformed_final_report", "blocked", finalReportGate.logEvent);
    return true;
  }

  if (currentState.usedReportRepairRetry) {
    currentState = transitionReportRepairRetryCleared(currentState);
    deps.setState(currentState);
  }

  if (requiresValidation(decision) && validated !== true) {
    blockGoalRun(pi, ctx, deps, "missing DEV_GOAL_VALIDATED: yes for continue/done decision", decision);
    return true;
  }

  if (decision === "blocked" || decision === "stop" || decision === "done") {
    const audit = finalReport ? terminalAuditEvent({ report: finalReport }) : undefined;
    const finalStatus = audit?.finalStatus;
    const terminalState = transitionTerminalDecision(currentState, decision, finalStatus);
    deps.setState(terminalState);
    const logExtra = { decision, reason: audit?.reason || decision, ...deliveryEvidence, ...(finalStatus ? { finalStatus } : {}) };
    deps.appendLoopLog(audit?.event || "loop_finished", logExtra);
    if (audit?.event === "loop_blocked") {
      deps.appendLoopLog("loop_postmortem", {
        decision,
        reason: audit.reason,
        blockerState: deliveryEvidence.blockerState,
        nextSteps: deliveryEvidence.nextSteps,
        likelyCause: likelyBlockerCause(audit.reason),
        nextSafeAction: nextSafeBlockerAction(audit.reason),
      });
    }
    pi.appendEntry(CUSTOM_STATE_TYPE, terminalState);
    deps.refreshUi(ctx);
    deps.notify(ctx, `Development goal ${decision}.`);
    return true;
  }

  const reportedState = transitionIterationReported(currentState, decision, deliveryEvidence);
  deps.setState(reportedState);
  deps.appendLoopLog("iteration_result", { decision, ...deliveryEvidence });
  pi.appendEntry(CUSTOM_STATE_TYPE, reportedState);
  deps.refreshUi(ctx);

  if (hasIterationCap(reportedState) && reportedState.iteration >= reportedState.maxIterations) {
    const terminalState = transitionMaxIterationsReached(reportedState);
    deps.setState(terminalState);
    deps.appendLoopLog("loop_finished", { decision: "done", reason: "max_iterations_reached", ...deliveryEvidence });
    pi.appendEntry(CUSTOM_STATE_TYPE, terminalState);
    deps.refreshUi(ctx);
    deps.notify(ctx, `Development goal stopped after ${terminalState.iteration}/${terminalState.maxIterations} iteration(s).`);
    return true;
  }

  if (compactBeforeNextIteration(pi, ctx, deps)) return true;
  queueNextIteration(pi, ctx, deps);
  return true;
}

function blockGoalRun(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, reason: string, decision?: string, extra: Partial<LoopLogRecord> = {}) {
  const blockedState = transitionBlocked(deps.getState(), reason, decision ?? "blocked");
  deps.setState(blockedState);
  deps.appendLoopLog("loop_blocked", { decision, reason, ...extra });
  deps.appendLoopLog("loop_postmortem", {
    decision: decision ?? "blocked",
    reason,
    blockerState: extra.blockerState,
    likelyCause: likelyBlockerCause(reason),
    nextSafeAction: nextSafeBlockerAction(reason),
  });
  pi.appendEntry(CUSTOM_STATE_TYPE, blockedState);
  deps.refreshUi(ctx);
  deps.notify(ctx, `Development goal blocked: ${reason}`, "warning");
}

function requiresValidation(decision: LoopDecision): boolean {
  return decision === "continue" || decision === "done";
}
