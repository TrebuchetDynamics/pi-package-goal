import * as path from "node:path";
import type { DeliveryEvidence, LoopReport } from "../../extensions/development-goal/domain.ts";

export type GoalDecision = "continue" | "stop" | "blocked" | "done";

export type FinalStatus =
  | "done"
  | "blocked"
  | "review_needed"
  | "unsafe_to_continue";

export type ReportQualityIssueCode =
  | "missing_blocked_work"
  | "missing_pivoted_work_completed"
  | "relative_human_changed_file"
  | "vague_typed_changed_file";

export type ReportQualityIssue = {
  code: ReportQualityIssueCode;
  message: string;
  value?: string;
};

export type ReportQuality = {
  valid: boolean;
  issues: ReportQualityIssue[];
};

export type FinalReport = {
  decision: GoalDecision;
  finalStatus?: FinalStatus;
  validated: boolean;
  deliveryEvidence: DeliveryEvidence;
  quality: ReportQuality;
};

export type FinalReportParseError = {
  code: "assistant_echo" | "missing_final_marker";
  message: string;
};

export type FinalReportParseResult =
  | { ok: true; report: FinalReport }
  | { ok: false; error: FinalReportParseError };

type FinalMarkerBlock = {
  index: number;
  validated: boolean;
  decision: GoalDecision;
};

export function parseFinalReport(text: string): FinalReportParseResult {
  const markerBlock = parseFinalMarkerBlock(text);
  if (!markerBlock) {
    return {
      ok: false,
      error: {
        code: "missing_final_marker",
        message: "missing DEV_GOAL_VALIDATED/DEV_GOAL_DECISION final marker block",
      },
    };
  }

  if (isAssistantEcho(text, markerBlock.index)) {
    return {
      ok: false,
      error: {
        code: "assistant_echo",
        message: "final marker block appears to be an instruction echo, not a completed final report",
      },
    };
  }

  const typedReport = parseTypedReport(text, markerBlock.index);
  const finalStatus = typedReport?.finalStatus || defaultFinalStatus(markerBlock.decision);
  const quality = reportQualityFromIssues(validateReportQualityIssues(text, markerBlock.index, typedReport?.deliveryEvidence || {}));
  return {
    ok: true,
    report: {
      decision: markerBlock.decision,
      finalStatus,
      validated: markerBlock.validated,
      deliveryEvidence: typedReport?.deliveryEvidence || {},
      quality,
    },
  };
}

export function parseLoopReport(text: string): LoopReport | undefined {
  const markerBlock = parseFinalMarkerBlock(text);
  const typedReport = parseTypedReport(text, markerBlock?.index);
  if (typedReport && markerBlock) return { ...typedReport, decision: markerBlock.decision, validated: markerBlock.validated };
  if (typedReport) return typedReport;
  if (markerBlock) return { decision: markerBlock.decision, validated: markerBlock.validated, deliveryEvidence: {} };
  return undefined;
}

