import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG_RELATIVE, DEFAULT_LANGUAGE, ensureMandatorySkills } from "./defaults.ts";
import type { ProjectConfig } from "./config.ts";
import { contextCwd, relativeToCwd, writeJsonFileAtomic } from "./files.ts";
import type { ParsedCommand } from "./command.ts";
import {
  initConfigSummary,
  initDefaults,
  shouldPromptForInit,
  splitLinesOrDefault,
} from "./init-config.ts";
import { DEFAULT_LOG_RELATIVE, type LoopState } from "./state.ts";
import { statusReport } from "./status.ts";
import { selectValue } from "./values.ts";

const COMMON_LANGUAGE_CHOICES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
  "Bengali",
  "Turkish",
  "Vietnamese",
  "Indonesian",
  "Polish",
  "Ukrainian",
  "Swahili",
];

type UiLikeContext = {
  cwd?: string;
  ui?: {
    notify?: (message: string, level?: string) => void;
    select?: (title: string, items: string[], options?: unknown) => Promise<string | { value: string } | undefined> | string | { value: string } | undefined;
    input?: (title: string, placeholder?: string) => Promise<string | undefined> | string | undefined;
    editor?: (title: string, text?: string) => Promise<string | undefined> | string | undefined;
    confirm?: (title: string, message: string, options?: unknown) => Promise<boolean> | boolean;
  };
  sessionManager?: { getCwd?: () => string };
};

export async function initConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext) {
  const cwd = contextCwd(ctx);
  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);

  if (!parsed.dryRun && fs.existsSync(configPath) && !parsed.force) {
    notify(ctx, `${relativeToCwd(cwd, configPath)} already exists; leaving it unchanged. Use /development-goal init --force to replace it.`);
    return;
  }

  const config = await buildInitConfig(parsed, ctx, cwd);
  if (!config) return;

  if (parsed.dryRun) {
    notify(ctx, `Development-goal init preview (no files written):\n${JSON.stringify(config, null, 2)}`);
    return;
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (fs.existsSync(configPath) && !parsed.force) {
    notify(ctx, `${relativeToCwd(cwd, configPath)} already exists; leaving it unchanged. Use /development-goal init --force to replace it.`);
    return;
  }
  writeJsonFileAtomic(configPath, config);
  notify(ctx, `Wrote ${relativeToCwd(cwd, configPath)}`);
}

async function buildInitConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext, cwd: string): Promise<ProjectConfig | undefined> {
  const defaults = initDefaults(parsed, cwd);
  if (!shouldPromptForInit(parsed, ctx)) return defaults.config;
  return promptForInitConfig(parsed, ctx, cwd);
}

async function promptForInitConfig(parsed: ParsedCommand, ctx: ExtensionCommandContext, cwd: string): Promise<ProjectConfig | undefined> {
  const ui = ctx.ui;
  const defaults = initDefaults(parsed, cwd);
  const config: ProjectConfig = { ...defaults.config };

  const defaultTopic = config.defaultTopic || defaults.defaults.defaultTopic;
  const topicText = await ui.editor!("Default objective", defaultTopic);
  if (topicText === undefined) return cancelInit(ctx);
  config.defaultTopic = topicText.trim() || defaultTopic;

  const language = selectValue(await ui.select!("Preferred language", COMMON_LANGUAGE_CHOICES));
  if (language === undefined) return cancelInit(ctx);
  config.language = language || config.language || DEFAULT_LANGUAGE;

  const delivery = selectValue(await ui.select!("Git delivery policy", ["manual", "commit", "push"]));
  if (delivery === undefined) return cancelInit(ctx);
  config.push = delivery === "push";
  config.commit = delivery === "commit" || config.push;

  const validationText = await ui.editor!("Validation commands (one per line)", (config.validationCommands ?? []).join("\n"));
  if (validationText === undefined) return cancelInit(ctx);
  config.validationCommands = splitLinesOrDefault(validationText, config.validationCommands ?? []);

  const preflightText = await ui.editor!("Preflight commands (one per line)", (config.preflightCommands ?? []).join("\n"));
  if (preflightText === undefined) return cancelInit(ctx);
  config.preflightCommands = splitLinesOrDefault(preflightText, config.preflightCommands ?? []);

  const skillsText = await ui.editor!("Skills (one per line)", (config.skills ?? []).join("\n"));
  if (skillsText === undefined) return cancelInit(ctx);
  config.skills = ensureMandatorySkills(splitLinesOrDefault(skillsText, config.skills ?? []));

  const stopConditionsText = await ui.editor!("Stop conditions (one per line)", (config.stopConditions ?? []).join("\n"));
  if (stopConditionsText === undefined) return cancelInit(ctx);
  config.stopConditions = splitLinesOrDefault(stopConditionsText, config.stopConditions ?? []);

  const logPathText = await ui.input!("Log path", config.logPath || DEFAULT_LOG_RELATIVE);
  if (logPathText === undefined) return cancelInit(ctx);
  config.logPath = logPathText.trim() || config.logPath || DEFAULT_LOG_RELATIVE;

  const ok = await ui.confirm!("Write development-goal config", initConfigSummary(config, cwd));
  if (!ok) return cancelInit(ctx);
  return config;
}

