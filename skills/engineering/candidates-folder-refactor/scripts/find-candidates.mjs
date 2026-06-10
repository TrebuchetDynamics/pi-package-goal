#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ignoredDirs = new Set([
  ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "coverage", ".next", ".nuxt", ".turbo",
  ".cache", ".parcel-cache", ".pi", ".understand-anything", "__pycache__", "target", "out", "tmp", "temp",
]);
const ignoredFileExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf", ".zip", ".gz", ".tgz", ".lock", ".pyc", ".pyo"]);
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".dart", ".swift", ".scala", ".c", ".cc", ".cpp", ".h", ".hpp"];
const protectedSourceFolderNames = new Set(["src", "lib", "app", "apps", "internal", "pkg", "cmd", "core", "domain", "features", "packages"]);
const flutterPlatformFolderNames = new Set(["android", "ios", "macos", "linux", "windows", "web"]);
const shallowNameOnlyHints = new Set(["external", "externals", "output", "outputs", "cache", "caches", "screenshots", "captures", "downloads"]);
const refactorIgnoreNameHints = new Set([
  "artifacts", "artifact", "logs", "log", "generated", "gen", "snapshots", "snapshot", "recordings", "recording",
  "third_party", "third-party", "thirdparty", "external", "externals", "vendor", "vendors", "deps", "dependencies",
  "fixtures", "fixture", "testdata", "golden", "goldens", "corpus", "samples", "sampledata", "cache", "caches",
  "tmp", "temp", "outputs", "output", "reports", "report", "coverage", "screenshots", "captures", "downloads", "__pycache__",
]);
const refactorIgnorePathHints = [
  /(^|[/\\])opensource[/\\](repos|projects|checkouts|clones)([/\\]|$)/i,
  /(^|[/\\])third[-_ ]?party([/\\]|$)/i,
  /(^|[/\\])vendor(ed)?([/\\]|$)/i,
  /(^|[/\\])(generated|gen|dist|build|coverage|artifacts?|logs?|fixtures?|testdata|__pycache__)([/\\]|$)/i,
];
const refactorIgnoreMarkerFiles = new Set([
  ".generated", "generated.txt", "do_not_edit", "DO_NOT_EDIT", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
]);
const refactorIgnoreArtifactExtensions = new Set([
  ".log", ".pid", ".sqlite", ".sqlite3", ".db", ".csv", ".tsv", ".wav", ".mp3", ".mp4", ".wasm", ".zip", ".7z", ".gz", ".tgz",
  ".dll", ".dylib", ".so", ".exe", ".bin", ".bak", ".tmp", ".exit", ".pyc", ".pyo", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
]);
const sourceLikeExtensions = new Set(sourceExtensions);
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
const maxContentFileBytes = positiveEnvInt("PI_CANDIDATES_FOLDER_REFACTOR_MAX_CONTENT_FILE_BYTES", 1024 * 1024);
const maxTotalContentBytes = positiveEnvInt("PI_CANDIDATES_FOLDER_REFACTOR_MAX_TOTAL_CONTENT_BYTES", 50 * 1024 * 1024);
let contentBytesRead = 0;
let skippedLargeContentFiles = 0;

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

function positiveEnvInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function parseArgs(args) {
  let top = 5;
  let fromLog = false;
  let writeLog = true;
  let targetArg = ".";
  let suggestionsLimit = 25;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--top") {
      top = Math.max(1, Number(args[index + 1]) || 5);
      index += 1;
    } else if (arg === "--suggestions") {
      const value = args[index + 1];
      suggestionsLimit = value === "all" ? Infinity : Math.max(0, Number(value) || 25);
      index += 1;
    } else if (arg === "--from-log" || arg === "--cache" || arg === "--cached") {
      fromLog = true;
    } else if (arg === "--no-log") {
      writeLog = false;
    } else if (!arg.startsWith("--")) {
      targetArg = arg;
    }
  }
  return { top, fromLog, writeLog, targetArg, suggestionsLimit };
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
  const files = [...new Set([
    path.join(cwd, ".gitignore"),
    path.join(scanRoot, ".gitignore"),
    ...nearestAncestorFiles(cwd, ".refactorignore", 20),
    ...nearestAncestorFiles(scanRoot, ".refactorignore", 20),
    ...descendantFiles(scanRoot, ".refactorignore"),
  ])];
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

