import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveCommitPush } from "./config.ts";
import type { ParsedCommand } from "./command.ts";
import { absoluteLogPath, contextCwd, relativeToCwd } from "./files.ts";
import { clampIterations } from "./init-config.ts";
import {
  buildCompactionResumePrompt,
  buildDevelopmentGoalCompactionInstructions,
  buildEmptyResponseRetryPrompt,
  buildIterationPrompt,
  buildMissingMarkerRecoveryPrompt,
  buildReportRepairPrompt,
  buildTransportErrorRetryPrompt,
} from "./prompts.ts";
import { contextUsageReason, shouldCompactBeforeNextIteration } from "./compaction.ts";
import type { LoopLogRecord } from "./logger.ts";
import type { FinalReport } from "./report-parser.ts";
import { autoContinueLimitFromEnv, shouldPauseForAutoContinueLimit } from "./runaway.ts";
import { createRunId } from "./runtime.ts";
import { statusLine } from "./status.ts";
import {
  CUSTOM_STATE_TYPE,
  DEFAULT_ITERATIONS,
  hasIterationCap,
  iterationProgress,
  type LoopState,
} from "./state.ts";
import { resolveDevelopmentGoalSettings, type ResolvedDevelopmentGoalSettings } from "./defaults.ts";
import {
  deferFirstPromptState,
  queueNextIterationState,
  startGoalRun,
  transitionAutoContinueLimited,
  transitionCompactionResumeQueued,
  transitionCompactionResumeSent,
  transitionLastReason,
  transitionMissingMarkerRecoveryRequested,
  transitionPaused,
  transitionPreparingForCompaction,
  transitionPromptNowRunning,
  transitionPromptSent,
  transitionReportRepairRequested,
  transitionResumed,
  transitionRetryCounterRestored,
  transitionRetryingAfterEmptyProviderResponse,
  transitionRetryingAfterProviderTransport,
  transitionStoppedByUser,
} from "./goal-run-transitions.ts";

const AUTO_CONTINUATION_RETRY_MS = 50;
const AUTO_CONTINUATION_MAX_ATTEMPTS = 20;
const EMPTY_RESPONSE_RETRY_MS = 50;
const EMPTY_RESPONSE_MAX_RETRIES = 2;

export type UiLikeContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    notify?: (message: string, level?: string) => void;
    confirm?: (title: string, message: string, options?: unknown) => Promise<boolean> | boolean;
  };
  sessionManager?: { getCwd?: () => string };
  isIdle?: () => boolean;
  getContextUsage?: () => { tokens?: number; contextWindow?: number; maxTokens?: number } | undefined;
  compact?: (options?: {
    customInstructions?: string;
    onComplete?: (result?: unknown) => void;
    onError?: (error: Error) => void;
  }) => void;
};

export type GoalRunControllerDeps = {
  getState: () => LoopState;
  setState: (state: LoopState) => void;
  appendLoopLog: (event: string, extra?: Partial<LoopLogRecord>) => void;
  refreshUi: (ctx: UiLikeContext) => void;
  notify: (ctx: UiLikeContext, message: string, level?: "info" | "warning" | "error") => void;
};

export function resumePendingRetryAfterSessionRestore(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const state = deps.getState();
  if (state.active && state.phase === "running" && state.lastReason === "empty_agent_response_waiting_for_compaction") {
    const retryNumber = Math.max(1, state.emptyResponseRetries ?? 0);
    if (retryNumber <= EMPTY_RESPONSE_MAX_RETRIES) {
      const restoredState = transitionRetryCounterRestored(state, retryNumber);
      deps.setState(restoredState);
      pi.appendEntry(CUSTOM_STATE_TYPE, restoredState);
      scheduleEmptyResponseRetry(pi, ctx, deps, restoredState.iteration, retryNumber);
    }
  }
  const currentState = deps.getState();
  if (currentState.active && currentState.phase === "running" && currentState.lastReason === "provider_transport_error_waiting_for_retry") {
    const retryNumber = Math.max(1, currentState.emptyResponseRetries ?? 0);
    if (retryNumber <= EMPTY_RESPONSE_MAX_RETRIES) {
      const restoredState = transitionRetryCounterRestored(currentState, retryNumber);
      deps.setState(restoredState);
      pi.appendEntry(CUSTOM_STATE_TYPE, restoredState);
      scheduleTransportErrorRetry(pi, ctx, deps, restoredState.iteration, retryNumber);
    }
  }
}