export function parseLoopDeliveryEvidence(text: string): DeliveryEvidence {
  const markerBlock = parseFinalMarkerBlock(text);
  const typedReport = parseLoopReport(text);
  if (typedReport && Object.keys(typedReport.deliveryEvidence).length > 0) return typedReport.deliveryEvidence;

  const lines = text.split(/\r?\n/);
  const changedFiles: string[] = [];
  const validationCommands: string[] = [];
  const nextSteps: string[] = [];
  const blockerStateLines: string[] = [];
  const blockedWorkLines: string[] = [];
  const pivotedWorkCompletedLines: string[] = [];
  let summary: string | undefined;
  let commitHash: string | undefined;
  let pushStatus: string | undefined;
  let section: "changed" | "validation" | "nextSteps" | "blocker" | "blockedWork" | "pivotedWorkCompleted" | undefined;

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

    const blockedWorkHeader = trimmed.match(/^Blocked Work(?:\s+[^:]*)?:\s*(.*)$/i);
    if (blockedWorkHeader) {
      section = "blockedWork";
      addInlineListItems(blockedWorkLines, blockedWorkHeader[1], cleanReportText);
      continue;
    }

    const pivotedWorkHeader = trimmed.match(/^Pivoted Work Completed(?:\s+[^:]*)?:\s*(.*)$/i);
    if (pivotedWorkHeader) {
      section = "pivotedWorkCompleted";
      addInlineListItems(pivotedWorkCompletedLines, pivotedWorkHeader[1], cleanReportText);
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
    if (section === "blockedWork") addUnique(blockedWorkLines, cleanReportText(bullet[1]));
    if (section === "pivotedWorkCompleted") addUnique(pivotedWorkCompletedLines, cleanReportText(bullet[1]));
  }

  const blockedWork = blockedWorkLines.join("; ");
  const pivotedWorkCompleted = pivotedWorkCompletedLines.join("; ");
  const blockerState = blockerStateLines.join("; ") || blockedWork;
  const deliveryEvidence: DeliveryEvidence = {
    ...(summary ? { summary } : {}),
    ...(blockerState ? { blockerState } : {}),
    ...(blockedWork ? { blockedWork } : {}),
    ...(pivotedWorkCompleted ? { pivotedWorkCompleted } : {}),
    ...(nextSteps.length ? { nextSteps } : {}),
    ...(changedFiles.length ? { changedFiles } : {}),
    ...(validationCommands.length ? { validationCommands } : {}),
    ...(commitHash ? { commitHash } : {}),
    ...(pushStatus ? { pushStatus } : {}),
  };
  const reportQualityWarnings = validateReportQuality(text, markerBlock?.index, deliveryEvidence);
  return {
    ...deliveryEvidence,
    ...(reportQualityWarnings.length ? { reportQualityWarnings } : {}),
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

function parseTypedReport(text: string, markerIndex?: number): (LoopReport & { finalStatus?: FinalStatus }) | undefined {
  const reportText = markerIndex === undefined ? text : text.slice(0, markerIndex);
  const match = reportText.match(/(?:^|\r?\n)\s*DEV_GOAL_REPORT:\s*(\{[^\r\n]*\})\s*$/i);
  if (!match) return undefined;
  const rawReport = parseJsonRecord(match[1]);
  if (!rawReport) return undefined;

  const decision = loopDecisionOrUndefined(rawReport.decision);
  const validated = booleanOrUndefined(rawReport.validated);
  const finalStatus = finalStatusOrUndefined(rawReport.finalStatus) || finalStatusOrUndefined(rawReport.final_status);
  const changedFiles = stringArrayOrUndefined(rawReport.changedFiles) || stringArrayOrUndefined(rawReport.files);
  const validationCommands = stringArrayOrUndefined(rawReport.validationCommands) || stringArrayOrUndefined(rawReport.validation);
  const commitHash = stringOrUndefined(rawReport.commitHash) || stringOrUndefined(rawReport.commit);
  const pushValue = stringOrUndefined(rawReport.pushStatus) || stringOrUndefined(rawReport.pushed) || stringOrUndefined(rawReport.push);
  const pushStatus = pushValue ? normalizePushStatus(pushValue) : undefined;
  const summary = stringOrUndefined(rawReport.summary) || stringOrUndefined(rawReport.whatChanged);
  const blockedWork = stringListAsText(rawReport.blockedWork) || stringListAsText(rawReport.blocked_work);
  const pivotedWorkCompleted = stringListAsText(rawReport.pivotedWorkCompleted) || stringListAsText(rawReport.pivoted_work_completed) || stringListAsText(rawReport.pivotedWork);
  const blockerState = recordBlockerState(rawReport) || blockedWork;
  const nextSteps = stringArrayOrSingleString(rawReport.nextSteps) || stringArrayOrSingleString(rawReport.possibleNextSteps) || stringArrayOrSingleString(rawReport.nextStep) || stringArrayOrSingleString(rawReport.nextActions);
  const deliveryEvidence: DeliveryEvidence = {
    ...(summary ? { summary } : {}),
    ...(blockerState ? { blockerState } : {}),
    ...(blockedWork ? { blockedWork } : {}),
    ...(pivotedWorkCompleted ? { pivotedWorkCompleted } : {}),
    ...(nextSteps ? { nextSteps } : {}),
    ...(changedFiles ? { changedFiles } : {}),
    ...(validationCommands ? { validationCommands } : {}),
    ...(commitHash ? { commitHash } : {}),
    ...(pushStatus ? { pushStatus } : {}),
  };
  const reportQualityWarnings = validateReportQuality(reportText, undefined, deliveryEvidence);

  return {
    ...(decision ? { decision } : {}),
    ...(validated !== undefined ? { validated } : {}),
    ...(finalStatus ? { finalStatus } : {}),
    deliveryEvidence: {
      ...deliveryEvidence,
      ...(reportQualityWarnings.length ? { reportQualityWarnings } : {}),
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

export function validateReportQuality(text: string, markerIndex?: number, deliveryEvidence: Partial<DeliveryEvidence> = {}): string[] {
  return validateReportQualityIssues(text, markerIndex, deliveryEvidence).map((issue) => issue.message);
}

export function validateReportQualityIssues(text: string, markerIndex?: number, deliveryEvidence: Partial<DeliveryEvidence> = {}): ReportQualityIssue[] {
  const reportText = reportBodyText(text, markerIndex);
  const surface = reportQualitySurface(reportText);
  const issues: ReportQualityIssue[] = [];
  const blockedWork = stringOrUndefined(deliveryEvidence.blockedWork) || surface.blockedWork;
  const pivotedWorkCompleted = stringOrUndefined(deliveryEvidence.pivotedWorkCompleted) || surface.pivotedWorkCompleted;

  if (!surface.hasBlockedWorkSection && !blockedWork) issues.push({ code: "missing_blocked_work", message: "missing Blocked Work section" });
  if (!surface.hasPivotedWorkCompletedSection && !pivotedWorkCompleted) issues.push({ code: "missing_pivoted_work_completed", message: "missing Pivoted Work Completed section" });

  for (const changedFile of surface.humanChangedFiles) {
    if (isNoChangedFilesEvidence(changedFile)) continue;
    if (!isAbsoluteChangedFilePath(changedFile)) issues.push({ code: "relative_human_changed_file", message: `relative human-readable changed file "${changedFile}"`, value: changedFile });
  }

  for (const changedFile of surface.typedChangedFiles) {
    if (isVagueChangedFileEvidence(changedFile)) issues.push({ code: "vague_typed_changed_file", message: `vague DEV_GOAL_REPORT.changedFiles entry "${changedFile}"`, value: changedFile });
  }

  return uniqueIssues(issues);
}

function reportBodyText(text: string, markerIndex?: number): string {
  const index = markerIndex ?? parseFinalMarkerBlock(text)?.index;
  return index === undefined ? text : text.slice(0, index);
}

type ReportQualitySurface = {
  hasBlockedWorkSection: boolean;
  hasPivotedWorkCompletedSection: boolean;
  blockedWork?: string;
  pivotedWorkCompleted?: string;
  humanChangedFiles: string[];
  typedChangedFiles: string[];
};

function reportQualitySurface(reportText: string): ReportQualitySurface {
  const blockedWorkLines: string[] = [];
  const pivotedWorkCompletedLines: string[] = [];
  const humanChangedFiles: string[] = [];
  let hasBlockedWorkSection = false;
  let hasPivotedWorkCompletedSection = false;
  let section: "changed" | "blockedWork" | "pivotedWorkCompleted" | undefined;

  for (const line of reportText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      section = undefined;
      continue;
    }

    const blockedWorkHeader = trimmed.match(/^Blocked Work(?:\s+[^:]*)?:\s*(.*)$/i);
    if (blockedWorkHeader) {
      hasBlockedWorkSection = true;
      section = "blockedWork";
      addInlineListItems(blockedWorkLines, blockedWorkHeader[1], cleanReportText);
      continue;
    }

    const pivotedWorkHeader = trimmed.match(/^Pivoted Work Completed(?:\s+[^:]*)?:\s*(.*)$/i);
    if (pivotedWorkHeader) {
      hasPivotedWorkCompletedSection = true;
      section = "pivotedWorkCompleted";
      addInlineListItems(pivotedWorkCompletedLines, pivotedWorkHeader[1], cleanReportText);
      continue;
    }

    const changedHeader = trimmed.match(/^Changed files(?:\s+[^:]*)?:\s*(.*)$/i);
    if (changedHeader) {
      section = "changed";
      addInlineListItems(humanChangedFiles, changedHeader[1], cleanChangedFileEvidence);
      continue;
    }

    if (looksLikeReportQualityResetHeader(trimmed) || looksLikeSectionHeader(trimmed)) {
      section = undefined;
      continue;
    }

    const bullet = trimmed.match(/^(?:[-*]\s+|\d+\.\s+)(.+)$/);
    if (!bullet || !section) continue;
    if (section === "changed") addUnique(humanChangedFiles, cleanChangedFileEvidence(bullet[1]));
    if (section === "blockedWork") addUnique(blockedWorkLines, cleanReportText(bullet[1]));
    if (section === "pivotedWorkCompleted") addUnique(pivotedWorkCompletedLines, cleanReportText(bullet[1]));
  }

  const rawReport = parseTypedReportRecord(reportText);
  const typedChangedFiles = rawReport
    ? stringArrayOrUndefined(rawReport.changedFiles) || stringArrayOrUndefined(rawReport.files) || []
    : [];

  return {
    hasBlockedWorkSection,
    hasPivotedWorkCompletedSection,
    blockedWork: blockedWorkLines.join("; ") || undefined,
    pivotedWorkCompleted: pivotedWorkCompletedLines.join("; ") || undefined,
    humanChangedFiles,
    typedChangedFiles,
  };
}

function parseTypedReportRecord(reportText: string): Record<string, unknown> | undefined {
  const match = reportText.match(/(?:^|\r?\n)\s*DEV_GOAL_REPORT:\s*(\{[^\r\n]*\})\s*$/i);
  return match ? parseJsonRecord(match[1]) : undefined;
}

function isAbsoluteChangedFilePath(value: string): boolean {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function isNoChangedFilesEvidence(value: string): boolean {
  return /^(?:none|no changed files|no files|none committed|not applicable|n\/a)\b/i.test(value.trim());
}

function isVagueChangedFileEvidence(value: string): boolean {
  const text = cleanEvidenceText(value)?.replace(/\s+/g, " ").trim() || "";
  if (!text) return true;
  if (isNoChangedFilesEvidence(text)) return true;
  const normalized = text.toLowerCase().replace(/[.!]+$/g, "");
  if (/^(?:changed files?|files?|various files?|multiple files?|several files?|source files?|code|docs?|documentation|tests?|test files?|project|repo|repository|workspace|worktree|changes?|updates?|misc(?:ellaneous)?|stuff|all files)$/.test(normalized)) return true;
  if (/[?*…]/.test(text)) return true;
  if (/\b(?:etc\.?|and others|various|multiple|several)\b/i.test(text)) return true;
  const file = cleanChangedFileEvidence(text) || text;
  if (!/[\\/]/.test(file) && !/\.[A-Za-z0-9][A-Za-z0-9_-]{0,9}$/.test(file)) return true;
  return false;
}

function uniqueIssues(issues: ReportQualityIssue[]): ReportQualityIssue[] {
  const seen = new Set<string>();
  const unique: ReportQualityIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}:${issue.value ?? ""}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
  }
  return unique;
}

function reportQualityFromIssues(issues: ReportQualityIssue[]): ReportQuality {
  return { valid: issues.length === 0, issues };
}

function loopDecisionOrUndefined(value: unknown): GoalDecision | undefined {
  const decision = stringOrUndefined(value)?.toLowerCase();
  return decision === "continue" || decision === "stop" || decision === "blocked" || decision === "done" ? decision : undefined;
}

function finalStatusOrUndefined(value: unknown): FinalStatus | undefined {
  const status = stringOrUndefined(value)?.toLowerCase();
  return status === "done" || status === "blocked" || status === "review_needed" || status === "unsafe_to_continue" ? status : undefined;
}

function defaultFinalStatus(decision: GoalDecision): FinalStatus | undefined {
  if (decision === "done") return "done";
  if (decision === "blocked") return "blocked";
  if (decision === "stop") return "review_needed";
  return undefined;
}

function isAssistantEcho(text: string, markerIndex: number): boolean {
  const beforeMarkers = text.slice(0, markerIndex).trim();
  if (!beforeMarkers) return false;
  if (/DEV_GOAL_REPORT:\s*\{/i.test(beforeMarkers)) return false;
  if (/^(?:Scope|Selected slice|Changed files|Validation evidence|Commit\/push evidence|Blocker state|Possible next steps):/im.test(beforeMarkers)) return false;
  const lastContext = beforeMarkers.split(/\r?\n/).slice(-4).join("\n").toLowerCase();
  return /\b(?:end with|return only|use exactly|final markers?|marker lines?|instructions? only|prompt tells)\b/.test(lastContext);
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

function stringListAsText(value: unknown): string | undefined {
  const array = stringArrayOrUndefined(value);
  if (array) return array.join("; ");
  return stringOrUndefined(value);
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function recordBlockerState(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.blockerState)
    || stringOrUndefined(record.blockerReason)
    || stringOrUndefined(record.blockedReason)
    || stringOrUndefined(record.blockers)
    || stringOrUndefined(record.missingPrerequisites)
    || stringListAsText(record.blockedWork)
    || stringListAsText(record.blocked_work);
}

function addInlineListItems(target: string[], value: string | undefined, clean: (item: string) => string | undefined) {
  if (!value) return;
  for (const item of value.split(/,\s*/)) addUnique(target, clean(item));
}

function cleanChangedFileEvidence(value: string): string | undefined {
  const leadingPath = cleanLeadingChangedFilePath(value);
  if (leadingPath) return leadingPath;
  const text = cleanEvidenceText(value);
  if (!text) return undefined;
  return text.split(/\s+(?:[-–—]|\()\s*/)[0]?.trim() || undefined;
}

function cleanLeadingChangedFilePath(value: string): string | undefined {
  const trimmed = value.replace(/^\[[ x-]\]\s*/i, "").trim();
  const leadingCode = trimmed.match(/^`([^`]+)`/);
  if (leadingCode) return leadingCode[1].trim() || undefined;

  const candidate = trimmed.split(/\s+(?:[-–—]|\()\s*/)[0]?.replace(/^`|`$/g, "").trim();
  if (!candidate) return undefined;
  if (looksLikeChangedFileEvidenceToken(candidate) || isNoChangedFilesEvidence(candidate)) return candidate;
  return undefined;
}

function looksLikeChangedFileEvidenceToken(value: string): boolean {
  if (/[\\/]/.test(value)) return true;
  return /\.[A-Za-z0-9][A-Za-z0-9_-]{0,9}$/.test(value);
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

function looksLikeReportQualityResetHeader(value: string): boolean {
  return /^(?:Scope|Selected slice|Validation(?: evidence)?|Commit\/push evidence|Blocker state|Possible next steps|Next steps|DEV_GOAL_REPORT):/i.test(value);
}

function normalizePushStatus(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "success" || lower === "succeeded" || lower === "yes") return "pushed";
  if (lower === "no") return "not_pushed";
  return lower;
}
