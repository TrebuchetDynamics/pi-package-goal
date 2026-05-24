import * as fs from "node:fs";
import * as path from "node:path";
import type { ObjectiveKind } from "./domain.ts";
import { objectiveInfo } from "./topic.ts";

const DEFAULT_LOG_TOPIC_MAX = 600;

export type DevelopmentLoopLogState = {
  adapterName: string;
  runId?: string;
  topic: unknown;
  iteration: number;
  maxIterations: number;
  phase: string;
  logPath: string;
};

export type LoopLogRecord = {
  at: string;
  event: string;
  adapterName: string;
  runId?: string;
  topic: string;
  topicLength?: number;
  topicTruncated?: boolean;
  topicHash?: string;
  topicKind?: ObjectiveKind;
  topicSanitized?: boolean;
  iteration: number;
  maxIterations: number;
  phase: string;
  decision?: string;
  reason?: string;
  summary?: string;
  blockerState?: string;
  blockedWork?: string;
  pivotedWorkCompleted?: string;
  nextSteps?: string[];
  changedFiles?: string[];
  validationCommands?: string[];
  commitHash?: string;
  pushStatus?: string;
  reportQualityWarnings?: string[];
  reportQualityIssueCodes?: string[];
  blockerKind?: string;
  finalStatus?: string;
  likelyCause?: string;
  nextSafeAction?: string;
  logPath: string;
};

export function buildLoopLogRecord(
  state: DevelopmentLoopLogState,
  event: string,
  extra: Partial<LoopLogRecord> = {},
  at = new Date().toISOString(),
  topicMaxLength = DEFAULT_LOG_TOPIC_MAX,
): LoopLogRecord {
  return {
    at,
    event,
    adapterName: state.adapterName,
    ...(state.runId ? { runId: state.runId } : {}),
    ...loopLogTopicFields(state.topic, topicMaxLength),
    iteration: state.iteration,
    maxIterations: state.maxIterations,
    phase: state.phase,
    logPath: state.logPath,
    ...extra,
  };
}

export function appendLoopLogRecord(logPath: string, record: LoopLogRecord): boolean {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
    return true;
  } catch {
    // Logging must never break the agent loop.
    return false;
  }
}

export function loopLogTopicFields(value: unknown, maxLength = DEFAULT_LOG_TOPIC_MAX): Pick<LoopLogRecord, "topic" | "topicLength" | "topicTruncated" | "topicHash" | "topicKind" | "topicSanitized"> {
  const info = objectiveInfo(value, maxLength);
  if (info.topic.length <= maxLength) {
    return {
      topic: info.topic,
      topicLength: info.rawLength,
      topicHash: info.topicHash,
      topicKind: info.kind,
      ...(info.sanitized ? { topicSanitized: true } : {}),
    };
  }
  return {
    topic: `${info.topic.slice(0, maxLength - 1)}…`,
    topicLength: info.rawLength,
    topicTruncated: true,
    topicHash: info.topicHash,
    topicKind: info.kind,
    ...(info.sanitized ? { topicSanitized: true } : {}),
  };
}
