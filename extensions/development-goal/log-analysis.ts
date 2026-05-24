import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseSinceFilter, type ParsedCommand, type SinceFilter } from "./command.ts";
import { absoluteLogPath, contextCwd, relativeToCwd } from "./files.ts";
import { DEFAULT_LOG_RELATIVE } from "./state.ts";
import { isPrematureCompactionRecord } from "./compaction.ts";
import { PROMPT_OBJECTIVE_MAX } from "./prompts.ts";
import {
  parseLoopLogRecord as parseLogRecord,
  recordDecision,
  recordEvent,
  recordReason,
  recordRunId,
  recordTimestampMs,
} from "./log-record.ts";
import {
  recordHasContextOverflowProviderError,
  recordHasProviderError,
  recordProviderErrorCategory,
  recordProviderErrorCode,
} from "./provider-error.ts";
import {
  blockerKindRecommendation,
  recordBlockedWork,
  recordBlockerKind,
  recordBlockerState,
  recordChangedFiles,
  recordCiGreen,
  recordCommitHash,
  recordHasDeliveryEvidence,
  recordPushStatus,
  recordPivotedWorkCompleted,
  recordReportMissingNextStepsDecision,
  recordReportNextSteps,
  recordReportQualityWarnings,
  recordReportSummary,
  recordValidationEvidence,
} from "./report-record.ts";
import { hashText } from "./topic.ts";
import { singleLineText, stringOrUndefined } from "./values.ts";

const LOG_TOPIC_MAX = 600;

type UiLikeContext = {
  cwd?: string;
  ui?: {
    notify?: (message: string, level?: string) => void;
  };
  sessionManager?: {
    getCwd?: () => string;
  };
};

type LoopLogAnalysisOptions = {
  since?: SinceFilter;
};

type LoopLogAnalysis = {
  logFiles: number;
  records: number;
  invalidRecords: number;
  sinceFilterLabel?: string;
  sinceCutoffIso?: string;
  sinceFilteredRecords: number;
  loopsStarted: number;
  finishedLoops: number;
  finishedWithoutValidationRecords: number;
  finishedWithoutDeliveryRecords: number;
  iterationResultRecords: number;
  iterationResultWithoutValidationRecords: number;
  iterationPromptSentRecords: number;
  topPromptResultImbalanceSource?: string;
  topPromptResultImbalanceSourceDelta: number;
  duplicatePromptSentGroups: number;
  duplicatePromptSentExtraRecords: number;
  assistantDecisionRecords: number;
  topAssistantDecision?: string;
  topAssistantDecisionCount: number;
  topFinishDecision?: string;
  topFinishDecisionCount: number;
  blockedLoops: number;
  blockerKindRecords: number;
  topBlockReason?: string;
  topBlockReasonCount: number;
  topBlockedSource?: string;
  topBlockedSourceCount: number;
  topBlockerKind?: string;
  topBlockerKindCount: number;
  postmortems: number;
  selfImprovementQueuedRecords: number;
  topSelfImprovementSource?: string;
  topSelfImprovementSourceCount: number;
  topSelfImprovementReason?: string;
  topSelfImprovementReasonCount: number;
  topSelfImprovementAction?: string;
  topSelfImprovementActionCount: number;
  topPostmortemCause?: string;
  topPostmortemCauseCount: number;
  topNextSafeAction?: string;
  topNextSafeActionCount: number;
  finalMarkerRecoveryRequests: number;
  topFinalMarkerRecoverySource?: string;
  topFinalMarkerRecoverySourceCount: number;
  topFinalMarkerRecoveryReason?: string;
  topFinalMarkerRecoveryReasonCount: number;
  finalMarkerRecoverySuccesses: number;
  finalMarkerRecoveryBlocks: number;
  topFinalMarkerRecoveryBlockSource?: string;
  topFinalMarkerRecoveryBlockSourceCount: number;
  topFinalMarkerRecoveryBlockReason?: string;
  topFinalMarkerRecoveryBlockReasonCount: number;
  deliveryEvidenceRecords: number;
  changedFileEvidenceRecords: number;
  validationEvidenceRecords: number;
  commitEvidenceRecords: number;
  reportSummaryRecords: number;
  reportBlockerStateRecords: number;
  reportBlockedWorkRecords: number;
  reportPivotedWorkCompletedRecords: number;
  reportNextStepItems: number;
  reportMissingNextStepsRecords: number;
  reportQualityWarningRecords: number;
  topReportSummary?: string;
  topReportBlockerState?: string;
  topReportBlockedWork?: string;
  topReportPivotedWorkCompleted?: string;
  topReportQualityWarning?: string;
  topReportMissingNextStepsDecision?: string;
  topReportSummaryCount: number;
  topReportBlockerStateCount: number;
  topReportBlockedWorkCount: number;
  topReportPivotedWorkCompletedCount: number;
  topReportQualityWarningCount: number;
  topReportMissingNextStepsDecisionCount: number;
  topReportNextStep?: string;
  topReportNextStepCount: number;
  pushEvidenceRecords: number;
  commitWithoutPushRecords: number;
  topCommitWithoutPushSource?: string;
  topCommitWithoutPushSourceCount: number;
  topPushStatus?: string;
  topPushStatusCount: number;
  ciGreenRecords: number;
  ciRedRecords: number;
  topCiRedSource?: string;
  topCiRedSourceCount: number;
  ciGateMissingRecords: number;
  topCiGateMissingSource?: string;
  topCiGateMissingSourceCount: number;
  topCiGateMissingReason?: string;
  topCiGateMissingReasonCount: number;
  unresolvedLoopStarts: number;
  topUnresolvedSource?: string;
  topUnresolvedSourceCount: number;
  emptyProviderResponses: number;
  emptyProviderRetryRecords: number;
  topEmptyProviderSource?: string;
  topEmptyProviderSourceCount: number;
  topEmptyProviderReason?: string;
  topEmptyProviderReasonCount: number;
  queuedIterationRecords: number;
  topQueuedIterationSource?: string;
  topQueuedIterationSourceCount: number;
  topQueuedIterationReason?: string;
  topQueuedIterationReasonCount: number;
  providerErrorRecords: number;
  topProviderErrorSource?: string;
  topProviderErrorSourceCount: number;
  topProviderErrorCode?: string;
  topProviderErrorCodeCount: number;
  topProviderErrorCategory?: string;
  topProviderErrorCategoryCount: number;
  contextOverflowResponses: number;
  compactionEvents: number;
  topCompactionSource?: string;
  topCompactionSourceCount: number;
  prematureCompactionRecords: number;
  topPrematureCompactionSource?: string;
  topPrematureCompactionSourceCount: number;
  compactionResumeRecords: number;
  compactionFailureRecords: number;
  topCompactionFailureReason?: string;
  topCompactionFailureReasonCount: number;
  userSteeringRecords: number;
  maxUserSteeringLength: number;
  providerNoiseTopicRecords: number;
  sanitizedTopicRecords: number;
  truncatedTopics: number;
  oversizedTopicRecords: number;
  mostRepeatedOversizedTopicRecords: number;
  maxTopicLength: number;
  readError?: string;
  recommendations: string[];
};

type LoopLogAccumulator = {
  analysis: LoopLogAnalysis;
  since?: SinceFilter;
  oversizedTopicCounts: Map<string, number>;
  blockReasonCounts: Map<string, number>;
  blockedSourceCounts: Map<string, number>;
  blockerKindCounts: Map<string, number>;
  finishDecisionCounts: Map<string, number>;
  assistantDecisionCounts: Map<string, number>;
  promptSentCounts: Map<string, number>;
  sourcePromptSentCounts: Map<string, number>;
  sourceIterationResultCounts: Map<string, number>;
  postmortemCauseCounts: Map<string, number>;
  nextSafeActionCounts: Map<string, number>;
  finalMarkerRecoverySourceCounts: Map<string, number>;
  finalMarkerRecoveryReasonCounts: Map<string, number>;
  finalMarkerRecoveryBlockSourceCounts: Map<string, number>;
  finalMarkerRecoveryBlockReasonCounts: Map<string, number>;
  selfImprovementSourceCounts: Map<string, number>;
  selfImprovementReasonCounts: Map<string, number>;
  selfImprovementActionCounts: Map<string, number>;
  commitWithoutPushSourceCounts: Map<string, number>;
  pushStatusCounts: Map<string, number>;
  reportSummaryCounts: Map<string, number>;
  reportBlockerStateCounts: Map<string, number>;
  reportBlockedWorkCounts: Map<string, number>;
  reportPivotedWorkCompletedCounts: Map<string, number>;
  reportNextStepCounts: Map<string, number>;
  reportMissingNextStepsDecisionCounts: Map<string, number>;
  reportQualityWarningCounts: Map<string, number>;
  ciRedSourceCounts: Map<string, number>;
  ciGateMissingSourceCounts: Map<string, number>;
  ciGateMissingReasonCounts: Map<string, number>;
  emptyProviderSourceCounts: Map<string, number>;
  emptyProviderReasonCounts: Map<string, number>;
  queuedIterationSourceCounts: Map<string, number>;
  queuedIterationReasonCounts: Map<string, number>;
  providerErrorSourceCounts: Map<string, number>;
  providerErrorCodeCounts: Map<string, number>;
  providerErrorCategoryCounts: Map<string, number>;
  compactionSourceCounts: Map<string, number>;
  prematureCompactionSourceCounts: Map<string, number>;
  compactionFailureReasonCounts: Map<string, number>;
  markerRecoveryKeys: Set<string>;
  markerRecoverySucceededKeys: Set<string>;
  markerRecoveryBlockedKeys: Set<string>;
  startedRunIds: Set<string>;
  terminalRunIds: Set<string>;
  sourceStartedRunIds: Map<string, Set<string>>;
  sourceTerminalRunIds: Map<string, Set<string>>;
  legacyStartsBySource: Map<string, number>;
  legacyFinishedBySource: Map<string, number>;
  legacyBlockedBySource: Map<string, number>;
  legacyLoopStarts: number;
  legacyFinishedLoops: number;
  legacyBlockedLoops: number;
  legacyMarkerRecoveryBlocks: number;
};

export function publishLogAnalysis(pi: ExtensionAPI, ctx: UiLikeContext, parsed: ParsedCommand, fallbackLogPath = DEFAULT_LOG_RELATIVE) {
  const cwd = contextCwd(ctx);
  const targetPath = absoluteLogPath(cwd, parsed.topic || fallbackLogPath || DEFAULT_LOG_RELATIVE);
  const since = parsed.since ? parseSinceFilter(parsed.since) : undefined;
  const analysis = parsed.since && !since ? invalidSinceLoopLogAnalysis(parsed.since) : analyzeLoopLogPath(targetPath, { since });
  const htmlPath = parsed.html ? writeLoopLogHtmlReport(analysis, cwd, targetPath) : undefined;
  const text = parsed.json
    ? formatLoopLogAnalysisJson(analysis, cwd, targetPath, htmlPath)
    : [formatLoopLogAnalysis(analysis, cwd, targetPath), htmlPath ? `HTML health report: ${htmlPath}` : undefined].filter(Boolean).join("\n");
  notify(ctx, text);
  if (typeof pi.sendMessage === "function") {
    pi.sendMessage({ customType: "development-goal-log-analysis", content: text, display: true });
  }
}

