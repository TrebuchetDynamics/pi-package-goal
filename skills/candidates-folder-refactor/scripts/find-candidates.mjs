#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ignoredDirs = new Set([
  ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "coverage", ".next", ".nuxt", ".turbo",
  ".cache", ".parcel-cache", ".pi", ".understand-anything", "target", "out", "tmp", "temp",
]);
const ignoredFileExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf", ".zip", ".gz", ".tgz", ".lock"]);
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php"];
const rolePatterns = [
  /api|route|controller|handler/i,
  /component|view|page|screen|ui/i,
  /service|client|adapter|gateway/i,
  /model|schema|type|entity/i,
  /util|helper|common|shared/i,
  /test|spec|fixture|mock/i,
  /style|css|theme/i,
  /hook|store|state|context/i,
  /config|constant|env/i,
];

const options = parseArgs(process.argv.slice(2));
const root = path.resolve(process.cwd(), options.targetArg);
const logDir = path.join(root, ".pi", "candidates-folder-refactor");
const latestLog = path.join(logDir, "latest.json");
const runsLog = path.join(logDir, "runs.jsonl");

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Target must be an existing directory: ${options.targetArg}`);
  process.exit(1);
}

if (options.fromLog) {
  if (!fs.existsSync(latestLog)) {
    console.error(`No candidates-folder-refactor log found at ${latestLog}`);
    process.exit(1);
  }
  printReport(JSON.parse(fs.readFileSync(latestLog, "utf8")), { fromLog: true });
  process.exit(0);
}

const refactorIgnore = loadRefactorIgnore(root, process.cwd());
const statsByDir = new Map();
const fileSet = new Set();
const fileContents = new Map();

function parseArgs(args) {
  let top = 5;
  let fromLog = false;
  let writeLog = true;
  let targetArg = ".";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--top") {
      top = Math.max(1, Number(args[index + 1]) || 5);
      index += 1;
    } else if (arg === "--from-log" || arg === "--cache" || arg === "--cached") {
      fromLog = true;
    } else if (arg === "--no-log") {
      writeLog = false;
    } else if (!arg.startsWith("--")) {
      targetArg = arg;
    }
  }
  return { top, fromLog, writeLog, targetArg };
}

function ensure(dir) {
  if (!statsByDir.has(dir)) {
    statsByDir.set(dir, {
      dir,
      totalFiles: 0,
      directFiles: 0,
      testFiles: 0,
      childDirs: new Set(),
      extensions: new Set(),
      roles: new Set(),
      maxDepth: 0,
      files: [],
      inboundCallers: new Set(),
      outboundImports: new Set(),
      churn: 0,
      duplicateBasenames: 0,
      duplicateSymbols: 0,
    });
  }
  return statsByDir.get(dir);
}

function shouldIgnoreDir(name) {
  return ignoredDirs.has(name) || name.startsWith(".") && name !== ".github";
}

function loadRefactorIgnore(scanRoot, cwd) {
  const files = [...new Set([path.join(cwd, ".refactorignore"), path.join(scanRoot, ".refactorignore")])];
  const rules = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const base = path.dirname(file);
    for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const negate = line.startsWith("!");
      if (negate) line = line.slice(1).trim();
      if (!line) continue;
      const dirOnly = line.endsWith("/");
      line = line.replace(/^\.\//, "").replace(/^\//, "").replace(/\/$/, "");
      if (!line) continue;
      rules.push({ base, pattern: line.split(path.sep).join("/"), negate, dirOnly, hasSlash: line.includes("/"), regex: globRegex(line.split(path.sep).join("/")) });
    }
  }
  return rules;
}

function globRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isRefactorIgnored(full, isDir) {
  let ignored = false;
  for (const rule of refactorIgnore) {
    if (rule.dirOnly && !isDir) continue;
    const rel = path.relative(rule.base, full).split(path.sep).join("/");
    if (!rel || rel.startsWith("../") || path.isAbsolute(rel)) continue;
    const segments = rel.split("/");
    const matched = rule.hasSlash
      ? rule.regex.test(rel) || rel.startsWith(`${rule.pattern}/`)
      : segments.some((segment, index) => rule.regex.test(segment) || isDir && index === segments.length - 1 && rule.regex.test(segment));
    if (matched) ignored = !rule.negate;
  }
  return ignored;
}

function noteRoles(stat, relativeFile) {
  for (let index = 0; index < rolePatterns.length; index += 1) {
    if (rolePatterns[index].test(relativeFile)) stat.roles.add(index);
  }
}

function isLikelyTest(file) {
  return /(^|[/\\])(__tests__|test|tests|spec|fixtures?|mocks?)([/\\]|$)|\.(test|spec)\.[cm]?[jt]sx?$/i.test(file);
}

function isTextSource(ext) {
  return sourceExtensions.includes(ext) || [".json", ".md", ".yml", ".yaml", ".toml"].includes(ext);
}

function walk(dir) {
  const stat = ensure(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name) || isRefactorIgnored(full, true)) continue;
      stat.childDirs.add(full);
      walk(full);
      continue;
    }
    if (!entry.isFile() || isRefactorIgnored(full, false)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ignoredFileExtensions.has(ext)) continue;
    stat.directFiles += 1;
    fileSet.add(full);
    if (isTextSource(ext)) {
      try {
        const content = fs.readFileSync(full, "utf8");
        if (!content.includes("\u0000")) fileContents.set(full, content);
      } catch {
        // Ignore unreadable files; the structural score still works.
      }
    }
    for (let current = dir; current.startsWith(root); current = path.dirname(current)) {
      const currentStat = ensure(current);
      const relativeFile = path.relative(current, full);
      const depth = relativeFile.split(path.sep).length - 1;
      currentStat.totalFiles += 1;
      currentStat.files.push(full);
      currentStat.maxDepth = Math.max(currentStat.maxDepth, depth);
      if (isLikelyTest(relativeFile)) currentStat.testFiles += 1;
      if (ext) currentStat.extensions.add(ext);
      noteRoles(currentStat, relativeFile);
      if (current === root) break;
    }
  }
}

walk(root);
addGitChurn();
addImportEvidence();
addDuplicateEvidence();

function addGitChurn() {
  const gitRoot = gitRootFor(root);
  if (!gitRoot) return;
  let output = "";
  try {
    output = execFileSync("git", ["-C", gitRoot, "log", "--since=180 days ago", "--name-only", "--pretty=format:"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return;
  }
  const changedFiles = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const changedFile of changedFiles) {
    const absoluteFile = path.resolve(gitRoot, changedFile);
    if (!absoluteFile.startsWith(root)) continue;
    for (let current = path.dirname(absoluteFile); current.startsWith(root); current = path.dirname(current)) {
      ensure(current).churn += 1;
      if (current === root) break;
    }
  }
}

function gitRootFor(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function addImportEvidence() {
  for (const [fromFile, content] of fileContents) {
    if (!sourceExtensions.includes(path.extname(fromFile).toLowerCase())) continue;
    for (const specifier of relativeImportSpecifiers(content)) {
      const target = resolveRelativeImport(fromFile, specifier);
      if (!target) continue;
      for (const stat of statsByDir.values()) {
        if (stat.dir === root) continue;
        const fromInside = isInside(fromFile, stat.dir);
        const toInside = isInside(target, stat.dir);
        if (!fromInside && toInside) stat.inboundCallers.add(fromFile);
        if (fromInside && !toInside) stat.outboundImports.add(target);
      }
    }
  }
}

function relativeImportSpecifiers(content) {
  const specs = [];
  const patterns = [
    /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g,
    /(?:require|import)\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...sourceExtensions.map((ext) => `${base}${ext}`), ...sourceExtensions.map((ext) => path.join(base, `index${ext}`))];
  return candidates.find((candidate) => fileSet.has(candidate));
}

function addDuplicateEvidence() {
  for (const stat of statsByDir.values()) {
    const basenames = new Map();
    const symbols = new Map();
    for (const file of stat.files) {
      const base = path.basename(file, path.extname(file)).toLowerCase();
      basenames.set(base, (basenames.get(base) ?? 0) + 1);
      const content = fileContents.get(file) ?? "";
      for (const symbol of symbolsIn(content)) symbols.set(symbol, (symbols.get(symbol) ?? 0) + 1);
    }
    stat.duplicateBasenames = [...basenames.values()].filter((count) => count > 1).length;
    stat.duplicateSymbols = [...symbols.values()].filter((count) => count > 1).length;
  }
}

function symbolsIn(content) {
  const symbols = [];
  const patterns = [
    /\b(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bdef\s+([A-Za-z_]\w*)/g,
    /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) symbols.push(match[1].toLowerCase());
  }
  return symbols;
}

function isInside(file, dir) {
  const relative = path.relative(dir, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function score(stat) {
  const testGap = stat.totalFiles >= 8 && stat.testFiles === 0 ? 10 : 0;
  return stat.totalFiles
    + stat.directFiles * 1.5
    + stat.childDirs.size * 4
    + stat.extensions.size * 5
    + stat.roles.size * 7
    + stat.maxDepth * 3
    + Math.min(stat.churn, 30) * 1.2
    + stat.inboundCallers.size * 4
    + stat.outboundImports.size * 2
    + stat.duplicateBasenames * 5
    + stat.duplicateSymbols * 6
    + testGap;
}

const candidates = [...statsByDir.values()]
  .filter((stat) => stat.dir !== root)
  .filter((stat) => stat.totalFiles >= 4 || stat.directFiles >= 3 || stat.childDirs.size >= 3)
  .map((stat) => serializeCandidate({ ...stat, score: score(stat), relative: path.relative(process.cwd(), stat.dir) || "." }))
  .sort((a, b) => b.score - a.score || b.files - a.files || a.relative.localeCompare(b.relative))
  .slice(0, options.top);

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  cwd: process.cwd(),
  target: path.relative(process.cwd(), root) || ".",
  targetAbsolute: root,
  command: `node ${path.relative(process.cwd(), process.argv[1]) || process.argv[1]} ${process.argv.slice(2).join(" ")}`.trim(),
  candidates,
};

if (options.writeLog) writeScanLog(report);
printReport(report, { fromLog: false, latestLog: options.writeLog ? latestLog : undefined });

function serializeCandidate(candidate) {
  return {
    relative: candidate.relative,
    score: Number(candidate.score.toFixed(1)),
    files: candidate.totalFiles,
    direct: candidate.directFiles,
    churn: candidate.churn,
    callers: candidate.inboundCallers.size,
    importsOut: candidate.outboundImports.size,
    tests: candidate.testFiles,
    roles: candidate.roles.size,
    duplicates: candidate.duplicateBasenames + candidate.duplicateSymbols,
    subdirs: candidate.childDirs.size,
    extensions: [...candidate.extensions].sort().slice(0, 6),
  };
}

function writeScanLog(report) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(latestLog, `${JSON.stringify(report, null, 2)}\n`);
  fs.appendFileSync(runsLog, `${JSON.stringify(report)}\n`);
}

function printReport(report, { fromLog, latestLog } = {}) {
  console.log(`Candidates folder refactor: ${report.target}`);
  if (fromLog) console.log(`From log: ${report.generatedAt} (${path.join(report.targetAbsolute, ".pi", "candidates-folder-refactor", "latest.json")})`);
  if (!report.candidates.length) {
    console.log("No candidate subfolders found.");
    return;
  }
  for (const [index, candidate] of report.candidates.entries()) {
    const extList = candidate.extensions.join(", ") || "none";
    console.log(`${index + 1}. ${candidate.relative} — score ${candidate.score.toFixed(1)}; files ${candidate.files}; churn ${candidate.churn}; callers ${candidate.callers}; imports-out ${candidate.importsOut}; tests ${candidate.tests}; roles ${candidate.roles}; duplicates ${candidate.duplicates}; subdirs ${candidate.subdirs}; extensions ${extList}`);
  }
  if (latestLog) console.log(`Log: ${latestLog}`);
}
