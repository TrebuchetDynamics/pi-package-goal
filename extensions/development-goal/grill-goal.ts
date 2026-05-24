import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_LANGUAGE, resolveDevelopmentGoalSettings } from "./defaults.ts";
import type { ParsedCommand } from "./command.ts";
import { contextCwd } from "./files.ts";
import { buildGrillGoalPrompt } from "./prompts.ts";
import { statusLine } from "./status.ts";
import type { LoopState } from "./state.ts";

export const GRILL_STATE_TYPE = "development-goal-grill-state";

export type GrillGoalState = {
  active: boolean;
  seedTopic: string;
  language: string;
  adapterName: string;
  startedAt: string;
};

type UiLikeContext = {
  cwd?: string;
  hasUI?: boolean;
  ui?: { notify?: (message: string, level?: string) => void };
  sessionManager?: {
    getEntries?: () => Array<{ type?: string; customType?: string; data?: unknown }>;
    getCwd?: () => string;
  };
  isIdle?: () => boolean;
};

type Notify = (ctx: UiLikeContext, message: string, level?: "info" | "warning" | "error") => void;
type SendLoopPrompt = (pi: ExtensionAPI, ctx: UiLikeContext, prompt: string, asFollowUp?: boolean) => void;
type StartLoop = (parsed: ParsedCommand, replaceActive: boolean, options?: { deferFirstPromptUntilIdle?: boolean }) => Promise<void>;

export async function startGrillGoalPlanning(
  pi: ExtensionAPI,
  ctx: UiLikeContext,
  state: LoopState,
  parsed: ParsedCommand,
  notify: Notify,
  sendLoopPrompt: SendLoopPrompt,
): Promise<GrillGoalState | undefined> {
  if (state.active) {
    notify(ctx, `${statusLine(state)}\nStop or finish the active development goal before starting /development-goal grill-me.`);
    return undefined;
  }

  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  const seedTopic = parsed.topic || resolved.config.defaultTopic || resolved.defaults.defaultTopic;
  const language = resolved.config.language || DEFAULT_LANGUAGE;
  const pending: GrillGoalState = {
    active: true,
    seedTopic,
    language,
    adapterName: resolved.defaults.name,
    startedAt: new Date().toISOString(),
  };
  pi.appendEntry(GRILL_STATE_TYPE, pending);
  notify(ctx, `Starting development-goal grill-me planning in ${language}.`);
  sendLoopPrompt(pi, ctx, buildGrillGoalPrompt(state, resolved, cwd, seedTopic));
  return pending;
}

export async function handleGrillGoalAssistantText(
  pi: ExtensionAPI,
  ctx: UiLikeContext,
  pending: GrillGoalState | undefined,
  assistantText: string,
  notify: Notify,
  startLoop: StartLoop,
): Promise<{ handled: boolean; pending?: GrillGoalState }> {
  const nextTopic = parseGrillGoalNextTopic(assistantText);
  if (nextTopic) {
    const nextPending = pending ? { ...pending, active: false } : undefined;
    if (nextPending) pi.appendEntry(GRILL_STATE_TYPE, nextPending);
    notify(ctx, `Development-goal grill-me selected next goal: ${nextTopic}`);
    await startLoop({
      command: "start",
      topic: nextTopic,
      validationCommands: [],
      preflightCommands: [],
      skills: [],
      stopConditions: [],
    }, false, { deferFirstPromptUntilIdle: true });
    return { handled: true, pending: nextPending };
  }

  const blocked = parseGrillGoalBlocked(assistantText);
  if (blocked) {
    const nextPending = pending ? { ...pending, active: false } : undefined;
    if (nextPending) pi.appendEntry(GRILL_STATE_TYPE, nextPending);
    notify(ctx, `Development-goal grill-me blocked: ${blocked}`, "warning");
    return { handled: true, pending: nextPending };
  }

  return { handled: false, pending };
}

export function restoreGrillGoalState(entries: Array<{ type?: string; customType?: string; data?: unknown }>): GrillGoalState | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === GRILL_STATE_TYPE && isGrillGoalState(entry.data)) return entry.data;
  }
  return undefined;
}

export function isGrillGoalState(value: unknown): value is GrillGoalState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<GrillGoalState>;
  return typeof item.active === "boolean" &&
    typeof item.seedTopic === "string" &&
    typeof item.language === "string" &&
    typeof item.adapterName === "string" &&
    typeof item.startedAt === "string";
}

export function parseGrillGoalNextTopic(text: string): string | undefined {
  return markerValue(text, "DEV_GOAL_NEXT_TOPIC");
}

export function parseGrillGoalBlocked(text: string): string | undefined {
  return markerValue(text, "DEV_GOAL_NEXT_BLOCKED");
}

function markerValue(text: string, marker: string): string | undefined {
  const pattern = new RegExp(`^${marker}:\\s*(.+?)\\s*$`, "im");
  const value = text.match(pattern)?.[1]?.trim();
  if (!value || /^<.*>$/.test(value)) return undefined;
  return value;
}
