import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, InputEvent } from "@earendil-works/pi-coding-agent";
import {
  DEVELOPMENT_GOAL_DEFAULTS,
  resolveDevelopmentGoalSettings,
} from "./defaults.ts";
import { DEVELOPMENT_GOAL_IDENTITY } from "./identity.ts";
import {
  contextCwd,
} from "./files.ts";
import {
  completeCommandArgs,
  parseArgs,
  parseSinceFilter,
  tokenizeArgs,
  type ParsedCommand,
} from "./command.ts";
import { publishLogAnalysis } from "./log-analysis.ts";
import {
  buildIterationPrompt,
  PROMPT_OBJECTIVE_MAX,
} from "./prompts.ts";
import { compactionReason, shouldCompactBeforeNextIteration } from "./compaction.ts";
import {
  appendLoopLogRecord,
  buildLoopLogRecord,
  type LoopLogRecord,
} from "./logger.ts";
import { parseLoopDeliveryEvidence, parseLoopReport } from "./report-parser.ts";
import { lastAssistantText } from "./runtime.ts";
import { evaluateActiveGoalToolCallSafety } from "./tool-safety.ts";
import {
  statusLine,
  statusReport,
  statusWidgetLines,
} from "./status.ts";
import {
  DEFAULT_ITERATIONS,
  DEFAULT_LOG_RELATIVE,
  inactiveState,
  restoreState,
  type LoopState,
} from "./state.ts";
import { initConfig, publishHelp, publishStatus } from "./command-ui.ts";
import {
  continueQueuedIterationAfterCompaction as runContinueQueuedIterationAfterCompaction,
  pauseLoop as runPauseLoop,
  prepareForCompaction as runPrepareForCompaction,
  resumeCurrentIterationAfterCompaction as runResumeCurrentIterationAfterCompaction,
  resumeLoop as runResumeLoop,
  resumePendingRetryAfterSessionRestore as runResumePendingRetryAfterSessionRestore,
  sendLoopPrompt,
  startLoop as runStartLoop,
  stopLoop as runStopLoop,
  type GoalRunControllerDeps,
} from "./goal-run-controller.ts";
import { handleGoalRunAssistantResult } from "./goal-run-result.ts";
import { handleGoalRunInput } from "./goal-run-steering.ts";
import {
  handleGrillGoalAssistantText as handleGrillGoalResult,
  restoreGrillGoalState,
  startGrillGoalPlanning,
  type GrillGoalState,
} from "./grill-goal.ts";
type LoopDecision = "continue" | "stop" | "blocked" | "done";

type UiThemeLike = {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
};

type UiSelectResult = string | { value: string; label?: string; description?: string } | undefined;

type UiLikeContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: {
    theme?: UiThemeLike;
    notify?: (message: string, level?: string) => void;
    setStatus?: (key: string, value: string | undefined) => void;
    setWidget?: (key: string, value: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }) => void;
    confirm?: (title: string, message: string, options?: unknown) => Promise<boolean> | boolean;
    select?: (title: string, items: string[], options?: unknown) => Promise<UiSelectResult> | UiSelectResult;
    input?: (title: string, placeholder?: string) => Promise<string | undefined> | string | undefined;
    editor?: (title: string, text?: string) => Promise<string | undefined> | string | undefined;
  };
  sessionManager?: {
    getEntries?: () => Array<{ type?: string; customType?: string; data?: unknown }>;
    getCwd?: () => string;
  };
  isIdle?: () => boolean;
  hasPendingMessages?: () => boolean;
  getContextUsage?: () => { tokens?: number; contextWindow?: number; maxTokens?: number } | undefined;
  compact?: (options?: {
    customInstructions?: string;
    onComplete?: (result?: unknown) => void;
    onError?: (error: Error) => void;
  }) => void;
};

const LOG_TOPIC_MAX = 600;

let state: LoopState = inactiveState(DEFAULT_LOG_RELATIVE, DEFAULT_ITERATIONS);
let pendingGrillGoal: GrillGoalState | undefined;

