#!/usr/bin/env node
// Fake `pi --mode rpc` for txservice tests: echoes a canned event per prompt.
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let cmd;
  try {
    cmd = JSON.parse(line);
  } catch {
    return;
  }
  if (cmd.type === "prompt") {
    process.stdout.write(
      `${JSON.stringify({ type: "event", data: { type: "message", role: "assistant", text: `fake reply to: ${cmd.message}` } })}\n`,
    );
    if (cmd.id)
      process.stdout.write(
        `${JSON.stringify({ type: "response", id: cmd.id, ok: true })}\n`,
      );
  }
});
