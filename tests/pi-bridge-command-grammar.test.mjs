import assert from "node:assert/strict";
import {
  parseActionCommand,
  popTrailingToken,
  splitCommandArgs,
  splitFirstArg,
} from "../extensions/_shared/pi-bridge/command-grammar.js";

assert.deepEqual(splitFirstArg(" chat how does auth work? "), {
  first: "chat",
  rest: "how does auth work?",
});
assert.deepEqual(splitFirstArg(""), { first: "", rest: "" });

assert.deepEqual(splitCommandArgs("'project a' \"project b\" out.md"), ["project a", "project b", "out.md"]);
assert.deepEqual(splitCommandArgs("query \"How does auth work?\""), ["query", "How does auth work?"]);
assert.deepEqual(splitCommandArgs("path AuthModule Database"), ["path", "AuthModule", "Database"]);
assert.throws(() => splitCommandArgs("query \"oops"), /Unclosed quote in command/);

assert.deepEqual(parseActionCommand("install now", ["help", "install"]), { action: "install", args: "now" });
assert.deepEqual(parseActionCommand("unknown args", ["help", "install"]), { action: "help", args: "unknown args" });
assert.deepEqual(parseActionCommand("", ["status"], { defaultAction: "status" }), { action: "status", args: "" });

assert.deepEqual(popTrailingToken(["auth", "flow", "plan.md"], (token) => token.endsWith(".md")), {
  tokens: ["auth", "flow"],
  token: "plan.md",
});
assert.deepEqual(popTrailingToken(["auth", "flow"], (token) => token.endsWith(".md")), {
  tokens: ["auth", "flow"],
  token: undefined,
});

console.log("pi-bridge-command-grammar ok");
