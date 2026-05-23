import * as path from "node:path";

export type GoalMarkers = {
  report: string;
  validated: string;
  decision: string;
};

export type GoalCommandIdentity = {
  name: string;
  aliases?: string[];
};

export type MigrationPolicy = {
  mode: "hard-break" | "warn-and-redirect" | "support-aliases";
  legacyCommands?: string[];
  legacyConfigFiles?: string[];
  legacyLogDirs?: string[];
  legacyStateTypes?: string[];
  legacyStatusKeys?: string[];
  legacyMarkers?: Array<Partial<GoalMarkers>>;
};

export type GoalIdentity = {
  slug: string;
  label: string;
  command: GoalCommandIdentity;
  stateType: string;
  statusKey: string;
  configFile: string;
  logDir: string;
  markers: GoalMarkers;
  migrationPolicy: MigrationPolicy;
};

export type GoalIdentityInput = Omit<GoalIdentity, "markers"> & {
  markers?: Partial<GoalMarkers>;
};

export type GoalIdentityValidationOptions = {
  mode?: "test" | "production";
  warn?: (message: string) => void;
};

const MARKER_PREFIX_OVERRIDES: Record<string, string> = {
  "development-goal": "DEV_GOAL",
};

export const GoalIdentitySchema = {
  issues(value: unknown): string[] {
    return goalIdentityIssues(value);
  },
  validate(value: unknown): value is GoalIdentity {
    return goalIdentityIssues(value).length === 0;
  },
};

export function defineGoalIdentity(input: GoalIdentityInput): GoalIdentity {
  const identity: GoalIdentity = {
    ...input,
    markers: {
      ...deriveGoalMarkers(input.slug),
      ...(input.markers ?? {}),
    },
  };
  return validateGoalIdentity(identity, { mode: "test" })!;
}

export function validateGoalIdentity(value: unknown, options: GoalIdentityValidationOptions = {}): GoalIdentity | undefined {
  const issues = goalIdentityIssues(value);
  if (issues.length === 0) return value as GoalIdentity;

  const message = `Invalid GoalIdentity: ${issues.join("; ")}`;
  if (options.mode === "production") {
    options.warn?.(message);
    return undefined;
  }
  throw new Error(message);
}

export function deriveGoalMarkers(slug: string): GoalMarkers {
  const prefix = markerPrefixForSlug(slug);
  return {
    report: `${prefix}_REPORT`,
    validated: `${prefix}_VALIDATED`,
    decision: `${prefix}_DECISION`,
  };
}

export function goalConfigPath(identity: GoalIdentity, cwd: string): string {
  return path.join(cwd, identity.configFile);
}

export function goalLogRelative(identity: GoalIdentity, fileName = "logs.jsonl"): string {
  return path.join(identity.logDir, fileName);
}

export function goalLogPath(identity: GoalIdentity, cwd: string, fileName = "logs.jsonl"): string {
  return path.join(cwd, goalLogRelative(identity, fileName));
}

function markerPrefixForSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  return MARKER_PREFIX_OVERRIDES[normalized]
    || normalized.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function goalIdentityIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["GoalIdentity must be an object"];
  const record = value as Record<string, unknown>;
  const issues: string[] = [];

  requireString(record.slug, "GoalIdentity.slug", issues);
  requireString(record.label, "GoalIdentity.label", issues);
  requireCommand(record.command, issues);
  requireString(record.stateType, "GoalIdentity.stateType", issues);
  requireString(record.statusKey, "GoalIdentity.statusKey", issues);
  requireString(record.configFile, "GoalIdentity.configFile", issues);
  requireString(record.logDir, "GoalIdentity.logDir", issues);
  requireMarkers(record.markers, issues);
  requireMigrationPolicy(record.migrationPolicy, issues);

  return issues;
}

function requireCommand(value: unknown, issues: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push("GoalIdentity.command must be an object");
    return;
  }
  const command = value as Record<string, unknown>;
  requireString(command.name, "GoalIdentity.command.name", issues);
  if (command.aliases !== undefined) requireStringArray(command.aliases, "GoalIdentity.command.aliases", issues);
}

function requireMarkers(value: unknown, issues: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push("GoalIdentity.markers must be an object");
    return;
  }
  const markers = value as Record<string, unknown>;
  requireString(markers.report, "GoalIdentity.markers.report", issues);
  requireString(markers.validated, "GoalIdentity.markers.validated", issues);
  requireString(markers.decision, "GoalIdentity.markers.decision", issues);
}

function requireMigrationPolicy(value: unknown, issues: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push("GoalIdentity.migrationPolicy must be an object");
    return;
  }
  const policy = value as Record<string, unknown>;
  const mode = policy.mode;
  if (mode !== "hard-break" && mode !== "warn-and-redirect" && mode !== "support-aliases") {
    issues.push("GoalIdentity.migrationPolicy.mode must be hard-break, warn-and-redirect, or support-aliases");
  }
  for (const field of ["legacyCommands", "legacyConfigFiles", "legacyLogDirs", "legacyStateTypes", "legacyStatusKeys"] as const) {
    if (policy[field] !== undefined) requireStringArray(policy[field], `GoalIdentity.migrationPolicy.${field}`, issues);
  }
}

function requireString(value: unknown, pathLabel: string, issues: string[]) {
  if (typeof value !== "string" || !value.trim()) issues.push(`${pathLabel} must be a non-empty string`);
}

function requireStringArray(value: unknown, pathLabel: string, issues: string[]) {
  if (!Array.isArray(value)) {
    issues.push(`${pathLabel} must be an array of non-empty strings`);
    return;
  }
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      issues.push(`${pathLabel} must be an array of non-empty strings`);
      return;
    }
  }
}
