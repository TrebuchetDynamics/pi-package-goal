import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const root = path.resolve(new URL(".", import.meta.url).pathname);
const repo = path.resolve(root, "../../..");
const image = "node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c";
const piCli = fs.realpathSync(execFileSync("sh", ["-lc", "command -v pi"], { encoding: "utf8" }).trim());
const piDir = path.resolve(path.dirname(piCli), "..");
const sequence = [
  ["f1-skill-authoring", "off"], ["f1-skill-authoring", "on"],
  ["f2-diagnose", "on"], ["f2-diagnose", "off"],
  ["f3-bug-harvest", "off"], ["f3-bug-harvest", "on"],
  ["f4-ponytail", "on"], ["f4-ponytail", "off"],
  ["f5-review-feedback", "off"], ["f5-review-feedback", "on"],
  ["f6-ui-redesign", "on"], ["f6-ui-redesign", "off"],
];
const ledgerPath = path.join(root, "ledger.json");
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : { ceilingUsd: 10, maxCalls: 12, calls: [] };
const index = ledger.calls.length;
if (index >= sequence.length) throw new Error("all 12 calls already recorded");
const [fixtureId, condition] = sequence[index];
const expectedArg = `${fixtureId}-${condition}`;
if (process.argv[2] !== expectedArg) throw new Error(`next cell is ${expectedArg}`);
const spent = ledger.calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
const remainingIncludingThis = sequence.length - index;
if (spent + remainingIncludingThis * 0.78 > ledger.ceilingUsd + 1e-9) throw new Error("worst-case aggregate would exceed US$10 ceiling");

const auth = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".pi/agent/auth.json"), "utf8"));
const key = auth?.openrouter?.key;
if (!key) throw new Error("OpenRouter credential unavailable");
const modelList = execFileSync("docker", [
  "run", "--rm", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--network", "none", "--env", "OPENROUTER_API_KEY", "--env", "HOME=/config", "--mount", `type=bind,src=${path.join(root, "container-home")},dst=/config,readonly`,
  "--mount", `type=bind,src=${piDir},dst=/opt/pi,readonly`, image,
  "node", "/opt/pi/dist/cli.js", "--offline", "--list-models", "openai/gpt-5.4-mini",
], { encoding: "utf8", env: { ...process.env, OPENROUTER_API_KEY: key } });
if (!/^openrouter\s+openai\/gpt-5\.4-mini\s+400K\s+128K\s+yes\s+yes\s*$/m.test(modelList)) throw new Error("exact OpenRouter model metadata unavailable");

const callNumber = index + 1;
const runName = `${String(callNumber).padStart(2, "0")}-${fixtureId}-${condition}`;
const runDir = path.join(root, "runs", runName);
if (fs.existsSync(runDir)) throw new Error(`run directory already exists: ${runName}`);
fs.mkdirSync(runDir, { recursive: true });
const fixtureDir = path.join(runDir, "fixture");
fs.cpSync(path.join(root, "templates", fixtureId), fixtureDir, { recursive: true });
const record = { callNumber, fixtureId, condition, provider: "openrouter", model: "openai/gpt-5.4-mini", status: "started", startedAt: new Date().toISOString(), costUsd: null };
ledger.calls.push(record);
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");

const prompt = path.join(root, "prompts", `${fixtureId}-${condition}.txt`);
const args = [
  "run", "--rm", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--pids-limit", "256", "--memory", "2g", "--network", "bridge",
  "--env", "OPENROUTER_API_KEY", "--env", "HOME=/config", "--env", "PI_OFFLINE=1",
  "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
  "--mount", `type=bind,src=${path.join(root, "container-home")},dst=/config,readonly`,
  "--mount", `type=bind,src=${piDir},dst=/opt/pi,readonly`,
  "--mount", `type=bind,src=${fixtureDir},dst=/work`,
  "--mount", `type=bind,src=${path.join(root, "package-snapshot", "skills")},dst=/skills,readonly`,
  "--mount", `type=bind,src=${path.join(root, "single-request-constraints.md")},dst=/constraints.md,readonly`,
  "--mount", `type=bind,src=${prompt},dst=/prompt.txt,readonly`,
  "--workdir", "/work", image,
  "node", "/opt/pi/dist/cli.js",
  "--provider", "openrouter", "--model", "openai/gpt-5.4-mini", "--thinking", "low",
  "--mode", "json", "--print", "--no-session", "--no-extensions", "--no-prompt-templates",
  "--no-context-files", "--no-skills", "--no-tools", "--no-approve",
  "--append-system-prompt", "/constraints.md", "@/prompt.txt",
];
const proc = spawnSync("docker", args, {
  cwd: repo,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: 15 * 60 * 1000,
  env: { ...process.env, OPENROUTER_API_KEY: key },
});
fs.writeFileSync(path.join(runDir, "events.jsonl"), proc.stdout ?? "");
fs.writeFileSync(path.join(runDir, "stderr.log"), proc.stderr ?? "");
record.exitStatus = proc.status;
record.signal = proc.signal;
record.finishedAt = new Date().toISOString();
if (proc.error) record.processError = proc.error.message;

const events = [];
for (const line of (proc.stdout ?? "").split(/\r?\n/).filter(Boolean)) {
  try { events.push(JSON.parse(line)); } catch { record.parseError = `non-JSON output: ${line.slice(0, 120)}`; break; }
}
const retries = events.filter((event) => event.type === "auto_retry_start");
const assistantEnds = events.filter((event) => event.type === "message_end" && event.message?.role === "assistant");
record.assistantResponses = assistantEnds.length;
record.retryEvents = retries.length;
const response = assistantEnds[0]?.message;
const usage = response?.usage;
if (usage) {
  record.usage = { input: usage.input ?? 0, output: usage.output ?? 0, cacheRead: usage.cacheRead ?? 0, cacheWrite: usage.cacheWrite ?? 0 };
  record.costUsd = usage.cost?.total ?? ((record.usage.input * 0.75 + record.usage.output * 4.5 + record.usage.cacheRead * 0.075) / 1_000_000);
}
const text = Array.isArray(response?.content) ? response.content.filter((part) => part.type === "text").map((part) => part.text).join("") : "";
fs.writeFileSync(path.join(runDir, "assistant.txt"), text);
const responseError = response?.stopReason === "error" || Boolean(response?.errorMessage);
if (responseError) record.error = String(response.errorMessage ?? "provider error").replace(/keys\/[a-f0-9]+/g, "keys/<redacted-key-id>");
record.status = proc.status === 0 && !record.parseError && !responseError && retries.length === 0 && assistantEnds.length === 1 && Number.isFinite(record.costUsd) && (response?.usage?.totalTokens ?? 0) > 0 ? "completed" : "stopped";
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
if (record.status !== "completed") throw new Error(`cell stopped: exit=${proc.status} responses=${assistantEnds.length} retries=${retries.length} parse=${record.parseError ?? "ok"}`);
if (record.costUsd > 0.78 + 1e-9) throw new Error(`per-call metadata ceiling exceeded: ${record.costUsd}`);
const total = ledger.calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
if (total > ledger.ceilingUsd + 1e-9) throw new Error(`aggregate ceiling exceeded: ${total}`);
console.log(JSON.stringify({ callNumber, cell: expectedArg, costUsd: record.costUsd, aggregateCostUsd: total, usage: record.usage }));
