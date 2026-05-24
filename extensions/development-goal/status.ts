import * as fs from "node:fs";
import * as path from "node:path";
import { parseLoopLogRecord, recordEvent, recordTimestamp } from "./log-record.ts";
import { loopBudgetSummary } from "./budget.ts";
import { recordBlockerState, recordGoalAchieved, recordGoalEvidence, recordReportNextSteps, recordReportSummary } from "./report-record.ts";
import { compactTopic, objectiveText } from "./topic.ts";
import { DEVELOPMENT_GOAL_IDENTITY } from "./identity.ts";
import { compactIterationProgress } from "./state.ts";
import { goalLogRelative } from "../goal-core/identity.ts";

const DEFAULT_LOG_RELATIVE = goalLogRelative(DEVELOPMENT_GOAL_IDENTITY);
const STATUS_TOPIC_MAX = 72;
const STATUS_REPORT_HISTORY_LIMIT = 3;
const PROMPT_OBJECTIVE_MAX = 600;

type UiThemeLike = {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
};

type LoopStatusState = {
  active: boolean;
  adapterName: string;
  topic: string;
  iteration: number;
  maxIterations: number;
  startedAt?: string;
  tokenBudget?: number;
  logPath?: string;
  phase: string;
  lastDecision?: string;
  lastReason?: string;
  commit: boolean;
  push: boolean;
};

export function statusReport(s: LoopStatusState, cwd = process.cwd()): string {
  const logPath = s.logPath || path.join(cwd, DEFAULT_LOG_RELATIVE);
  const last = readLastLoopRecord(logPath);
  return [
    statusLine(s),
    ...(s.adapterName && s.adapterName !== "none" ? [`adapter: ${s.adapterName}`] : []),
    ...(s.topic ? [`topic: ${objectiveText(s.topic, PROMPT_OBJECTIVE_MAX)}`] : []),
    `state: ${stateExplanation(s, last)}`,
    ...(s.active ? [`budget: ${loopBudgetSummary(s)}`] : []),
    summarizeLastLoopRecord(last),
    ...summarizeRecentReportContext(readRecentReportRecords(logPath)),
    `log: ${relativeToCwd(cwd, logPath)}`,
    ...statusCommandHints(s),
  ].join("\n");
}

export function statusLine(s: LoopStatusState, theme?: UiThemeLike): string {
  const status = loopStatusMeta(s);
  const context = statusContext(s);
  return compactJoin([
    paint(theme, status.color, `${status.icon} ${status.label}`),
    paint(theme, "dim", s.active ? compactIterationProgress(s) : "goal"),
    s.adapterName !== "none" ? paint(theme, "dim", s.adapterName) : undefined,
    s.adapterName !== "none" ? paint(theme, deliveryColor(s), deliverySegment(s)) : undefined,
    context ? paint(theme, "muted", context) : undefined,
  ]);
}

export function statusWidgetLines(s: LoopStatusState, cwd: string, theme?: UiThemeLike): string[] | undefined {
  if (!s.active && s.phase === "idle" && !s.lastDecision) return undefined;
  const logPath = s.logPath || path.join(cwd, DEFAULT_LOG_RELATIVE);
  const last = readLastLoopRecord(logPath);
  const reportSummary = last ? recordReportSummary(last) : undefined;
  const reportNextSteps = last ? recordReportNextSteps(last) : [];
  const blockerState = last ? recordBlockerState(last) : undefined;
  const goalAchieved = last ? recordGoalAchieved(last) : undefined;
  const goalEvidence = last ? recordGoalEvidence(last) : undefined;
  const detail = compactJoin([
    recordEvent(last) ? `last ${recordEvent(last)}` : "last none",
    recordTime(last),
    last?.iteration !== undefined ? `i${String(last.iteration)}` : undefined,
    goalAchieved !== undefined ? `goal ${goalAchieved ? "achieved" : "not achieved"}` : undefined,
    goalEvidence ? `proof ${compactStatusText(goalEvidence)}` : undefined,
    reportSummary ? `summary ${compactStatusText(reportSummary)}` : undefined,
    blockerState ? `blocker ${compactStatusText(blockerState)}` : undefined,
    widgetNextStepsSummary(reportNextSteps),
    `log ${relativeToCwd(cwd, logPath)}`,
  ]);
  return [paint(theme, "dim", detail)];
}

