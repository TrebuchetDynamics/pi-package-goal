import assert from "node:assert/strict";
import bugHarvestExtension, {
  buildContinuationPrompt,
  needsContextHandoff,
  parseBugHarvestCommand,
  updateRepetitionState,
} from "../extensions/bug-harvest/index.js";

assert.deepEqual(parseBugHarvestCommand(""), { action: "start", scope: "." });
assert.deepEqual(parseBugHarvestCommand("src/api"), {
  action: "start",
  scope: "src/api",
});
assert.deepEqual(parseBugHarvestCommand("pause"), { action: "pause" });
assert.deepEqual(parseBugHarvestCommand("abort"), { action: "stop" });
assert.deepEqual(parseBugHarvestCommand("handoff"), { action: "handoff" });
assert.equal(needsContextHandoff({ percent: 79 }), false);
assert.equal(needsContextHandoff({ percent: 80 }), true);
const assistantIteration = [
  {
    role: "assistant",
    stopReason: "stop",
    content: [{ type: "text", text: "Checked tests; no bug found." }],
  },
];
const firstIteration = updateRepetitionState(
  { recentFingerprints: [], stuckCount: 0, narrationStreak: 0 },
  assistantIteration,
);
const repeatedIteration = updateRepetitionState(
  firstIteration,
  assistantIteration,
);
assert.equal(firstIteration.stuckCount, 0);
assert.equal(repeatedIteration.stuckCount, 1);
const toolBackedIteration = updateRepetitionState(
  { recentFingerprints: [], stuckCount: 0, narrationStreak: 1 },
  [
    { role: "assistant", content: [{ type: "toolCall", name: "bash" }] },
    { role: "toolResult", content: [] },
    {
      role: "assistant",
      stopReason: "stop",
      content: [{ type: "text", text: "Tests passed." }],
    },
  ],
);
assert.equal(
  toolBackedIteration.narrationStreak,
  0,
  "tool calls earlier in the turn must count as evidence",
);
assert.match(
  buildContinuationPrompt({ scope: "src", iterations: 2, stuckCount: 2 }),
  /different subtask/i,
);
assert.match(
  buildContinuationPrompt({ scope: "src", iterations: 2 }),
  /iteration 3/i,
);
assert.match(
  buildContinuationPrompt({ scope: "src", iterations: 2 }),
  /severity/i,
);
assert.match(
  buildContinuationPrompt({ scope: "src", iterations: 2 }),
  /different tracked evidence lane/i,
);

const commands = new Map();
const handlers = new Map();
const entries = [];
const messages = [];
const statuses = [];
const pi = {
  appendEntry(customType, data) {
    entries.push({ type: "custom", customType, data });
  },
  on(event, handler) {
    handlers.set(event, handler);
  },
  registerCommand(name, options) {
    commands.set(name, options);
  },
  sendUserMessage(message, options) {
    messages.push({ message, options });
  },
};
const ctx = {
  hasPendingMessages: () => false,
  isIdle: () => true,
  getContextUsage: () => ({ percent: 10 }),
  sessionManager: {
    getBranch: () => [],
    getSessionFile: () => "/tmp/old-session.jsonl",
  },
  ui: {
    notify() {},
    setStatus(key, value) {
      statuses.push({ key, value });
    },
  },
};

bugHarvestExtension(pi);
assert.ok(commands.has("bug-harvest"));
assert.ok(
  handlers.has("session_tree"),
  "tree navigation must restore branch-local run state",
);
await commands.get("bug-harvest").handler("src/api", ctx);
assert.match(messages.at(-1).message, /^\/skill:bug-harvest/);
assert.equal(entries.at(-1).data.run.status, "active");

await handlers.get("agent_end")(
  { messages: [{ role: "assistant", stopReason: "stop" }] },
  ctx,
);
await handlers.get("agent_settled")({}, ctx);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(messages.length, 2);
assert.match(messages.at(-1).message, /iteration 2/i);

await commands.get("bug-harvest").handler("pause", ctx);
await handlers.get("agent_settled")({}, ctx);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(messages.length, 2, "paused harvest must not queue another turn");
assert.equal(entries.at(-1).data.run.status, "paused");
assert.match(statuses.at(-1).value, /paused/i);

ctx.sessionManager.getBranch = () => [
  {
    type: "custom",
    customType: "pi-bug-harvest",
    data: {
      run: { id: "tree-run", scope: ".", status: "active", iterations: 4 },
    },
  },
];
await handlers.get("session_tree")({}, ctx);
assert.equal(
  entries.at(-1).data.run.status,
  "paused",
  "tree-restored active runs must pause",
);
assert.equal(entries.at(-1).data.run.id, "tree-run");

let handoffEntry;
ctx.newSession = async ({ setup, withSession }) => {
  setup({
    appendCustomEntry(_type, data) {
      handoffEntry = data;
    },
  });
  await withSession({
    sendUserMessage(message) {
      messages.push({ message });
    },
  });
  return { cancelled: false };
};
await commands.get("bug-harvest").handler("handoff", ctx);
assert.equal(handoffEntry.run.status, "paused");
assert.equal(handoffEntry.run.handoffs, 1);
assert.equal(messages.at(-1).message, "/bug-harvest resume");

console.log("bug-harvest-extension ok");
