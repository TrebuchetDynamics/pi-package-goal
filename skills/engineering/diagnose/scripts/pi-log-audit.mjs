#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log("Usage: pi-log-audit.mjs [--attention-only] [--since=2h|ISO] [ROOT]");
  console.log("Read-only summary of .pi/*/logs.jsonl files under ROOT.");
  console.log("Includes development-goal, e2e-goal, and custom *-goal logs/configs.");
  console.log("Use --since=2h or --since=2026-05-22T02:30:00.000Z to summarize only timestamped records at or after the cutoff.");
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
  const parsed = { attentionOnly: false, help: false, rootArg: undefined, since: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (["-h", "--help"].includes(arg)) {
      parsed.help = true;
    } else if (arg === "--attention-only") {
      parsed.attentionOnly = true;
    } else if (arg === "--since") {
      const value = args[index + 1];
      if (!value) failUsage("Missing value for --since");
      parsed.since = parseSinceFilter(value);
      index += 1;
    } else if (arg.startsWith("--since=")) {
      parsed.since = parseSinceFilter(arg.slice("--since=".length));
    } else if (arg.startsWith("-")) {
      failUsage(`Unknown option: ${arg}`);
    } else if (!parsed.rootArg) {
      parsed.rootArg = arg;
    } else {
      failUsage(`Unexpected extra root path: ${arg}`);
    }
  }
  return parsed;
}

function failUsage(message) {
  console.error(message);
  process.exit(2);
}

function parseSinceFilter(value, nowMs = Date.now()) {
  const text = String(value ?? "").trim();
  if (!text) failUsage("Missing value for --since");

  const duration = text.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2].toLowerCase();
    const unitMs = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
    const cutoffMs = nowMs - amount * unitMs;
    return { label: text, cutoffMs, cutoffIso: new Date(cutoffMs).toISOString() };
  }

  const cutoffMs = Date.parse(text);
  if (!Number.isFinite(cutoffMs)) failUsage(`Invalid --since value: ${text}`);
  return { label: text, cutoffMs, cutoffIso: new Date(cutoffMs).toISOString() };
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

function filterEventsBySince(events) {
  if (!options.since) return { events, sinceFiltered: 0 };
  const filtered = [];
  let sinceFiltered = 0;
  for (const event of events) {
    const timestampMs = eventTimestampMs(event);
    if (timestampMs !== undefined && timestampMs >= options.since.cutoffMs) filtered.push(event);
    else sinceFiltered += 1;
  }
  return { events: filtered, sinceFiltered };
}

function eventTimestampMs(event) {
  const value = event?.at ?? event?.timestamp;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : undefined;
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
    .filter((entry) => entry.isFile() && entry.name.endsWith("-goal.json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function readConfigDetails(piDir, configNames) {
  const details = new Map();
  for (const configName of configNames) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(piDir, configName), "utf8"));
      details.set(configName, { adapter: config.adapter, badJson: false });
    } catch {
      details.set(configName, { adapter: "bad_json", badJson: true });
    }
  }
  return details;
}

function formatValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replace(/\s+/g, " ").slice(0, 180);
}

