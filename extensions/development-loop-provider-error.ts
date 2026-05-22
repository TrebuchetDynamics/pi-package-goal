export function isContextOverflowProviderError(text: string): boolean {
  return /context[\s_-]*length[\s_-]*exceeded|input exceeds the context window|context overflow detected/i.test(text);
}

export function recordHasContextOverflowProviderError(record: Record<string, unknown>, event: string): boolean {
  if (event === "context_overflow_waiting_for_compaction" || isContextOverflowProviderError(event)) return true;
  return [
    record.reason,
    record.message,
    record.error,
    record.code,
    record.content,
    record.warning,
    record.providerError,
    record.provider_error,
  ].some((value) => valueHasContextOverflowProviderError(value));
}

export function valueHasContextOverflowProviderError(value: unknown): boolean {
  if (typeof value === "string") return isContextOverflowProviderError(value);
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((child) => valueHasContextOverflowProviderError(child));
}

export function hasContextOverflowProviderError(messages: Array<{ role?: string; content?: unknown }>): boolean {
  return messages.some((message) => message.role !== "user" && isContextOverflowProviderError(messageText(message)));
}

export function recordHasProviderError(record: Record<string, unknown>, event: string): boolean {
  return event === "provider_error" || event.endsWith("_provider_error") || record.providerError !== undefined || record.provider_error !== undefined;
}

export function recordProviderErrorCode(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.code)
    || providerErrorCodeFromValue(record.error)
    || providerErrorCodeFromValue(record.providerError)
    || providerErrorCodeFromValue(record.provider_error)
    || (recordHasContextOverflowProviderError(record, "") ? "context_length_exceeded" : undefined);
}

export function recordProviderErrorCategory(record: Record<string, unknown>, event: string, code: string): string {
  const text = [
    event,
    code,
    stringOrUndefined(record.reason),
    stringOrUndefined(record.message),
    providerErrorTextFromValue(record.error),
    providerErrorTextFromValue(record.providerError),
    providerErrorTextFromValue(record.provider_error),
  ].filter(Boolean).join(" ");
  if (isContextOverflowProviderError(text)) return "context-overflow";
  if (/rate[_ -]?limit|too[_ -]?many[_ -]?requests|\b429\b/i.test(text)) return "rate-limit";
  if (/auth|unauthorized|forbidden|invalid[_ -]?api[_ -]?key|permission|\b401\b|\b403\b/i.test(text)) return "auth";
  if (/websocket|socket|network|timeout|timed?\s*out|connection|econn|stream/i.test(text)) return "transport";
  return "other";
}

function providerErrorCodeFromValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    if (isContextOverflowProviderError(value)) return "context_length_exceeded";
    return undefined;
  }
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return stringOrUndefined(record.code) || stringOrUndefined(record.type) || stringOrUndefined(record.status);
}

function providerErrorTextFromValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  return Object.values(value as Record<string, unknown>)
    .map((child) => typeof child === "string" ? child : undefined)
    .filter(Boolean)
    .join(" ") || undefined;
}

function messageText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
      return "";
    }).join("\n");
  }
  return "";
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
