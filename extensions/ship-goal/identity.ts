import { defineGoalIdentity } from "../goal-core/identity.ts";

export const SHIP_GOAL_IDENTITY = defineGoalIdentity({
  slug: "ship-goal",
  label: "Ship Goal",
  command: { name: "ship-goal" },
  stateType: "ship-goal-state",
  statusKey: "ship-goal",
  configFile: ".pi/ship-goal.json",
  logDir: ".pi/ship-goal",
  migrationPolicy: { mode: "hard-break" },
});
