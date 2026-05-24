import * as path from "node:path";
import {
  DEFAULT_CONFIG_RELATIVE,
  DEFAULT_LANGUAGE,
  ensureMandatorySkills,
  getAdapterByName,
  type LoopAdapter,
} from "./adapter.ts";
import type { ParsedCommand } from "./command.ts";
import { resolveCommitPush, type ProjectConfig } from "./config.ts";
import { relativeToCwd, splitLines } from "./files.ts";
import { DEFAULT_ITERATIONS, DEFAULT_LOG_RELATIVE, hasIterationCap } from "./state.ts";

export const HARD_MAX_ITERATIONS = 25;

type InitParsedCommand = Partial<ParsedCommand> & Pick<ParsedCommand, "command">;

export type InitDefaults = {
  adapterName: string;
  adapter: LoopAdapter;
  config: ProjectConfig;
};

export type InitPromptContext = {
  hasUI?: boolean;
  ui?: {
    select?: (...args: unknown[]) => unknown;
    input?: (...args: unknown[]) => unknown;
    editor?: (...args: unknown[]) => unknown;
    confirm?: (...args: unknown[]) => unknown;
  };
};

export function initDefaults(parsed: InitParsedCommand, _cwd?: string, adapterName = "generic-git"): InitDefaults {
  const adapter = getAdapterByName(adapterName) ?? getAdapterByName("generic-git")!;
  const resolvedAdapterName = adapter.name;
  const defaultTopic = parsed.topic || adapter.defaultTopic;
  const validationCommands = parsed.validationCommands?.length ? parsed.validationCommands : adapter.validationCommands;
  const preflightCommands = parsed.preflightCommands?.length ? parsed.preflightCommands : adapter.preflightCommands;
  const skills = ensureMandatorySkills(parsed.skills?.length ? parsed.skills : adapter.skills);
  const stopConditions = parsed.stopConditions?.length ? parsed.stopConditions : adapter.stopConditions;
  const { commit, push } = resolveCommitPush(parsed.commit, parsed.push, false, false);
  const maxIterations = parsed.iterations ? clampIterations(parsed.iterations) : undefined;
  const logPath = parsed.logPath || DEFAULT_LOG_RELATIVE;

  return {
    adapterName: resolvedAdapterName,
    adapter,
    config: {
      adapter: resolvedAdapterName,
      defaultTopic,
      language: DEFAULT_LANGUAGE,
      skills,
      preflightCommands,
      validationCommands,
      commit,
      push,
      logPath,
      ...(maxIterations ? { maxIterations } : {}),
      stopConditions,
    },
  };
}

export function shouldPromptForInit(parsed: Pick<ParsedCommand, "yes"> | { yes?: boolean }, ctx: InitPromptContext): boolean {
  return parsed.yes !== true &&
    ctx.hasUI === true &&
    typeof ctx.ui?.select === "function" &&
    typeof ctx.ui.input === "function" &&
    typeof ctx.ui.editor === "function" &&
    typeof ctx.ui.confirm === "function";
}

export function splitLinesOrDefault(value: string, fallback: string[]): string[] {
  const lines = splitLines(value);
  return lines.length > 0 ? lines : fallback;
}

export function initConfigSummary(config: ProjectConfig, cwd: string, configRelative = DEFAULT_CONFIG_RELATIVE): string {
  return [
    `Target: ${relativeToCwd(cwd, path.join(cwd, configRelative))}`,
    `Adapter: ${config.adapter}`,
    `Objective: ${config.defaultTopic}`,
    `Preferred language: ${config.language || DEFAULT_LANGUAGE}`,
    `Iterations: ${iterationCapSummary(config.maxIterations)}`,
    `Git delivery: ${config.push ? "push" : config.commit ? "commit" : "manual"}`,
    `Validation: ${(config.validationCommands ?? []).join("; ") || "none"}`,
    `Log path: ${config.logPath || DEFAULT_LOG_RELATIVE}`,
  ].join("\n");
}

export function clampIterations(value: number): number {
  return Math.max(1, Math.min(Math.floor(value), HARD_MAX_ITERATIONS));
}

export function iterationCapSummary(maxIterations: number | undefined): string {
  return hasIterationCap(maxIterations ?? DEFAULT_ITERATIONS) ? String(maxIterations) : "until goal achieved";
}