function cancelInit(ctx: UiLikeContext): undefined {
  notify(ctx, "Development-goal init cancelled.");
  return undefined;
}

export function publishStatus(pi: ExtensionAPI, ctx: UiLikeContext, state: LoopState) {
  const cwd = contextCwd(ctx);
  const text = statusReport(state, cwd);
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-goal-status", content: text, display: true });
  }
}

export function publishHelp(pi: ExtensionAPI, ctx: UiLikeContext) {
  const text = [
    "Development-goal commands:",
    "- /development-goal [options] <topic> — start a goal",
    "- /development-goal improve-codebase-architecture [focus] — start an architecture-improvement goal",
    "- /development-goal git-commit-push [focus] — legacy delivery command; prefer /git-commit-push to validate, commit, and push current changes",
    "- /development-goal grill-me [seed] — use grill-me in the configured language to choose the next goal, then start it",
    "- /development-goal restart [options] <topic> — replace the active goal",
    "- /development-goal pause — pause automatic continuation without clearing goal state",
    "- /development-goal resume — resume a paused goal at the current iteration",
    "- /development-goal stop — stop the active goal",
    "- /development-goal status — show current state",
    "- /development-goal analyze-logs [path] — summarize one log file or a directory of goal logs",
    "- /development-goal analyze-logs --since=2h [path] — summarize only recent timestamped records",
    "- /development-goal analyze-logs --html [path] — also write a self-contained HTML health report",
    "- /development-goal analyze-logs --json [path] — emit machine-readable JSON for automation",
    "- Start/restart option: --tokens <n|nK|nM> / --budget <n|nK|nM> records a soft token budget in prompts and status",
    "- /development-goal init [options] <default topic> — configure .pi/development-goal.json interactively",
    "",
    "Configurable init options:",
    "- /development-goal init --dry-run ... — preview without writing files",
    "- --iterations <n> | --max-iterations <n> | -n <n> — optional legacy safety cap; omit for continuous goal mode",
    "- --commit | --no-commit | --push | --no-push (--push implies --commit)",
    "- --validation <command> | --test <command> (repeatable)",
    "- --preflight <command> (repeatable)",
    "- --skill <name-or-note> (repeatable), for example greploop or grill-me",
    "- --stop-condition <text> (repeatable)",
    "- --log-path <path>",
    "- --force — atomically replace an existing config",
    "- --yes | -y | --defaults — accept generated values without prompts",
    "",
    "Active-goal behavior:",
    "- DEV_GOAL_DECISION: continue starts the next iteration automatically when Pi is idle until DEV_GOAL_DECISION: done, blocked, stop, or pause.",
    "- PI_DEV_GOAL_MAX_AUTO_CONTINUES caps automatic prompt sends before the goal pauses for manual resume. Default: 500.",
    "- Provider transport errors such as WebSocket failures retry the same iteration instead of triggering final-marker recovery.",
    "- A useful non-provider response missing final markers gets one informational final-marker-only recovery prompt before blocking.",
    "- Plain text typed during an active goal becomes steering for the current or next safe package.",
  ].join("\n");
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-goal-help", content: text, display: true });
  }
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) {
    ctx.ui.notify(message, level);
  } else {
    console.log(message);
  }
}
