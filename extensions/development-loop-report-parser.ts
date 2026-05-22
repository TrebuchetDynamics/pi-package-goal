import type { LoopDecision, LoopReport } from "./development-loop-domain.ts";

type FinalMarkerBlock = {
  index: number;
  validated: boolean;
  decision: LoopDecision;
};

export function parseLoopReport(text: string): LoopReport | undefined {
  const markerBlock = parseFinalMarkerBlock(text);
  const typedReport = parseTypedReport(text, markerBlock?.index);
  if (typedReport && markerBlock) return { ...typedReport, decision: markerBlock.decision, validated: markerBlock.validated };
  if (typedReport) return typedReport;
  if (markerBlock) return { decision: markerBlock.decision, validated: markerBlock.validated, deliveryEvidence: {} };
  return undefined;
}

function parseFinalMarkerBlock(text: string): FinalMarkerBlock | undefined {
  const match = text.match(/(?:^|\r?\n)\s*DEV_LOOP_VALIDATED:\s*(yes|no)\s*\r?\n\s*DEV_LOOP_DECISION:\s*(continue|stop|blocked|done)\s*$/i);
  if (!match || match.index === undefined) return undefined;
  return {
    index: match.index,
    validated: match[1].toLowerCase() === "yes",
    decision: match[2].toLowerCase() as LoopDecision,
  };
}

function parseTypedReport(text: string, markerIndex?: number): LoopReport | undefined {
  const reportText = markerIndex === undefined ? text : text.slice(0, markerIndex);
  const match = reportText.match(/(?:^|\r?\n)\s*DEV_LOOP_REPORT:\s*(\{[^\r\n]*\})\s*$/i);
  if (!match) return undefined;
  const rawReport = parseJsonRecord(match[1]);
  if (!rawReport) return undefined;

  const decision = loopDecisionOrUndefined(rawReport.decision);
  const validated = booleanOrUndefined(rawReport.validated);
  const changedFiles = stringArrayOrUndefined(rawReport.changedFiles) || stringArrayOrUndefined(rawReport.files);
  const validationCommands = stringArrayOrUndefined(rawReport.validationCommands) || stringArrayOrUndefined(rawReport.validation);
  const commitHash = stringOrUndefined(rawReport.commitHash) || stringOrUndefined(rawReport.commit);
  const pushValue = stringOrUndefined(rawReport.pushStatus) || stringOrUndefined(rawReport.pushed) || stringOrUndefined(rawReport.push);
  const pushStatus = pushValue ? normalizePushStatus(pushValue) : undefined;
  const summary = stringOrUndefined(rawReport.summary) || stringOrUndefined(rawReport.whatChanged);
  const blockerState = recordBlockerState(rawReport);
  const nextSteps = stringArrayOrSingleString(rawReport.nextSteps) || stringArrayOrSingleString(rawReport.possibleNextSteps) || stringArrayOrSingleString(rawReport.nextStep) || stringArrayOrSingleString(rawReport.nextActions);

  return {
    ...(decision ? { decision } : {}),
    ...(validated !== undefined ? { validated } : {}),
    deliveryEvidence: {
      ...(summary ? { summary } : {}),
      ...(blockerState ? { blockerState } : {}),
      ...(nextSteps ? { nextSteps } : {}),
      ...(changedFiles ? { changedFiles } : {}),
      ...(validationCommands ? { validationCommands } : {}),
      ...(commitHash ? { commitHash } : {}),
      ...(pushStatus ? { pushStatus } : {}),
    },
  };
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function loopDecisionOrUndefined(value: unknown): LoopDecision | undefined {
  const decision = stringOrUndefined(value)?.toLowerCase();
  return decision === "continue" || decision === "stop" || decision === "blocked" || decision === "done" ? decision : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayOrUndefined(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
  return items.length ? items : undefined;
}

function stringArrayOrSingleString(value: unknown): string[] | undefined {
  const array = stringArrayOrUndefined(value);
  if (array) return array;
  const single = stringOrUndefined(value);
  return single ? [single] : undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function recordBlockerState(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.blockerState)
    || stringOrUndefined(record.blockerReason)
    || stringOrUndefined(record.blockedReason)
    || stringOrUndefined(record.blockers)
    || stringOrUndefined(record.missingPrerequisites);
}

function normalizePushStatus(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "success" || lower === "succeeded" || lower === "yes") return "pushed";
  if (lower === "no") return "not_pushed";
  return lower;
}
