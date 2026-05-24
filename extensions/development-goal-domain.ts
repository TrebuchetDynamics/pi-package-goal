export type LoopPhase = "idle" | "started" | "queued" | "running" | "reported" | "paused" | "blocked" | "done";
export type LoopDecision = "continue" | "stop" | "blocked" | "done";
export type ObjectiveKind = "short" | "oversized" | "provider-noise";

export type DeliveryEvidence = {
  summary?: string;
  blockerState?: string;
  blockedWork?: string;
  pivotedWorkCompleted?: string;
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
  reportQualityWarnings?: string[];
};

export type LoopReport = {
  decision?: LoopDecision;
  validated?: boolean;
  deliveryEvidence: DeliveryEvidence;
};

export type DevelopmentLoopRun = {
  active: boolean;
  adapterName: string;
  runId?: string;
  topic: string;
  iteration: number;
  maxIterations: number;
  startedAt: string;
  logPath: string;
  tokenBudget?: number;
  requiredSkill?: string;
  commandIntent?: string;
  allWorktreeChangesInScope?: boolean;
  phase: LoopPhase;
  lastDecision?: LoopDecision | string;
  lastReason?: string;
  commit: boolean;
  push: boolean;
  emptyResponseRetries?: number;
  markerRecoveryRetries?: number;
  usedReportRepairRetry?: boolean;
  autoContinueCount?: number;
};

export type LoopEvent = {
  at: string;
  event: string;
  adapterName: string;
  runId?: string;
  topic: string;
  topicLength?: number;
  topicTruncated?: boolean;
  topicHash?: string;
  topicKind?: ObjectiveKind;
  topicSanitized?: boolean;
  iteration: number;
  maxIterations: number;
  phase: LoopPhase;
  tokenBudget?: number;
  decision?: string;
  reason?: string;
  summary?: string;
  blockerState?: string;
  blockedWork?: string;
  pivotedWorkCompleted?: string;
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
  reportQualityWarnings?: string[];
  reportQualityIssueCodes?: string[];
  blockerKind?: string;
  finalStatus?: string;
  likelyCause?: string;
  nextSafeAction?: string;
  logPath: string;
};

export type BlockerRecord = Pick<LoopEvent, "decision" | "reason" | "blockerState" | "nextSteps" | "likelyCause" | "nextSafeAction">;
