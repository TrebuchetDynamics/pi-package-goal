import { defineGoalIdentity } from "../goal-core/identity.ts";

export const DEVELOPMENT_GOAL_IDENTITY = defineGoalIdentity({
  slug: "development-goal",
  label: "Development Goal",
  command: { name: "development-goal" },
  stateType: "development-goal-state",
  statusKey: "development-goal",
  configFile: ".pi/development-goal.json",
  logDir: ".pi/development-goal",
  migrationPolicy: {
    mode: "hard-break",
    legacyCommands: ["development-loop", "dev-loop"],
    legacyConfigFiles: [".pi/development-loop.json"],
    legacyLogDirs: [".pi/development-loop"],
    legacyStateTypes: ["development-loop-state"],
    legacyStatusKeys: ["development-loop"],
  },
});
