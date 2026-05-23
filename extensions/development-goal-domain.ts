export type LoopPhase = "idle" | "started" | "queued" | "running" | "reported" | "paused" | "blocked" | "done";
export type LoopDecision = "continue" | "stop" | "blocked" | "done";
export type ObjectiveKind = "short" | "oversized" | "provider-noise";

export type DeliveryEvidence = {
  summary?: string;
  blockerState?: string;
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
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
  phase: LoopPhase;
  lastDecision?: LoopDecision | string;
  lastReason?: string;
  commit: boolean;
  push: boolean;
  emptyResponseRetries?: number;
  markerRecoveryRetries?: number;
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
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
  likelyCause?: string;
  nextSafeAction?: string;
  logPath: string;
};

export type BlockerRecord = Pick<LoopEvent, "decision" | "reason" | "blockerState" | "nextSteps" | "likelyCause" | "nextSafeAction">;
