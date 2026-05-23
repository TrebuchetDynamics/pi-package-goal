export type LoopBudgetState = {
  startedAt?: string;
  iteration: number;
  maxIterations: number;
};

export function loopBudgetSummary(s: LoopBudgetState, nowMs = Date.now()): string {
  const remaining = Math.max(0, Math.floor(s.maxIterations) - Math.floor(s.iteration));
  return `elapsed ${elapsedSince(s.startedAt, nowMs)}; iterations ${s.iteration}/${s.maxIterations}; remaining ${remaining}`;
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