function analyzeLoopLogPath(targetPath: string, options: LoopLogAnalysisOptions = {}): LoopLogAnalysis {
  try {
    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) return analyzeLoopLogDirectory(targetPath, options);
    return analyzeLoopLogFile(targetPath, options);
  } catch (error) {
    return unreadableLoopLogAnalysis(error);
  }
}

function analyzeLoopLogFile(logPath: string, options: LoopLogAnalysisOptions = {}): LoopLogAnalysis {
  try {
    const accumulator = createLoopLogAccumulator(options);
    accumulator.analysis.logFiles = 1;
    accumulateLoopLogText(fs.readFileSync(logPath, "utf8"), accumulator, logPath);
    return finalizeLoopLogAnalysis(accumulator);
  } catch (error) {
    return unreadableLoopLogAnalysis(error);
  }
}

function analyzeLoopLogDirectory(dirPath: string, options: LoopLogAnalysisOptions = {}): LoopLogAnalysis {
  try {
    const logFiles = discoverLoopLogFiles(dirPath);
    if (logFiles.length === 0) {
      return {
        ...emptyLoopLogAnalysis(),
        readError: "No logs.jsonl files found under directory.",
        recommendations: ["Log unavailable: pass a loop log file or a directory containing .pi/**/logs.jsonl files."],
      };
    }
    const accumulator = createLoopLogAccumulator(options);
    for (const logFile of logFiles) {
      accumulator.analysis.logFiles++;
      accumulateLoopLogText(fs.readFileSync(logFile, "utf8"), accumulator, logFile);
    }
    return finalizeLoopLogAnalysis(accumulator);
  } catch (error) {
    return unreadableLoopLogAnalysis(error);
  }
}

function analyzeLoopLogText(content: string, options: LoopLogAnalysisOptions = {}): LoopLogAnalysis {
  const accumulator = createLoopLogAccumulator(options);
  accumulateLoopLogText(content, accumulator);
  return finalizeLoopLogAnalysis(accumulator);
}

function createLoopLogAccumulator(options: LoopLogAnalysisOptions = {}): LoopLogAccumulator {
  const analysis = emptyLoopLogAnalysis();
  if (options.since) {
    analysis.sinceFilterLabel = options.since.label;
    analysis.sinceCutoffIso = options.since.cutoffIso;
  }
  return {
    analysis,
    since: options.since,
    oversizedTopicCounts: new Map<string, number>(),
    blockReasonCounts: new Map<string, number>(),
    blockedSourceCounts: new Map<string, number>(),
    blockerKindCounts: new Map<string, number>(),
    finishDecisionCounts: new Map<string, number>(),
    assistantDecisionCounts: new Map<string, number>(),
    promptSentCounts: new Map<string, number>(),
    sourcePromptSentCounts: new Map<string, number>(),
    sourceIterationResultCounts: new Map<string, number>(),
    postmortemCauseCounts: new Map<string, number>(),
    nextSafeActionCounts: new Map<string, number>(),
    finalMarkerRecoverySourceCounts: new Map<string, number>(),
    finalMarkerRecoveryReasonCounts: new Map<string, number>(),
    finalMarkerRecoveryBlockSourceCounts: new Map<string, number>(),
    finalMarkerRecoveryBlockReasonCounts: new Map<string, number>(),
    selfImprovementSourceCounts: new Map<string, number>(),
    selfImprovementReasonCounts: new Map<string, number>(),
    selfImprovementActionCounts: new Map<string, number>(),
    commitWithoutPushSourceCounts: new Map<string, number>(),
    pushStatusCounts: new Map<string, number>(),
    reportSummaryCounts: new Map<string, number>(),
    reportBlockerStateCounts: new Map<string, number>(),
    reportBlockedWorkCounts: new Map<string, number>(),
    reportPivotedWorkCompletedCounts: new Map<string, number>(),
    reportNextStepCounts: new Map<string, number>(),
    reportMissingNextStepsDecisionCounts: new Map<string, number>(),
    reportQualityWarningCounts: new Map<string, number>(),
    ciRedSourceCounts: new Map<string, number>(),
    ciGateMissingSourceCounts: new Map<string, number>(),
    ciGateMissingReasonCounts: new Map<string, number>(),
    emptyProviderSourceCounts: new Map<string, number>(),
    emptyProviderReasonCounts: new Map<string, number>(),
    queuedIterationSourceCounts: new Map<string, number>(),
    queuedIterationReasonCounts: new Map<string, number>(),
    providerErrorSourceCounts: new Map<string, number>(),
    providerErrorCodeCounts: new Map<string, number>(),
    providerErrorCategoryCounts: new Map<string, number>(),
    compactionSourceCounts: new Map<string, number>(),
    prematureCompactionSourceCounts: new Map<string, number>(),
    compactionFailureReasonCounts: new Map<string, number>(),
    markerRecoveryKeys: new Set<string>(),
    markerRecoverySucceededKeys: new Set<string>(),
    markerRecoveryBlockedKeys: new Set<string>(),
    startedRunIds: new Set<string>(),
    terminalRunIds: new Set<string>(),
    sourceStartedRunIds: new Map<string, Set<string>>(),
    sourceTerminalRunIds: new Map<string, Set<string>>(),
    legacyStartsBySource: new Map<string, number>(),
    legacyFinishedBySource: new Map<string, number>(),
    legacyBlockedBySource: new Map<string, number>(),
    legacyLoopStarts: 0,
    legacyFinishedLoops: 0,
    legacyBlockedLoops: 0,
    legacyMarkerRecoveryBlocks: 0,
  };
}