export function readLastLoopRecord(logPath: string): Record<string, unknown> | undefined {
  try {
    const content = fs.readFileSync(logPath, "utf8").trim();
    if (!content) return undefined;
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = parseLoopLogRecord(lines[i]);
      if (parsed) return parsed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function readRecentReportRecords(logPath: string, limit = STATUS_REPORT_HISTORY_LIMIT): Record<string, unknown>[] {
  try {
    const content = fs.readFileSync(logPath, "utf8").trim();
    if (!content) return [];
    const lines = content.split(/\r?\n/).filter(Boolean);
    const records: Record<string, unknown>[] = [];
    for (let i = lines.length - 1; i >= 0 && records.length < limit; i--) {
      const parsed = parseLoopLogRecord(lines[i]);
      if (parsed && (recordReportSummary(parsed) || recordBlockerState(parsed) || recordReportNextSteps(parsed).length > 0)) records.push(parsed);
    }
    return records;
  } catch {
    return [];
  }
}

function loopStatusMeta(s: LoopStatusState): { icon: string; label: string; color: string } {
  if (s.phase === "blocked") return { icon: "■", label: "block", color: "error" };
  if (s.phase === "done") return { icon: "✓", label: "done", color: "success" };
  if (!s.active) return { icon: "○", label: "idle", color: "dim" };
  if (s.phase === "paused") return { icon: "Ⅱ", label: "pause", color: "warning" };
  if (s.phase === "queued") return { icon: "◆", label: "queue", color: "warning" };
  if (s.phase === "reported") return { icon: "◇", label: "report", color: "accent" };
  if (s.phase === "started") return { icon: "●", label: "start", color: "accent" };
  return { icon: "●", label: "run", color: "accent" };
}

function deliverySegment(s: LoopStatusState): string {
  if (s.push) return "git:push";
  if (s.commit) return "git:commit";
  return "git:manual";
}

function statusContext(s: LoopStatusState): string | undefined {
  if (s.active) return compactTopic(objectiveText(s.topic, PROMPT_OBJECTIVE_MAX), STATUS_TOPIC_MAX);
  if (s.phase === "blocked") return compactStatusText(s.lastReason || String(s.lastDecision || "blocked"));
  if (s.phase === "done") return undefined;
  return s.lastDecision ? compactStatusText(String(s.lastDecision)) : undefined;
}

function deliveryColor(s: LoopStatusState): string {
  if (s.push) return "success";
  if (s.commit) return "warning";
  return "dim";
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

function paint(theme: UiThemeLike | undefined, color: string, text: string): string {
  return theme?.fg ? theme.fg(color, text) : text;
}

function compactStatusText(text: string): string {
  if (text.length <= STATUS_TOPIC_MAX) return text;
  return `${text.slice(0, STATUS_TOPIC_MAX - 1)}…`;
}

function recordTime(record?: Record<string, unknown>): string | undefined {
  const at = recordTimestamp(record);
  if (!at) return undefined;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.toISOString().slice(11, 19);
}

function stateExplanation(s: LoopStatusState, last?: Record<string, unknown>): string {
  if (!s.active) {
    if (s.phase === "blocked") return `Blocked${s.lastReason ? `: ${s.lastReason}` : "."}`;
    if (s.phase === "done") return "Done.";
    return s.lastDecision ? `Idle after ${s.lastDecision}.` : "Idle.";
  }
  if (s.phase === "queued") return "Queued follow-up; waiting for Pi to deliver the next iteration prompt.";
  if (s.phase === "running") return "Running; waiting for final DEV_GOAL markers.";
  if (s.phase === "reported") return "Iteration reported; preparing the next action.";
  const event = recordEvent(last);
  return event ? `Active; latest event is ${event}.` : "Active.";
}

function summarizeLastLoopRecord(record?: Record<string, unknown>): string {
  if (!record) return "Last event:\n  none recorded yet";
  const lines = [`Last event:`, `  event: ${recordEvent(record) ?? "unknown"}`];
  const at = recordTimestamp(record);
  if (at) lines.push(`  at: ${at}`);
  if (record.iteration !== undefined) lines.push(`  iteration: ${String(record.iteration)}`);
  if (typeof record.decision === "string") lines.push(`  decision: ${record.decision}`);
  if (typeof record.reason === "string") lines.push(`  reason: ${record.reason}`);
  const goalAchieved = recordGoalAchieved(record);
  if (goalAchieved !== undefined) lines.push(`  goal achieved: ${goalAchieved ? "yes" : "no"}`);
  const goalEvidence = recordGoalEvidence(record);
  if (goalEvidence) lines.push(`  goal evidence: ${goalEvidence}`);
  const reportSummary = recordReportSummary(record);
  if (reportSummary) lines.push(`  summary: ${reportSummary}`);
  const blockerState = recordBlockerState(record);
  if (blockerState) lines.push(`  blocker: ${blockerState}`);
  const nextSteps = recordReportNextSteps(record);
  for (const [index, step] of nextSteps.slice(0, 3).entries()) lines.push(`  next ${index + 1}: ${step}`);
  if (nextSteps.length > 3) lines.push(`  next: +${nextSteps.length - 3} more`);
  return lines.join("\n");
}

function reportNextStepSummaryParts(nextSteps: string[], limit = 3): string[] {
  const visible = nextSteps.slice(0, Math.max(0, limit));
  const parts = visible.map((step, index) => `next ${index + 1} ${step}`);
  if (nextSteps.length > visible.length) parts.push(`next +${nextSteps.length - visible.length} more`);
  return parts;
}

function summarizeRecentReportContext(records: Record<string, unknown>[]): string[] {
  if (!records.length) return [];
  return [
    "Recent report context:",
    ...records.flatMap((record, index) => formatRecentReportRecord(record, index + 1)),
  ];
}

function formatRecentReportRecord(record: Record<string, unknown>, index: number): string[] {
  const summary = recordReportSummary(record);
  const goalAchieved = recordGoalAchieved(record);
  const goalEvidence = recordGoalEvidence(record);
  const blockerState = recordBlockerState(record);
  const header = compactJoin([
    typeof record.iteration === "number" ? `i${record.iteration}` : undefined,
    typeof record.decision === "string" ? record.decision : undefined,
  ]) || "record";
  const nextSteps = recordReportNextSteps(record);
  return [
    `  ${index}. ${header}`,
    goalAchieved !== undefined ? `     goal achieved: ${goalAchieved ? "yes" : "no"}` : undefined,
    goalEvidence ? `     goal evidence: ${compactStatusText(goalEvidence)}` : undefined,
    summary ? `     summary: ${compactStatusText(summary)}` : undefined,
    blockerState ? `     blocker: ${compactStatusText(blockerState)}` : undefined,
    ...nextSteps.slice(0, 3).map((step, stepIndex) => `     next ${stepIndex + 1}: ${compactStatusText(step)}`),
    nextSteps.length > 3 ? `     next: +${nextSteps.length - 3} more` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function statusCommandHints(s: LoopStatusState): string[] {
  if (s.active && s.phase === "paused") {
    return [
      "Commands:",
      "  control: /development-goal resume | /development-goal stop",
      "  inspect: /development-goal status | /development-goal analyze-logs",
    ];
  }
  if (s.active) {
    return [
      "Commands:",
      "  control: /development-goal pause | /development-goal stop",
      "  inspect: /development-goal status | /development-goal analyze-logs",
    ];
  }
  return [
    "Commands:",
    "  start: /development-goal <topic>",
    "  inspect: /development-goal status | /development-goal analyze-logs",
    "  configure: /development-goal init | /development-goal adapters | /development-goal help",
  ];
}

function widgetNextStepsSummary(nextSteps: string[]): string | undefined {
  if (!nextSteps[0]) return undefined;
  const suffix = nextSteps.length > 1 ? ` (+${nextSteps.length - 1} more)` : "";
  return `next ${compactStatusText(`${nextSteps[0]}${suffix}`)}`;
}

function relativeToCwd(cwd: string, target: string): string {
  const absolute = path.isAbsolute(target) ? target : path.join(cwd, target);
  const relative = path.relative(cwd, absolute);
  return relative && !relative.startsWith("..") ? relative : absolute;
}