function controllerDeps(): GoalRunControllerDeps {
  return {
    getState: () => state,
    setState: (nextState) => { state = nextState; },
    appendLoopLog,
    refreshUi,
    notify,
  };
}

export default function developmentLoopExtension(pi: ExtensionAPI) {
  async function onSessionStart(_event: unknown, ctx: ExtensionContext) {
    const entries = ctx.sessionManager.getEntries();
    state = restoreState(entries) ?? inactiveState(DEFAULT_LOG_RELATIVE, DEFAULT_ITERATIONS);
    pendingGrillGoal = restoreGrillGoalState(entries);
    refreshUi(ctx);
    runResumePendingRetryAfterSessionRestore(pi, ctx, controllerDeps());
  }

  async function onAgentEnd(event: { messages?: Array<{ role?: string; content?: unknown; stopReason?: string }> }, ctx: ExtensionContext) {
    const messages = event.messages ?? [];
    const assistantText = lastAssistantText(messages);

    if (pendingGrillGoal?.active) {
      const result = await handleGrillGoalResult(pi, ctx, pendingGrillGoal, assistantText, notify, (parsed, replaceActive, options) => runStartLoop(pi, ctx, controllerDeps(), parsed, replaceActive, options));
      pendingGrillGoal = result.pending;
      if (result.handled) return;
    }

    handleGoalRunAssistantResult(pi, ctx, messages, assistantText, controllerDeps());
  }

  async function onSessionBeforeCompact(event: { preparation?: { tokensBefore?: number } }, ctx: ExtensionContext) {
    if (!state.active) return;
    runPrepareForCompaction(pi, ctx, controllerDeps(), compactionReason(event.preparation?.tokensBefore));
  }

  async function onSessionCompact(_event: unknown, ctx: ExtensionContext) {
    if (!state.active) return;
    if (state.phase === "running") {
      runResumeCurrentIterationAfterCompaction(pi, ctx, controllerDeps());
      return;
    }
    if (state.phase === "queued" || state.phase === "reported") {
      runContinueQueuedIterationAfterCompaction(pi, ctx, controllerDeps());
    }
  }

  async function onInput(event: InputEvent, ctx: ExtensionContext) {
    return handleGoalRunInput(pi, ctx, event, controllerDeps());
  }

  async function onToolCall(event: { toolName: string; input?: unknown }, ctx: ExtensionContext) {
    const decision = evaluateActiveGoalToolCallSafety({ active: state.active, push: state.push }, event.toolName, event.input);
    if (decision.action === "allow") return undefined;

    appendLoopLog("tool_call_blocked", { reason: decision.reason, blockerKind: decision.kind });
    notify(ctx, decision.reason, "warning");
    return { block: true, reason: decision.reason };
  }

  pi.on("session_start", onSessionStart);
  pi.on("agent_end", onAgentEnd);
  pi.on("session_before_compact", onSessionBeforeCompact);
  pi.on("session_compact", onSessionCompact);
  pi.on("input", onInput);
  pi.on("tool_call", onToolCall);

  const command = {
    description: "Run a project development goal",
    getArgumentCompletions: completeCommandArgs,
    handler: async (args: string, ctx: ExtensionCommandContext) => runCommand(pi, args, ctx),
  };

  pi.registerCommand(DEVELOPMENT_GOAL_IDENTITY.command.name, command);
}

