#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log("Usage: pi-log-audit.mjs [--attention-only] [ROOT]");
  console.log("Read-only summary of .pi/*/logs.jsonl files under ROOT.");
  console.log("Includes development-loop, e2e-loop, and custom *-loop logs/configs.");
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

function findLoopConfigs(piDir) {
  return safeReaddir(piDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith("-loop.json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
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
  logsWithoutConfigs: 0,
  filteredOut: 0,
  piDirs: 0,
  piDirsWithoutLogs: 0,
  piDirsWithConfigsWithoutLogs: 0,
  configFiles: 0,
};

function incrementSummary(status, attention, badJson, missingConfig) {
  summary.logs += 1;
  if (Object.hasOwn(summary, status)) summary[status] += 1;
  else summary.unknown += 1;
  if (attention) summary.issues += 1;
  summary.badJson += badJson;
  if (missingConfig) summary.logsWithoutConfigs += 1;
  if (options.attentionOnly && !attention) summary.filteredOut += 1;
}

function incrementPiDirSummary(logCount, configCount) {
  summary.piDirs += 1;
  if (logCount === 0) summary.piDirsWithoutLogs += 1;
  if (logCount === 0 && configCount > 0) {
    summary.piDirsWithConfigsWithoutLogs += 1;
    summary.issues += 1;
  }
  summary.configFiles += configCount;
}

function needsAttention(status, lastFailure, badJson, missingConfig) {
  if (badJson > 0) return true;
  if (missingConfig) return true;
  if (["blocked", "needs_attention"].includes(status)) return true;
  return status !== "done" && Boolean(lastFailure);
}

function findLastAt(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.at) return events[index].at;
  }
  return undefined;
}

function buildLogRecord(loopName, logPath, hasMatchingConfig) {
  const { events, badJson, lineCount } = parseJsonl(logPath);
  const latest = events.at(-1) ?? {};
  const failures = events.filter(isFailureEvent);
  const lastFailure = failures.at(-1);
  const lastAt = findLastAt(events);
  const status = classifyStatus(latest, badJson);
  const missingConfig = !hasMatchingConfig;
  const attention = needsAttention(status, lastFailure, badJson, missingConfig);
  const stats = fs.statSync(logPath);
  const size = stats.size;
  const mtime = stats.mtime.toISOString();
  const matchingConfigName = `${loopName}.json`;
  incrementSummary(status, attention, badJson, missingConfig);
  return { loopName, events, badJson, lineCount, latest, lastFailure, lastAt, status, attention, size, mtime, matchingConfigName, missingConfig };
}

function printPiConfigIssue(configNames, repoDir) {
  console.log([
    "ISSUE",
    ".pi-config",
    repoDir,
    `configs=${configNames.join(",")}`,
    "reason=config files present but no loop logs",
  ].join("\t"));
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
    `last_at=${formatValue(record.lastAt)}`,
    `mtime=${formatValue(record.mtime)}`,
    `latest=${formatValue(record.latest.event)}`,
    `iteration=${formatValue(record.latest.iteration)}/${formatValue(record.latest.maxIterations)}`,
    `phase=${formatValue(record.latest.phase)}`,
    `decision=${formatValue(record.latest.decision)}`,
    `status=${record.status}`,
    `config=${record.missingConfig ? "missing" : "present"}`,
    `attention=${record.attention ? "yes" : "no"}`,
  ].join("\t"));

  if (record.lastFailure) {
    console.log([
      record.attention ? "ISSUE" : "HISTORY",
      record.loopName,
      repoDir,
      `failure=${formatValue(record.lastFailure.event)}`,
      `reason=${formatValue(record.lastFailure.reason)}`,
    ].join("\t"));
  }

  if (record.missingConfig) {
    console.log([
      "ISSUE",
      record.loopName,
      repoDir,
      `missing_config=.pi/${record.matchingConfigName}`,
      "reason=log directory has no matching loop config",
    ].join("\t"));
  }
}

const piDirs = findPiDirs(root).sort();
console.log(`PI_DIR_COUNT ${piDirs.length}`);

for (const piDir of piDirs) {
  const repoDir = path.dirname(piDir);
  const logs = findLoopLogs(piDir);
  const configNames = findLoopConfigs(piDir);
  const configNameSet = new Set(configNames);
  const configOnlyIssue = logs.length === 0 && configNames.length > 0;
  incrementPiDirSummary(logs.length, configNames.length);

  const records = logs.map(({ loopName, logPath }) => buildLogRecord(loopName, logPath, configNameSet.has(`${loopName}.json`)));
  const visibleRecords = options.attentionOnly ? records.filter((record) => record.attention) : records;
  if (options.attentionOnly && visibleRecords.length === 0 && !configOnlyIssue) continue;

  const loopNames = (options.attentionOnly ? visibleRecords : records).map((record) => record.loopName);
  console.log(`PI_DIR\t${repoDir}\tlogs=${loopNames.join(",") || "-"}\tconfigs=${configNames.join(",") || "-"}`);

  if (configOnlyIssue) {
    printPiConfigIssue(configNames, repoDir);
  }

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
  `logs_without_configs=${summary.logsWithoutConfigs}`,
];
if (options.attentionOnly) summaryParts.push(`filtered_out=${summary.filteredOut}`);
summaryParts.push(
  `pi_dirs=${summary.piDirs}`,
  `pi_dirs_without_logs=${summary.piDirsWithoutLogs}`,
  `pi_dirs_with_configs_without_logs=${summary.piDirsWithConfigsWithoutLogs}`,
  `config_files=${summary.configFiles}`,
);
console.log(summaryParts.join("\t"));