function nearestAncestorFiles(start, name, maxParents) {
  const files = [];
  let current = path.resolve(start);
  for (let depth = 0; depth <= maxParents; depth += 1) {
    const file = path.join(current, name);
    if (fs.existsSync(file)) {
      files.push(file);
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return files;
}

function descendantFiles(start, name) {
  const files = [];
  walkForIgnoreFiles(path.resolve(start));
  return files;

  function walkForIgnoreFiles(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && shouldIgnoreDir(entry.name)) continue;
      if (entry.isFile() && entry.name === name) {
        files.push(full);
        continue;
      }
      if (!entry.isDirectory() || shouldIgnoreDir(entry.name)) continue;
      walkForIgnoreFiles(full);
    }
  }
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
        const fileStat = fs.statSync(full);
        if (fileStat.size > maxContentFileBytes || contentBytesRead + fileStat.size > maxTotalContentBytes) {
          skippedLargeContentFiles += 1;
        } else {
          const content = fs.readFileSync(full, "utf8");
          contentBytesRead += fileStat.size;
          if (!content.includes("\u0000")) fileContents.set(full, content);
        }
      } catch {
        // Ignore unreadable files; the structural score still works.
      }
    }
    for (let current = dir; isInsideOrEqual(current, root); current = path.dirname(current)) {
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
    if (!isInsideOrEqual(absoluteFile, root)) continue;
    for (let current = path.dirname(absoluteFile); isInsideOrEqual(current, root); current = path.dirname(current)) {
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
  for (const stat of statsByDir.values()) addDuplicateEvidenceForStat(stat);
}

function addDuplicateEvidenceForStat(stat) {
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

function isInsideOrEqual(file, dir) {
  const relative = path.relative(dir, file);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasNominationEvidence(stat) {
  return stat.directFiles > 0
    || stat.testFiles > 0
    || stat.inboundCallers.size > 0
    || stat.outboundImports.size > 0
    || [...stat.extensions].some((ext) => sourceExtensions.includes(ext));
}

function score(stat) {
  // Debt is intentionally based only on the table's progress metrics.
  // Root files are the main thing to reduce; total files are a small tie-breaker
  // so huge parents don't look clean, but churn/dups/subdirs/roles stay evidence-only.
  return stat.directFiles * 10 + Math.min(stat.totalFiles, 100) * 0.1;
}

const refactorIgnoreSuggestions = compactRefactorIgnoreSuggestions([...statsByDir.values()]
  .filter((stat) => stat.dir !== root)
  .map((stat) => suggestedRefactorIgnore(stat))
  .filter(Boolean))
  .sort((a, b) => b.confidence - a.confidence || b.files - a.files || a.path.localeCompare(b.path))
  .slice(0, options.suggestionsLimit);
const suggestedIgnorePaths = refactorIgnoreSuggestions.map((suggestion) => suggestion.path.split(path.sep).join("/"));
const gitRoot = gitRootFor(root);
const shouldNominateScanRoot = !gitRoot || path.resolve(gitRoot) !== root;

const candidates = [...statsByDir.values()]
  .filter((stat) => stat.dir !== root || shouldNominateScanRoot && stat.directFiles >= 3)
  .map((stat) => candidateStatExcludingSuggestedIgnores(stat, suggestedIgnorePaths))
  .filter((stat) => hasNominationEvidence(stat))
  .filter((stat) => stat.totalFiles >= 4 || stat.directFiles >= 3 || (stat.childDirs.size >= 3 && stat.totalFiles >= 8))
  .map((stat) => serializeCandidate({ ...stat, score: score(stat), relative: path.relative(process.cwd(), stat.dir) || "." }))
  .filter((candidate) => !isSuggestedIgnoredCandidate(candidate.relative, suggestedIgnorePaths))
  .sort((a, b) => b.score - a.score || depthOf(b.relative) - depthOf(a.relative) || a.files - b.files || a.relative.localeCompare(b.relative))
  .slice(0, options.top);

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  cwd: process.cwd(),
  target: path.relative(process.cwd(), root) || ".",
  targetAbsolute: root,
  command: `node ${path.relative(process.cwd(), process.argv[1]) || process.argv[1]} ${process.argv.slice(2).join(" ")}`.trim(),
  candidates,
  refactorIgnoreSuggestions,
  contentRead: {
    bytes: contentBytesRead,
    skippedLargeFiles: skippedLargeContentFiles,
    maxFileBytes: maxContentFileBytes,
    maxTotalBytes: maxTotalContentBytes,
  },
};

if (options.writeLog) writeScanLog(report);
printReport(report, { fromLog: false, latestLog: options.writeLog ? latestLog : undefined });

function depthOf(relative) {
  if (!relative || relative === ".") return 0;
  return relative.split(/[\\/]/).filter(Boolean).length;
}

function isSuggestedIgnoredCandidate(relative, ignoredPaths) {
  const normalized = relative.split(path.sep).join("/");
  return ignoredPaths.some((ignored) => normalized === ignored || normalized.startsWith(`${ignored}/`));
}

function candidateStatExcludingSuggestedIgnores(stat, ignoredPaths) {
  const relativeDir = path.relative(process.cwd(), stat.dir).split(path.sep).join("/");
  if (isSuggestedIgnoredCandidate(relativeDir, ignoredPaths)) return { ...stat, totalFiles: 0, directFiles: 0, childDirs: new Set(), extensions: new Set(), roles: new Set(), files: [] };
  const files = stat.files.filter((file) => !isSuggestedIgnoredCandidate(path.relative(process.cwd(), file), ignoredPaths));
  if (files.length === stat.files.length) return stat;
  const next = {
    ...stat,
    totalFiles: files.length,
    directFiles: 0,
    testFiles: 0,
    childDirs: new Set(),
    extensions: new Set(),
    roles: new Set(),
    maxDepth: 0,
    files,
  };
  for (const file of files) {
    const relativeFile = path.relative(stat.dir, file);
    const firstPart = relativeFile.split(path.sep)[0];
    if (path.dirname(file) === stat.dir) next.directFiles += 1;
    else if (firstPart) next.childDirs.add(path.join(stat.dir, firstPart));
    const ext = path.extname(file).toLowerCase();
    if (ext) next.extensions.add(ext);
    if (isLikelyTest(relativeFile)) next.testFiles += 1;
    next.maxDepth = Math.max(next.maxDepth, relativeFile.split(path.sep).length - 1);
    noteRoles(next, relativeFile);
  }
  addDuplicateEvidenceForStat(next);
  return next;
}

function suggestedRefactorIgnore(stat) {
  const relative = path.relative(process.cwd(), stat.dir) || ".";
  const normalized = relative.split(path.sep).join("/");
  const rawParts = normalized.split("/");
  const parts = rawParts.map((part) => part.toLowerCase());
  const reasons = [];
  let confidence = 0;
  const basename = path.basename(stat.dir).toLowerCase();
  const nestedGitRoot = stat.dir !== root && fs.existsSync(path.join(stat.dir, ".git"));
  if (protectedSourceFolderNames.has(basename) && !nestedGitRoot) return undefined;
  const opensourceIndex = parts.indexOf("opensource");
  const reposIndex = ["repos", "projects", "checkouts", "clones"].map((name) => parts.indexOf(name)).filter((index) => index > opensourceIndex).sort((a, b) => a - b)[0] ?? -1;
  const suggestedPath = opensourceIndex !== -1 && reposIndex > opensourceIndex ? rawParts.slice(0, reposIndex + 1).join("/") : normalized;
  if (nestedGitRoot) {
    reasons.push("nested git checkout/submodule boundary");
    confidence += 8;
  }
  if (opensourceIndex !== -1 && reposIndex > opensourceIndex) {
    reasons.push("vendored/third-party repo mirror path");
    confidence += 5;
  }
  if (refactorIgnorePathHints.some((pattern) => pattern.test(relative))) {
    reasons.push("generated/vendor/artifact path pattern");
    confidence += 3;
  }
  if (isLikelyFlutterPlatformFolder(stat.dir, basename)) {
    reasons.push("Flutter platform scaffold, not primary refactor target");
    confidence += 8;
  }
  if (refactorIgnoreNameHints.has(basename)) {
    reasons.push(`folder name '${basename}' is usually non-refactorable`);
    confidence += shallowNameOnlyHints.has(basename) ? 1 : 3;
  } else if (parts.some((part) => refactorIgnoreNameHints.has(part))) {
    reasons.push("ancestor folder name suggests artifacts or fixtures");
    confidence += 2;
  }
  const artifactExtensions = [...stat.extensions].filter((ext) => refactorIgnoreArtifactExtensions.has(ext));
  const sourceExtensionsInStat = [...stat.extensions].filter((ext) => sourceLikeExtensions.has(ext));
  const artifactRatio = stat.extensions.size ? artifactExtensions.length / stat.extensions.size : 0;
  if (artifactExtensions.length >= 3 || artifactRatio >= 0.5) {
    reasons.push(`artifact-heavy extensions: ${artifactExtensions.slice(0, 5).join(", ")}`);
    confidence += artifactRatio >= 0.5 ? 3 : 2;
  }
  if (sourceExtensionsInStat.length === 0 && stat.totalFiles >= 8) {
    reasons.push("no source-code extensions detected");
    confidence += 2;
  }
  if (stat.totalFiles >= 500 && stat.churn === 0 && stat.inboundCallers.size === 0) {
    reasons.push("large unreferenced low-churn tree");
    confidence += 3;
  }
  const markerFiles = stat.files.map((file) => path.basename(file)).filter((name) => refactorIgnoreMarkerFiles.has(name));
  if (markerFiles.length) {
    reasons.push(`lock/generated marker files: ${[...new Set(markerFiles)].slice(0, 3).join(", ")}`);
    confidence += 2;
  }
  const generatedTextHits = generatedTextHitCount(stat.files);
  if (generatedTextHits >= 3 || generatedTextHits && stat.totalFiles <= 20) {
    reasons.push("generated-code headers detected");
    confidence += generatedTextHits >= 3 ? 3 : 2;
  }
  const onlyWeakNameEvidence = reasons.length === 1 && /folder name|ancestor folder name/.test(reasons[0]);
  if (onlyWeakNameEvidence) return undefined;
  if (stat.inboundCallers.size > 0 && confidence < 5) return undefined;
  if (sourceExtensionsInStat.length >= 2 && confidence < 8) return undefined;
  if (confidence < 4) return undefined;
  return {
    path: suggestedPath.split("/").join(path.sep),
    pattern: `${suggestedPath}/`,
    reason: [...new Set(reasons)].join("; "),
    confidence,
    files: stat.totalFiles,
    extensions: [...stat.extensions].sort().slice(0, 6),
  };
}

function isLikelyFlutterPlatformFolder(dir, basename) {
  if (!flutterPlatformFolderNames.has(basename)) return false;
  if (!hasPubspecAtOrAbove(dir)) return false;
  const markerNames = new Set([
    "AndroidManifest.xml", "build.gradle", "build.gradle.kts", "gradle.properties", "settings.gradle", "settings.gradle.kts",
    "Podfile", "Info.plist", "Runner.xcodeproj", "Runner.xcworkspace", "CMakeLists.txt", "index.html",
  ]);
  const markerExtensions = new Set([".xcodeproj", ".xcworkspace", ".sln", ".vcxproj"]);
  let markers = 0;
  for (const file of listFilesShallow(dir, 3)) {
    const name = path.basename(file);
    if (markerNames.has(name) || markerExtensions.has(path.extname(name))) markers += 1;
    if (markers >= 1 && basename !== "web") return true;
    if (markers >= 2) return true;
  }
  return false;
}

function hasPubspecAtOrAbove(dir) {
  for (let current = dir; isInsideOrEqual(current, root); current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pubspec.yaml"))) return true;
    if (current === root) break;
  }
  return fs.existsSync(path.join(root, "pubspec.yaml")) || fs.existsSync(path.join(process.cwd(), "pubspec.yaml"));
}

function listFilesShallow(dir, maxDepth) {
  const files = [];
  walkShallow(dir, 0);
  return files;

  function walkShallow(current, depth) {
    if (depth > maxDepth || files.length > 200) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if ([".git", ".pi", ".dart_tool", "build", ".gradle"].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walkShallow(full, depth + 1);
      else if (entry.isFile()) files.push(full);
    }
  }
}

function generatedTextHitCount(files) {
  let hits = 0;
  for (const file of files.slice(0, 100)) {
    const content = fileContents.get(file);
    if (!content) continue;
    const head = content.slice(0, 800);
    if (hasStrongGeneratedHeader(head)) hits += 1;
  }
  return hits;
}

function hasStrongGeneratedHeader(head) {
  return head.split(/\r?\n/).slice(0, 12).some((line) => {
    const normalized = line.trim().replace(/^(?:\/\/|#|\/\*|\*|<!--)\s*/, "").replace(/\s*(?:\*\/|-->)$/, "");
    return /^(?:code\s+)?generated\b.*(?:do not edit|automatically|by)\b/i.test(normalized)
      || /^do not edit\b.*\bgenerated\b/i.test(normalized);
  });
}

function compactRefactorIgnoreSuggestions(suggestions) {
  const normalized = suggestions.map((item) => ({ ...item, normalizedPath: item.path.split(path.sep).join("/") }));
  const withoutWeakParents = normalized.filter((item) => !normalized.some((other) => other !== item
    && other.normalizedPath.startsWith(`${item.normalizedPath}/`)
    && other.files === item.files
    && other.confidence >= item.confidence));
  const sorted = withoutWeakParents.sort((a, b) => a.normalizedPath.length - b.normalizedPath.length || b.confidence - a.confidence);
  const kept = [];
  for (const suggestion of sorted) {
    const parent = kept.find((item) => suggestion.normalizedPath !== item.normalizedPath
      && suggestion.normalizedPath.startsWith(`${item.normalizedPath}/`)
      && item.confidence >= suggestion.confidence - 1);
    if (!parent) kept.push(suggestion);
  }
  return kept.map(({ normalizedPath, ...item }) => item);
}

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
  if ((report.contentRead?.skippedLargeFiles || 0) > 0) {
    console.log(`Scanner content budget: skipped ${report.contentRead.skippedLargeFiles} large/budgeted file(s); structural counts remain, import/symbol evidence may be partial.`);
  }
  if (report.refactorIgnoreSuggestions?.length) {
    console.log("Suggested .refactorignore entries:");
    for (const suggestion of report.refactorIgnoreSuggestions) {
      console.log(`- ${suggestion.pattern} — confidence ${suggestion.confidence}; ${suggestion.reason}; files ${suggestion.files}; extensions ${suggestion.extensions.join(", ") || "none"}`);
    }
  }
  if (!report.candidates.length) {
    console.log("No candidate subfolders found.");
    return;
  }
  for (const [index, candidate] of report.candidates.entries()) {
    const extList = candidate.extensions.join(", ") || "none";
    console.log(`${index + 1}. ${candidate.relative} — debt ${candidate.score.toFixed(1)}; root ${candidate.direct}; total ${candidate.files}; evidence: churn ${candidate.churn}; callers ${candidate.callers}; imports-out ${candidate.importsOut}; tests ${candidate.tests}; duplicates ${candidate.duplicates}; subdirs ${candidate.subdirs}; roles ${candidate.roles}; extensions ${extList}`);
  }
  if (latestLog) console.log(`Log: ${latestLog}`);
}
