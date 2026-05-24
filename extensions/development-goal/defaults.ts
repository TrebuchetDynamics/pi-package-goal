import * as path from "node:path";
import { loadProjectConfig, type ProjectConfig } from "./config.ts";
import { DEVELOPMENT_GOAL_IDENTITY } from "./identity.ts";
import { DEFAULT_ITERATIONS, DEFAULT_LOG_RELATIVE } from "./state.ts";

export type DevelopmentGoalDefaults = {
  name: string;
  label: string;
  description: string;
  defaultTopic: string;
  skills: string[];
  preflightCommands: string[];
  validationCommands: string[];
  stopConditions: string[];
};

export type ResolvedDevelopmentGoalSettings = {
  defaults: DevelopmentGoalDefaults;
  config: ProjectConfig;
  configPath: string;
  configLoaded: boolean;
  configError?: string;
};

export const DEFAULT_CONFIG_RELATIVE = DEVELOPMENT_GOAL_IDENTITY.configFile;
export const DEFAULT_LANGUAGE = "English";
export const DEVELOPMENT_GOAL_SKILL_STACK = ["caveman", "goal", "grill-me", "grill-with-docs", "improve-codebase-architecture", "diagnose", "tdd", "write-a-skill"];
export const MANDATORY_SKILLS = DEVELOPMENT_GOAL_SKILL_STACK;

export const COMMON_PREFLIGHT = [
  "pwd",
  "git rev-parse --show-toplevel 2>/dev/null || true",
  "git rev-parse --abbrev-ref HEAD 2>/dev/null || true",
  "git status --short --branch --untracked-files=all 2>/dev/null || true",
];

export const DEVELOPMENT_GOAL_DEFAULTS: DevelopmentGoalDefaults = {
  name: "generic-git",
  label: "Generic Git",
  description: "Conservative generic git-project development goal",
  defaultTopic: "discover and complete the largest safe useful project goal package with validation",
  skills: [
    "caveman",
    "goal for in-conversation goal discipline",
    "grill-me self-answer-first; hard owner/pivot questions only",
    "grill-with-docs for docs-backed plan grilling",
    "improve-codebase-architecture scout; no HTML unless requested",
    "diagnose for bugs/performance regressions",
    "tdd for code; avoid weak tests",
    "write-a-skill for skills",
    "repo-local skills before package defaults",
    "greploop only for explicit authenticated review cleanup",
    "zoom-out for source map",
    "to-prd for PRDs",
    "to-issues for tracer-bullet issues",
    "triage for issue workflow",
    "writing-plans for multi-step plans",
    "writing-shape for docs/READMEs/articles",
    "fresh validation evidence before done",
  ],
  preflightCommands: COMMON_PREFLIGHT,
  validationCommands: [
    "git diff --check",
  ],
  stopConditions: [
    "project instructions are missing or conflict",
    "no task remains after TODO.md, progress.json, plans, and repo-local guidance",
    "no relevant test/build command can be identified",
    "greploop requires unavailable Greptile, CLI auth, or PR/MR/CL context",
    "validation fails twice with the same blocker",
    "commit or push would include unrelated dirty work",
  ],
};

export function resolveDevelopmentGoalSettings(cwd: string): ResolvedDevelopmentGoalSettings {
  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);
  const loaded = loadProjectConfig(configPath);
  const config = loaded.config ?? {};
  return {
    defaults: DEVELOPMENT_GOAL_DEFAULTS,
    config: mergeDevelopmentGoalConfig(config),
    configPath,
    configLoaded: Boolean(loaded.config),
    configError: loaded.error,
  };
}

export function mergeDevelopmentGoalConfig(config: ProjectConfig): ProjectConfig {
  const defaults = DEVELOPMENT_GOAL_DEFAULTS;
  return {
    defaultTopic: config.defaultTopic ?? defaults.defaultTopic,
    language: config.language ?? DEFAULT_LANGUAGE,
    skills: ensureMandatorySkills(nonEmpty(config.skills) ? config.skills : defaults.skills),
    preflightCommands: nonEmpty(config.preflightCommands) ? config.preflightCommands : defaults.preflightCommands,
    validationCommands: nonEmpty(config.validationCommands) ? config.validationCommands : defaults.validationCommands,
    commit: config.commit ?? false,
    push: config.push ?? false,
    logPath: config.logPath ?? DEFAULT_LOG_RELATIVE,
    maxIterations: config.maxIterations ?? DEFAULT_ITERATIONS,
    stopConditions: nonEmpty(config.stopConditions) ? config.stopConditions : defaults.stopConditions,
  };
}

export function ensureMandatorySkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const skill of [...MANDATORY_SKILLS, ...skills]) {
    const trimmed = skill.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function nonEmpty(value: string[] | undefined): value is string[] {
  return Array.isArray(value) && value.length > 0;
}
