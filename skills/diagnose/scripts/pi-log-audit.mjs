#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rootArg = process.argv[2] ?? process.cwd();

if (["-h", "--help"].includes(rootArg)) {
  console.log("Usage: pi-log-audit.mjs [ROOT]");
  console.log("Read-only summary of .pi/*/logs.jsonl files under ROOT.");
  process.exit(0);
}

const root = path.resolve(rootArg);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Root directory not found: ${root}`);
  process.exit(2);
}

const ignoredDirs = new Set([".git", "node_modules"]);

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

function isFailureEvent(event) {
  const eventName = String(event.event ?? "").toLowerCase();
  const phase = String(event.phase ?? "").toLowerCase();
  const reason = String(event.reason ?? "").toLowerCase();
  return eventName.includes("failed") || eventName.includes("blocked") || phase === "blocked" || reason.includes("error");
}

const piDirs = findPiDirs(root).sort();
console.log(`PI_DIR_COUNT ${piDirs.length}`);

for (const piDir of piDirs) {
  const repoDir = path.dirname(piDir);
  const logs = findLoopLogs(piDir);
  const configNames = ["development-loop.json", "e2e-loop.json"].filter((name) => fs.existsSync(path.join(piDir, name)));
  console.log(`PI_DIR\t${repoDir}\tlogs=${logs.map((item) => item.loopName).join(",") || "-"}\tconfigs=${configNames.join(",") || "-"}`);

  for (const { loopName, logPath } of logs) {
    const { events, badJson, lineCount } = parseJsonl(logPath);
    const latest = events.at(-1) ?? {};
    const failures = events.filter(isFailureEvent);
    const lastFailure = failures.at(-1);
    const size = fs.statSync(logPath).size;

    console.log([
      "LOG",
      loopName,
      repoDir,
      `lines=${lineCount}`,
      `parsed=${events.length}`,
      `bad_json=${badJson}`,
      `bytes=${size}`,
      `at=${formatValue(latest.at)}`,
      `latest=${formatValue(latest.event)}`,
      `iteration=${formatValue(latest.iteration)}/${formatValue(latest.maxIterations)}`,
      `phase=${formatValue(latest.phase)}`,
      `decision=${formatValue(latest.decision)}`,
    ].join("\t"));

    if (lastFailure) {
      console.log([
        "ISSUE",
        loopName,
        repoDir,
        `failure=${formatValue(lastFailure.event)}`,
        `reason=${formatValue(lastFailure.reason)}`,
      ].join("\t"));
    }
  }
}