function accumulateLoopLogText(content: string, accumulator: LoopLogAccumulator, sourceKey?: string) {
  const { analysis, since, oversizedTopicCounts, blockReasonCounts, blockedSourceCounts, blockerKindCounts, finishDecisionCounts, assistantDecisionCounts, promptSentCounts, sourcePromptSentCounts, sourceIterationResultCounts, postmortemCauseCounts, nextSafeActionCounts, finalMarkerRecoverySourceCounts, finalMarkerRecoveryReasonCounts, finalMarkerRecoveryBlockSourceCounts, finalMarkerRecoveryBlockReasonCounts, selfImprovementSourceCounts, selfImprovementReasonCounts, selfImprovementActionCounts, commitWithoutPushSourceCounts, pushStatusCounts, reportSummaryCounts, reportBlockerStateCounts, reportBlockedWorkCounts, reportPivotedWorkCompletedCounts, reportNextStepCounts, reportMissingNextStepsDecisionCounts, reportQualityWarningCounts, ciRedSourceCounts, ciGateMissingSourceCounts, ciGateMissingReasonCounts, emptyProviderSourceCounts, emptyProviderReasonCounts, queuedIterationSourceCounts, queuedIterationReasonCounts, providerErrorSourceCounts, providerErrorCodeCounts, providerErrorCategoryCounts, compactionSourceCounts, prematureCompactionSourceCounts, compactionFailureReasonCounts, markerRecoveryKeys, markerRecoverySucceededKeys, markerRecoveryBlockedKeys, startedRunIds, terminalRunIds, sourceStartedRunIds, sourceTerminalRunIds, legacyStartsBySource, legacyFinishedBySource, legacyBlockedBySource } = accumulator;
  const lines = content.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const record = parseLogRecord(line);
    if (!record) {
      analysis.invalidRecords++;
      continue;
    }
    if (since) {
      const timestampMs = recordTimestampMs(record);
      if (timestampMs === undefined || timestampMs < since.cutoffMs) {
        analysis.sinceFilteredRecords++;
        continue;
      }
    }
    analysis.records++;
    const event = recordEvent(record) || "";
    const runId = recordRunId(record);
    if (event === "iteration_result") {
      analysis.iterationResultRecords++;
      if (sourceKey) incrementCount(sourceIterationResultCounts, sourceKey);
      if (recordValidationEvidence(record).length === 0) analysis.iterationResultWithoutValidationRecords++;
    }
    if (event === "iteration_prompt_sent") {
      analysis.iterationPromptSentRecords++;
      if (sourceKey) incrementCount(sourcePromptSentCounts, sourceKey);
      incrementCount(promptSentCounts, promptSentGroupKey(record, sourceKey));
    }
    if (event === "assistant_decision") {
      analysis.assistantDecisionRecords++;
      const decision = recordDecision(record, event) || "<missing decision>";
      const count = incrementCount(assistantDecisionCounts, decision);
      if (count > analysis.topAssistantDecisionCount) {
        analysis.topAssistantDecision = decision;
        analysis.topAssistantDecisionCount = count;
      }
    }
    const recoveryKey = markerRecoveryKey(record, runId);
    if (event === "missing_final_marker_recovery_requested") {
      analysis.finalMarkerRecoveryRequests++;
      if (sourceKey) {
        const sourceCount = incrementCount(finalMarkerRecoverySourceCounts, sourceKey);
        if (sourceCount > analysis.topFinalMarkerRecoverySourceCount) {
          analysis.topFinalMarkerRecoverySource = sourceKey;
          analysis.topFinalMarkerRecoverySourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const reasonCount = incrementCount(finalMarkerRecoveryReasonCounts, reason);
      if (reasonCount > analysis.topFinalMarkerRecoveryReasonCount) {
        analysis.topFinalMarkerRecoveryReason = reason;
        analysis.topFinalMarkerRecoveryReasonCount = reasonCount;
      }
      if (recoveryKey) markerRecoveryKeys.add(recoveryKey);
    }
    if ((event === "iteration_result" || event === "loop_finished") && recoveryKey && markerRecoveryKeys.has(recoveryKey)) {
      markerRecoverySucceededKeys.add(recoveryKey);
    }
    if (event === "loop_started") {
      analysis.loopsStarted++;
      if (runId) {
        startedRunIds.add(runId);
        if (sourceKey) ensureSet(sourceStartedRunIds, sourceKey).add(runId);
      } else {
        accumulator.legacyLoopStarts++;
        if (sourceKey) incrementCount(legacyStartsBySource, sourceKey);
      }
    }
    if (event === "loop_finished") {
      analysis.finishedLoops++;
      if (recordValidationEvidence(record).length === 0) analysis.finishedWithoutValidationRecords++;
      if (!recordHasDeliveryEvidence(record)) analysis.finishedWithoutDeliveryRecords++;
      if (runId) {
        terminalRunIds.add(runId);
        if (sourceKey) ensureSet(sourceTerminalRunIds, sourceKey).add(runId);
      } else {
        accumulator.legacyFinishedLoops++;
        if (sourceKey) incrementCount(legacyFinishedBySource, sourceKey);
      }
      const decision = recordDecision(record, event) || "<missing decision>";
      const count = incrementCount(finishDecisionCounts, decision);
      if (count > analysis.topFinishDecisionCount) {
        analysis.topFinishDecision = decision;
        analysis.topFinishDecisionCount = count;
      }
    }
    if (isBlockedLoopRecord(event, record)) {
      analysis.blockedLoops++;
      if (runId) {
        terminalRunIds.add(runId);
        if (sourceKey) ensureSet(sourceTerminalRunIds, sourceKey).add(runId);
      } else {
        accumulator.legacyBlockedLoops++;
        if (sourceKey) incrementCount(legacyBlockedBySource, sourceKey);
      }
      const rawReason = recordReason(record, event);
      const reason = rawReason || "<missing reason>";
      if (recoveryKey && markerRecoveryKeys.has(recoveryKey)) {
        const isFirstRecoveryBlock = !markerRecoveryBlockedKeys.has(recoveryKey);
        markerRecoveryBlockedKeys.add(recoveryKey);
        if (isFirstRecoveryBlock) {
          if (sourceKey) {
            const sourceCount = incrementCount(finalMarkerRecoveryBlockSourceCounts, sourceKey);
            if (sourceCount > analysis.topFinalMarkerRecoveryBlockSourceCount) {
              analysis.topFinalMarkerRecoveryBlockSource = sourceKey;
              analysis.topFinalMarkerRecoveryBlockSourceCount = sourceCount;
            }
          }
          const recoveryBlockReasonCount = incrementCount(finalMarkerRecoveryBlockReasonCounts, reason);
          if (recoveryBlockReasonCount > analysis.topFinalMarkerRecoveryBlockReasonCount) {
            analysis.topFinalMarkerRecoveryBlockReason = reason;
            analysis.topFinalMarkerRecoveryBlockReasonCount = recoveryBlockReasonCount;
          }
        }
      } else if (!recoveryKey && isMissingFinalMarkerReason(rawReason)) {
        accumulator.legacyMarkerRecoveryBlocks++;
        if (sourceKey) {
          const sourceCount = incrementCount(finalMarkerRecoveryBlockSourceCounts, sourceKey);
          if (sourceCount > analysis.topFinalMarkerRecoveryBlockSourceCount) {
            analysis.topFinalMarkerRecoveryBlockSource = sourceKey;
            analysis.topFinalMarkerRecoveryBlockSourceCount = sourceCount;
          }
        }
        const recoveryBlockReasonCount = incrementCount(finalMarkerRecoveryBlockReasonCounts, reason);
        if (recoveryBlockReasonCount > analysis.topFinalMarkerRecoveryBlockReasonCount) {
          analysis.topFinalMarkerRecoveryBlockReason = reason;
          analysis.topFinalMarkerRecoveryBlockReasonCount = recoveryBlockReasonCount;
        }
      }
      const count = incrementCount(blockReasonCounts, reason);
      if (count > analysis.topBlockReasonCount) {
        analysis.topBlockReason = reason;
        analysis.topBlockReasonCount = count;
      }
      const blockerKind = recordBlockerKind(record);
      if (blockerKind) {
        analysis.blockerKindRecords++;
        const blockerKindCount = incrementCount(blockerKindCounts, blockerKind);
        if (blockerKindCount > analysis.topBlockerKindCount) {
          analysis.topBlockerKind = blockerKind;
          analysis.topBlockerKindCount = blockerKindCount;
        }
      }
      if (sourceKey) {
        const sourceCount = incrementCount(blockedSourceCounts, sourceKey);
        if (sourceCount > analysis.topBlockedSourceCount) {
          analysis.topBlockedSource = sourceKey;
          analysis.topBlockedSourceCount = sourceCount;
        }
      }
    }
    if (event === "loop_postmortem") {
      analysis.postmortems++;
      const likelyCause = stringOrUndefined(record.likelyCause) || "<missing likelyCause>";
      const causeCount = incrementCount(postmortemCauseCounts, likelyCause);
      if (causeCount > analysis.topPostmortemCauseCount) {
        analysis.topPostmortemCause = likelyCause;
        analysis.topPostmortemCauseCount = causeCount;
      }
      const nextSafeAction = stringOrUndefined(record.nextSafeAction);
      if (nextSafeAction) {
        const actionCount = incrementCount(nextSafeActionCounts, nextSafeAction);
        if (actionCount > analysis.topNextSafeActionCount) {
          analysis.topNextSafeAction = nextSafeAction;
          analysis.topNextSafeActionCount = actionCount;
        }
      }
    }
    if (event === "self_improvement_queued") {
      analysis.selfImprovementQueuedRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(selfImprovementSourceCounts, sourceKey);
        if (sourceCount > analysis.topSelfImprovementSourceCount) {
          analysis.topSelfImprovementSource = sourceKey;
          analysis.topSelfImprovementSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const reasonCount = incrementCount(selfImprovementReasonCounts, reason);
      if (reasonCount > analysis.topSelfImprovementReasonCount) {
        analysis.topSelfImprovementReason = reason;
        analysis.topSelfImprovementReasonCount = reasonCount;
      }
      const action = recordSelfImprovementAction(record);
      if (action) {
        const actionCount = incrementCount(selfImprovementActionCounts, action);
        if (actionCount > analysis.topSelfImprovementActionCount) {
          analysis.topSelfImprovementAction = action;
          analysis.topSelfImprovementActionCount = actionCount;
        }
      }
    }
    const hasChangedFiles = recordChangedFiles(record).length > 0;
    const hasValidationEvidence = recordValidationEvidence(record).length > 0;
    const hasCommitEvidence = Boolean(recordCommitHash(record));
    const reportSummary = recordReportSummary(record);
    const reportBlockerState = recordBlockerState(record);
    const reportBlockedWork = recordBlockedWork(record);
    const reportPivotedWorkCompleted = recordPivotedWorkCompleted(record);
    const reportNextSteps = recordReportNextSteps(record);
    const pushStatus = recordPushStatus(record);
    if (hasChangedFiles || hasValidationEvidence || hasCommitEvidence || reportSummary || reportBlockerState || reportBlockedWork || reportPivotedWorkCompleted || reportNextSteps.length > 0 || pushStatus) analysis.deliveryEvidenceRecords++;
    if (hasChangedFiles) analysis.changedFileEvidenceRecords++;
    if (hasValidationEvidence) analysis.validationEvidenceRecords++;
    if (hasCommitEvidence) analysis.commitEvidenceRecords++;
    if (reportSummary) {
      analysis.reportSummaryRecords++;
      const count = incrementCount(reportSummaryCounts, reportSummary);
      if (count > analysis.topReportSummaryCount) {
        analysis.topReportSummary = reportSummary;
        analysis.topReportSummaryCount = count;
      }
    }
    if (reportBlockerState) {
      analysis.reportBlockerStateRecords++;
      const count = incrementCount(reportBlockerStateCounts, reportBlockerState);
      if (count > analysis.topReportBlockerStateCount) {
        analysis.topReportBlockerState = reportBlockerState;
        analysis.topReportBlockerStateCount = count;
      }
    }
    if (reportBlockedWork) {
      analysis.reportBlockedWorkRecords++;
      const count = incrementCount(reportBlockedWorkCounts, reportBlockedWork);
      if (count > analysis.topReportBlockedWorkCount) {
        analysis.topReportBlockedWork = reportBlockedWork;
        analysis.topReportBlockedWorkCount = count;
      }
    }
    if (reportPivotedWorkCompleted) {
      analysis.reportPivotedWorkCompletedRecords++;
      const count = incrementCount(reportPivotedWorkCompletedCounts, reportPivotedWorkCompleted);
      if (count > analysis.topReportPivotedWorkCompletedCount) {
        analysis.topReportPivotedWorkCompleted = reportPivotedWorkCompleted;
        analysis.topReportPivotedWorkCompletedCount = count;
      }
    }
    for (const nextStep of reportNextSteps) {
      analysis.reportNextStepItems++;
      const count = incrementCount(reportNextStepCounts, nextStep);
      if (count > analysis.topReportNextStepCount) {
        analysis.topReportNextStep = nextStep;
        analysis.topReportNextStepCount = count;
      }
    }
    const missingNextStepsDecision = recordReportMissingNextStepsDecision(event, recordDecision(record, event), reportNextSteps);
    if (missingNextStepsDecision) {
      analysis.reportMissingNextStepsRecords++;
      const count = incrementCount(reportMissingNextStepsDecisionCounts, missingNextStepsDecision);
      if (count > analysis.topReportMissingNextStepsDecisionCount) {
        analysis.topReportMissingNextStepsDecision = missingNextStepsDecision;
        analysis.topReportMissingNextStepsDecisionCount = count;
      }
    }
    const reportQualityWarnings = recordReportQualityWarnings(event, record);
    if (reportQualityWarnings.length > 0) {
      analysis.reportQualityWarningRecords++;
      for (const reportQualityWarning of reportQualityWarnings) {
        const count = incrementCount(reportQualityWarningCounts, reportQualityWarning);
        if (count > analysis.topReportQualityWarningCount) {
          analysis.topReportQualityWarning = reportQualityWarning;
          analysis.topReportQualityWarningCount = count;
        }
      }
    }
    if (hasCommitEvidence && !pushStatus) {
      analysis.commitWithoutPushRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(commitWithoutPushSourceCounts, sourceKey);
        if (sourceCount > analysis.topCommitWithoutPushSourceCount) {
          analysis.topCommitWithoutPushSource = sourceKey;
          analysis.topCommitWithoutPushSourceCount = sourceCount;
        }
      }
    }
    if (pushStatus) {
      analysis.pushEvidenceRecords++;
      const count = incrementCount(pushStatusCounts, pushStatus);
      if (count > analysis.topPushStatusCount) {
        analysis.topPushStatus = pushStatus;
        analysis.topPushStatusCount = count;
      }
    }
    const ciGreen = recordCiGreen(record, event);
    if (ciGreen === true) analysis.ciGreenRecords++;
    if (ciGreen === false) {
      analysis.ciRedRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(ciRedSourceCounts, sourceKey);
        if (sourceCount > analysis.topCiRedSourceCount) {
          analysis.topCiRedSource = sourceKey;
          analysis.topCiRedSourceCount = sourceCount;
        }
      }
    }
    if (event === "ci_gate_missing") {
      analysis.ciGateMissingRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(ciGateMissingSourceCounts, sourceKey);
        if (sourceCount > analysis.topCiGateMissingSourceCount) {
          analysis.topCiGateMissingSource = sourceKey;
          analysis.topCiGateMissingSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const count = incrementCount(ciGateMissingReasonCounts, reason);
      if (count > analysis.topCiGateMissingReasonCount) {
        analysis.topCiGateMissingReason = reason;
        analysis.topCiGateMissingReasonCount = count;
      }
    }
    if (event === "empty_agent_response_waiting_for_compaction" || event === "empty_provider_response_retry_sent") {
      analysis.emptyProviderResponses++;
      if (sourceKey) {
        const sourceCount = incrementCount(emptyProviderSourceCounts, sourceKey);
        if (sourceCount > analysis.topEmptyProviderSourceCount) {
          analysis.topEmptyProviderSource = sourceKey;
          analysis.topEmptyProviderSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || "<missing reason>";
      const count = incrementCount(emptyProviderReasonCounts, reason);
      if (count > analysis.topEmptyProviderReasonCount) {
        analysis.topEmptyProviderReason = reason;
        analysis.topEmptyProviderReasonCount = count;
      }
    }
    if (event === "empty_provider_response_retry_sent") analysis.emptyProviderRetryRecords++;
    if (isQueuedIterationEvent(event)) {
      analysis.queuedIterationRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(queuedIterationSourceCounts, sourceKey);
        if (sourceCount > analysis.topQueuedIterationSourceCount) {
          analysis.topQueuedIterationSource = sourceKey;
          analysis.topQueuedIterationSourceCount = sourceCount;
        }
      }
      const reason = recordReason(record, event) || event;
      const count = incrementCount(queuedIterationReasonCounts, reason);
      if (count > analysis.topQueuedIterationReasonCount) {
        analysis.topQueuedIterationReason = reason;
        analysis.topQueuedIterationReasonCount = count;
      }
    }
    if (recordHasProviderError(record, event)) {
      analysis.providerErrorRecords++;
      if (sourceKey) {
        const sourceCount = incrementCount(providerErrorSourceCounts, sourceKey);
        if (sourceCount > analysis.topProviderErrorSourceCount) {
          analysis.topProviderErrorSource = sourceKey;
          analysis.topProviderErrorSourceCount = sourceCount;
        }
      }
      const code = recordProviderErrorCode(record) || "<missing code>";
      const count = incrementCount(providerErrorCodeCounts, code);
      if (count > analysis.topProviderErrorCodeCount) {
        analysis.topProviderErrorCode = code;
        analysis.topProviderErrorCodeCount = count;
      }
      const category = recordProviderErrorCategory(record, event, code);
      const categoryCount = incrementCount(providerErrorCategoryCounts, category);
      if (categoryCount > analysis.topProviderErrorCategoryCount) {
        analysis.topProviderErrorCategory = category;
        analysis.topProviderErrorCategoryCount = categoryCount;
      }
    }
    if (recordHasContextOverflowProviderError(record, event)) analysis.contextOverflowResponses++;
    if (event.startsWith("compaction_")) {
      analysis.compactionEvents++;
      if (sourceKey) {
        const sourceCount = incrementCount(compactionSourceCounts, sourceKey);
        if (sourceCount > analysis.topCompactionSourceCount) {
          analysis.topCompactionSource = sourceKey;
          analysis.topCompactionSourceCount = sourceCount;
        }
      }
      if (isPrematureCompactionRecord(record, event)) {
        analysis.prematureCompactionRecords++;
        if (sourceKey) {
          const sourceCount = incrementCount(prematureCompactionSourceCounts, sourceKey);
          if (sourceCount > analysis.topPrematureCompactionSourceCount) {
            analysis.topPrematureCompactionSource = sourceKey;
            analysis.topPrematureCompactionSourceCount = sourceCount;
          }
        }
      }
    }
    if (isCompactionResumeEvent(event)) analysis.compactionResumeRecords++;
    if (isCompactionFailureEvent(event)) {
      analysis.compactionFailureRecords++;
      const reason = recordReason(record, event) || "<missing reason>";
      const count = incrementCount(compactionFailureReasonCounts, reason);
      if (count > analysis.topCompactionFailureReasonCount) {
        analysis.topCompactionFailureReason = reason;
        analysis.topCompactionFailureReasonCount = count;
      }
    }
    if (event === "user_steering") {
      analysis.userSteeringRecords++;
      analysis.maxUserSteeringLength = Math.max(analysis.maxUserSteeringLength, recordUserSteeringLength(record));
    }
    if (record.topicKind === "provider-noise") analysis.providerNoiseTopicRecords++;
    if (record.topicSanitized === true) analysis.sanitizedTopicRecords++;
    if (record.topicTruncated === true) analysis.truncatedTopics++;
    const topicLength = recordTopicLength(record);
    if (topicLength > LOG_TOPIC_MAX) {
      analysis.oversizedTopicRecords++;
      const key = stringOrUndefined(record.topicHash) || (typeof record.topic === "string" ? record.topic : `<missing-topic:${topicLength}>`);
      const count = incrementCount(oversizedTopicCounts, key);
      analysis.mostRepeatedOversizedTopicRecords = Math.max(analysis.mostRepeatedOversizedTopicRecords, count);
    }
    analysis.maxTopicLength = Math.max(analysis.maxTopicLength, topicLength);
  }
}

function isQueuedIterationEvent(event: string): boolean {
  return event === "iteration_queued" || event === "iteration_prompt_queued" || event === "compaction_continue_queued_iteration" || event === "compaction_resume_queued";
}

function isCompactionResumeEvent(event: string): boolean {
  return event === "compaction_continue_queued_iteration" || event === "compaction_resume_queued" || event === "compaction_resume_sent";
}

function isCompactionFailureEvent(event: string): boolean {
  return event.startsWith("compaction_") && event.includes("failed");
}

function recordUserSteeringLength(record: Record<string, unknown>): number {
  const text = stringOrUndefined(record.reason) || stringOrUndefined(record.text) || stringOrUndefined(record.steering) || "";
  return singleLineText(text).length;
}

function promptSentGroupKey(record: Record<string, unknown>, sourceKey?: string): string {
  const source = sourceKey || stringOrUndefined(record.logPath) || "<unknown-log>";
  const runId = recordRunId(record) || "<missing-run>";
  const adapter = stringOrUndefined(record.adapterName) || stringOrUndefined(record.adapter) || "<missing-adapter>";
  const iteration = recordScalarKey(record.iteration);
  const maxIterations = recordScalarKey(record.maxIterations);
  const topic = stringOrUndefined(record.topicHash) || (typeof record.topic === "string" ? hashText(singleLineText(record.topic)) : "<missing-topic>");
  return [source, runId, adapter, iteration, maxIterations, topic].join("|");
}

function recordScalarKey(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.floor(value));
  if (typeof value === "string" && value.trim()) return value.trim();
  return "<missing>";
}

function hasPromptResultImbalance(analysis: LoopLogAnalysis): boolean {
  return analysis.iterationPromptSentRecords !== analysis.iterationResultRecords;
}

function promptResultImbalanceText(analysis: LoopLogAnalysis): string {
  return promptResultImbalanceDeltaText(analysis.iterationPromptSentRecords - analysis.iterationResultRecords);
}

function promptResultImbalanceDeltaText(delta: number): string {
  if (delta === 0) return "0";
  if (delta > 0) return `${delta} more ${delta === 1 ? "prompt" : "prompts"} than results`;
  const resultDelta = Math.abs(delta);
  return `${resultDelta} more ${resultDelta === 1 ? "result" : "results"} than prompts`;
}

function finalizeLoopLogAnalysis(accumulator: LoopLogAccumulator): LoopLogAnalysis {
  const analysis = accumulator.analysis;
  for (const count of accumulator.promptSentCounts.values()) {
    if (count > 1) {
      analysis.duplicatePromptSentGroups++;
      analysis.duplicatePromptSentExtraRecords += count - 1;
    }
  }
  const promptResultSources = new Set<string>([
    ...accumulator.sourcePromptSentCounts.keys(),
    ...accumulator.sourceIterationResultCounts.keys(),
  ]);
  for (const source of promptResultSources) {
    const delta = (accumulator.sourcePromptSentCounts.get(source) || 0) - (accumulator.sourceIterationResultCounts.get(source) || 0);
    if (delta !== 0 && Math.abs(delta) > Math.abs(analysis.topPromptResultImbalanceSourceDelta)) {
      analysis.topPromptResultImbalanceSource = source;
      analysis.topPromptResultImbalanceSourceDelta = delta;
    }
  }
  const unresolvedRunIds = [...accumulator.startedRunIds].filter((runId) => !accumulator.terminalRunIds.has(runId)).length;
  const unresolvedLegacyStarts = Math.max(0, accumulator.legacyLoopStarts - accumulator.legacyFinishedLoops - accumulator.legacyBlockedLoops);
  analysis.unresolvedLoopStarts = unresolvedRunIds + unresolvedLegacyStarts;
  for (const [source, started] of accumulator.sourceStartedRunIds.entries()) {
    const terminals = accumulator.sourceTerminalRunIds.get(source) || new Set<string>();
    updateTopUnresolvedSource(analysis, source, [...started].filter((runId) => !terminals.has(runId)).length);
  }
  for (const source of accumulator.legacyStartsBySource.keys()) {
    const unresolved = Math.max(0, (accumulator.legacyStartsBySource.get(source) || 0) - (accumulator.legacyFinishedBySource.get(source) || 0) - (accumulator.legacyBlockedBySource.get(source) || 0));
    updateTopUnresolvedSource(analysis, source, unresolved);
  }
  analysis.finalMarkerRecoverySuccesses = [...accumulator.markerRecoverySucceededKeys].filter((key) => !accumulator.markerRecoveryBlockedKeys.has(key)).length;
  analysis.finalMarkerRecoveryBlocks = accumulator.markerRecoveryBlockedKeys.size + accumulator.legacyMarkerRecoveryBlocks;
  analysis.recommendations = loopLogRecommendations(analysis);
  return analysis;
}

function unreadableLoopLogAnalysis(error: unknown): LoopLogAnalysis {
  return {
    ...emptyLoopLogAnalysis(),
    readError: error instanceof Error ? error.message : String(error),
    recommendations: ["Log unavailable: check the configured log path or run a loop first."],
  };
}

function invalidSinceLoopLogAnalysis(value: string): LoopLogAnalysis {
  return {
    ...emptyLoopLogAnalysis(),
    readError: `Invalid --since value "${value}". Use a duration like 2h, 30m, or an ISO timestamp.`,
    recommendations: ["Since filter unavailable: rerun analyze-logs with a duration such as --since=2h or an ISO timestamp."],
  };
}

function emptyLoopLogAnalysis(): LoopLogAnalysis {
  return {
    logFiles: 0,
    records: 0,
    invalidRecords: 0,
    sinceFilteredRecords: 0,
    loopsStarted: 0,
    finishedLoops: 0,
    finishedWithoutValidationRecords: 0,
    finishedWithoutDeliveryRecords: 0,
    iterationResultRecords: 0,
    iterationResultWithoutValidationRecords: 0,
    iterationPromptSentRecords: 0,
    topPromptResultImbalanceSourceDelta: 0,
    duplicatePromptSentGroups: 0,
    duplicatePromptSentExtraRecords: 0,
    assistantDecisionRecords: 0,
    topAssistantDecisionCount: 0,
    topFinishDecisionCount: 0,
    blockedLoops: 0,
    blockerKindRecords: 0,
    topBlockReasonCount: 0,
    topBlockedSourceCount: 0,
    topBlockerKindCount: 0,
    postmortems: 0,
    selfImprovementQueuedRecords: 0,
    topSelfImprovementSourceCount: 0,
    topSelfImprovementReasonCount: 0,
    topSelfImprovementActionCount: 0,
    topPostmortemCauseCount: 0,
    topNextSafeActionCount: 0,
    finalMarkerRecoveryRequests: 0,
    topFinalMarkerRecoverySourceCount: 0,
    topFinalMarkerRecoveryReasonCount: 0,
    finalMarkerRecoverySuccesses: 0,
    finalMarkerRecoveryBlocks: 0,
    topFinalMarkerRecoveryBlockSourceCount: 0,
    topFinalMarkerRecoveryBlockReasonCount: 0,
    deliveryEvidenceRecords: 0,
    changedFileEvidenceRecords: 0,
    validationEvidenceRecords: 0,
    commitEvidenceRecords: 0,
    reportSummaryRecords: 0,
    reportBlockerStateRecords: 0,
    reportBlockedWorkRecords: 0,
    reportPivotedWorkCompletedRecords: 0,
    reportNextStepItems: 0,
    reportMissingNextStepsRecords: 0,
    reportQualityWarningRecords: 0,
    topReportSummaryCount: 0,
    topReportBlockerStateCount: 0,
    topReportBlockedWorkCount: 0,
    topReportPivotedWorkCompletedCount: 0,
    topReportQualityWarningCount: 0,
    topReportMissingNextStepsDecisionCount: 0,
    topReportNextStepCount: 0,
    pushEvidenceRecords: 0,
    commitWithoutPushRecords: 0,
    topCommitWithoutPushSourceCount: 0,
    topPushStatusCount: 0,
    ciGreenRecords: 0,
    ciRedRecords: 0,
    topCiRedSourceCount: 0,
    ciGateMissingRecords: 0,
    topCiGateMissingSourceCount: 0,
    topCiGateMissingReasonCount: 0,
    unresolvedLoopStarts: 0,
    topUnresolvedSourceCount: 0,
    emptyProviderResponses: 0,
    emptyProviderRetryRecords: 0,
    topEmptyProviderSourceCount: 0,
    topEmptyProviderReasonCount: 0,
    queuedIterationRecords: 0,
    topQueuedIterationSourceCount: 0,
    topQueuedIterationReasonCount: 0,
    providerErrorRecords: 0,
    topProviderErrorSourceCount: 0,
    topProviderErrorCodeCount: 0,
    topProviderErrorCategoryCount: 0,
    contextOverflowResponses: 0,
    compactionEvents: 0,
    topCompactionSourceCount: 0,
    prematureCompactionRecords: 0,
    topPrematureCompactionSourceCount: 0,
    compactionResumeRecords: 0,
    compactionFailureRecords: 0,
    topCompactionFailureReasonCount: 0,
    userSteeringRecords: 0,
    maxUserSteeringLength: 0,
    providerNoiseTopicRecords: 0,
    sanitizedTopicRecords: 0,
    truncatedTopics: 0,
    oversizedTopicRecords: 0,
    mostRepeatedOversizedTopicRecords: 0,
    maxTopicLength: 0,
    recommendations: [],
  };
}

function discoverLoopLogFiles(dirPath: string): string[] {
  const logFiles: string[] = [];
  const skipDirs = new Set([".git", "node_modules"]);
  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(path.join(currentDir, entry.name));
        continue;
      }
      if (entry.isFile() && entry.name === "logs.jsonl") logFiles.push(path.join(currentDir, entry.name));
    }
  };
  walk(dirPath);
  return logFiles.sort();
}

