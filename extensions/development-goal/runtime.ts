import * as crypto from "node:crypto";

export type MessageLike = {
  role?: string;
  content?: unknown;
};

export function lastAssistantText(messages: MessageLike[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") return messageText(messages[i]);
  }
  return "";
}

export function messageText(message: { content?: unknown }): string {
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

export function createRunId(startedAt: string): string {
  const timestamp = Date.parse(startedAt);
  const encodedTime = Number.isFinite(timestamp) ? timestamp.toString(36) : Date.now().toString(36);
  return `dl-${encodedTime}-${crypto.randomBytes(3).toString("hex")}`;
}
