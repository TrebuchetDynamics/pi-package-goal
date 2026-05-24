import type { DeliveryEvidence, LoopDecision } from "./domain.ts";
import type { LoopState } from "./state.ts";

export type StartGoalRunInput = Pick<LoopState, "topic" | "logPath" | "commit" | "push" | "maxIterations"> & {
  defaultsName: string;
  runId: string;
  startedAt: string;
  tokenBudget?: number;
  requiredSkill?: string;
  commandIntent?: string;
  allWorktreeChangesInScope?: boolean;
};

export function startGoalRun(input: StartGoalRunInput): LoopState {
  return {
    active: true,
    // `adapterName` is legacy audit/state vocabulary; keep value for compatibility.
    adapterName: input.defaultsName,
    runId: input.runId,
    topic: input.topic,
    iteration: 1,
    maxIterations: input.maxIterations,
    startedAt: input.startedAt,
    logPath: input.logPath,
    ...(input.tokenBudget ? { tokenBudget: input.tokenBudget } : {}),
    ...(input.requiredSkill ? { requiredSkill: input.requiredSkill } : {}),
    ...(input.commandIntent ? { commandIntent: input.commandIntent } : {}),
    ...(input.allWorktreeChangesInScope ? { allWorktreeChangesInScope: true } : {}),
    phase: "started",
    commit: input.commit,
    push: input.push,
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
    autoContinueCount: 0,
  };
}

export function transitionTerminalDecision(s: LoopState, decision: Exclude<LoopDecision, "continue">, finalStatus?: string): LoopState {
  return {
    ...s,
    active: false,
    phase: decision === "done" ? "done" : decision === "blocked" ? "blocked" : "idle",
    lastDecision: decision,
    ...(finalStatus ? { lastReason: finalStatus } : {}),
  };
}

export function transitionIterationReported(s: LoopState, decision: LoopDecision, deliveryEvidence: DeliveryEvidence): LoopState {
  return {
    ...s,
    phase: "reported",
    lastDecision: decision,
    ...(deliveryEvidence.broadScoutCache ? { broadScoutCache: deliveryEvidence.broadScoutCache } : {}),
  };
}

export function transitionMaxIterationsReached(s: LoopState): LoopState {
  return {
    ...s,
    active: false,
    phase: "done",
    lastDecision: "done",
    lastReason: "max_iterations_reached",
  };
}

export function queueNextIterationState(s: LoopState, lastReason?: string): LoopState {
  return {
    ...s,
    iteration: s.iteration + 1,
    phase: "queued",
    ...(lastReason ? { lastReason } : {}),
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
  };
}

export function deferFirstPromptState(s: LoopState): LoopState {
  return { ...s, phase: "queued" };
}

export function transitionPromptSent(s: LoopState, asFollowUp: boolean): LoopState {
  return {
    ...s,
    phase: asFollowUp ? "queued" : "running",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
    autoContinueCount: (s.autoContinueCount ?? 0) + 1,
  };
}

export function transitionPromptNowRunning(s: LoopState): LoopState {
  return { ...s, phase: "running" };
}

export function transitionPaused(s: LoopState, lastReason: string): LoopState {
  return { ...s, phase: "paused", lastReason };
}

export function transitionResumed(s: LoopState): LoopState {
  return {
    ...s,
    phase: "queued",
    lastReason: "resumed_by_user",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
    autoContinueCount: 0,
  };
}

export function transitionBlocked(s: LoopState, reason: string, decision: string = "blocked"): LoopState {
  return {
    ...s,
    active: false,
    phase: "blocked",
    lastDecision: decision,
    lastReason: reason,
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
  };
}

export function transitionAutoContinueLimited(s: LoopState): LoopState {
  return {
    ...s,
    phase: "paused",
    lastReason: "auto_continue_limit_reached",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
  };
}

export function transitionRetryCounterRestored(s: LoopState, retryNumber: number): LoopState {
  return { ...s, emptyResponseRetries: retryNumber };
}

export function transitionContextOverflowWaiting(s: LoopState): LoopState {
  return {
    ...s,
    phase: "running",
    lastReason: "context_overflow_waiting_for_compaction",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
  };
}

export function transitionProviderTransportWaiting(s: LoopState, transportRetries: number): LoopState {
  return {
    ...s,
    phase: "running",
    lastReason: "provider_transport_error_waiting_for_retry",
    emptyResponseRetries: transportRetries,
    markerRecoveryRetries: 0,
  };
}

export function transitionEmptyResponseWaiting(s: LoopState, emptyResponseRetries: number): LoopState {
  return {
    ...s,
    phase: "running",
    lastReason: "empty_agent_response_waiting_for_compaction",
    emptyResponseRetries,
    markerRecoveryRetries: 0,
  };
}

export function transitionResponseRetryCountersCleared(s: LoopState): LoopState {
  return { ...s, emptyResponseRetries: 0, markerRecoveryRetries: 0 };
}

export function transitionReportRepairRetryCleared(s: LoopState): LoopState {
  return { ...s, usedReportRepairRetry: false };
}

export function transitionPreparingForCompaction(s: LoopState): LoopState {
  return { ...s, lastReason: "preparing_for_compaction" };
}

export function transitionUserSteering(s: LoopState, topic: string): LoopState {
  return { ...s, topic, lastReason: "user_steering" };
}

export function transitionStoppedByUser(s: LoopState): LoopState {
  return { ...s, active: false, phase: "idle", lastDecision: "stopped_by_user" };
}

export function transitionLastReason(s: LoopState, lastReason: string): LoopState {
  return { ...s, lastReason };
}

export function transitionCompactionResumeQueued(s: LoopState): LoopState {
  return { ...s, phase: "queued", lastReason: "resuming_after_compaction" };
}

export function transitionCompactionResumeSent(s: LoopState): LoopState {
  return {
    ...s,
    phase: "running",
    lastReason: "resumed_after_compaction",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: false,
  };
}

export function transitionReportRepairRequested(s: LoopState): LoopState {
  return {
    ...s,
    phase: "running",
    lastReason: "malformed_final_report_repair_requested",
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    usedReportRepairRetry: true,
  };
}

export function transitionMissingMarkerRecoveryRequested(s: LoopState, retryNumber: number): LoopState {
  return {
    ...s,
    phase: "running",
    lastReason: "missing_final_marker_recovery_requested",
    emptyResponseRetries: 0,
    markerRecoveryRetries: retryNumber,
  };
}

export function transitionRetryingAfterEmptyProviderResponse(s: LoopState): LoopState {
  return { ...s, lastReason: "retrying_after_empty_provider_response" };
}

export function transitionRetryingAfterProviderTransport(s: LoopState): LoopState {
  return { ...s, lastReason: "retrying_after_provider_transport_error" };
}