function markerRecoveryKey(record: Record<string, unknown>, runId: string | undefined): string | undefined {
  if (!runId) return undefined;
  const iteration = typeof record.iteration === "number" && Number.isFinite(record.iteration) ? Math.floor(record.iteration) : "unknown";
  return `${runId}:${iteration}`;
}

function isMissingFinalMarkerReason(reason: string | undefined): boolean {
  return Boolean(reason && /missing(?:_|\s|-)*(?:final(?:_|\s|-)*)?(?:marker|DEV_GOAL_DECISION|assistant_decision)/i.test(reason));
}

function isBlockedLoopRecord(event: string, record: Record<string, unknown>): boolean {
  const decision = recordDecision(record, event)?.toLowerCase();
  const phase = stringOrUndefined(record.phase)?.toLowerCase();
  return event === "loop_blocked" || (event === "loop_finished" && (decision === "blocked" || phase === "blocked"));
}

function recordTopicLength(record: Record<string, unknown>): number {
  if (typeof record.topicLength === "number" && Number.isFinite(record.topicLength)) return record.topicLength;
  return typeof record.topic === "string" ? singleLineText(record.topic).length : 0;
}

function incrementCount(counts: Map<string, number>, key: string): number {
  const count = (counts.get(key) || 0) + 1;
  counts.set(key, count);
  return count;
}

