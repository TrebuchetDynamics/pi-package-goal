import type { DeliveryEvidence, LoopDecision, LoopReport } from "./development-goal-domain.ts";

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

export function parseLoopDeliveryEvidence(text: string): DeliveryEvidence {
  const typedReport = parseLoopReport(text);
  if (typedReport && Object.keys(typedReport.deliveryEvidence).length > 0) return typedReport.deliveryEvidence;

  const lines = text.split(/\r?\n/);
  const changedFiles: string[] = [];
  const validationCommands: string[] = [];
  const nextSteps: string[] = [];
  const blockerStateLines: string[] = [];
  let summary: string | undefined;
  let commitHash: string | undefined;
  let pushStatus: string | undefined;
  let section: "changed" | "validation" | "nextSteps" | "blocker" | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      section = undefined;
      continue;
    }

    const summaryHeader = trimmed.match(/^(?:Summary|End report summary|What changed(?: and why)?):\s*(.*)$/i);
    if (summaryHeader) {
      summary = cleanReportText(summaryHeader[1]) || summary;
      section = undefined;
      continue;
    }

    const nextStepsHeader = trimmed.match(/^(?:Possible next steps|Next steps|Follow-up actions|Follow up actions)(?:\s+[^:]*)?:\s*(.*)$/i);
    if (nextStepsHeader) {
      section = "nextSteps";
      addInlineListItems(nextSteps, nextStepsHeader[1], cleanReportText);
      continue;
    }

    const blockerHeader = trimmed.match(/^(?:Blocker state|Blocked because|Blocking reason|Missing prerequisites?|Blockers?)(?:\s+[^:]*)?:\s*(.*)$/i);
    if (blockerHeader) {
      section = "blocker";
      addInlineListItems(blockerStateLines, blockerHeader[1], cleanReportText);
      continue;
    }

    const changedHeader = trimmed.match(/^Changed files(?:\s+[^:]*)?:\s*(.*)$/i);
    if (changedHeader) {
      section = "changed";
      addInlineListItems(changedFiles, changedHeader[1], cleanChangedFileEvidence);
      continue;
    }

    const validationHeader = trimmed.match(/^Validation(?:\s+[^:]*)?:\s*(.*)$/i);
    if (validationHeader) {
      section = "validation";
      addInlineListItems(validationCommands, validationHeader[1], cleanValidationEvidence);
      continue;
    }

    const explicitPush = trimmed.match(/\bpush(?:ed| status)?\s*:\s*(success|succeeded|pushed|failed|blocked|yes|no)\b/i);
    if (explicitPush) pushStatus = normalizePushStatus(explicitPush[1]);

    if (/\b(?:commit|committed|push|pushed)\b/i.test(trimmed)) {
      const hash = trimmed.match(/\b[0-9a-f]{7,40}\b/i)?.[0];
      if (hash && !commitHash) commitHash = hash;
      if (/\bpushed\b|commit(?:ted)?\/pushed/i.test(trimmed)) pushStatus = pushStatus || "pushed";
    }

    if (looksLikeSectionHeader(trimmed)) {
      section = undefined;
      continue;
    }

    const bullet = trimmed.match(/^(?:[-*]\s+|\d+\.\s+)(.+)$/);
    if (!bullet || !section) continue;
    if (section === "changed") addUnique(changedFiles, cleanChangedFileEvidence(bullet[1]));
    if (section === "validation") addUnique(validationCommands, cleanValidationEvidence(bullet[1]));
    if (section === "nextSteps") addUnique(nextSteps, cleanReportText(bullet[1]));
    if (section === "blocker") addUnique(blockerStateLines, cleanReportText(bullet[1]));
  }

  const blockerState = blockerStateLines.join("; ");
  return {
    ...(summary ? { summary } : {}),
    ...(blockerState ? { blockerState } : {}),
    ...(nextSteps.length ? { nextSteps } : {}),
    ...(changedFiles.length ? { changedFiles } : {}),
    ...(validationCommands.length ? { validationCommands } : {}),
    ...(commitHash ? { commitHash } : {}),
    ...(pushStatus ? { pushStatus } : {}),
  };
}

function parseFinalMarkerBlock(text: string): FinalMarkerBlock | undefined {
  const match = text.match(/(?:^|\r?\n)\s*DEV_GOAL_VALIDATED:\s*(yes|no)\s*\r?\n\s*DEV_GOAL_DECISION:\s*(continue|stop|blocked|done)\s*$/i);
  if (!match || match.index === undefined) return undefined;
  return {
    index: match.index,
    validated: match[1].toLowerCase() === "yes",
    decision: match[2].toLowerCase() as LoopDecision,
  };
}

function parseTypedReport(text: string, markerIndex?: number): LoopReport | undefined {
  const reportText = markerIndex === undefined ? text : text.slice(0, markerIndex);
  const match = reportText.match(/(?:^|\r?\n)\s*DEV_GOAL_REPORT:\s*(\{[^\r\n]*\})\s*$/i);
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

function addInlineListItems(target: string[], value: string | undefined, clean: (item: string) => string | undefined) {
  if (!value) return;
  for (const item of value.split(/,\s*/)) addUnique(target, clean(item));
}

function cleanChangedFileEvidence(value: string): string | undefined {
  const text = cleanEvidenceText(value);
  if (!text) return undefined;
  return text.split(/\s+(?:[-–—]|\()\s*/)[0]?.trim() || undefined;
}

function cleanValidationEvidence(value: string): string | undefined {
  const text = cleanEvidenceText(value);
  if (!text) return undefined;
  return text.replace(/\s+(?:exited|passed|failed|succeeded|returned|→).*/i, "").trim() || undefined;
}

function cleanReportText(value: string): string | undefined {
  const text = cleanEvidenceText(value);
  return text ? text.replace(/\s+/g, " ").trim() : undefined;
}

function cleanEvidenceText(value: string): string | undefined {
  const code = value.match(/`([^`]+)`/)?.[1];
  const text = (code || value).replace(/^\[[ x-]\]\s*/i, "").trim();
  return text || undefined;
}

function addUnique(target: string[], value: string | undefined) {
  if (value && !target.includes(value)) target.push(value);
}

function looksLikeSectionHeader(value: string): boolean {
  return /^[A-Z][A-Za-z0-9 /_-]{0,60}:\s*\S/.test(value);
}

function normalizePushStatus(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "success" || lower === "succeeded" || lower === "yes") return "pushed";
  if (lower === "no") return "not_pushed";
  return lower;
}
