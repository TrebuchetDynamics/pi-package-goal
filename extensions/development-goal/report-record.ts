import { recordEvent, recordReason } from "./log-record.ts";

export function recordHasDeliveryEvidence(record: Record<string, unknown>): boolean {
  return recordChangedFiles(record).length > 0
    || recordValidationEvidence(record).length > 0
    || Boolean(recordCommitHash(record))
    || Boolean(recordReportSummary(record))
    || recordGoalAchieved(record) !== undefined
    || Boolean(recordGoalEvidence(record))
    || Boolean(recordBlockerState(record))
    || Boolean(recordBlockedWork(record))
    || Boolean(recordPivotedWorkCompleted(record))
    || recordReportNextSteps(record).length > 0
    || Boolean(recordPushStatus(record));
}

export function recordChangedFiles(record: Record<string, unknown>): string[] {
  return stringArrayOrUndefined(record.changedFiles) || stringArrayOrUndefined(record.files) || [];
}

export function recordValidationEvidence(record: Record<string, unknown>): string[] {
  return stringArrayOrUndefined(record.validationCommands)
    || stringArrayOrUndefined(record.validation)
    || stringArrayOrUndefined(record.validations)
    || objectKeys(record.validation)
    || objectKeys(record.validations)
    || [];
}

export function recordCommitHash(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.commitHash) || stringOrUndefined(record.commit);
}

export function recordReportSummary(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.summary) || stringOrUndefined(record.whatChanged);
}

export function recordGoalAchieved(record: Record<string, unknown>): boolean | undefined {
  return booleanOrUndefined(record.goalAchieved) ?? booleanOrUndefined(record.objectiveAchieved);
}

export function recordGoalEvidence(record: Record<string, unknown>): string | undefined {
  return stringListAsText(record.goalEvidence)
    || stringListAsText(record.completionEvidence)
    || stringListAsText(record.achievementEvidence)
    || stringListAsText(record.howProven)
    || stringListAsText(record.howAchieved);
}

export function recordReportQualityWarning(event: string, reportSummary: string | undefined): string | undefined {
  if (event !== "iteration_result" && event !== "loop_finished") return undefined;
  if (reportSummary && isVagueReportSummary(reportSummary)) return `vague report summary "${reportSummary}"`;
  return undefined;
}

export function recordReportQualityWarnings(event: string, record: Record<string, unknown>): string[] {
  if (event !== "iteration_result" && event !== "loop_finished") return [];
  const warnings = stringArrayOrUndefined(record.reportQualityWarnings) || stringArrayOrUndefined(record.report_quality_warnings) || [];
  const summaryWarning = recordReportQualityWarning(event, recordReportSummary(record));
  return uniqueStrings([...warnings, ...(summaryWarning ? [summaryWarning] : [])]);
}

export function recordReportMissingNextStepsDecision(event: string, decision: string | undefined, reportNextSteps: string[]): string | undefined {
  if (event !== "iteration_result" && event !== "loop_finished") return undefined;
  const normalizedDecision = decision?.trim().toLowerCase();
  if ((normalizedDecision === "continue" || normalizedDecision === "blocked") && reportNextSteps.length === 0) return normalizedDecision;
  return undefined;
}

export function recordBlockerState(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.blockerState)
    || stringOrUndefined(record.blockerReason)
    || stringOrUndefined(record.blockedReason)
    || stringOrUndefined(record.blockers)
    || stringOrUndefined(record.missingPrerequisites)
    || recordBlockedWork(record);
}

export function recordBlockedWork(record: Record<string, unknown>): string | undefined {
  return stringListAsText(record.blockedWork) || stringListAsText(record.blocked_work);
}

export function recordPivotedWorkCompleted(record: Record<string, unknown>): string | undefined {
  return stringListAsText(record.pivotedWorkCompleted)
    || stringListAsText(record.pivoted_work_completed)
    || stringListAsText(record.pivotedWork);
}

export function recordBlockerKind(record: Record<string, unknown>): string | undefined {
  const explicitKind = stringOrUndefined(record.blockerKind) || stringOrUndefined(record.blocker_kind);
  if (explicitKind) return explicitKind;
  const text = [
    recordBlockerState(record),
    recordReason(record, recordEvent(record) || ""),
    stringOrUndefined(record.error),
    stringOrUndefined(record.message),
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return undefined;
  if (/malformed[_\s-]+final[_\s-]+report/.test(text)) return "malformed_final_report";
  if (/\bgit\s+push\b/.test(text) && /(fetch-first|non[-\s]?fast[-\s]?forward|rejected|failed to push some refs|remote contains work)/.test(text)) return "git_push_fetch_first";
  if (isValidationFailedTwiceText(text)) return "validation_failed_twice";
  return undefined;
}

export function blockerKindRecommendation(kind: string | undefined): string | undefined {
  if (kind === "malformed_final_report") return "Malformed final-report blockers: repair only the final report, address the exact issue codes, then restart the same Development Goal if the work remains valid.";
  if (kind === "git_push_fetch_first") return "Fetch-first push blockers: approve fetch/rebase/merge workflow, rerun validation, then push.";
  if (kind === "validation_failed_twice") return "Validation failed twice blockers: fix the first failing assertion, rerun required validation, then commit/push only after green.";
  return undefined;
}

export function recordReportNextSteps(record: Record<string, unknown>): string[] {
  return stringArrayOrSingleString(record.nextSteps)
    || stringArrayOrSingleString(record.possibleNextSteps)
    || stringArrayOrSingleString(record.nextStep)
    || stringArrayOrSingleString(record.nextActions)
    || [];
}

export function recordPushStatus(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.pushStatus) || stringOrUndefined(record.pushed) || stringOrUndefined(record.push);
}

export function recordCiGreen(record: Record<string, unknown>, event: string): boolean | undefined {
  const explicit = booleanOrUndefined(record.ciGreen) ?? booleanOrUndefined(record.ci_green);
  if (explicit !== undefined) return explicit;
  const text = stringOrUndefined(record.ciGreen) || stringOrUndefined(record.ci_green) || stringOrUndefined(record.ciGate) || stringOrUndefined(record.ci_gate);
  if (text && /^(yes|true|green|passed|pass|local_full_gate_passed)$/i.test(text)) return true;
  if (text && /^(no|false|red|failed|fail|missing|missing_CI_GREEN_yes)$/i.test(text)) return false;
  if (event === "ci_gate_missing") return false;
  return undefined;
}

function isVagueReportSummary(summary: string): boolean {
  const normalized = summary.trim().toLowerCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ");
  return /^(all good|fixed stuff|done|finished|complete|completed|works|it works|fixed|updates?|changes?|misc|cleanup|wip)$/.test(normalized);
}

function isValidationFailedTwiceText(text: string): boolean {
  return /\b(failed|fails|failure)\s+twice\b/.test(text) && /\b(validation|tests?|npm|flutter|pytest|cargo|mvn|gradle|assertion|check)\b/.test(text);
}

function objectKeys(value: unknown): string[] | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
  const keys = Object.keys(value).filter(Boolean);
  return keys.length ? keys : undefined;
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
