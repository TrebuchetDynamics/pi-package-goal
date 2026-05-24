import { defineGoalIdentity } from "../goal-core/identity.ts";

export const GIT_COMMIT_PUSH_IDENTITY = defineGoalIdentity({
  slug: "git-commit-push",
  label: "Git Commit Push",
  command: { name: "git-commit-push" },
  stateType: "git-commit-push-state",
  statusKey: "git-commit-push",
  configFile: ".pi/git-commit-push.json",
  logDir: ".pi/git-commit-push",
  migrationPolicy: { mode: "hard-break" },
});
