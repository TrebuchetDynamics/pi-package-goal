export const DEFAULT_MAX_AUTO_CONTINUES = 500;
export const AUTO_CONTINUE_LIMIT_ENV = "PI_DEV_LOOP_MAX_AUTO_CONTINUES";

export function autoContinueLimitFromEnv(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number(env[AUTO_CONTINUE_LIMIT_ENV]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_MAX_AUTO_CONTINUES;
}

export function shouldPauseForAutoContinueLimit(autoContinueCount: number | undefined, limit = autoContinueLimitFromEnv()): boolean {
  const count = Math.max(0, Math.floor(autoContinueCount ?? 0));
  return count >= limit;
}