function ensureSet(map: Map<string, Set<string>>, key: string): Set<string> {
  const existing = map.get(key);
  if (existing) return existing;
  const created = new Set<string>();
  map.set(key, created);
  return created;
}

function updateTopUnresolvedSource(analysis: LoopLogAnalysis, source: string, count: number) {
  if (count > analysis.topUnresolvedSourceCount) {
    analysis.topUnresolvedSource = source;
    analysis.topUnresolvedSourceCount = count;
  }
}

function loopLogRecommendations(analysis: LoopLogAnalysis): string[] {
  const recommendations: string[] = [];
  if (analysis.maxTopicLength > PROMPT_OBJECTIVE_MAX) recommendations.push("Oversized topics: cap prompt and log objective text before repeating it in every event.");
  if (analysis.mostRepeatedOversizedTopicRecords > 1) recommendations.push("Repeated oversized topics: summarize copied objectives once instead of carrying the same paste through every event.");
  if (analysis.emptyProviderResponses > 0) recommendations.push("Empty provider responses: inspect the top empty-provider source, retry the same iteration, and prefer compaction before blocking.");
  if (analysis.emptyProviderRetryRecords > 0) recommendations.push("Empty provider retries: track whether retries resolved, escalated to compaction, or blocked the loop.");
  if (analysis.queuedIterationRecords > 0) recommendations.push("Queued iterations: inspect the top queued source/reason and verify compaction/resume hooks flush queued prompts without leaving runs waiting silently.");
  if (analysis.providerErrorRecords > 0) recommendations.push("Provider errors: inspect the top provider error source and group codes/categories so context, rate-limit, auth, and transport failures drive different recovery paths.");
  if (hasPromptResultImbalance(analysis)) recommendations.push("Prompt/result lifecycle: inspect the top imbalance source and reconcile iteration_prompt_sent and iteration_result counts so duplicate sends or duplicate final parsing are visible.");
  if (analysis.duplicatePromptSentGroups > 0) recommendations.push("Duplicate prompt sends: investigate repeated iteration_prompt_sent groups before trusting prompt/result lifecycle counts.");
  if (analysis.contextOverflowResponses > 0) recommendations.push("Context overflow: preserve goal state and resume after compaction.");
  if (analysis.unresolvedLoopStarts > 0) recommendations.push("Unresolved loop starts: inspect the top unresolved log source to see whether loops are still active or missing terminal loop_finished/loop_blocked records.");
  if (analysis.compactionFailureRecords > 0) recommendations.push("Compaction failures: inspect failure reasons and verify the loop either resumes safely or remains queued for manual recovery.");
  if (analysis.prematureCompactionRecords > 0) recommendations.push("Premature compaction churn: reload stale Pi sessions or inspect compaction policy when compaction happens below current token and context-ratio thresholds.");
  if (analysis.topCompactionSource) recommendations.push("Compaction source: inspect the top compaction log source before treating aggregate compaction pressure as evenly distributed.");
  if (analysis.userSteeringRecords > 0) recommendations.push("User steering: review steering records to distinguish intentional scope changes from accidental plain-text turns.");
  if (analysis.providerNoiseTopicRecords > 0) recommendations.push("Provider-noise topics: verify provider error text is sanitized out of repeated objectives while topic hashes preserve diagnostics.");
  if (analysis.compactionEvents > analysis.loopsStarted && analysis.loopsStarted > 0) recommendations.push("Compaction-heavy runs: summarize continuation state and reduce repeated prompt text.");
  if (analysis.postmortems > 0) recommendations.push("Loop postmortems: use likelyCause and nextSafeAction to resume or file follow-up fixes.");
  if (analysis.selfImprovementQueuedRecords > 0) recommendations.push("Self-improvement follow-ups: review the top queued source/reason/action after blocked custom-goal runs and promote repeatable policy into this package.");
  if (analysis.assistantDecisionRecords > 0) recommendations.push("Assistant decisions: compare custom-goal decisions with iteration results so missing decision handshakes do not hide completed work.");
  if (analysis.finalMarkerRecoveryRequests > 0) recommendations.push("Final-marker recovery: compare the top recovery source/reason with successes and blocks to see whether marker-only retries are resolving missing final reports.");
  if (analysis.finalMarkerRecoveryBlocks > 0) recommendations.push("Final-marker recovery blocks: inspect the top block source/reason and prefer DEV_GOAL_REPORT plus final markers so useful work is not lost to malformed endings.");
  if (analysis.ciGateMissingRecords > 0) recommendations.push("CI gate missing records: inspect the top CI-gate missing source and require explicit DEV_GOAL_VALIDATED or CI_GREEN evidence before queuing follow-up work.");
  if (analysis.commitWithoutPushRecords > 0) recommendations.push("Commit-without-push records: inspect the top commit-without-push source and record pushStatus when push delivery is expected, or use an explicit skipped push status.");
  if (analysis.ciRedRecords > 0) recommendations.push("CI gate failures: inspect the top CI-red source and require local validation evidence before continue or done decisions.");
  if (analysis.iterationResultWithoutValidationRecords > 0) recommendations.push("Iteration results without validation evidence: require validationCommands on every continue/done iteration result before scheduling follow-up work.");
  if (analysis.finishedWithoutDeliveryRecords > 0) recommendations.push("Finished loops without delivery evidence: include changed files, validation, commit, and push evidence on terminal done records.");
  if (analysis.finishedWithoutValidationRecords > 0) recommendations.push("Finished loops without validation evidence: include validationCommands in terminal done records or link the final report to recorded validation evidence.");
  if (analysis.finishedLoops > 0 && analysis.validationEvidenceRecords === 0) recommendations.push("Missing validation evidence: record validationCommands or validation arrays on terminal delivery records.");
  if (analysis.blockedLoops > analysis.reportBlockerStateRecords) recommendations.push("Blocked reports without blocker state: include blockerState so log analysis can show the exact missing prerequisite or unsafe condition.");
  const blockerKindAction = blockerKindRecommendation(analysis.topBlockerKind);
  if (blockerKindAction) recommendations.push(blockerKindAction);
  if (analysis.reportMissingNextStepsRecords > 0) recommendations.push("Missing report next steps: include nextSteps for continue and blocked reports so queued follow-up work has a concrete next action.");
  if (analysis.reportQualityWarningRecords > 0) recommendations.push("Report quality warnings: include Blocked Work and Pivoted Work Completed, use absolute human-readable changed-file paths, replace vague DEV_GOAL_REPORT.changedFiles entries, and avoid vague summaries.");
  if (analysis.topBlockedSource) recommendations.push("Blocked log source: inspect the top blocked log source before treating aggregate blocker counts as evenly distributed.");
  if (analysis.blockedLoops > 0) recommendations.push("Blocked loops: inspect missing final markers and validation evidence.");
  if (analysis.invalidRecords > 0) recommendations.push("Invalid records: keep log writes JSONL-compatible for diagnostics.");
  return recommendations.length ? recommendations : ["No obvious loop health issues detected in this log."];
}

