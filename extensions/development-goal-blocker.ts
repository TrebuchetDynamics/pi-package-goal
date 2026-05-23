export function likelyBlockerCause(reason: string): string {
  if (/missing DEV_GOAL_DECISION|missing_final_marker/i.test(reason)) return "assistant_response_missing_final_markers";
  if (/missing DEV_GOAL_VALIDATED/i.test(reason)) return "validation_evidence_missing_or_red";
  if (/empty provider response/i.test(reason)) return "provider_returned_empty_response";
  if (/context[_ -]?overflow|context[_ -]?length/i.test(reason)) return "provider_context_overflow";
  return "loop_blocked";
}

export function nextSafeBlockerAction(reason: string): string {
  if (/missing DEV_GOAL_DECISION|missing_final_marker/i.test(reason)) return "reuse completed work if present, then return only DEV_GOAL_VALIDATED and DEV_GOAL_DECISION markers or restart the iteration";
  if (/missing DEV_GOAL_VALIDATED/i.test(reason)) return "run the configured validation commands, then report DEV_GOAL_VALIDATED: yes only with evidence or fix failures first";
  if (/empty provider response|context[_ -]?overflow|context[_ -]?length/i.test(reason)) return "compact the session if needed, preserve unrelated dirty work, then retry the same iteration";
  return "inspect the blocker, preserve unrelated dirty work, and restart with the largest safe validated package";
}
