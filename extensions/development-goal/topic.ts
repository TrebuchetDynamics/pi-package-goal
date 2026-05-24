import * as crypto from "node:crypto";
import type { ObjectiveKind } from "./domain.ts";

export type ObjectiveInfo = {
  topic: string;
  rawLength: number;
  topicHash: string;
  kind: ObjectiveKind;
  sanitized: boolean;
};

export function compactTopic(topic: string, maxLength: number): string {
  if (topic.length <= maxLength) return topic;
  return `${topic.slice(0, maxLength - 1)}…`;
}

export function promptObjectiveText(value: unknown, maxLength: number): string {
  const info = objectiveInfo(value, maxLength);
  return compactTopic(info.topic, maxLength);
}

export function objectiveIntakeSummary(value: unknown, oversizedThreshold: number): string {
  const info = objectiveInfo(value, oversizedThreshold);
  return `${info.kind} objective · length ${info.rawLength} · hash ${info.topicHash}`;
}

export function objectiveInfo(value: unknown, oversizedThreshold: number): ObjectiveInfo {
  const rawTopic = singleLineText(value);
  const topic = stripProviderErrorSuffix(rawTopic);
  const sanitized = topic !== rawTopic;
  const kind: ObjectiveKind = sanitized ? "provider-noise" : rawTopic.length > oversizedThreshold ? "oversized" : "short";
  return {
    topic,
    rawLength: rawTopic.length,
    topicHash: hashText(topic),
    kind,
    sanitized,
  };
}

export function objectiveText(value: unknown, oversizedThreshold: number): string {
  return objectiveInfo(value, oversizedThreshold).topic;
}

export function objectiveNeedsBroadScouting(value: unknown, oversizedThreshold: number): boolean {
  const info = objectiveInfo(value, oversizedThreshold);
  if (info.kind !== "short") return true;
  return isBroadObjectiveText(info.topic);
}

export function isBroadObjectiveText(topic: string): boolean {
  const text = topic.toLowerCase().trim();
  if (!text) return true;
  return /\b(discover|explore|audit|analy[sz]e|review|find|identify|improve|refactor|cleanup|clean up|optimi[sz]e|harden)\b/.test(text) &&
    /\b(any|useful|largest|project|codebase|architecture|backlog|todo|roadmap|queue|next|goal|work|opportunit(?:y|ies)|issues?)\b/.test(text);
}

export function stripProviderErrorSuffix(text: string): string {
  const errorIndex = text.search(/\bError:\s+Codex error:.*context[\s_-]*length[\s_-]*exceeded/i);
  if (errorIndex > 0) return text.slice(0, errorIndex).trim();
  return text;
}

export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function singleLineText(value: unknown): string {
  return typeof value === "string"
    ? value
      .replace(/\[object Object\]/g, " ")
      .replace(/[\u2500-\u257F]{3,}/g, " ")
      .replace(/↑↓\s*(?:navi(?:gate)?|nav|na)?/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
    : "";
}