export function pauseLoop(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const state = deps.getState();
  if (!state.active) {
    deps.notify(ctx, "No active development goal to pause.");
    return;
  }
  if (state.phase === "paused") {
    deps.notify(ctx, "Development goal already paused.");
    return;
  }
  const nextState = transitionPaused(state, "paused_by_user");
  deps.setState(nextState);
  deps.appendLoopLog("loop_paused", { reason: "paused_by_user" });
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, "Development goal paused. Use /development-goal resume to continue.");
}

export function stopLoop(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const nextState = transitionStoppedByUser(deps.getState());
  deps.setState(nextState);
  deps.appendLoopLog("loop_stopped", { reason: "stopped_by_user" });
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, "Development goal stopped.");
}

export function resumeLoop(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const state = deps.getState();
  if (!state.active || state.phase !== "paused") {
    deps.notify(ctx, "No paused development goal to resume.");
    return;
  }
  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  const nextState = transitionResumed(state);
  deps.setState(nextState);
  deps.appendLoopLog("loop_resumed", { reason: "resumed_by_user" });
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, `Resuming development goal iteration ${iterationProgress(nextState)}.`);
  sendIterationPrompt(pi, ctx, deps, resolved);
}

export async function startLoop(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, parsed: ParsedCommand, replaceActive: boolean, options: { deferFirstPromptUntilIdle?: boolean } = {}) {
  const current = deps.getState();
  if (current.active && !replaceActive) {
    deps.notify(ctx, `${statusLine(current)}\nNo user input is needed; queued goal iterations start automatically. Use /development-goal restart to replace it or /development-goal stop to stop it.`);
    deps.refreshUi(ctx);
    return;
  }

  if (current.active && replaceActive && ctx.hasUI) {
    const ok = await ctx.ui?.confirm?.("Restart development goal", "Replace the current active goal state?");
    if (!ok) return;
  }

  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  const defaults = resolved.defaults;
  const topic = parsed.topic || resolved.config.defaultTopic || defaults.defaultTopic;
  const configuredIterationCap = parsed.iterations ?? (hasIterationCap(resolved.config) ? resolved.config.maxIterations : undefined);
  const maxIterations = configuredIterationCap ? clampIterations(configuredIterationCap) : DEFAULT_ITERATIONS;
  const { commit, push } = resolveCommitPush(parsed.commit, parsed.push, resolved.config.commit, resolved.config.push);
  const logPath = absoluteLogPath(cwd, resolved.config.logPath);
  const startedAt = new Date().toISOString();
  const runId = createRunId(startedAt);

  let nextState = startGoalRun({
    defaultsName: defaults.name,
    runId,
    topic,
    maxIterations,
    startedAt,
    logPath,
    tokenBudget: parsed.tokenBudget,
    requiredSkill: parsed.requiredSkill,
    commandIntent: parsed.commandIntent,
    allWorktreeChangesInScope: parsed.allWorktreeChangesInScope,
    commit,
    push,
  });

  deps.setState(nextState);
  deps.appendLoopLog("loop_started", { reason: resolved.configLoaded ? "config_loaded" : "built_in_defaults" });
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, `Starting development goal ${iterationProgress(nextState)}; log: ${relativeToCwd(cwd, logPath)}`);
  if (options.deferFirstPromptUntilIdle) {
    nextState = deferFirstPromptState(nextState);
    deps.setState(nextState);
    deps.appendLoopLog("iteration_queued", { reason: "deferred_first_prompt_until_idle" });
    pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
    deps.refreshUi(ctx);
    scheduleAutomaticIteration(pi, ctx, deps, resolved, nextState.iteration);
    return;
  }
  sendIterationPrompt(pi, ctx, deps, resolved);
}

export function queueNextIteration(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const state = deps.getState();
  if (!state.active) return;
  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  const nextState = queueNextIterationState(state);
  deps.setState(nextState);
  deps.appendLoopLog("iteration_queued");
  deps.refreshUi(ctx);
  deps.notify(ctx, `Queued development goal iteration ${iterationProgress(nextState)}; it will start automatically when the current turn is idle.`);
  scheduleAutomaticIteration(pi, ctx, deps, resolved, nextState.iteration);
}

export function compactBeforeNextIteration(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps): boolean {
  const state = deps.getState();
  if (!state.active || !shouldCompactBeforeNextIteration(ctx) || typeof ctx.compact !== "function") return false;
  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  const nextState = queueNextIterationState(state, "compaction_before_next_iteration");
  deps.setState(nextState);
  deps.appendLoopLog("compaction_before_next_iteration", { reason: contextUsageReason(ctx) });
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, `Compacting before development goal iteration ${iterationProgress(nextState)}.`);
  ctx.compact({
    customInstructions: buildDevelopmentGoalCompactionInstructions(nextState, resolved, cwd),
    onComplete: () => deps.notify(ctx, "Development goal compaction completed; continuing automatically."),
    onError: (error) => {
      const failedState = transitionLastReason(deps.getState(), "compaction_failed_before_next_iteration");
      deps.setState(failedState);
      deps.appendLoopLog("compaction_failed_before_next_iteration", { reason: error.message });
      pi.appendEntry(CUSTOM_STATE_TYPE, failedState);
      deps.refreshUi(ctx);
      deps.notify(ctx, `Compaction failed before next iteration: ${error.message}. Continuing without compaction.`, "warning");
      scheduleAutomaticIteration(pi, ctx, deps, resolved, failedState.iteration);
    },
  });
  return true;
}

