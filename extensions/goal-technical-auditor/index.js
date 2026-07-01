import {
  buildGoalTechnicalAuditorObjective,
  DEFAULT_TOKEN_BUDGET,
  GOAL_TECHNICAL_AUDITOR_USAGE,
  goalTechnicalAuditorCompletions,
  validateGoalTechnicalAuditorLaunch,
} from "./lib/command.js";

export default function goalTechnicalAuditor(pi) {
  pi.registerCommand("goal-technical-auditor", {
    description: "Start a goal-driven technical-auditor Full-mode automation loop",
    getArgumentCompletions: (prefix, ctx = {}) => {
      const completions = goalTechnicalAuditorCompletions(prefix, ctx.cwd ?? process.cwd());
      return completions.length ? completions : null;
    },
    handler: async (args, ctx) => {
      const objective = buildGoalTechnicalAuditorObjective(args);
      const { scopeLabel, tokenBudget, goalCommand, dryRun, help, error, focus } = objective;
      const scopeError = error ? null : validateGoalTechnicalAuditorLaunch(ctx.cwd ?? process.cwd(), objective);
      if (help) {
        ctx.ui.notify(GOAL_TECHNICAL_AUDITOR_USAGE, "info");
        return;
      }
      if (error || scopeError) {
        ctx.ui.notify(error || scopeError, "warning");
        return;
      }
      if (dryRun) {
        ctx.ui.notify(`DRY RUN: /goal-technical-auditor\nscope: ${scopeLabel}\nfocus: ${focus || "none"}\ntokens: ${tokenBudget || DEFAULT_TOKEN_BUDGET}\ncommand: ${goalCommand}`, "info");
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
