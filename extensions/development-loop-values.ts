export function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function singleLineText(value: unknown): string {
  return typeof value === "string"
    ? value
      .replace(/\[object Object\]/g, " ")
      .replace(/[\u2500-\u257F]{3,}/g, " ")
      .replace(/↑↓\s*(?:navi(?:gate)?|nav|na)?/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
    : "";
}

export function selectValue(value: unknown): string | undefined {
  if (typeof value === "string") return stringOrUndefined(value);
  if (!value || typeof value !== "object") return undefined;
  return stringOrUndefined((value as { value?: unknown }).value);
}

export function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}
