export type LoopBudgetState = {
  startedAt?: string;
  iteration: number;
  maxIterations: number;
  tokenBudget?: number;
};

export function loopBudgetSummary(s: LoopBudgetState, nowMs = Date.now()): string {
  const remaining = Math.max(0, Math.floor(s.maxIterations) - Math.floor(s.iteration));
  const tokenBudget = formatTokenBudget(s.tokenBudget);
  return [
    `elapsed ${elapsedSince(s.startedAt, nowMs)}`,
    `iterations ${s.iteration}/${s.maxIterations}`,
    `remaining ${remaining}`,
    ...(tokenBudget !== "none" ? [`token budget ${tokenBudget}`] : []),
  ].join("; ");
}

export function parseTokenBudget(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM]?)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const suffix = match[2].toLowerCase();
  const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  const budget = Math.floor(amount * multiplier);
  return Number.isFinite(budget) && budget > 0 ? budget : undefined;
}

export function formatTokenBudget(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "none";
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) return `${trimTrailingZero(value / 1_000_000)}M`;
  if (absValue >= 1_000) return `${trimTrailingZero(value / 1_000)}K`;
  return String(Math.floor(value));
}

export function elapsedSince(startedAt: string | undefined, nowMs = Date.now()): string {
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (!Number.isFinite(startedMs)) return "unknown";
  return formatElapsedDuration(nowMs - startedMs);
}

export function formatElapsedDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`;
}

function trimTrailingZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}
