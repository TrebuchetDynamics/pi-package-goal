import type { FinalStatus, GoalDecision } from "./development-goal-report-parser.ts";

export type ScopeExpansionConfig = {
  allowScopeExpansion?: boolean;
  requireReviewOnEmptyQueue?: boolean;
};

export type ScopeExpansionPolicy = {
  allowScopeExpansion: boolean;
  requireReviewOnEmptyQueue: boolean;
};

export type EmptyQueueAction =
  | { action: "discover" }
  | { action: "stop"; decision: Extract<GoalDecision, "stop">; finalStatus: Extract<FinalStatus, "review_needed">; reason: string };

export function resolveScopeExpansionPolicy(config: ScopeExpansionConfig): ScopeExpansionPolicy {
  return {
    allowScopeExpansion: config.allowScopeExpansion === true,
    requireReviewOnEmptyQueue: config.requireReviewOnEmptyQueue !== false,
  };
}

export function decideEmptyQueueAction(input: { queueEmpty: boolean; objectiveIsBroad?: boolean; policy: ScopeExpansionPolicy }): EmptyQueueAction | undefined {
  if (!input.queueEmpty) return undefined;
  if (input.policy.allowScopeExpansion) return { action: "discover" };
  if (!input.policy.requireReviewOnEmptyQueue) return { action: "discover" };
  return {
    action: "stop",
    decision: "stop",
    finalStatus: "review_needed",
    reason: input.objectiveIsBroad ? "broad_objective_empty_queue_review_needed" : "empty_queue_review_needed",
  };
}
