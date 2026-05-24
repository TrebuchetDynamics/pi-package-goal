import * as path from "node:path";
import { loadProjectConfig, type ProjectConfig } from "./config.ts";
import { DEVELOPMENT_GOAL_IDENTITY } from "./identity.ts";
import { dirExists } from "./files.ts";
import { DEFAULT_ITERATIONS, DEFAULT_LOG_RELATIVE } from "./state.ts";

export type LoopAdapter = {
  name: string;
  label: string;
  description: string;
  defaultTopic: string;
  skills: string[];
  preflightCommands: string[];
  validationCommands: string[];
  stopConditions: string[];
  matches(cwd: string): boolean;
};

export type ResolvedProjectAdapter = {
  adapter: LoopAdapter;
  config: ProjectConfig;
  configPath: string;
  configLoaded: boolean;
  configError?: string;
};

export const DEFAULT_CONFIG_RELATIVE = DEVELOPMENT_GOAL_IDENTITY.configFile;
export const DEFAULT_LANGUAGE = "English";
export const MANDATORY_SKILLS = ["improve-codebase-architecture", "grill-me", "caveman"];

export const COMMON_PREFLIGHT = [
  "pwd",
  "git rev-parse --show-toplevel 2>/dev/null || true",
  "git rev-parse --abbrev-ref HEAD 2>/dev/null || true",
  "git status --short --branch --untracked-files=all 2>/dev/null || true",
];

export const BUILT_IN_ADAPTERS: LoopAdapter[] = [
  {
    name: "generic-git",
    label: "Generic Git",
    description: "Conservative generic git-project development goal",
    defaultTopic: "discover and complete the largest safe useful project goal package with validation",
    skills: [
      "improve-codebase-architecture scout; no HTML unless requested",
      "grill-me self-answer-first; hard owner/pivot questions only",
      "caveman",
      "repo-local skills before package defaults",
      "greploop only for explicit authenticated review cleanup",
      "zoom-out for source map",
      "to-prd for PRDs",
      "to-issues for tracer-bullet issues",
      "triage for issue workflow",
      "writing-plans for multi-step plans",
      "writing-shape for docs/READMEs/articles",
      "write-a-skill for skills",
      "tdd for code; avoid weak tests",
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
    matches(cwd: string): boolean {
      return dirExists(path.join(cwd, ".git"));
    },
  },
];

export function resolveProjectAdapter(cwd: string, requestedAdapter?: string): ResolvedProjectAdapter {
  const configPath = path.join(cwd, DEFAULT_CONFIG_RELATIVE);
  const loaded = loadProjectConfig(configPath);
  const config = loaded.config ?? {};
  const adapterName = requestedAdapter || config.adapter || "generic-git";
  const adapter = getAdapterByName(adapterName) ?? getAdapterByName("generic-git")!;
  return {
    adapter,
    config: mergeAdapterConfig(adapter, config),
    configPath,
    configLoaded: Boolean(loaded.config),
    configError: loaded.error,
  };
}

export function mergeAdapterConfig(adapter: LoopAdapter, config: ProjectConfig): ProjectConfig {
  return {
    adapter: adapter.name,
    defaultTopic: config.defaultTopic ?? adapter.defaultTopic,
    language: config.language ?? DEFAULT_LANGUAGE,
    skills: ensureMandatorySkills(nonEmpty(config.skills) ? config.skills : adapter.skills),
    preflightCommands: nonEmpty(config.preflightCommands) ? config.preflightCommands : adapter.preflightCommands,
    validationCommands: nonEmpty(config.validationCommands) ? config.validationCommands : adapter.validationCommands,
    commit: config.commit ?? false,
    push: config.push ?? false,
    logPath: config.logPath ?? DEFAULT_LOG_RELATIVE,
    maxIterations: config.maxIterations ?? DEFAULT_ITERATIONS,
    stopConditions: nonEmpty(config.stopConditions) ? config.stopConditions : adapter.stopConditions,
  };
}

export function getAdapterByName(name: string): LoopAdapter | undefined {
  return BUILT_IN_ADAPTERS.find((adapter) => adapter.name === name);
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
