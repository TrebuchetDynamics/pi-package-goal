export function emptyGoalCommandAction(goal) {
  return !goal || goal.status === "complete" ? "start-skill" : "show-status";
}
