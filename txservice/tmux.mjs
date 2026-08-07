// txservice — tx/tmux session control. Reads the tx config format directly
// and drives tmux headlessly; tx stays the interactive CLI.
// ponytail: config parser expands ~ and $VAR; full tx semantics (prefix
// matching, VAR-in-path precedence) live in tx itself, add if the app needs it.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000, ...opts }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout ?? "").toString() });
    });
  });
}

export function configPath(env = process.env) {
  return (
    env.TX_CONFIG ||
    path.join(
      env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
      "tx",
      "session.config",
    )
  );
}

function expand(value, vars) {
  let out = value.replace(/^~(?=\/|$)/, os.homedir());
  out = out.replace(/\$(\w+)/g, (_, name) => vars[name] ?? "");
  return out;
}

export function listSessions(env = process.env) {
  const file = configPath(env);
  const vars = {};
  const aliases = [];
  if (!fs.existsSync(file)) return aliases;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
      vars[key] = value;
      continue;
    }
    const dir = expand(value, vars);
    for (const alias of key.split(",")) {
      const a = alias.trim();
      if (a) aliases.push({ alias: a, dir });
    }
  }
  return aliases;
}

export async function sessionStates(env = process.env) {
  const { stdout } = await run(
    "tmux",
    ["list-sessions", "-F", "#{session_name}"],
    { env },
  );
  const running = new Set(stdout.trim() ? stdout.trim().split("\n") : []);
  return listSessions(env).map((s) => ({
    ...s,
    running: running.has(s.alias),
  }));
}

export async function startSession(alias, dir, env = process.env) {
  const target = dir || listSessions(env).find((s) => s.alias === alias)?.dir;
  if (!target)
    throw Object.assign(new Error(`no configured dir for alias '${alias}'`), {
      status: 400,
    });
  const { stdout, ok } = await run(
    "tmux",
    ["new-session", "-d", "-s", alias, "-c", target],
    { env },
  );
  if (!ok && !stdout.includes("duplicate session")) {
    throw Object.assign(
      new Error(`tmux failed: ${stdout.trim() || "unknown error"}`),
      { status: 500 },
    );
  }
}

export async function killSession(alias, env = process.env) {
  await run("tmux", ["kill-session", "-t", alias], { env });
}

export async function capturePane(alias, env = process.env) {
  const { stdout } = await run("tmux", ["capture-pane", "-t", alias, "-p"], {
    env,
  });
  return stdout;
}

export async function sendKeys(
  alias,
  keys,
  { enter = false } = {},
  env = process.env,
) {
  if (keys) await run("tmux", ["send-keys", "-t", alias, "-l", keys], { env });
  if (enter) await run("tmux", ["send-keys", "-t", alias, "Enter"], { env });
}