function writeLoopLogHtmlReport(analysis: LoopLogAnalysis, cwd: string, logPath: string): string {
  const tmpDir = process.env.TMPDIR || process.env.TEMP || "/tmp";
  fs.mkdirSync(tmpDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(tmpDir, `development-goal-health-${timestamp}.html`);
  fs.writeFileSync(reportPath, buildLoopLogHtmlReport(analysis, cwd, logPath), "utf8");
  return reportPath;
}

function buildLoopLogHtmlReport(analysis: LoopLogAnalysis, cwd: string, logPath: string): string {
  const source = analysis.logFiles > 1 ? `${relativeToCwd(cwd, logPath)} (${analysis.logFiles} log files)` : relativeToCwd(cwd, logPath);
  const metrics: Array<[string, string]> = [
    ...(analysis.sinceCutoffIso ? [["Since", analysis.sinceCutoffIso], ["Since-filtered records", String(analysis.sinceFilteredRecords)]] as Array<[string, string]> : []),
    ["Records", `${analysis.records}${analysis.invalidRecords ? ` (${analysis.invalidRecords} invalid)` : ""}`],
    ["Loops started", String(analysis.loopsStarted)],
    ["Finished loops", String(analysis.finishedLoops)],
    ["Finished-without-validation records", String(analysis.finishedWithoutValidationRecords)],
    ["Finished-without-delivery records", String(analysis.finishedWithoutDeliveryRecords)],
    ["Iteration result records", String(analysis.iterationResultRecords)],
    ["Iteration-result-without-validation records", String(analysis.iterationResultWithoutValidationRecords)],
    ["Iteration prompt sent records", String(analysis.iterationPromptSentRecords)],
    ["Prompt/result imbalance", promptResultImbalanceText(analysis)],
    ["Duplicate prompt-sent groups", String(analysis.duplicatePromptSentGroups)],
    ["Duplicate prompt-sent extra records", String(analysis.duplicatePromptSentExtraRecords)],
    ["Assistant decision records", String(analysis.assistantDecisionRecords)],
    ["Blocked loops", String(analysis.blockedLoops)],
    ["Blocker kind records", String(analysis.blockerKindRecords)],
    ["Postmortems", String(analysis.postmortems)],
    ["Self-improvement queued records", String(analysis.selfImprovementQueuedRecords)],
    ["Final-marker recovery requests", String(analysis.finalMarkerRecoveryRequests)],
    ["Final-marker recovery successes", String(analysis.finalMarkerRecoverySuccesses)],
    ["Final-marker recovery blocks", String(analysis.finalMarkerRecoveryBlocks)],
    ["Delivery evidence records", String(analysis.deliveryEvidenceRecords)],
    ["Validation evidence records", String(analysis.validationEvidenceRecords)],
    ["Commit evidence records", String(analysis.commitEvidenceRecords)],
    ["Report summary records", String(analysis.reportSummaryRecords)],
    ["Report blocker-state records", String(analysis.reportBlockerStateRecords)],
    ["Report blocked-work records", String(analysis.reportBlockedWorkRecords)],
    ["Report pivoted-work records", String(analysis.reportPivotedWorkCompletedRecords)],
    ["Report next-step items", String(analysis.reportNextStepItems)],
    ["Report missing-next-steps records", String(analysis.reportMissingNextStepsRecords)],
    ["Report quality warning records", String(analysis.reportQualityWarningRecords)],
    ["Push evidence records", String(analysis.pushEvidenceRecords)],
    ["Commit-without-push records", String(analysis.commitWithoutPushRecords)],
    ["CI-green records", String(analysis.ciGreenRecords)],
    ["CI-red records", String(analysis.ciRedRecords)],
    ["CI-gate missing records", String(analysis.ciGateMissingRecords)],
    ["Unresolved loop starts", String(analysis.unresolvedLoopStarts)],
    ["Empty provider responses", String(analysis.emptyProviderResponses)],
    ["Empty provider retry records", String(analysis.emptyProviderRetryRecords)],
    ["Queued iteration records", String(analysis.queuedIterationRecords)],
    ["Provider error records", String(analysis.providerErrorRecords)],
    ["Context overflow responses", String(analysis.contextOverflowResponses)],
    ["Compaction events", String(analysis.compactionEvents)],
    ["Premature compaction records", String(analysis.prematureCompactionRecords)],
    ["Compaction resume records", String(analysis.compactionResumeRecords)],
    ["Compaction failure records", String(analysis.compactionFailureRecords)],
    ["User steering records", String(analysis.userSteeringRecords)],
    ["Max user steering length", String(analysis.maxUserSteeringLength)],
    ["Provider-noise topic records", String(analysis.providerNoiseTopicRecords)],
    ["Sanitized topic records", String(analysis.sanitizedTopicRecords)],
    ["Oversized topic records", String(analysis.oversizedTopicRecords)],
    ["Max topic length", String(analysis.maxTopicLength)],
  ];
  const metricCards = metrics.map(([label, value]) => `<section class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></section>`).join("\n");
  const recommendations = analysis.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
  const topFacts = [
    analysis.topFinishDecision ? ["Top finish decision", `${analysis.topFinishDecision} (${analysis.topFinishDecisionCount})`] : undefined,
    analysis.topAssistantDecision ? ["Top assistant decision", `${analysis.topAssistantDecision} (${analysis.topAssistantDecisionCount})`] : undefined,
    analysis.topBlockReason ? ["Top block reason", `${analysis.topBlockReason} (${analysis.topBlockReasonCount})`] : undefined,
    analysis.topBlockedSource ? ["Top blocked log source", `${relativeToCwd(cwd, analysis.topBlockedSource)} (${analysis.topBlockedSourceCount})`] : undefined,
    analysis.topBlockerKind ? ["Top blocker kind", `${analysis.topBlockerKind} (${analysis.topBlockerKindCount})`] : undefined,
    analysis.topPromptResultImbalanceSource ? ["Top prompt/result imbalance source", `${relativeToCwd(cwd, analysis.topPromptResultImbalanceSource)} (${promptResultImbalanceDeltaText(analysis.topPromptResultImbalanceSourceDelta)})`] : undefined,
    analysis.topPostmortemCause ? ["Top postmortem cause", `${analysis.topPostmortemCause} (${analysis.topPostmortemCauseCount})`] : undefined,
    analysis.topNextSafeAction ? ["Top next safe action", `${analysis.topNextSafeAction} (${analysis.topNextSafeActionCount})`] : undefined,
    analysis.topFinalMarkerRecoverySource ? ["Top final-marker recovery log source", `${relativeToCwd(cwd, analysis.topFinalMarkerRecoverySource)} (${analysis.topFinalMarkerRecoverySourceCount})`] : undefined,
    analysis.topFinalMarkerRecoveryReason ? ["Top final-marker recovery reason", `${analysis.topFinalMarkerRecoveryReason} (${analysis.topFinalMarkerRecoveryReasonCount})`] : undefined,
    analysis.topFinalMarkerRecoveryBlockSource ? ["Top final-marker recovery block log source", `${relativeToCwd(cwd, analysis.topFinalMarkerRecoveryBlockSource)} (${analysis.topFinalMarkerRecoveryBlockSourceCount})`] : undefined,
    analysis.topFinalMarkerRecoveryBlockReason ? ["Top final-marker recovery block reason", `${analysis.topFinalMarkerRecoveryBlockReason} (${analysis.topFinalMarkerRecoveryBlockReasonCount})`] : undefined,
    analysis.topCommitWithoutPushSource ? ["Top commit-without-push log source", `${relativeToCwd(cwd, analysis.topCommitWithoutPushSource)} (${analysis.topCommitWithoutPushSourceCount})`] : undefined,
    analysis.topReportSummary ? ["Top report summary", `${analysis.topReportSummary} (${analysis.topReportSummaryCount})`] : undefined,
    analysis.topReportBlockerState ? ["Top report blocker state", `${analysis.topReportBlockerState} (${analysis.topReportBlockerStateCount})`] : undefined,
    analysis.topReportBlockedWork ? ["Top report blocked work", `${analysis.topReportBlockedWork} (${analysis.topReportBlockedWorkCount})`] : undefined,
    analysis.topReportPivotedWorkCompleted ? ["Top report pivoted work", `${analysis.topReportPivotedWorkCompleted} (${analysis.topReportPivotedWorkCompletedCount})`] : undefined,
    analysis.topReportNextStep ? ["Top report next step", `${analysis.topReportNextStep} (${analysis.topReportNextStepCount})`] : undefined,
    analysis.topReportMissingNextStepsDecision ? ["Top report missing-next-steps decision", `${analysis.topReportMissingNextStepsDecision} (${analysis.topReportMissingNextStepsDecisionCount})`] : undefined,
    analysis.topReportQualityWarning ? ["Top report quality warning", `${analysis.topReportQualityWarning} (${analysis.topReportQualityWarningCount})`] : undefined,
    analysis.topSelfImprovementSource ? ["Top self-improvement log source", `${relativeToCwd(cwd, analysis.topSelfImprovementSource)} (${analysis.topSelfImprovementSourceCount})`] : undefined,
    analysis.topSelfImprovementReason ? ["Top self-improvement reason", `${analysis.topSelfImprovementReason} (${analysis.topSelfImprovementReasonCount})`] : undefined,
    analysis.topSelfImprovementAction ? ["Top self-improvement action", `${analysis.topSelfImprovementAction} (${analysis.topSelfImprovementActionCount})`] : undefined,
    analysis.topCiRedSource ? ["Top CI-red log source", `${relativeToCwd(cwd, analysis.topCiRedSource)} (${analysis.topCiRedSourceCount})`] : undefined,
    analysis.topCiGateMissingSource ? ["Top CI-gate missing log source", `${relativeToCwd(cwd, analysis.topCiGateMissingSource)} (${analysis.topCiGateMissingSourceCount})`] : undefined,
    analysis.topCiGateMissingReason ? ["Top CI-gate missing reason", `${analysis.topCiGateMissingReason} (${analysis.topCiGateMissingReasonCount})`] : undefined,
    analysis.topUnresolvedSource ? ["Top unresolved log source", `${relativeToCwd(cwd, analysis.topUnresolvedSource)} (${analysis.topUnresolvedSourceCount})`] : undefined,
    analysis.topEmptyProviderSource ? ["Top empty provider log source", `${relativeToCwd(cwd, analysis.topEmptyProviderSource)} (${analysis.topEmptyProviderSourceCount})`] : undefined,
    analysis.topEmptyProviderReason ? ["Top empty provider reason", `${analysis.topEmptyProviderReason} (${analysis.topEmptyProviderReasonCount})`] : undefined,
    analysis.topQueuedIterationSource ? ["Top queued iteration log source", `${relativeToCwd(cwd, analysis.topQueuedIterationSource)} (${analysis.topQueuedIterationSourceCount})`] : undefined,
    analysis.topQueuedIterationReason ? ["Top queued iteration reason", `${analysis.topQueuedIterationReason} (${analysis.topQueuedIterationReasonCount})`] : undefined,
    analysis.topProviderErrorSource ? ["Top provider error log source", `${relativeToCwd(cwd, analysis.topProviderErrorSource)} (${analysis.topProviderErrorSourceCount})`] : undefined,
    analysis.topProviderErrorCode ? ["Top provider error code", `${analysis.topProviderErrorCode} (${analysis.topProviderErrorCodeCount})`] : undefined,
    analysis.topProviderErrorCategory ? ["Top provider error category", `${analysis.topProviderErrorCategory} (${analysis.topProviderErrorCategoryCount})`] : undefined,
    analysis.topCompactionSource ? ["Top compaction log source", `${relativeToCwd(cwd, analysis.topCompactionSource)} (${analysis.topCompactionSourceCount})`] : undefined,
    analysis.topPrematureCompactionSource ? ["Top premature compaction log source", `${relativeToCwd(cwd, analysis.topPrematureCompactionSource)} (${analysis.topPrematureCompactionSourceCount})`] : undefined,
    analysis.topCompactionFailureReason ? ["Top compaction failure reason", `${analysis.topCompactionFailureReason} (${analysis.topCompactionFailureReasonCount})`] : undefined,
    analysis.topPushStatus ? ["Top push status", `${analysis.topPushStatus} (${analysis.topPushStatusCount})`] : undefined,
  ].filter((fact): fact is [string, string] => Boolean(fact));
  const factRows = topFacts.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Development Goal Health Report</title>
<style>
:root { color-scheme: light dark; --bg: #0f172a; --panel: #111827; --text: #e5e7eb; --muted: #94a3b8; --accent: #38bdf8; --warn: #fb7185; --ok: #34d399; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
main { max-width: 1100px; margin: 0 auto; padding: 2rem; }
header { margin-bottom: 1.5rem; }
h1 { margin: 0 0 .5rem; font-size: clamp(2rem, 5vw, 3.5rem); }
.source { color: var(--muted); word-break: break-all; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; }
.card { border: 1px solid rgba(148,163,184,.25); border-radius: 1rem; background: rgba(17,24,39,.78); padding: 1rem; box-shadow: 0 12px 30px rgba(0,0,0,.22); }
.card span { display: block; color: var(--muted); font-size: .85rem; }
.card strong { display: block; margin-top: .4rem; font-size: 1.6rem; color: var(--accent); }
.panel { margin-top: 1.5rem; border-radius: 1rem; background: rgba(17,24,39,.78); padding: 1.25rem; border: 1px solid rgba(148,163,184,.25); }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: .65rem; border-bottom: 1px solid rgba(148,163,184,.18); }
th { color: var(--muted); width: 16rem; }
li { margin: .45rem 0; }
.badge { display: inline-block; border-radius: 999px; padding: .25rem .65rem; background: rgba(56,189,248,.15); color: var(--accent); }
</style>
</head>
<body>
<main>
<header>
<p class="badge">Loop health</p>
<h1>Development Goal Health Report</h1>
<p class="source">Source: ${escapeHtml(source)}</p>
</header>
<section class="grid">${metricCards}</section>
<section class="panel">
<h2>Top signals</h2>
${factRows ? `<table>${factRows}</table>` : `<p>No top signal counts were present.</p>`}
</section>
<section class="panel">
<h2>Recommendations</h2>
<ul>${recommendations}</ul>
</section>
</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] || char));
}

