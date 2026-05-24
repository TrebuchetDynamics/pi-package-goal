import type { ExtensionAPI, InputEvent, InputEventResult } from "@earendil-works/pi-coding-agent";
import { resolveDevelopmentGoalSettings } from "./defaults.ts";
import { contextCwd } from "./files.ts";
import type { GoalRunControllerDeps, UiLikeContext } from "./goal-run-controller.ts";
import { CUSTOM_STATE_TYPE } from "./state.ts";
import { buildSteeringPrompt } from "./prompts.ts";
import { mergeSteeringTopic } from "./steering.ts";
import { singleLineText } from "./values.ts";
import { transitionUserSteering } from "./goal-run-transitions.ts";

export function handleGoalRunInput(pi: ExtensionAPI, ctx: UiLikeContext, event: InputEvent, deps: GoalRunControllerDeps): InputEventResult {
  const state = deps.getState();
  if (!state.active || state.phase === "paused") return { action: "continue" };
  if (event.source === "extension") return { action: "continue" };

  const steeringText = singleLineText(event.text);
  if (!steeringText || steeringText.startsWith("/")) return { action: "continue" };

  const cwd = contextCwd(ctx);
  const resolved = resolveDevelopmentGoalSettings(cwd);
  const steeredState = transitionUserSteering(state, mergeSteeringTopic(state.topic, steeringText));
  deps.setState(steeredState);
  deps.appendLoopLog("user_steering", { reason: steeringText });
  pi.appendEntry(CUSTOM_STATE_TYPE, steeredState);
  deps.refreshUi(ctx);
  deps.notify(ctx, "Development goal steering accepted for the active task.");

  return {
    action: "transform",
    text: buildSteeringPrompt(steeredState, resolved, cwd, steeringText),
    images: event.images,
  };
}
