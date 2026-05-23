import type { FinalStatus } from "./development-goal-report-parser.ts";

export type WorktreeRiskStats = {
  changedFiles: number;
  untrackedFiles: number;
  insertions: number;
};

export type WorktreeRiskPolicy = {
  maxDirtyFiles?: number;
  maxUntrackedFiles?: number;
  maxInsertions?: number;
};

export type WorktreeRiskVerdict =
  | { action: "continue"; reasons: [] }
  | { action: "stop"; finalStatus: FinalStatus; reasons: string[] };

export function evaluateWorktreeRisk(stats: WorktreeRiskStats, policy: WorktreeRiskPolicy): WorktreeRiskVerdict {
  const reasons: string[] = [];
  addThresholdReason(reasons, "changed files", stats.changedFiles, policy.maxDirtyFiles);
  addThresholdReason(reasons, "untracked files", stats.untrackedFiles, policy.maxUntrackedFiles);
  addThresholdReason(reasons, "insertions", stats.insertions, policy.maxInsertions);

  if (reasons.length === 0) return { action: "continue", reasons: [] };
  return { action: "stop", finalStatus: "review_needed", reasons };
}

function addThresholdReason(reasons: string[], label: string, actual: number, limit: number | undefined) {
  if (limit === undefined) return;
  if (actual > limit) reasons.push(`${label} ${actual} exceeds max ${limit}`);
}
