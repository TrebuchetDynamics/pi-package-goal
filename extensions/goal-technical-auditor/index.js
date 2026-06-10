import { buildGoalTechnicalAuditorObjective, DEFAULT_TOKEN_BUDGET } from "../../lib/goal-technical-auditor/command.js";

export default function goalTechnicalAuditor(pi) {
  pi.registerCommand("goal-technical-auditor", {
    description: "Start a goal-driven technical-auditor Full-mode automation loop",
    getArgumentCompletions: (prefix) => {
      const values = [".", "--tokens 200k .", "--tokens 500k .", "skills", "extensions", "lib"];
      const filtered = values.filter((value) => value.startsWith(prefix));
      return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const { scopeLabel, tokenBudget, goalCommand } = buildGoalTechnicalAuditorObjective(args);
      ctx.ui.notify(
        `Starting goal-driven technical audit automation for ${scopeLabel}. Token budget: ${tokenBudget || DEFAULT_TOKEN_BUDGET}.`,
        "info",
      );
      pi.sendUserMessage(goalCommand);
    },
  });
}