function stringField(record, fieldName) {
  const value = record?.[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recordBlockerState(record) {
  return stringField(record, "blockerState")
    || stringField(record, "blockerReason")
    || stringField(record, "blockedReason")
    || stringField(record, "blockers");
}

function recordBlockerKind(record) {
  const text = [
    recordBlockerState(record),
    stringField(record, "reason"),
    stringField(record, "error"),
    stringField(record, "message"),
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text) return undefined;
  if (/\bgit\s+push\b/.test(text) && /(fetch-first|non[-\s]?fast[-\s]?forward|rejected|failed to push some refs|remote contains work)/.test(text)) return "git_push_fetch_first";
  if (isValidationFailedTwiceText(text)) return "validation_failed_twice";
  return undefined;
}

function isValidationFailedTwiceText(text) {
  return /\b(failed|fails|failure)\s+twice\b/.test(text) && /\b(validation|tests?|npm|flutter|pytest|cargo|mvn|gradle|assertion|check)\b/.test(text);
}

function blockerKindNextAction(blockerKind) {
  if (blockerKind === "git_push_fetch_first") return "approve fetch/rebase/merge workflow, rerun validation, then push";
  if (blockerKind === "validation_failed_twice") return "fix first failing validation failure, rerun required validation, then commit/push only after green";
  return undefined;
}

function recordNextAction(record) {
  const nextSteps = record?.nextSteps;
  if (Array.isArray(nextSteps)) {
    const firstStep = nextSteps.find((step) => typeof step === "string" && step.trim());
    if (firstStep) return firstStep.trim();
  }
  return stringField(record, "nextAction") || stringField(record, "nextStep");
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

function isProgressEvent(event) {
  const eventName = String(event.event ?? "").toLowerCase();
  const phase = String(event.phase ?? "").toLowerCase();
  const decision = String(event.decision ?? "").toLowerCase();
  return ["compaction_continue_queued_iteration", "compaction_started", "iteration_prompt_sent", "iteration_result", "loop_finished"].includes(eventName) || phase === "running" || phase === "reported" || decision === "continue" || decision === "done";
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

function isSinceWindowTerminalConfigHygiene(status, lastFailure, badJson, missingConfig, configBadJson) {
  return Boolean(options.since && status === "done" && !lastFailure && badJson === 0 && (missingConfig || configBadJson));
}

const summary = {
  logs: 0,
  needs_attention: 0,
  blocked: 0,
  running: 0,
  queued: 0,
  done: 0,
  unknown: 0,
  attentionLogs: 0,
  blockerKindRecords: 0,
  topBlockerKind: undefined,
  topBlockerKindCount: 0,
  issues: 0,
  badJson: 0,
  logsWithoutConfigs: 0,
  configBadJson: 0,
  filteredOut: 0,
  sinceFiltered: 0,
  piDirs: 0,
  piDirsWithoutLogs: 0,
  piDirsWithConfigsWithoutLogs: 0,
  configFiles: 0,
};

const blockerKindCounts = new Map();

function incrementSummary(status, attention, badJson, missingConfig, configBadJson, sinceFiltered, blockerKind) {
  summary.logs += 1;
  if (Object.hasOwn(summary, status)) summary[status] += 1;
  else summary.unknown += 1;
  if (attention) {
    summary.attentionLogs += 1;
    summary.issues += 1;
    if (blockerKind) {
      summary.blockerKindRecords += 1;
      const count = (blockerKindCounts.get(blockerKind) ?? 0) + 1;
      blockerKindCounts.set(blockerKind, count);
      if (count > summary.topBlockerKindCount) {
        summary.topBlockerKind = blockerKind;
        summary.topBlockerKindCount = count;
      }
    }
  }
  summary.badJson += badJson;
  summary.sinceFiltered += sinceFiltered;
  if (missingConfig) summary.logsWithoutConfigs += 1;
  if (configBadJson) summary.configBadJson += 1;
  if (options.attentionOnly && !attention) summary.filteredOut += 1;
}

function incrementPiDirSummary(logCount, configCount, countConfigOnlyIssue) {
  summary.piDirs += 1;
  if (logCount === 0) summary.piDirsWithoutLogs += 1;
  if (logCount === 0 && configCount > 0) {
    summary.piDirsWithConfigsWithoutLogs += 1;
    if (countConfigOnlyIssue) summary.issues += 1;
  }
  summary.configFiles += configCount;
}

function needsAttention(status, lastFailure, badJson, missingConfig, configBadJson) {
  if (badJson > 0) return true;
  if (missingConfig) return true;
  if (configBadJson) return true;
  if (["blocked", "needs_attention"].includes(status)) return true;
  return status !== "done" && Boolean(lastFailure);
}

function findLastAt(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.at) return events[index].at;
  }
  return undefined;
}

function findLastRunId(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.runId) return events[index].runId;
  }
  return undefined;
}

function findLastResult(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === "iteration_result") return events[index];
  }
  return undefined;
}

