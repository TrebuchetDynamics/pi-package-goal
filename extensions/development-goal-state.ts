import type { DevelopmentLoopRun } from "./development-goal-domain.ts";

export const CUSTOM_STATE_TYPE = "development-goal-state";
export const DEFAULT_LOG_RELATIVE = ".pi/development-goal/logs.jsonl";
export const UNBOUNDED_MAX_ITERATIONS = Number.MAX_SAFE_INTEGER;
export const DEFAULT_ITERATIONS = UNBOUNDED_MAX_ITERATIONS;

export type LoopState = DevelopmentLoopRun;
export type LoopStateEntry = {
  type?: string;
  customType?: string;
  data?: unknown;
};

export function restoreState(entries: LoopStateEntry[], customStateType = CUSTOM_STATE_TYPE): LoopState | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === customStateType && isLoopState(entry.data)) {
      return entry.data;
    }
  }
  return undefined;
}

export function isLoopState(value: unknown): value is LoopState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LoopState>;
  return typeof item.active === "boolean" &&
    typeof item.adapterName === "string" &&
    typeof item.topic === "string" &&
    typeof item.iteration === "number" &&
    typeof item.maxIterations === "number" &&
    typeof item.startedAt === "string" &&
    typeof item.logPath === "string" &&
    typeof item.phase === "string";
}

export function hasIterationCap(value: { maxIterations?: number } | number | undefined): boolean {
  const maxIterations = typeof value === "number" ? value : value?.maxIterations;
  return typeof maxIterations === "number" &&
    Number.isFinite(maxIterations) &&
    maxIterations > 0 &&
    maxIterations < UNBOUNDED_MAX_ITERATIONS;
}

export function iterationProgress(value: { iteration: number; maxIterations?: number }): string {
  return hasIterationCap(value) ? `${value.iteration}/${value.maxIterations}` : `${value.iteration} (until done)`;
}

export function compactIterationProgress(value: { iteration: number; maxIterations?: number }): string {
  return hasIterationCap(value) ? `i${value.iteration}/${value.maxIterations}` : `i${value.iteration}/∞`;
}

export function inactiveState(defaultLogPath = DEFAULT_LOG_RELATIVE, defaultIterations = DEFAULT_ITERATIONS): LoopState {
  return {
    active: false,
    adapterName: "none",
    topic: "",
    iteration: 0,
    maxIterations: defaultIterations,
    startedAt: new Date(0).toISOString(),
    logPath: defaultLogPath,
    phase: "idle",
    commit: false,
    push: false,
    emptyResponseRetries: 0,
    markerRecoveryRetries: 0,
    autoContinueCount: 0,
  };
}