export function requestContextOverflowCompaction(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  if (typeof ctx.compact !== "function") return;
  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  ctx.compact({
    customInstructions: `The provider reported a context-overflow error before DEV_GOAL markers were emitted. Compact the conversation, preserve the current development-goal state, and continue the same iteration after compaction.\n\n${buildDevelopmentGoalCompactionInstructions(deps.getState(), resolved, cwd)}`,
    onComplete: () => deps.notify(ctx, "Development goal context-overflow compaction completed; continuing automatically."),
    onError: (error) => {
      const failedState = transitionLastReason(deps.getState(), "context_overflow_compaction_failed");
      deps.setState(failedState);
      deps.appendLoopLog("context_overflow_compaction_failed", { reason: error.message });
      pi.appendEntry(CUSTOM_STATE_TYPE, failedState);
      deps.refreshUi(ctx);
      deps.notify(ctx, `Compaction failed after provider context-overflow error: ${error.message}. Waiting for manual compaction or retry.`, "warning");
    },
  });
}

export function prepareForCompaction(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, reason: string) {
  const nextState = transitionPreparingForCompaction(deps.getState());
  deps.setState(nextState);
  deps.appendLoopLog("compaction_started", { reason });
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, "Development goal state saved before compaction.");
}

export function resumeCurrentIterationAfterCompaction(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  const prompt = buildCompactionResumePrompt(deps.getState(), resolved, cwd);
  const queuedState = transitionCompactionResumeQueued(deps.getState());
  deps.setState(queuedState);
  deps.appendLoopLog("compaction_resume_queued");
  deps.refreshUi(ctx);
  sendLoopPrompt(pi, ctx, prompt);
  const runningState = transitionCompactionResumeSent(deps.getState());
  deps.setState(runningState);
  deps.appendLoopLog("compaction_resume_sent");
  pi.appendEntry(CUSTOM_STATE_TYPE, runningState);
  deps.refreshUi(ctx);
  deps.notify(ctx, `Resumed development goal iteration ${iterationProgress(runningState)} after compaction.`);
}

export function continueQueuedIterationAfterCompaction(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  deps.appendLoopLog("compaction_continue_queued_iteration");
  deps.notify(ctx, `Continuing development goal iteration ${iterationProgress(deps.getState())} after compaction.`);
  sendIterationPrompt(pi, ctx, deps, resolved);
}

export function requestReportRepair(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, report: FinalReport, logEvent: { event: string; reason: string; blockerKind: string; reportQualityIssueCodes: string[] }) {
  const nextState = transitionReportRepairRequested(deps.getState());
  deps.setState(nextState);
  const { event, ...logExtra } = logEvent;
  deps.appendLoopLog(event, logExtra);
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, `Development goal sent a repair-only final-report prompt (${logEvent.reportQualityIssueCodes.join(", ") || "malformed_final_report"}).`);
  sendLoopPrompt(pi, ctx, buildReportRepairPrompt(nextState, report), true);
}

export function requestMissingMarkerRecovery(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps) {
  const retryNumber = (deps.getState().markerRecoveryRetries ?? 0) + 1;
  const nextState = transitionMissingMarkerRecoveryRequested(deps.getState(), retryNumber);
  deps.setState(nextState);
  deps.appendLoopLog("missing_final_marker_recovery_requested", { reason: "missing DEV_GOAL_DECISION final marker" });
  pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
  deps.refreshUi(ctx);
  deps.notify(ctx, "Development goal sent a final-marker-only recovery prompt.");
  sendLoopPrompt(pi, ctx, buildMissingMarkerRecoveryPrompt(nextState), true);
}

