// txservice — Pi agent lifecycle: spawn `pi --mode rpc` and bridge JSONL
// events to SSE clients. No runtime dependencies.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export const agents = new Map();

export class PiAgent {
  constructor({ cwd, name, provider, model, piCmd }) {
    this.id = randomUUID().slice(0, 8);
    this.clients = new Set();
    this.buffer = "";
    this.closed = false;
    const args = ["--mode", "rpc"];
    if (name) args.push("--name", name);
    if (provider) args.push("--provider", provider);
    if (model) args.push("--model", model);
    this.child = spawn(piCmd, args, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this._onData(chunk));
    this.child.stderr.on("data", (chunk) =>
      this._emit({ type: "stderr", text: chunk }),
    );
    this.child.on("error", (err) =>
      this._emit({ type: "error", error: String(err) }),
    );
    this.child.on("exit", (code, signal) => {
      this.closed = true;
      this.child = null;
      this._emit({ type: "exit", code, signal: signal ?? null });
    });
  }

  _onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this._emit({ type: "pi", line });
    }
  }

  _emit(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(data);
      } catch {}
    }
  }

  prompt(message) {
    if (this.closed || !this.child)
      throw Object.assign(new Error("agent is not running"), { status: 409 });
    this.child.stdin.write(
      `${JSON.stringify({ type: "prompt", message, streamingBehavior: "steer" })}\n`,
    );
  }

  stop() {
    if (this.child) this.child.kill();
  }
}
