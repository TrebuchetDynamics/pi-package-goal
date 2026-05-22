#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log("Usage: pi-log-audit.mjs [--attention-only] [ROOT]");
  console.log("Read-only summary of .pi/*/logs.jsonl files under ROOT.");
  process.exit(0);
}

const root = path.resolve(options.rootArg ?? process.cwd());
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Root directory not found: ${root}`);
  const suggestion = findClosestExistingSibling(root);
  if (suggestion) console.error(`Did you mean: ${suggestion}`);
  process.exit(2);
}

const ignoredDirs = new Set([".git", "node_modules"]);

function parseArgs(args) {
  const parsed = { attentionOnly: false, help: false, rootArg: undefined };
  for (const arg of args) {
    if (["-h", "--help"].includes(arg)) {
      parsed.help = true;
    } else if (arg === "--attention-only") {
      parsed.attentionOnly = true;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    } else if (!parsed.rootArg) {
      parsed.rootArg = arg;
    } else {
      console.error(`Unexpected extra root path: ${arg}`);
      process.exit(2);
    }
  }
  return parsed;
}

function findClosestExistingSibling(target) {
  const parent = path.dirname(target);
  const wanted = path.basename(target);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) return undefined;

  const candidates = safeReaddir(parent)
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, distance: editDistance(wanted, entry.name) }))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
  const best = candidates[0];
  if (!best || best.distance > Math.max(3, Math.ceil(wanted.length / 3))) return undefined;
  return path.join(parent, best.name);
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function findPiDirs(dir, out = []) {
  for (const entry of safeReaddir(dir)) {
    if (!entry.isDirectory()) continue;
    if (ignoredDirs.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.name === ".pi") {
      out.push(full);
      continue;
    }

    findPiDirs(full, out);
  }
  return out;
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function parseJsonl(file) {
  const text = fs.readFileSync(file, "utf8");
  const events = [];
  let badJson = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      badJson += 1;
    }
  }

  return { events, badJson, lineCount: events.length + badJson };
}

function findLoopLogs(piDir) {
  return safeReaddir(piDir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ loopName: entry.name, logPath: path.join(piDir, entry.name, "logs.jsonl") }))
    .filter(({ logPath }) => fs.existsSync(logPath) && fs.statSync(logPath).isFile())
    .sort((a, b) => a.loopName.localeCompare(b.loopName));
}

function formatValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replace(/\s+/g, " ").slice(0, 180);
}

function isBlockedEvent(event) {
  const eventName = String(event.event ?? "").toLowerCase();
  const phase = String(event.phase ?? "").toLowerCase();
  const reason = String(event.reason ?? "").toLowerCase();
  const decision = String(event.decision ?? "").toLowerCase();
  return eventName.includes("blocked") || phase === "blocked" || decision === "blocked" || reason.includes("blocked");
}

function isFailureEvent(event) {
  const eventName = String(event.event ?? "").toLowerCase();
  const reason = String(event.reason ?? "").toLowerCase();
  return isBlockedEvent(event) || eventName.includes("failed") || reason.includes("error");
}

function classifyStatus(latest, badJson) {
  const eventName = String(latest.event ?? "").toLowerCase();
  const phase = String(latest.phase ?? "").toLowerCase();
  const decision = String(latest.decision ?? "").toLowerCase();

  if (isBlockedEvent(latest)) return "blocked";
  if (badJson > 0 || isFailureEvent(latest)) return "needs_attention";
  if (phase === "done" || decision === "done" || eventName === "loop_finished") return "done";
  if (phase === "running" || eventName === "iteration_prompt_sent") return "running";
  if (phase === "queued" || eventName === "iteration_queued") return "queued";
  return "unknown";
}

const summary = {
  logs: 0,
  needs_attention: 0,
  blocked: 0,
  running: 0,
  queued: 0,
  done: 0,
  unknown: 0,
  issues: 0,
  badJson: 0,
  filteredOut: 0,
};

function incrementSummary(status, attention, badJson) {
  summary.logs += 1;
  if (Object.hasOwn(summary, status)) summary[status] += 1;
  else summary.unknown += 1;
  if (attention) summary.issues += 1;
  summary.badJson += badJson;
  if (options.attentionOnly && !attention) summary.filteredOut += 1;
}

function buildLogRecord(loopName, logPath) {
  const { events, badJson, lineCount } = parseJsonl(logPath);
  const latest = events.at(-1) ?? {};
  const failures = events.filter(isFailureEvent);
  const lastFailure = failures.at(-1);
  const status = classifyStatus(latest, badJson);
  const attention = status === "needs_attention" || Boolean(lastFailure) || badJson > 0;
  const size = fs.statSync(logPath).size;
  incrementSummary(status, attention, badJson);
  return { loopName, events, badJson, lineCount, latest, lastFailure, status, attention, size };
}

function printLogRecord(record, repoDir) {
  console.log([
    "LOG",
    record.loopName,
    repoDir,
    `lines=${record.lineCount}`,
    `parsed=${record.events.length}`,
    `bad_json=${record.badJson}`,
    `bytes=${record.size}`,
    `at=${formatValue(record.latest.at)}`,
    `latest=${formatValue(record.latest.event)}`,
    `iteration=${formatValue(record.latest.iteration)}/${formatValue(record.latest.maxIterations)}`,
    `phase=${formatValue(record.latest.phase)}`,
    `decision=${formatValue(record.latest.decision)}`,
    `status=${record.status}`,
    `attention=${record.attention ? "yes" : "no"}`,
  ].join("\t"));

  if (record.lastFailure) {
    console.log([
      "ISSUE",
      record.loopName,
      repoDir,
      `failure=${formatValue(record.lastFailure.event)}`,
      `reason=${formatValue(record.lastFailure.reason)}`,
    ].join("\t"));
  }
}

const piDirs = findPiDirs(root).sort();
console.log(`PI_DIR_COUNT ${piDirs.length}`);

for (const piDir of piDirs) {
  const repoDir = path.dirname(piDir);
  const logs = findLoopLogs(piDir);
  const records = logs.map(({ loopName, logPath }) => buildLogRecord(loopName, logPath));
  const visibleRecords = options.attentionOnly ? records.filter((record) => record.attention) : records;
  if (options.attentionOnly && visibleRecords.length === 0) continue;

  const configNames = ["development-loop.json", "e2e-loop.json"].filter((name) => fs.existsSync(path.join(piDir, name)));
  const loopNames = (options.attentionOnly ? visibleRecords : records).map((record) => record.loopName);
  console.log(`PI_DIR\t${repoDir}\tlogs=${loopNames.join(",") || "-"}\tconfigs=${configNames.join(",") || "-"}`);

  for (const record of visibleRecords) {
    printLogRecord(record, repoDir);
  }
}

const summaryParts = [
  "SUMMARY",
  `logs=${summary.logs}`,
  `needs_attention=${summary.needs_attention}`,
  `blocked=${summary.blocked}`,
  `running=${summary.running}`,
  `queued=${summary.queued}`,
  `done=${summary.done}`,
  `unknown=${summary.unknown}`,
  `issues=${summary.issues}`,
  `bad_json=${summary.badJson}`,
];
if (options.attentionOnly) summaryParts.push(`filtered_out=${summary.filteredOut}`);
console.log(summaryParts.join("\t"));
