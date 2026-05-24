import { recordReason } from "./log-record.ts";

export const PROACTIVE_COMPACTION_MIN_TOKENS = 240_000;
export const PROACTIVE_COMPACTION_CONTEXT_RATIO = 0.70;

export type ContextUsageLike = {
  tokens?: unknown;
  contextWindow?: unknown;
  maxTokens?: unknown;
};

export type ContextUsageProvider = {
  getContextUsage?: () => ContextUsageLike | undefined;
};

export function shouldCompactBeforeNextIteration(ctx: ContextUsageProvider): boolean {
  if (typeof ctx.getContextUsage !== "function") return false;
  const usage = ctx.getContextUsage();
  const tokens = usageNumber(usage?.tokens);
  if (tokens === undefined) return false;
  if (tokens >= PROACTIVE_COMPACTION_MIN_TOKENS) return true;
  const contextWindow = usageContextWindow(usage);
  return contextWindow !== undefined && contextWindow > 0 && tokens / contextWindow >= PROACTIVE_COMPACTION_CONTEXT_RATIO;
}

export function compactionReason(tokensBefore?: number): string {
  return typeof tokensBefore === "number" ? `tokens_before=${tokensBefore}` : "tokens_before=unknown";
}

export function contextUsageReason(ctx: ContextUsageProvider): string {
  const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
  const tokens = usageNumber(usage?.tokens);
  const contextWindow = usageContextWindow(usage);
  return compactJoin([
    tokens !== undefined ? `tokens=${tokens}` : undefined,
    contextWindow !== undefined ? `context_window=${contextWindow}` : undefined,
  ]) || "tokens=unknown";
}

export function isPrematureCompactionRecord(record: Record<string, unknown>, event: string): boolean {
  if (event !== "compaction_before_next_iteration") return false;
  const { tokens, contextWindow } = recordCompactionContextUsage(record);
  if (tokens === undefined || tokens >= PROACTIVE_COMPACTION_MIN_TOKENS) return false;
  if (contextWindow === undefined) return true;
  return tokens / contextWindow < PROACTIVE_COMPACTION_CONTEXT_RATIO;
}

export function recordCompactionContextUsage(record: Record<string, unknown>): { tokens?: number; contextWindow?: number } {
  const reason = recordReason(record, "compaction_before_next_iteration") || "";
  return {
    tokens: positiveNumber(record.tokens) || positiveNumber(record.tokenCount) || positiveIntegerFromMatch(reason, /\btokens=(\d+)/i),
    contextWindow: positiveNumber(record.contextWindow) || positiveNumber(record.context_window) || positiveNumber(record.maxTokens) || positiveIntegerFromMatch(reason, /\bcontext_window=(\d+)/i),
  };
}

function usageContextWindow(usage: ContextUsageLike | undefined): number | undefined {
  return usageNumber(usage?.contextWindow) ?? usageNumber(usage?.maxTokens);
}

function usageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveIntegerFromMatch(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  return match ? positiveNumber(match[1]) : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