function formatLoopLogAnalysisJson(analysis: LoopLogAnalysis, cwd: string, logPath: string, htmlPath?: string): string {
  return JSON.stringify({
    source: relativeToCwd(cwd, logPath),
    ...(htmlPath ? { htmlPath } : {}),
    ...analysis,
  }, null, 2);
}

function formatLoopLogOverview(analysis: LoopLogAnalysis, cwd: string): string[] {
  const issues = topLoopLogIssues(analysis, cwd);
  const health = analysis.readError ? "unavailable" : issues.length ? "attention needed" : "healthy";
  return [
    `Health: ${health}`,
    `Outcome: ${analysis.loopsStarted} started · ${analysis.finishedLoops} finished · ${analysis.blockedLoops} blocked · ${analysis.unresolvedLoopStarts} unresolved`,
    `Lifecycle: ${analysis.iterationPromptSentRecords} prompts · ${analysis.iterationResultRecords} results · ${promptResultImbalanceText(analysis)}`,
    `Evidence: ${analysis.deliveryEvidenceRecords} delivery · ${analysis.validationEvidenceRecords} validation · ${analysis.changedFileEvidenceRecords} changed-file`,
    `Most useful next action: ${mostUsefulLoopLogAction(analysis)}`,
    "Top issues:",
    ...(issues.length ? issues.map((issue) => `- ${issue}`) : ["- none"]),
  ];
}

function mostUsefulLoopLogAction(analysis: LoopLogAnalysis): string {
  if (analysis.topNextSafeAction) return analysis.topNextSafeAction;
  if (analysis.recommendations[0]) return analysis.recommendations[0];
  return "No immediate action; continue monitoring the next goal run.";
}

function topLoopLogIssues(analysis: LoopLogAnalysis, cwd: string): string[] {
  const issues: string[] = [];
  if (analysis.blockedLoops > 0) {
    issues.push(compactLoopLogIssue([
      `Blocked loops: ${analysis.blockedLoops}`,
      analysis.topBlockerKind ? `kind ${analysis.topBlockerKind}` : undefined,
      analysis.topBlockReason ? `reason ${analysis.topBlockReason}` : undefined,
      analysis.topBlockedSource ? `source ${relativeToCwd(cwd, analysis.topBlockedSource)}` : undefined,
    ]));
  }
  if (analysis.unresolvedLoopStarts > 0) issues.push(compactLoopLogIssue([`Unresolved starts: ${analysis.unresolvedLoopStarts}`, analysis.topUnresolvedSource ? `source ${relativeToCwd(cwd, analysis.topUnresolvedSource)}` : undefined]));
  if (hasPromptResultImbalance(analysis)) issues.push(compactLoopLogIssue([`Prompt/result imbalance: ${promptResultImbalanceText(analysis)}`, analysis.topPromptResultImbalanceSource ? `source ${relativeToCwd(cwd, analysis.topPromptResultImbalanceSource)}` : undefined]));
  if (analysis.providerErrorRecords > 0) issues.push(compactLoopLogIssue([`Provider errors: ${analysis.providerErrorRecords}`, analysis.topProviderErrorCategory ? `category ${analysis.topProviderErrorCategory}` : undefined, analysis.topProviderErrorCode ? `code ${analysis.topProviderErrorCode}` : undefined]));
  if (analysis.emptyProviderResponses > 0) issues.push(`Empty provider responses: ${analysis.emptyProviderResponses}`);
  if (analysis.compactionFailureRecords > 0) issues.push(compactLoopLogIssue([`Compaction failures: ${analysis.compactionFailureRecords}`, analysis.topCompactionFailureReason ? `reason ${analysis.topCompactionFailureReason}` : undefined]));
  if (analysis.reportQualityWarningRecords > 0) issues.push(compactLoopLogIssue([`Report quality warnings: ${analysis.reportQualityWarningRecords}`, analysis.topReportQualityWarning ? `top ${analysis.topReportQualityWarning}` : undefined]));
  if (analysis.iterationResultWithoutValidationRecords > 0) issues.push(`Iteration results without validation: ${analysis.iterationResultWithoutValidationRecords}`);
  if (analysis.finishedWithoutValidationRecords > 0) issues.push(`Finished without validation: ${analysis.finishedWithoutValidationRecords}`);
  if (analysis.finishedWithoutDeliveryRecords > 0) issues.push(`Finished without delivery evidence: ${analysis.finishedWithoutDeliveryRecords}`);
  if (analysis.commitWithoutPushRecords > 0) issues.push(`Commit without push status: ${analysis.commitWithoutPushRecords}`);
  if (analysis.ciRedRecords > 0) issues.push(`CI red records: ${analysis.ciRedRecords}`);
  if (analysis.ciGateMissingRecords > 0) issues.push(`CI gate missing: ${analysis.ciGateMissingRecords}`);
  if (analysis.oversizedTopicRecords > 0) issues.push(`Oversized topics: ${analysis.oversizedTopicRecords}${analysis.mostRepeatedOversizedTopicRecords > 1 ? ` · repeated ${analysis.mostRepeatedOversizedTopicRecords} times` : ""}`);
  return issues.slice(0, 8);
}