function findLastFailureIndex(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (isFailureEvent(events[index])) return index;
  }
  return -1;
}

function isRecoveredFailure(events, lastFailureIndex) {
  const latest = events.at(-1);
  return Boolean(lastFailureIndex >= 0 && lastFailureIndex < events.length - 1 && latest && !isFailureEvent(latest) && isProgressEvent(latest));
}

function buildLogRecord(loopName, logPath, hasMatchingConfig, configDetails) {
  const parsedLog = parseJsonl(logPath);
  const { events, sinceFiltered } = filterEventsBySince(parsedLog.events);
  const { badJson, lineCount } = parsedLog;
  const latest = events.at(-1) ?? {};
  const lastFailureIndex = findLastFailureIndex(events);
  const lastFailure = lastFailureIndex >= 0 ? events[lastFailureIndex] : undefined;
  const failureRecovered = isRecoveredFailure(events, lastFailureIndex);
  const effectiveLastFailure = failureRecovered ? undefined : lastFailure;
  const lastAt = findLastAt(events);
  const runId = findLastRunId(events);
  const lastResult = findLastResult(events);
  const outsideSinceWindow = Boolean(options.since && events.length === 0);
  const status = outsideSinceWindow ? "unknown" : classifyStatus(latest, badJson);
  const missingConfig = !hasMatchingConfig;
  const configAdapter = configDetails?.adapter;
  const configBadJson = Boolean(configDetails?.badJson);
  const configHygieneOnly = isSinceWindowTerminalConfigHygiene(status, effectiveLastFailure, badJson, missingConfig, configBadJson);
  const attention = outsideSinceWindow || configHygieneOnly ? false : needsAttention(status, effectiveLastFailure, badJson, missingConfig, configBadJson);
  const stats = fs.statSync(logPath);
  const size = stats.size;
  const mtime = stats.mtime.toISOString();
  const matchingConfigName = `${loopName}.json`;
  const blockerKind = attention && effectiveLastFailure ? recordBlockerKind(effectiveLastFailure) : undefined;
  incrementSummary(status, attention, outsideSinceWindow ? 0 : badJson, outsideSinceWindow || configHygieneOnly ? false : missingConfig, outsideSinceWindow || configHygieneOnly ? false : configBadJson, sinceFiltered, blockerKind);
  return { loopName, events, badJson, lineCount, sinceFiltered, outsideSinceWindow, configHygieneOnly, latest, lastFailure, lastAt, runId, lastResult, status, attention, size, mtime, matchingConfigName, missingConfig, configAdapter, configBadJson };
}

function printPiConfigIssue(configNames, repoDir) {
  console.log([
    "ISSUE",
    ".pi-config",
    repoDir,
    `configs=${configNames.join(",")}`,
    "reason=config files present but no goal logs",
    "next_action=start a goal for these configs or remove stale config files",
  ].join("\t"));
}