async function runCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext) {
  const parsed = parseArgs(args);
  switch (parsed.command) {
    case "status":
      publishStatus(pi, ctx, state);
      return;
    case "pause":
      runPauseLoop(pi, ctx, controllerDeps());
      return;
    case "resume":
      runResumeLoop(pi, ctx, controllerDeps());
      return;
    case "stop":
      runStopLoop(pi, ctx, controllerDeps());
      return;
    case "analyze-logs":
      publishLogAnalysis(pi, ctx, parsed, state.logPath || DEFAULT_LOG_RELATIVE);
      return;
    case "help":
      publishHelp(pi, ctx);
      return;
    case "init":
      await initConfig(parsed, ctx);
      return;
    case "improve-codebase-architecture":
      await runStartLoop(pi, ctx, controllerDeps(), improveCodebaseArchitectureCommand(parsed), false);
      return;
    case "git-commit-push":
      await runStartLoop(pi, ctx, controllerDeps(), gitCommitPushCommand(parsed), false);
      return;
    case "grill-me":
      pendingGrillGoal = await startGrillGoalPlanning(pi, ctx, state, parsed, notify, sendLoopPrompt) ?? pendingGrillGoal;
      return;
    case "restart":
      await runStartLoop(pi, ctx, controllerDeps(), parsed, true);
      return;
    case "start":
    default:
      await runStartLoop(pi, ctx, controllerDeps(), parsed, false);
      return;
  }
}

function improveCodebaseArchitectureCommand(parsed: ParsedCommand): ParsedCommand {
  const baseTopic = "Improve codebase architecture";
  return {
    ...parsed,
    command: "start",
    requiredSkill: "improve-codebase-architecture",
    skills: ["improve-codebase-architecture", ...parsed.skills.filter((skill) => skill !== "improve-codebase-architecture")],
    topic: parsed.topic ? `${baseTopic}: ${parsed.topic}` : baseTopic,
  };
}

function gitCommitPushCommand(parsed: ParsedCommand): ParsedCommand {
  const baseTopic = "Commit and push all current worktree changes";
  const intent = [
    "all current tracked, modified, deleted, and untracked worktree changes are in scope unless they are secrets, generated caches, vendored dependency folders, or otherwise unsafe to commit",
    "inspect git status and diffs before staging; group changes into coherent commits instead of one dump commit when there are separable concerns",
    "Make required local validation/CI green before each commit or push; if validation fails, fix code and rerun until green or blocked by an external prerequisite",
    "Push the current branch after validation is green; never force push, and block with fetch/rebase/merge next steps if the branch is behind or diverged",
  ].map((line) => `- ${line}`).join("\n");
  return {
    ...parsed,
    command: "start",
    commit: true,
    push: true,
    allWorktreeChangesInScope: true,
    commandIntent: intent,
    topic: parsed.topic ? `${baseTopic}: ${parsed.topic}` : baseTopic,
  };
}

function refreshUi(ctx: UiLikeContext) {
  if (!ctx.hasUI || !ctx.ui) return;
  const theme = ctx.ui.theme;
  const statusKey = DEVELOPMENT_GOAL_IDENTITY.statusKey;
  ctx.ui.setStatus?.(statusKey, undefined);
  ctx.ui.setWidget?.(statusKey, undefined);
  ctx.ui.setStatus?.(statusKey, statusLine(state, theme));
  ctx.ui.setWidget?.(statusKey, statusWidgetLines(state, contextCwd(ctx), theme), { placement: "belowEditor" });
}

function appendLoopLog(event: string, extra: Partial<LoopLogRecord> = {}) {
  const logPath = state.logPath || path.join(process.cwd(), DEFAULT_LOG_RELATIVE);
  appendLoopLogRecord(logPath, buildLoopLogRecord({ ...state, logPath }, event, extra, new Date().toISOString(), LOG_TOPIC_MAX));
}

function parseLoopDecision(text: string): LoopDecision | undefined {
  return parseLoopReport(text)?.decision;
}

function parseValidated(text: string): boolean | undefined {
  return parseLoopReport(text)?.validated;
}

function notify(ctx: UiLikeContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.ui?.notify) {
    ctx.ui.notify(message, level);
  } else {
    console.log(message);
  }
}

export const __test__ = {
  DEVELOPMENT_GOAL_DEFAULTS,
  buildIterationPrompt,
  parseArgs,
  parseLoopDecision,
  parseLoopDeliveryEvidence,
  parseLoopReport,
  parseSinceFilter,
  parseValidated,
  resolveDevelopmentGoalSettings,
  shouldCompactBeforeNextIteration,
  statusReport,
  tokenizeArgs,
};