function compactLoopLogIssue(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

function formatLoopLogAnalysis(analysis: LoopLogAnalysis, cwd: string, logPath: string): string {
  const source = relativeToCwd(cwd, logPath);
  const sourceLabel = analysis.logFiles > 1 ? `${source} (${analysis.logFiles} log files)` : source;
  return [
    `Development goal log analysis: ${sourceLabel}`,
    ...formatLoopLogOverview(analysis, cwd),
    analysis.readError ? `Error: ${analysis.readError}` : undefined,
    analysis.sinceCutoffIso ? `Since: ${analysis.sinceCutoffIso}` : undefined,
    analysis.sinceFilterLabel && analysis.sinceFilterLabel !== analysis.sinceCutoffIso ? `Since window: ${analysis.sinceFilterLabel}` : undefined,
    analysis.sinceCutoffIso ? `Since-filtered records: ${analysis.sinceFilteredRecords}` : undefined,
    "Detailed counters:",
    `Records: ${analysis.records}${analysis.invalidRecords ? ` (${analysis.invalidRecords} invalid)` : ""}`,
    `Loops started: ${analysis.loopsStarted}`,
    `Finished loops: ${analysis.finishedLoops}`,
    `Finished-without-validation records: ${analysis.finishedWithoutValidationRecords}`,
    `Finished-without-delivery records: ${analysis.finishedWithoutDeliveryRecords}`,
    `Iteration result records: ${analysis.iterationResultRecords}`,
    `Iteration-result-without-validation records: ${analysis.iterationResultWithoutValidationRecords}`,
    `Iteration prompt sent records: ${analysis.iterationPromptSentRecords}`,
    `Prompt/result imbalance: ${promptResultImbalanceText(analysis)}`,
    analysis.topPromptResultImbalanceSource ? `Top prompt/result imbalance source: ${relativeToCwd(cwd, analysis.topPromptResultImbalanceSource)} (${promptResultImbalanceDeltaText(analysis.topPromptResultImbalanceSourceDelta)})` : undefined,
    `Duplicate prompt-sent groups: ${analysis.duplicatePromptSentGroups}`,
    `Duplicate prompt-sent extra records: ${analysis.duplicatePromptSentExtraRecords}`,
    `Assistant decision records: ${analysis.assistantDecisionRecords}`,
    analysis.topAssistantDecision ? `Top assistant decision: ${analysis.topAssistantDecision} (${analysis.topAssistantDecisionCount} ${analysis.topAssistantDecisionCount === 1 ? "record" : "records"})` : undefined,
    analysis.topFinishDecision ? `Top finish decision: ${analysis.topFinishDecision} (${analysis.topFinishDecisionCount} ${analysis.topFinishDecisionCount === 1 ? "record" : "records"})` : undefined,
    `Blocked loops: ${analysis.blockedLoops}`,
    `Blocker kind records: ${analysis.blockerKindRecords}`,
    analysis.topBlockReason ? `Top block reason: ${analysis.topBlockReason} (${analysis.topBlockReasonCount} ${analysis.topBlockReasonCount === 1 ? "record" : "records"})` : undefined,
    analysis.topBlockedSource ? `Top blocked log source: ${relativeToCwd(cwd, analysis.topBlockedSource)} (${analysis.topBlockedSourceCount} ${analysis.topBlockedSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topBlockerKind ? `Top blocker kind: ${analysis.topBlockerKind} (${analysis.topBlockerKindCount} ${analysis.topBlockerKindCount === 1 ? "record" : "records"})` : undefined,
    `Postmortems: ${analysis.postmortems}`,
    `Self-improvement queued records: ${analysis.selfImprovementQueuedRecords}`,
    analysis.topSelfImprovementSource ? `Top self-improvement log source: ${relativeToCwd(cwd, analysis.topSelfImprovementSource)} (${analysis.topSelfImprovementSourceCount} ${analysis.topSelfImprovementSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topSelfImprovementReason ? `Top self-improvement reason: ${analysis.topSelfImprovementReason} (${analysis.topSelfImprovementReasonCount} ${analysis.topSelfImprovementReasonCount === 1 ? "record" : "records"})` : undefined,
    analysis.topSelfImprovementAction ? `Top self-improvement action: ${analysis.topSelfImprovementAction} (${analysis.topSelfImprovementActionCount} ${analysis.topSelfImprovementActionCount === 1 ? "record" : "records"})` : undefined,
    analysis.topPostmortemCause ? `Top postmortem cause: ${analysis.topPostmortemCause} (${analysis.topPostmortemCauseCount} ${analysis.topPostmortemCauseCount === 1 ? "record" : "records"})` : undefined,
    analysis.topNextSafeAction ? `Top next safe action: ${analysis.topNextSafeAction} (${analysis.topNextSafeActionCount} ${analysis.topNextSafeActionCount === 1 ? "record" : "records"})` : undefined,
    `Final-marker recovery requests: ${analysis.finalMarkerRecoveryRequests}`,
    analysis.topFinalMarkerRecoverySource ? `Top final-marker recovery log source: ${relativeToCwd(cwd, analysis.topFinalMarkerRecoverySource)} (${analysis.topFinalMarkerRecoverySourceCount} ${analysis.topFinalMarkerRecoverySourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topFinalMarkerRecoveryReason ? `Top final-marker recovery reason: ${analysis.topFinalMarkerRecoveryReason} (${analysis.topFinalMarkerRecoveryReasonCount} ${analysis.topFinalMarkerRecoveryReasonCount === 1 ? "record" : "records"})` : undefined,
    `Final-marker recovery successes: ${analysis.finalMarkerRecoverySuccesses}`,
    `Final-marker recovery blocks: ${analysis.finalMarkerRecoveryBlocks}`,
    analysis.topFinalMarkerRecoveryBlockSource ? `Top final-marker recovery block log source: ${relativeToCwd(cwd, analysis.topFinalMarkerRecoveryBlockSource)} (${analysis.topFinalMarkerRecoveryBlockSourceCount} ${analysis.topFinalMarkerRecoveryBlockSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topFinalMarkerRecoveryBlockReason ? `Top final-marker recovery block reason: ${analysis.topFinalMarkerRecoveryBlockReason} (${analysis.topFinalMarkerRecoveryBlockReasonCount} ${analysis.topFinalMarkerRecoveryBlockReasonCount === 1 ? "record" : "records"})` : undefined,
    `Delivery evidence records: ${analysis.deliveryEvidenceRecords}`,
    `Changed-file evidence records: ${analysis.changedFileEvidenceRecords}`,
    `Validation evidence records: ${analysis.validationEvidenceRecords}`,
    `Commit evidence records: ${analysis.commitEvidenceRecords}`,
    `Push evidence records: ${analysis.pushEvidenceRecords}`,
    `Report summary records: ${analysis.reportSummaryRecords}`,
    `Report blocker-state records: ${analysis.reportBlockerStateRecords}`,
    `Report blocked-work records: ${analysis.reportBlockedWorkRecords}`,
    `Report pivoted-work records: ${analysis.reportPivotedWorkCompletedRecords}`,
    `Report next-step items: ${analysis.reportNextStepItems}`,
    `Report missing-next-steps records: ${analysis.reportMissingNextStepsRecords}`,
    `Report quality warning records: ${analysis.reportQualityWarningRecords}`,
    analysis.topReportSummary ? `Top report summary: ${analysis.topReportSummary} (${analysis.topReportSummaryCount} ${analysis.topReportSummaryCount === 1 ? "record" : "records"})` : undefined,
    analysis.topReportBlockerState ? `Top report blocker state: ${analysis.topReportBlockerState} (${analysis.topReportBlockerStateCount} ${analysis.topReportBlockerStateCount === 1 ? "record" : "records"})` : undefined,
    analysis.topReportBlockedWork ? `Top report blocked work: ${analysis.topReportBlockedWork} (${analysis.topReportBlockedWorkCount} ${analysis.topReportBlockedWorkCount === 1 ? "record" : "records"})` : undefined,
    analysis.topReportPivotedWorkCompleted ? `Top report pivoted work: ${analysis.topReportPivotedWorkCompleted} (${analysis.topReportPivotedWorkCompletedCount} ${analysis.topReportPivotedWorkCompletedCount === 1 ? "record" : "records"})` : undefined,
    analysis.topReportNextStep ? `Top report next step: ${analysis.topReportNextStep} (${analysis.topReportNextStepCount} ${analysis.topReportNextStepCount === 1 ? "record" : "records"})` : undefined,
    analysis.topReportMissingNextStepsDecision ? `Top report missing-next-steps decision: ${analysis.topReportMissingNextStepsDecision} (${analysis.topReportMissingNextStepsDecisionCount} ${analysis.topReportMissingNextStepsDecisionCount === 1 ? "record" : "records"})` : undefined,
    analysis.topReportQualityWarning ? `Top report quality warning: ${analysis.topReportQualityWarning} (${analysis.topReportQualityWarningCount} ${analysis.topReportQualityWarningCount === 1 ? "record" : "records"})` : undefined,
    `Commit-without-push records: ${analysis.commitWithoutPushRecords}`,
    analysis.topCommitWithoutPushSource ? `Top commit-without-push log source: ${relativeToCwd(cwd, analysis.topCommitWithoutPushSource)} (${analysis.topCommitWithoutPushSourceCount} ${analysis.topCommitWithoutPushSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topPushStatus ? `Top push status: ${analysis.topPushStatus} (${analysis.topPushStatusCount} ${analysis.topPushStatusCount === 1 ? "record" : "records"})` : undefined,
    `CI-green records: ${analysis.ciGreenRecords}`,
    `CI-red records: ${analysis.ciRedRecords}`,
    analysis.topCiRedSource ? `Top CI-red log source: ${relativeToCwd(cwd, analysis.topCiRedSource)} (${analysis.topCiRedSourceCount} ${analysis.topCiRedSourceCount === 1 ? "record" : "records"})` : undefined,
    `CI-gate missing records: ${analysis.ciGateMissingRecords}`,
    analysis.topCiGateMissingSource ? `Top CI-gate missing log source: ${relativeToCwd(cwd, analysis.topCiGateMissingSource)} (${analysis.topCiGateMissingSourceCount} ${analysis.topCiGateMissingSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topCiGateMissingReason ? `Top CI-gate missing reason: ${analysis.topCiGateMissingReason} (${analysis.topCiGateMissingReasonCount} ${analysis.topCiGateMissingReasonCount === 1 ? "record" : "records"})` : undefined,
    `Unresolved loop starts: ${analysis.unresolvedLoopStarts}`,
    analysis.topUnresolvedSource ? `Top unresolved log source: ${relativeToCwd(cwd, analysis.topUnresolvedSource)} (${analysis.topUnresolvedSourceCount} ${analysis.topUnresolvedSourceCount === 1 ? "record" : "records"})` : undefined,
    `Empty provider responses: ${analysis.emptyProviderResponses}`,
    `Empty provider retry records: ${analysis.emptyProviderRetryRecords}`,
    analysis.topEmptyProviderSource ? `Top empty provider log source: ${relativeToCwd(cwd, analysis.topEmptyProviderSource)} (${analysis.topEmptyProviderSourceCount} ${analysis.topEmptyProviderSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topEmptyProviderReason ? `Top empty provider reason: ${analysis.topEmptyProviderReason} (${analysis.topEmptyProviderReasonCount} ${analysis.topEmptyProviderReasonCount === 1 ? "record" : "records"})` : undefined,
    `Queued iteration records: ${analysis.queuedIterationRecords}`,
    analysis.topQueuedIterationSource ? `Top queued iteration log source: ${relativeToCwd(cwd, analysis.topQueuedIterationSource)} (${analysis.topQueuedIterationSourceCount} ${analysis.topQueuedIterationSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topQueuedIterationReason ? `Top queued iteration reason: ${analysis.topQueuedIterationReason} (${analysis.topQueuedIterationReasonCount} ${analysis.topQueuedIterationReasonCount === 1 ? "record" : "records"})` : undefined,
    `Provider error records: ${analysis.providerErrorRecords}`,
    analysis.topProviderErrorSource ? `Top provider error log source: ${relativeToCwd(cwd, analysis.topProviderErrorSource)} (${analysis.topProviderErrorSourceCount} ${analysis.topProviderErrorSourceCount === 1 ? "record" : "records"})` : undefined,
    analysis.topProviderErrorCode ? `Top provider error code: ${analysis.topProviderErrorCode} (${analysis.topProviderErrorCodeCount} ${analysis.topProviderErrorCodeCount === 1 ? "record" : "records"})` : undefined,
    analysis.topProviderErrorCategory ? `Top provider error category: ${analysis.topProviderErrorCategory} (${analysis.topProviderErrorCategoryCount} ${analysis.topProviderErrorCategoryCount === 1 ? "record" : "records"})` : undefined,
    `Context overflow responses: ${analysis.contextOverflowResponses}`,
    `Compaction events: ${analysis.compactionEvents}`,
    analysis.topCompactionSource ? `Top compaction log source: ${relativeToCwd(cwd, analysis.topCompactionSource)} (${analysis.topCompactionSourceCount} ${analysis.topCompactionSourceCount === 1 ? "record" : "records"})` : undefined,
    `Premature compaction records: ${analysis.prematureCompactionRecords}`,
    analysis.topPrematureCompactionSource ? `Top premature compaction log source: ${relativeToCwd(cwd, analysis.topPrematureCompactionSource)} (${analysis.topPrematureCompactionSourceCount} ${analysis.topPrematureCompactionSourceCount === 1 ? "record" : "records"})` : undefined,
    `Compaction resume records: ${analysis.compactionResumeRecords}`,
    `Compaction failure records: ${analysis.compactionFailureRecords}`,
    analysis.topCompactionFailureReason ? `Top compaction failure reason: ${analysis.topCompactionFailureReason} (${analysis.topCompactionFailureReasonCount} ${analysis.topCompactionFailureReasonCount === 1 ? "record" : "records"})` : undefined,
    `User steering records: ${analysis.userSteeringRecords}`,
    `Max user steering length: ${analysis.maxUserSteeringLength}`,
    `Provider-noise topic records: ${analysis.providerNoiseTopicRecords}`,
    `Sanitized topic records: ${analysis.sanitizedTopicRecords}`,
    `Truncated topics: ${analysis.truncatedTopics}`,
    `Oversized topic records: ${analysis.oversizedTopicRecords}`,
    `Most repeated oversized topic: ${analysis.mostRepeatedOversizedTopicRecords} records`,
    `Max topic length: ${analysis.maxTopicLength}`,
    "Recommendations:",
    ...analysis.recommendations.map((item) => `- ${item}`),
  ].filter((line): line is string => Boolean(line)).join("\n");
}


function recordSelfImprovementAction(record: Record<string, unknown>): string | undefined {
  return stringOrUndefined(record.nextAction)
    || stringOrUndefined(record.next_action)
    || stringOrUndefined(record.nextSafeAction)
    || stringOrUndefined(record.action);
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) {
    ctx.ui.notify(message, level);
  } else {
    console.log(message);
  }
}
