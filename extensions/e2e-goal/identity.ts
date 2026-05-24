import { defineGoalIdentity } from "../goal-core/identity.ts";

export const E2E_GOAL_IDENTITY = defineGoalIdentity({
  slug: "e2e-goal",
  label: "E2E Goal",
  command: { name: "e2e-goal", aliases: ["e2e"] },
  stateType: "e2e-goal-state",
  statusKey: "e2e-goal",
  configFile: ".pi/e2e-goal.json",
  logDir: ".pi/e2e-goal",
  migrationPolicy: {
    mode: "support-aliases",
  },
});
