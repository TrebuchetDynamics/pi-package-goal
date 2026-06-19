import assert from "node:assert/strict";
import ponytailExtension, {
  filterSkillBodyForMode,
  parsePonytailCommand,
  readDefaultMode,
  resolveSessionMode,
} from "../extensions/ponytail/index.js";

assert.deepEqual(parsePonytailCommand("", "full"), { type: "set-mode", mode: "full" });
assert.deepEqual(parsePonytailCommand("status"), { type: "status" });
assert.deepEqual(parsePonytailCommand("lite"), { type: "set-mode", mode: "lite" });
assert.deepEqual(parsePonytailCommand("default ultra"), { type: "set-default", mode: "ultra" });
assert.equal(parsePonytailCommand("nope").type, "invalid");
assert.equal(readDefaultMode(), process.env.PONYTAIL_DEFAULT_MODE?.toLowerCase() || "full");

assert.equal(resolveSessionMode([{ type: "custom", customType: "ponytail-mode", data: { mode: "lite" } }]), "lite");
assert.equal(resolveSessionMode([{ type: "custom", customType: "other", data: { mode: "ultra" } }], "full"), "full");

const filtered = filterSkillBodyForMode("---\nname: x\n---\n| **lite** | keep |\n| **ultra** | drop |\n- lite: keep\n- ultra: drop\n- No unrequested abstractions: keep", "lite");
assert.match(filtered, /lite/);
assert.doesNotMatch(filtered, /ultra/);
assert.match(filtered, /No unrequested abstractions/);

const commands = new Map();
const events = new Map();
const entries = [];
const messages = [];
const pi = {
  appendEntry(type, data) { entries.push({ type, data }); },
  sendUserMessage(message, options) { messages.push({ message, options }); },
  registerCommand(name, command) { commands.set(name, command); },
  on(name, handler) { events.set(name, handler); },
};
ponytailExtension(pi);
assert.ok(commands.has("ponytail"));
assert.ok(commands.has("ponytail-review"));
assert.ok(events.has("before_agent_start"));

const notifications = [];
await commands.get("ponytail").handler("lite", { ui: { notify: (message, level) => notifications.push({ message, level }) } });
assert.deepEqual(entries.at(-1), { type: "ponytail-mode", data: { mode: "lite" } });
assert.match(notifications.at(-1).message, /lite/);

const promptResult = await events.get("before_agent_start")({ systemPrompt: "base" });
assert.match(promptResult.systemPrompt, /base/);
assert.match(promptResult.systemPrompt, /PONYTAIL MODE ACTIVE/);

await commands.get("ponytail-review").handler("", { isIdle: () => true });
assert.deepEqual(messages.at(-1), { message: "/skill:ponytail-review", options: undefined });

console.log("ponytail-extension ok");
