import assert from "node:assert/strict";
import goalAdvisorExtension, {
  buildAdvisorUserPrompt,
  createDefaultAdvisorConfig,
  formatAdvisorStatus,
  handleGoalAdvisorCommand,
  normalizeAdvisorConfig,
  parseCacheRetention,
  parseModelSpec,
  parsePositiveInt,
  serializeBranchForAdvisor,
} from "../extensions/goal-advisor.js";

assert.deepEqual(parseModelSpec("anthropic/claude-opus-4-5"), {
  provider: "anthropic",
  modelId: "claude-opus-4-5",
});
assert.equal(parseModelSpec("missing-slash"), undefined);
assert.equal(parsePositiveInt("5"), 5);
assert.equal(parsePositiveInt("0"), undefined);
assert.equal(parseCacheRetention("long"), "long");
assert.equal(parseCacheRetention("forever"), undefined);

const defaults = createDefaultAdvisorConfig();
assert.equal(defaults.enabled, false);
assert.equal(defaults.maxUses, 3);

const normalized = normalizeAdvisorConfig({ enabled: true, maxUses: 2.7, cacheRetention: "none" }, defaults);
assert.equal(normalized.enabled, true);
assert.equal(normalized.maxUses, 2);
assert.equal(normalized.cacheRetention, "none");

let result = handleGoalAdvisorCommand("enable", defaults, 0, () => true);
assert.equal(result.level, "error");
assert.match(result.message, /Set an advisor model first/);
assert.equal(result.config.enabled, false);

result = handleGoalAdvisorCommand("model openai/gpt-5.5", defaults, 0, () => true);
assert.equal(result.level, "info");
assert.equal(result.persist, true);
assert.equal(result.config.provider, "openai");
assert.equal(result.config.modelId, "gpt-5.5");

result = handleGoalAdvisorCommand("enable", result.config, 0, () => true);
assert.equal(result.config.enabled, true);
assert.equal(result.updateToolState, true);

result = handleGoalAdvisorCommand("cache long", result.config, 0, () => true);
assert.equal(result.config.cacheRetention, "long");

result = handleGoalAdvisorCommand("max-uses 7", result.config, 4, () => true);
assert.equal(result.config.maxUses, 7);
assert.equal(result.useCount, 4);

result = handleGoalAdvisorCommand("reset", result.config, 4, () => true);
assert.equal(result.useCount, 0);

assert.match(formatAdvisorStatus(result.config, 0, () => true), /goal-advisor enabled/);
assert.match(formatAdvisorStatus(result.config, 0, () => false), /not found/);

const transcript = serializeBranchForAdvisor([
  { type: "message", message: { role: "user", content: [{ type: "text", text: "Please plan this" }] } },
  { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read", arguments: { path: "README.md" } }] } },
  { type: "message", message: { role: "toolResult", toolName: "read", isError: false, content: [{ type: "text", text: "# README" }] } },
]);
assert.match(transcript, /USER:\nPlease plan this/);
assert.match(transcript, /\[tool call: read\]/);
assert.match(transcript, /TOOL RESULT read \(ok\):/);

const prompt = buildAdvisorUserPrompt({ question: "What next?", phase: "planning", context: "Keep it cheap." }, transcript);
assert.match(prompt, /## Executor Question\nWhat next\?/);
assert.match(prompt, /## Extra Context\nKeep it cheap\./);
assert.match(prompt, /## Conversation Transcript/);

const registered = { tools: [], commands: [], events: [], activeTools: ["bash", "goal_advisor"] };
goalAdvisorExtension({
  registerTool(tool) { registered.tools.push(tool.name); },
  registerCommand(name) { registered.commands.push(name); },
  on(name) { registered.events.push(name); },
  appendEntry() {},
  getActiveTools() { return registered.activeTools; },
  setActiveTools(names) { registered.activeTools = names; },
});
assert.deepEqual(registered.tools, ["goal_advisor"]);
assert.deepEqual(registered.commands, ["goal-advisor"]);
assert.ok(registered.events.includes("before_agent_start"));

console.log("goal-advisor-extension ok");
