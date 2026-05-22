export function parseLoopLogRecord(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export function recordEvent(record?: Record<string, unknown>): string | undefined {
  return normalizeLoopLogEvent(rawRecordEvent(record));
}

export function rawRecordEvent(record?: Record<string, unknown>): string | undefined {
  const value = record?.event;
  if (typeof value === "string") return value;
  const type = record?.type;
  return typeof type === "string" ? type : undefined;
}

export function normalizeLoopLogEvent(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "loop_start") return "loop_started";
  if (value === "done") return "loop_finished";
  if (value === "blocked") return "loop_blocked";
  return value;
}

export function recordTimestamp(record?: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record?.at) || stringOrUndefined(record?.timestamp);
}

export function recordTimestampMs(record?: Record<string, unknown>): number | undefined {
  const value = recordTimestamp(record);
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function recordRunId(record?: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record?.runId) || stringOrUndefined(record?.run_id);
}

export function recordDecision(record: Record<string, unknown>, event: string): string | undefined {
  const explicit = stringOrUndefined(record.decision);
  if (explicit) return explicit;
  const finalLineDecision = finalLineLoopDecision(record);
  if (finalLineDecision) return finalLineDecision;
  if (event === "loop_finished" && rawRecordEvent(record) === "done") return "done";
  return undefined;
}

export function recordReason(record: Record<string, unknown>, event: string): string | undefined {
  const explicit = stringOrUndefined(record.reason);
  if (explicit) return explicit;
  if (event === "loop_blocked" && rawRecordEvent(record) === "blocked") return "blocked";
  return undefined;
}

function finalLineLoopDecision(record: Record<string, unknown>): string | undefined {
  const finalLine = stringOrUndefined(record.finalLine);
  const match = finalLine?.match(/\b(?:DEV_)?LOOP_DECISION:\s*(continue|stop|blocked|done)\b/i);
  return match?.[1]?.toLowerCase();
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
