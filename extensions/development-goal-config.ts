import * as fs from "node:fs";

export type ProjectConfig = {
  adapter?: string;
  defaultTopic?: string;
  language?: string;
  skills?: string[];
  preflightCommands?: string[];
  validationCommands?: string[];
  commit?: boolean;
  push?: boolean;
  logPath?: string;
  maxIterations?: number;
  stopConditions?: string[];
  allowScopeExpansion?: boolean;
  requireReviewOnEmptyQueue?: boolean;
};

export function loadProjectConfig(configPath: string): { config?: ProjectConfig; error?: string } {
  try {
    if (!fs.existsSync(configPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return { error: "config is not a JSON object" };
    return { config: normalizeConfig(parsed as Record<string, unknown>) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function normalizeConfig(raw: Record<string, unknown>): ProjectConfig {
  return {
    adapter: selectValue(raw.adapter),
    defaultTopic: stringOrUndefined(raw.defaultTopic),
    language: stringOrUndefined(raw.language),
    skills: stringArrayOrUndefined(raw.skills),
    preflightCommands: stringArrayOrUndefined(raw.preflightCommands),
    validationCommands: stringArrayOrUndefined(raw.validationCommands),
    commit: booleanOrUndefined(raw.commit),
    push: booleanOrUndefined(raw.push),
    logPath: stringOrUndefined(raw.logPath),
    maxIterations: numberOrUndefined(raw.maxIterations),
    stopConditions: stringArrayOrUndefined(raw.stopConditions),
    ...optionalBooleanField("allowScopeExpansion", raw.allowScopeExpansion),
    ...optionalBooleanField("requireReviewOnEmptyQueue", raw.requireReviewOnEmptyQueue),
  };
}

export function resolveCommitPush(commitFlag: boolean | undefined, pushFlag: boolean | undefined, fallbackCommit = false, fallbackPush = false): { commit: boolean; push: boolean } {
  const push = pushFlag ?? fallbackPush;
  const commit = (commitFlag ?? fallbackCommit) || push;
  return { commit, push };
}

function selectValue(value: unknown): string | undefined {
  if (typeof value === "string") return stringOrUndefined(value);
  if (!value || typeof value !== "object") return undefined;
  return stringOrUndefined((value as { value?: unknown }).value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayOrUndefined(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  return items.length ? items : undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalBooleanField(name: "allowScopeExpansion" | "requireReviewOnEmptyQueue", value: unknown): Pick<ProjectConfig, typeof name> | {} {
  const parsed = booleanOrUndefined(value);
  return parsed === undefined ? {} : { [name]: parsed };
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}