export function scheduleEmptyResponseRetry(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, targetIteration: number, retryNumber: number) {
  setTimeout(() => {
    const state = deps.getState();
    if (!state.active || state.iteration !== targetIteration || state.phase !== "running") return;
    if (state.lastReason !== "empty_agent_response_waiting_for_compaction") return;
    if ((state.emptyResponseRetries ?? 0) !== retryNumber) return;

    const cwd = contextCwd(ctx);
    const resolved = resolveDevelopmentGoalSettings(cwd);
    const prompt = buildEmptyResponseRetryPrompt(state, resolved, cwd);
    const nextState = transitionRetryingAfterEmptyProviderResponse(state);
    deps.setState(nextState);
    deps.appendLoopLog("empty_provider_response_retry_sent", { reason: `retry ${retryNumber}/${EMPTY_RESPONSE_MAX_RETRIES}` });
    deps.refreshUi(ctx);
    sendLoopPrompt(pi, ctx, prompt);
    pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
    deps.refreshUi(ctx);
  }, EMPTY_RESPONSE_RETRY_MS);
}

export function scheduleTransportErrorRetry(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, targetIteration: number, retryNumber: number) {
  setTimeout(() => {
    const state = deps.getState();
    if (!state.active || state.iteration !== targetIteration || state.phase !== "running") return;
    if (state.lastReason !== "provider_transport_error_waiting_for_retry") return;
    if ((state.emptyResponseRetries ?? 0) !== retryNumber) return;

    const cwd = contextCwd(ctx);
    const resolved = resolveDevelopmentGoalSettings(cwd);
    const prompt = buildTransportErrorRetryPrompt(state, resolved, cwd);
    const nextState = transitionRetryingAfterProviderTransport(state);
    deps.setState(nextState);
    deps.appendLoopLog("provider_transport_error_retry_sent", { reason: `retry ${retryNumber}/${EMPTY_RESPONSE_MAX_RETRIES}`, providerError: "transport" });
    deps.refreshUi(ctx);
    sendLoopPrompt(pi, ctx, prompt);
    pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
    deps.refreshUi(ctx);
  }, EMPTY_RESPONSE_RETRY_MS);
}

export function sendIterationPrompt(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, resolved: ResolvedDevelopmentGoalSettings, asFollowUp = false) {
  const autoContinueLimit = autoContinueLimitFromEnv();
  const state = deps.getState();
  if (shouldPauseForAutoContinueLimit(state.autoContinueCount, autoContinueLimit)) {
    const nextState = transitionAutoContinueLimited(state);
    deps.setState(nextState);
    deps.appendLoopLog("loop_auto_continue_limited", { reason: `max_auto_continues=${autoContinueLimit}` });
    pi.appendEntry(CUSTOM_STATE_TYPE, nextState);
    deps.refreshUi(ctx);
    deps.notify(ctx, `Development goal auto-continuation guard reached after ${autoContinueLimit} prompt sends. Use /development-goal resume or raise PI_DEV_GOAL_MAX_AUTO_CONTINUES to continue automatically.`, "warning");
    return;
  }
  const prompt = buildIterationPrompt(state, resolved, contextCwd(ctx));
  const queuedState = transitionPromptSent(state, asFollowUp);
  deps.setState(queuedState);
  deps.appendLoopLog(asFollowUp ? "iteration_prompt_queued" : "iteration_prompt_sent", { reason: `auto_continue ${queuedState.autoContinueCount}/${autoContinueLimit}` });
  deps.refreshUi(ctx);
  sendLoopPrompt(pi, ctx, prompt, asFollowUp);
  const runningState = transitionPromptNowRunning(queuedState);
  deps.setState(runningState);
  pi.appendEntry(CUSTOM_STATE_TYPE, runningState);
  deps.refreshUi(ctx);
}

export function sendLoopPrompt(pi: ExtensionAPI, ctx: UiLikeContext, prompt: string, asFollowUp = false) {
  const idle = typeof ctx.isIdle === "function" ? ctx.isIdle() : true;
  if (asFollowUp || !idle) {
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  } else {
    pi.sendUserMessage(prompt);
  }
}

function scheduleAutomaticIteration(pi: ExtensionAPI, ctx: UiLikeContext, deps: GoalRunControllerDeps, resolved: ResolvedDevelopmentGoalSettings, targetIteration: number, attempt = 0) {
  const delay = attempt === 0 ? 0 : AUTO_CONTINUATION_RETRY_MS;
  setTimeout(() => {
    const state = deps.getState();
    if (!state.active || state.iteration !== targetIteration || state.phase !== "queued") return;

    const idle = typeof ctx.isIdle === "function" ? ctx.isIdle() : true;
    if (idle) {
      sendIterationPrompt(pi, ctx, deps, resolved);
      return;
    }

    if (attempt >= AUTO_CONTINUATION_MAX_ATTEMPTS) {
      deps.appendLoopLog("iteration_prompt_follow_up_fallback", { reason: "agent_not_idle_after_retry" });
      sendIterationPrompt(pi, ctx, deps, resolved, true);
      return;
    }

    scheduleAutomaticIteration(pi, ctx, deps, resolved, targetIteration, attempt + 1);
  }, delay);
}
