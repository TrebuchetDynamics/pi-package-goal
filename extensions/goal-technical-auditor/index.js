import {
  buildGoalTechnicalAuditorObjective,
  DEFAULT_TOKEN_BUDGET,
  GOAL_TECHNICAL_AUDITOR_USAGE,
  validateScopeInsideCwd,
} from "../../lib/goal-technical-auditor/command.js";

export default function goalTechnicalAuditor(pi) {
  pi.registerCommand("goal-technical-auditor", {
    description: "Start a goal-driven technical-auditor Full-mode automation loop",
    getArgumentCompletions: (prefix) => {
      const values = [".", "--tokens 700k .", "--tokens 500k .", "--tokens 200k .", "--dry-run .", "--focus bug-hunt-refactor .", "skills", "extensions", "lib"];
      const filtered = values.filter((value) => value.startsWith(prefix));
      return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const { scope, scopeLabel, tokenBudget, goalCommand, dryRun, help, error } = buildGoalTechnicalAuditorObjective(args);
      const scopeError = error ? null : validateScopeInsideCwd(ctx.cwd ?? process.cwd(), scope);
      if (help) {
        ctx.ui.notify(GOAL_TECHNICAL_AUDITOR_USAGE, "info");
        return;
      }
      if (error || scopeError) {
        ctx.ui.notify(error || scopeError, "warning");
        return;
      }
      if (dryRun) {
        ctx.ui.notify(`DRY RUN: ${goalCommand}`, "info");
        return;
      }
      ctx.ui.notify(
        `Starting goal-driven technical audit automation for ${scopeLabel}. Token budget: ${tokenBudget || DEFAULT_TOKEN_BUDGET}.`,
        "info",
      );
      pi.sendUserMessage(goalCommand);
    },
  });
}
