import {
  buildLoopEngineeringObjective,
  LOOP_ENGINEERING_USAGE,
} from "./lib/command.js";

function registerLoopCommand(pi, name) {
  pi.registerCommand(name, {
    description: "Start a goal-backed Loop Engineering workflow",
    getArgumentCompletions: (prefix) => {
      const values = [
        "audit .",
        "init daily-triage --tool grok",
        "init issue-triage --tool codex",
        "cost daily-triage --level L1",
        "goal .",
        "1d Run loop-triage. Update STATE.md. No auto-fix in week one.",
      ];
      const filtered = values.filter((value) => value.startsWith(prefix));
      return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const { goalCommand, action, tokenBudget, dryRun, help, error } = buildLoopEngineeringObjective(args);
      if (help) {
        ctx.ui.notify(LOOP_ENGINEERING_USAGE, "info");
        return;
      }
      if (error) {
        ctx.ui.notify(error, "warning");
        return;
      }
      if (dryRun) {
        ctx.ui.notify(`DRY RUN: ${goalCommand}`, "info");
        return;
      }
      ctx.ui.notify(`Starting Loop Engineering ${action} workflow. Token budget: ${tokenBudget}.`, "info");
      pi.sendUserMessage(goalCommand);
    },
  });
}

export default function loopEngineering(pi) {
  registerLoopCommand(pi, "loop-engineering");
  registerLoopCommand(pi, "loop");
}