function printLogRecord(record, repoDir) {
  console.log([
    "LOG",
    record.loopName,
    repoDir,
    `log_path=.pi/${record.loopName}/logs.jsonl`,
    `config_path=.pi/${record.matchingConfigName}`,
    `lines=${record.lineCount}`,
    `parsed=${record.events.length}`,
    ...(options.since ? [`since_filtered=${record.sinceFiltered}`] : []),
    `bad_json=${record.badJson}`,
    `bytes=${record.size}`,
    `at=${formatValue(record.latest.at)}`,
    `last_at=${formatValue(record.lastAt)}`,
    `mtime=${formatValue(record.mtime)}`,
    `latest=${formatValue(record.latest.event)}`,
    `iteration=${formatValue(record.latest.iteration)}/${formatValue(record.latest.maxIterations)}`,
    `phase=${formatValue(record.latest.phase)}`,
    `decision=${formatValue(record.latest.decision)}`,
    `run_id=${formatValue(record.runId)}`,
    `last_result_at=${formatValue(record.lastResult?.at)}`,
    `last_decision=${formatValue(record.lastResult?.decision)}`,
    `last_commit=${formatValue(record.lastResult?.commitHash)}`,
    `last_push=${formatValue(record.lastResult?.pushStatus)}`,
    `status=${record.status}`,
    `config=${record.missingConfig ? "missing" : "present"}`,
    `adapter=${formatValue(record.configAdapter)}`,
    `attention=${record.attention ? "yes" : "no"}`,
  ].join("\t"));

  if (record.lastFailure) {
    const failureFields = [
      record.attention ? "ISSUE" : "HISTORY",
      record.loopName,
      repoDir,
      `failure=${formatValue(record.lastFailure.event)}`,
      `failure_at=${formatValue(record.lastFailure.at)}`,
      `reason=${formatValue(record.lastFailure.reason)}`,
    ];
    const blockerState = recordBlockerState(record.lastFailure);
    const blockerKind = recordBlockerKind(record.lastFailure);
    if (blockerState) failureFields.push(`blocker=${formatValue(blockerState)}`);
    if (blockerKind) failureFields.push(`blocker_kind=${formatValue(blockerKind)}`);
    if (record.attention) failureFields.push(`next_action=${formatValue(recordNextAction(record.lastFailure) || blockerKindNextAction(blockerKind) || "inspect failure reason then resume or clear the goal")}`);
    console.log(failureFields.join("\t"));
  }

  if (record.missingConfig && !record.outsideSinceWindow && !record.configHygieneOnly) {
    console.log([
      "ISSUE",
      record.loopName,
      repoDir,
      `missing_config=.pi/${record.matchingConfigName}`,
      "reason=log directory has no matching goal config",
      "next_action=restore matching goal config or archive/remove stale log directory",
    ].join("\t"));
  }

  if (record.configBadJson && !record.outsideSinceWindow && !record.configHygieneOnly) {
    console.log([
      "ISSUE",
      record.loopName,
      repoDir,
      `config=.pi/${record.matchingConfigName}`,
      "reason=matching goal config is not valid JSON",
      "next_action=repair or regenerate the goal config",
    ].join("\t"));
  }
}

const piDirs = findPiDirs(root).sort();
console.log(options.since ? `PI_DIR_COUNT ${piDirs.length}\tsince=${options.since.cutoffIso}` : `PI_DIR_COUNT ${piDirs.length}`);

for (const piDir of piDirs) {
  const repoDir = path.dirname(piDir);
  const logs = findLoopLogs(piDir);
  const configNames = findLoopConfigs(piDir);
  const configNameSet = new Set(configNames);
  const configDetails = readConfigDetails(piDir, configNames);
  const configOnlyIssue = logs.length === 0 && configNames.length > 0 && !options.since;
  incrementPiDirSummary(logs.length, configNames.length, !options.since);

  const records = logs.map(({ loopName, logPath }) => {
    const matchingConfigName = `${loopName}.json`;
    return buildLogRecord(loopName, logPath, configNameSet.has(matchingConfigName), configDetails.get(matchingConfigName));
  });
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
  `attention_logs=${summary.attentionLogs}`,
  `blocker_kind_records=${summary.blockerKindRecords}`,
  ...(summary.topBlockerKind ? [`top_blocker_kind=${summary.topBlockerKind}:${summary.topBlockerKindCount}`] : []),
  `issues=${summary.issues}`,
  `bad_json=${summary.badJson}`,
  `logs_without_configs=${summary.logsWithoutConfigs}`,
  `config_bad_json=${summary.configBadJson}`,
];
if (options.attentionOnly) summaryParts.push(`filtered_out=${summary.filteredOut}`);
if (options.since) summaryParts.push(`since=${options.since.cutoffIso}`, `since_filtered=${summary.sinceFiltered}`);
summaryParts.push(
  `pi_dirs=${summary.piDirs}`,
  `pi_dirs_without_logs=${summary.piDirsWithoutLogs}`,
  `pi_dirs_with_configs_without_logs=${summary.piDirsWithConfigsWithoutLogs}`,
  `config_files=${summary.configFiles}`,
);
console.log(summaryParts.join("\t"));
