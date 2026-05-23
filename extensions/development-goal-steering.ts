import { singleLineText } from "./development-goal-values.ts";

export const STEERING_TOPIC_MAX = 240;

export function mergeSteeringTopic(currentTopic: string, steeringText: string, maxLength = STEERING_TOPIC_MAX): string {
  const baseTopic = singleLineText(currentTopic) || "active development goal";
  const steering = singleLineText(steeringText);
  const next = `${baseTopic}; latest user steering: ${steering}`;
  return next.length <= maxLength ? next : `${next.slice(0, maxLength - 1)}…`;
}
