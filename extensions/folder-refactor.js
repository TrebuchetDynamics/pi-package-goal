import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, readlink, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const Type = {
  String: (options = {}) => ({ type: "string", ...options }),
  Boolean: (options = {}) => ({ type: "boolean", ...options }),
  Integer: (options = {}) => ({ type: "integer", ...options }),
  Array: (items, options = {}) => ({ type: "array", items, ...options }),
  Optional: (schema) => ({ ...schema, __optional: true }),
  Object: (properties) => ({
    type: "object",
    properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, stripOptionalMarker(value)])),
    required: Object.entries(properties).filter(([, value]) => !value.__optional).map(([key]) => key),
  }),
};

function stripOptionalMarker(schema) {
  const { __optional, ...rest } = schema;
  return rest;
}

const stateDirName = join(".pi", "folder-refactor");
const defaultScanDepth = 1;
const maxScanDepth = 2;
const defaultToolEntryLimit = 500;
const maxToolEntryLimit = 2000;
const maxToolOutputBytes = 50 * 1024;
const maxToolOutputLines = 2000;
const maxInspectableFileBytes = 256 * 1024;

export function resolveTarget(cwd, target = ".") {
  const resolved = isAbsolute(target) ? resolve(target) : resolve(cwd, target || ".");
  const relativeTarget = toPosixPath(relative(cwd, resolved)) || ".";
  return { absolute: resolved, relative: relativeTarget };
}

export async function scanFolderRefactorTarget(cwd, target = ".", options = {}) {
  const resolved = resolveTarget(cwd, target);
  const depth = normalizeDepth(options.depth);
  const offset = normalizeOffset(options.offset);
  const limit = normalizeLimit(options.limit);
  const warnings = [];
  const git = await collectGitInfo(cwd, resolved.absolute, options.signal);
  const packages = await collectPackageInfo(cwd, resolved.absolute);
  const allEntries = [];
  const rootEntries = [];

  await scanDirectory({
    cwd,
    targetAbsolute: resolved.absolute,
    dirAbsolute: resolved.absolute,
    targetRelativePrefix: "",
    currentDepth: 1,
    maxDepth: depth,
    git,
    packages,
    allEntries,
    rootEntries,
    warnings,
  });

  sortEntries(allEntries);
  sortEntries(rootEntries);

  const rootFiles = rootEntries.filter((entry) => entry.kind === "file").map((entry) => entry.basename);
  const rootDirs = rootEntries.filter((entry) => entry.kind === "dir").map((entry) => entry.basename);
  const rootSymlinks = rootEntries.filter((entry) => entry.kind === "symlink").map((entry) => entry.basename);
  const rootOther = rootEntries.filter((entry) => !["file", "dir", "symlink"].includes(entry.kind)).map((entry) => entry.basename);
  const files = rootEntries.filter((entry) => entry.kind === "file");
  const dirs = rootEntries.filter((entry) => entry.kind === "dir");
  const symlinks = rootEntries.filter((entry) => entry.kind === "symlink");
  const other = rootEntries.filter((entry) => !["file", "dir", "symlink"].includes(entry.kind));
  const gitOnlyEntries = collectGitOnlyEntries({ cwd, targetAbsolute: resolved.absolute, git, maxDepth: depth });
  const totalEntries = allEntries.length + gitOnlyEntries.length;
  const combinedEntries = [...allEntries, ...gitOnlyEntries];
  sortEntries(combinedEntries);
  const entries = limit === undefined ? combinedEntries.slice(offset) : combinedEntries.slice(offset, offset + limit);
  const truncated = offset > 0 || entries.length < combinedEntries.length;
  const rootInventory = rootEntries.map((entry) => rootInventoryEntry(entry));
  const scanHash = hashScanInventory({ target: resolved.relative, rootInventory, gitOnlyEntries: gitOnlyEntries.map(rootInventoryEntry) });

  return {
    version: 2,
    target: resolved.relative,
    targetAbsolute: resolved.absolute,
    depth,
    offset,
    limit: limit ?? null,
    truncated,
    totalEntries,
    scanHash,
    hashAlgorithm: "sha256",
    rootFiles,
    rootDirs,
    rootSymlinks,
    rootOther,
    files,
    dirs,
    symlinks,
    other,
    entries,
    rootInventory,
    git,
    packages,
    warnings: sortStrings([...warnings, ...git.warnings]),
  };
}

export function auditFolderRefactorCompletion(scan, classifications = {}) {
  const facade = stringSet(classifications.facadeFiles);
  const outOfScope = stringSet(classifications.outOfScopeFiles);
  const nextCandidates = stringSet(classifications.nextCandidateFiles);
  const classified = new Set([...facade, ...outOfScope, ...nextCandidates]);
  const rootFileSet = new Set(scan.rootFiles);
  const unclassified = scan.rootFiles.filter((file) => !classified.has(file));
  const unknownClassified = [...classified].filter((file) => !rootFileSet.has(file)).sort(compareStrings);
  const issues = [];
  const baselineHash = typeof classifications.baselineHash === "string" && classifications.baselineHash.trim()
    ? classifications.baselineHash.trim()
    : undefined;

  if (unclassified.length) issues.push(`${unclassified.length} root file(s) are unclassified`);
  if (unknownClassified.length) issues.push(`${unknownClassified.length} classified file(s) are not present at target root`);
  if (baselineHash && scan.scanHash && baselineHash !== scan.scanHash) {
    issues.push(`scan baseline hash mismatch: expected ${baselineHash}, current ${scan.scanHash}`);
  }
  if (classifications.plannedTopologyComplete && nextCandidates.size) {
    issues.push("plannedTopologyComplete is true but nextCandidateFiles is not empty");
  }
  if (classifications.plannedTopologyComplete && unclassified.length) {
    issues.push("plannedTopologyComplete is true but root files remain unclassified");
  }

  return {
    ok: issues.length === 0,
    issues,
    target: scan.target,
    scanHash: scan.scanHash,
    baselineHash: baselineHash ?? null,
    rootFiles: scan.rootFiles,
    rootDirs: scan.rootDirs,
    classifications: {
      facadeFiles: [...facade].sort(compareStrings),
      outOfScopeFiles: [...outOfScope].sort(compareStrings),
      nextCandidateFiles: [...nextCandidates].sort(compareStrings),
    },
    unclassified,
    unknownClassified,
    plannedTopologyComplete: Boolean(classifications.plannedTopologyComplete),
  };
}

export function formatAuditResult(audit) {
  const lines = [
    `FOLDER_REFACTOR_AUDIT: ${audit.ok ? "pass" : "fail"}`,
    `target: ${audit.target}`,
    `plannedTopologyComplete: ${audit.plannedTopologyComplete ? "yes" : "no"}`,
    `scan hash: ${audit.scanHash ?? "unknown"}`,
    `baseline hash: ${audit.baselineHash ?? "none"}`,
    `root files: ${audit.rootFiles.length}`,
    `root dirs: ${audit.rootDirs.length}`,
  ];
  if (audit.issues.length) {
    lines.push("issues:", ...audit.issues.map((issue) => `- ${issue}`));
  }
  lines.push(
    `facade/compatibility: ${audit.classifications.facadeFiles.join(", ") || "none"}`,
    `out-of-scope: ${audit.classifications.outOfScopeFiles.join(", ") || "none"}`,
    `next candidates: ${audit.classifications.nextCandidateFiles.join(", ") || "none"}`,
    `unclassified: ${audit.unclassified.join(", ") || "none"}`,
  );
  if (audit.unknownClassified.length) lines.push(`unknown classified: ${audit.unknownClassified.join(", ")}`);
  return lines.join("\n");
}

export function buildFolderRefactorPrompt(args = "") {
  const target = args.trim();
  const targetText = target || "the named target folder";
  return [
    `/skill:skill-folder-refactor ${target}`.trimEnd(),
    "",
    "Use the folder-refactor guardrail extension while working:",
    `- Start with folder_refactor_scan on ${targetText}; note its scanHash as a receipt, and pass baselineHash to folder_refactor_audit only when verifying the current inventory still matches a recent scan.`,
    "- Before any final report, call folder_refactor_audit with exact remaining root file basenames classified as facadeFiles, outOfScopeFiles, or nextCandidateFiles.",
    "- If folder_refactor_audit fails, do not report done; either continue safe slices or report the specific blocker.",
    "- If nextCandidateFiles is non-empty and validation is green, execute the next candidate instead of stopping.",
  ].join("\n");
}

export async function writeFolderRefactorState(cwd, target, state) {
  const resolved = resolveTarget(cwd, target);
  const dir = join(cwd, stateDirName);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${safeStateName(resolved.relative)}.json`);
  const payload = { version: 1, target: resolved.relative, updatedAt: new Date().toISOString(), ...state };
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
  return { file, payload };
}

export async function readFolderRefactorState(cwd, target) {
  const resolved = resolveTarget(cwd, target);
  const file = join(cwd, stateDirName, `${safeStateName(resolved.relative)}.json`);
  const payload = JSON.parse(await readFile(file, "utf8"));
  return { file, payload };
}

export function stableStringify(value, space = 2) {
  return JSON.stringify(sortJsonValue(value), null, space);
}

async function scanDirectory({ cwd, targetAbsolute, dirAbsolute, targetRelativePrefix, currentDepth, maxDepth, git, packages, allEntries, rootEntries, warnings }) {
  let dirents;
  try {
    dirents = await readdir(dirAbsolute, { withFileTypes: true });
  } catch (error) {
    warnings.push(`unreadable directory: ${toPosixPath(relative(cwd, dirAbsolute)) || "."} (${error.code ?? error.message})`);
    return;
  }

  dirents.sort((a, b) => compareStrings(a.name, b.name));

  for (const dirent of dirents) {
    const targetRelativePath = targetRelativePrefix ? `${targetRelativePrefix}/${dirent.name}` : dirent.name;
    const absolutePath = join(dirAbsolute, dirent.name);
    const entry = await buildScanEntry({
      cwd,
      targetAbsolute,
      targetRelativePath,
      absolutePath,
      dirent,
      depth: currentDepth,
      git,
      packages,
      warnings,
    });
    allEntries.push(entry);
    if (currentDepth === 1) rootEntries.push(entry);

    if (entry.kind === "dir" && !entry.is_symlink && currentDepth < maxDepth) {
      await scanDirectory({
        cwd,
        targetAbsolute,
        dirAbsolute: absolutePath,
        targetRelativePrefix: targetRelativePath,
        currentDepth: currentDepth + 1,
        maxDepth,
        git,
        packages,
        allEntries,
        rootEntries,
        warnings,
      });
    }
  }
}

async function buildScanEntry({ cwd, targetAbsolute, targetRelativePath, absolutePath, dirent, depth, git, packages, warnings }) {
  const entryWarnings = [];
  let fileStat;
  try {
    fileStat = await lstat(absolutePath);
  } catch (error) {
    const warning = `unreadable entry metadata: ${toPosixPath(relative(cwd, absolutePath))} (${error.code ?? error.message})`;
    warnings.push(warning);
    entryWarnings.push(warning);
    return missingEntry({ cwd, targetRelativePath, absolutePath, depth, git, warnings: entryWarnings });
  }

  const kind = direntKind(dirent);
  const cwdRelativePath = toPosixPath(relative(cwd, absolutePath)) || ".";
  const gitStatus = statusForPath(git, absolutePath, kind);
  const symlink = await symlinkInfo(absolutePath, kind);
  const readable = await isReadable(absolutePath, kind);
  if (!readable) {
    const warning = `unreadable ${kind}: ${cwdRelativePath}`;
    warnings.push(warning);
    entryWarnings.push(warning);
  }
  if (symlink.brokenSymlink) {
    const warning = `broken symlink: ${cwdRelativePath} -> ${symlink.symlinkTarget}`;
    warnings.push(warning);
    entryWarnings.push(warning);
  }

  const hints = await collectRefactorHints({
    absolutePath,
    basename: basename(absolutePath),
    kind,
    size: fileStat.size,
    packages,
    cwdRelativePath,
  });

  return {
    basename: basename(absolutePath),
    relativePath: cwdRelativePath,
    targetRelativePath: toPosixPath(targetRelativePath),
    depth,
    kind,
    gitStatus: gitStatus.status,
    gitStatusRaw: gitStatus.raw,
    gitOldPath: gitStatus.oldPath,
    isGitIgnored: gitStatus.status === "ignored",
    isVendor: isVendorPath(cwdRelativePath),
    isGenerated: hints.isGenerated,
    isLikelyTest: hints.isLikelyTest,
    packageName: hints.packageName,
    imports: hints.imports,
    localImports: hints.localImports,
    facadeLike: hints.facadeLike,
    facadeReasons: hints.facadeReasons,
    is_symlink: kind === "symlink",
    symlinkTarget: symlink.symlinkTarget,
    brokenSymlink: symlink.brokenSymlink,
    permissions: modeToPermissions(fileStat.mode),
    size: fileStat.size,
    mtime: new Date(fileStat.mtimeMs).toISOString(),
    mtimeMs: Math.trunc(fileStat.mtimeMs),
    readable,
    warnings: sortStrings(entryWarnings),
  };
}

function missingEntry({ cwd, targetRelativePath, absolutePath, depth, git, warnings }) {
  const gitStatus = statusForPath(git, absolutePath, "missing");
  return {
    basename: basename(absolutePath),
    relativePath: toPosixPath(relative(cwd, absolutePath)) || ".",
    targetRelativePath: toPosixPath(targetRelativePath),
    depth,
    kind: "missing",
    gitStatus: gitStatus.status,
    gitStatusRaw: gitStatus.raw,
    gitOldPath: gitStatus.oldPath,
    isGitIgnored: gitStatus.status === "ignored",
    isVendor: isVendorPath(toPosixPath(relative(cwd, absolutePath))),
    isGenerated: false,
    isLikelyTest: /_test\.go$/.test(basename(absolutePath)),
    packageName: null,
    imports: [],
    localImports: [],
    facadeLike: false,
    facadeReasons: [],
    is_symlink: false,
    symlinkTarget: null,
    brokenSymlink: false,
    permissions: null,
    size: null,
    mtime: null,
    mtimeMs: null,
    readable: false,
    warnings: sortStrings(warnings),
  };
}

function collectGitOnlyEntries({ cwd, targetAbsolute, git, maxDepth }) {
  if (!git.available) return [];
  const out = [];
  const targetPrefix = toPosixPath(relative(git.rootAbsolute, targetAbsolute));
  for (const statusEntry of Object.values(git.statusByPath)) {
    if (!["deleted", "renamed"].includes(statusEntry.status)) continue;
    const inventoryPath = statusEntry.status === "renamed" && statusEntry.oldPath ? statusEntry.oldPath : statusEntry.path;
    const targetRelativePath = relativePathWithinTarget(inventoryPath, targetPrefix);
    if (targetRelativePath === null) continue;
    const depth = targetRelativePath.split("/").filter(Boolean).length;
    if (depth < 1 || depth > maxDepth) continue;
    out.push({
      basename: basename(targetRelativePath),
      relativePath: toPosixPath(join(toPosixPath(relative(cwd, git.rootAbsolute)), inventoryPath)).replace(/^\.\//, ""),
      targetRelativePath,
      depth,
      kind: statusEntry.status,
      gitStatus: statusEntry.status,
      gitStatusRaw: statusEntry.raw,
      gitOldPath: statusEntry.oldPath,
      isGitIgnored: false,
      isVendor: isVendorPath(statusEntry.path),
      isGenerated: detectGeneratedBasename(basename(targetRelativePath)),
      isLikelyTest: /_test\.go$/.test(basename(targetRelativePath)),
      packageName: null,
      imports: [],
      localImports: [],
      facadeLike: false,
      facadeReasons: [],
      is_symlink: false,
      symlinkTarget: null,
      brokenSymlink: false,
      permissions: null,
      size: null,
      mtime: null,
      mtimeMs: null,
      readable: false,
      warnings: [],
    });
  }
  return out;
}

function relativePathWithinTarget(gitRelativePath, targetPrefix) {
  const normalizedTarget = targetPrefix === "." ? "" : targetPrefix;
  if (!normalizedTarget) return gitRelativePath;
  if (gitRelativePath === normalizedTarget) return "";
  const prefix = `${normalizedTarget}/`;
  if (!gitRelativePath.startsWith(prefix)) return null;
  return gitRelativePath.slice(prefix.length);
}

async function collectGitInfo(cwd, targetAbsolute, signal) {
  const unavailable = (reason) => ({
    available: false,
    root: null,
    rootAbsolute: null,
    targetTracked: false,
    statusByPath: {},
    warnings: reason ? [reason] : [],
  });

  let rootStdout;
  try {
    ({ stdout: rootStdout } = await execFile("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { signal, timeout: 2000, maxBuffer: 1024 * 1024 }));
  } catch {
    return unavailable("git status unavailable: target is not inside a git checkout or git is not installed");
  }

  const rootAbsolute = rootStdout.trim();
  if (!isPathInside(rootAbsolute, targetAbsolute)) {
    return unavailable("git status unavailable: target is outside the current git checkout");
  }

  const targetGitPath = toPosixPath(relative(rootAbsolute, targetAbsolute)) || ".";
  let statusStdout = "";
  const warnings = [];
  try {
    ({ stdout: statusStdout } = await execFile(
      "git",
      ["-C", rootAbsolute, "status", "--porcelain=v1", "-z", "--ignored", "--untracked-files=all", "--", targetGitPath],
      { signal, timeout: 5000, maxBuffer: 20 * 1024 * 1024 },
    ));
  } catch (error) {
    warnings.push(`git status failed: ${error.message}`);
  }

  return {
    available: true,
    root: toPosixPath(relative(cwd, rootAbsolute)) || ".",
    rootAbsolute,
    targetTracked: true,
    statusByPath: parseGitStatus(statusStdout),
    warnings,
  };
}

function parseGitStatus(stdout) {
  const statusByPath = {};
  const records = stdout.split("\0").filter(Boolean);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4) continue;
    const raw = record.slice(0, 2);
    const path = toPosixPath(record.slice(3));
    const status = mapGitStatus(raw);
    let oldPath = null;
    if (raw.includes("R") || raw.includes("C")) {
      oldPath = toPosixPath(records[index + 1] ?? "");
      index += 1;
    }
    statusByPath[path] = { path, raw, status, oldPath };
  }
  return statusByPath;
}

function mapGitStatus(raw) {
  if (raw === "??") return "untracked";
  if (raw === "!!") return "ignored";
  if (raw.includes("R")) return "renamed";
  if (raw.includes("D")) return "deleted";
  return "modified";
}

function statusForPath(git, absolutePath, kind) {
  if (!git.available || !git.rootAbsolute || !isPathInside(git.rootAbsolute, absolutePath)) {
    return { status: "unknown", raw: null, oldPath: null };
  }

  const gitRelativePath = toPosixPath(relative(git.rootAbsolute, absolutePath));
  const direct = git.statusByPath[gitRelativePath];
  if (direct) return { status: direct.status, raw: direct.raw, oldPath: direct.oldPath };

  if (kind === "dir") {
    const childStatuses = Object.values(git.statusByPath)
      .filter((entry) => entry.path.startsWith(`${gitRelativePath}/`))
      .map((entry) => entry.status);
    if (childStatuses.length) {
      const unique = new Set(childStatuses);
      if (unique.size === 1) {
        const [status] = [...unique];
        return { status, raw: null, oldPath: null };
      }
      return { status: "modified", raw: "mixed", oldPath: null };
    }
  }

  return { status: "clean", raw: null, oldPath: null };
}

async function collectPackageInfo(cwd, targetAbsolute) {
  const goModulePath = await findGoModulePath(cwd, targetAbsolute);
  return { goModulePath };
}

async function findGoModulePath(cwd, targetAbsolute) {
  let current = targetAbsolute;
  const stop = resolve(cwd, "..");
  while (isPathInside(stop, current)) {
    const modPath = join(current, "go.mod");
    try {
      const content = await readFile(modPath, "utf8");
      const match = content.match(/^\s*module\s+(\S+)/m);
      if (match) return match[1];
    } catch {
      // keep walking up
    }
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return null;
}

async function collectRefactorHints({ absolutePath, basename: fileName, kind, size, packages, cwdRelativePath }) {
  const defaults = {
    isLikelyTest: isLikelyTestFile(fileName),
    isGenerated: detectGeneratedBasename(fileName),
    packageName: null,
    imports: [],
    localImports: [],
    facadeLike: false,
    facadeReasons: [],
  };
  if (kind !== "file" || size > maxInspectableFileBytes) return defaults;

  let content;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch {
    return defaults;
  }

  const imports = parseImports(fileName, content);
  const localImports = imports.filter((importPath) => isLocalImport(importPath, packages.goModulePath));
  const facade = detectFacadeLike(fileName, content, imports);

  return {
    isLikelyTest: defaults.isLikelyTest,
    isGenerated: defaults.isGenerated || detectGeneratedContent(content),
    packageName: parsePackageName(fileName, content),
    imports,
    localImports,
    facadeLike: facade.likely,
    facadeReasons: facade.reasons,
  };
}

function parsePackageName(fileName, content) {
  if (!fileName.endsWith(".go")) return null;
  return content.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_]*)/m)?.[1] ?? null;
}

function parseImports(fileName, content) {
  const imports = new Set();
  if (fileName.endsWith(".go")) {
    for (const match of content.matchAll(/^\s*import\s+"([^"]+)"/gm)) imports.add(match[1]);
    for (const block of content.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) {
      for (const match of block[1].matchAll(/(?:^|\s)(?:[\w.]+\s+)?"([^"]+)"/g)) imports.add(match[1]);
    }
  }
  if (/\.[cm]?[jt]sx?$/.test(fileName)) {
    for (const match of content.matchAll(/\bfrom\s+["']([^"']+)["']/g)) imports.add(match[1]);
    for (const match of content.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) imports.add(match[1]);
    for (const match of content.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) imports.add(match[1]);
  }
  return sortStrings([...imports]);
}

function isLocalImport(importPath, goModulePath) {
  return importPath.startsWith(".") || Boolean(goModulePath && (importPath === goModulePath || importPath.startsWith(`${goModulePath}/`)));
}

function detectGeneratedBasename(fileName) {
  return /(?:^|\.)pb\.go$/.test(fileName) || /(?:^|[_.-])generated\./i.test(fileName) || /\.gen\./i.test(fileName);
}

function detectGeneratedContent(content) {
  const header = content.split(/\r?\n/, 20).join("\n");
  return /Code generated .* DO NOT EDIT\.?/i.test(header) || /DO NOT EDIT/i.test(header);
}

function isLikelyTestFile(fileName) {
  return /_test\.go$/.test(fileName) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(fileName);
}

function detectFacadeLike(fileName, content, imports) {
  const reasons = [];
  const codeLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*") && !line.startsWith("#"));

  if (/^(index|mod)\.[cm]?[jt]sx?$/.test(fileName)) {
    const onlyExports = codeLines.every((line) => /^(export\s+(?:\*|\{|type\s+\{|\w)|import\s)/.test(line));
    if (onlyExports && codeLines.length <= 50) reasons.push("small JS/TS import-export facade");
  }

  if (fileName.endsWith(".go") && imports.length > 0 && codeLines.length <= 80) {
    const funcCount = (content.match(/^\s*func\s+/gm) ?? []).length;
    const hasStateOrTypes = /^\s*(type|const|var)\s+/m.test(content);
    if (!hasStateOrTypes && funcCount > 0 && funcCount <= 5) {
      reasons.push("small Go file with imports and only a few delegating funcs");
    }
  }

  return { likely: reasons.length > 0, reasons };
}

async function symlinkInfo(absolutePath, kind) {
  if (kind !== "symlink") return { symlinkTarget: null, brokenSymlink: false };
  let symlinkTarget = null;
  try {
    symlinkTarget = await readlink(absolutePath);
  } catch {
    return { symlinkTarget: null, brokenSymlink: true };
  }

  try {
    await stat(isAbsolute(symlinkTarget) ? symlinkTarget : resolve(dirname(absolutePath), symlinkTarget));
    return { symlinkTarget, brokenSymlink: false };
  } catch {
    return { symlinkTarget, brokenSymlink: true };
  }
}

async function isReadable(path, kind) {
  try {
    await access(path, kind === "dir" ? fsConstants.R_OK | fsConstants.X_OK : fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function direntKind(dirent) {
  if (dirent.isSymbolicLink()) return "symlink";
  if (dirent.isFile()) return "file";
  if (dirent.isDirectory()) return "dir";
  if (dirent.isBlockDevice()) return "blockDevice";
  if (dirent.isCharacterDevice()) return "characterDevice";
  if (dirent.isFIFO()) return "fifo";
  if (dirent.isSocket()) return "socket";
  return "other";
}

function rootInventoryEntry(entry) {
  return {
    basename: entry.basename,
    targetRelativePath: entry.targetRelativePath,
    kind: entry.kind,
    gitStatus: entry.gitStatus,
    gitStatusRaw: entry.gitStatusRaw,
    isGitIgnored: entry.isGitIgnored,
    isVendor: entry.isVendor,
    isGenerated: entry.isGenerated,
    isLikelyTest: entry.isLikelyTest,
    packageName: entry.packageName,
    permissions: entry.permissions,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    is_symlink: entry.is_symlink,
    symlinkTarget: entry.symlinkTarget,
    brokenSymlink: entry.brokenSymlink,
  };
}

function hashScanInventory(value) {
  return createHash("sha256").update(stableStringify(value, 0)).digest("hex");
}

function normalizeDepth(depth) {
  const parsed = Number.isInteger(depth) ? depth : Number.parseInt(String(depth ?? defaultScanDepth), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultScanDepth;
  return Math.min(parsed, maxScanDepth);
}

function normalizeOffset(offset) {
  const parsed = Number.isInteger(offset) ? offset : Number.parseInt(String(offset ?? 0), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeLimit(limit) {
  if (limit === undefined || limit === null || limit === "") return undefined;
  const parsed = Number.isInteger(limit) ? limit : Number.parseInt(String(limit), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return Math.min(parsed, maxToolEntryLimit);
}

function modeToPermissions(mode) {
  return `0${(mode & 0o777).toString(8)}`;
}

function isVendorPath(pathValue) {
  return pathValue.split("/").some((part) => ["vendor", "node_modules", "third_party", "dist", "build", "coverage"].includes(part));
}

function isPathInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function sortEntries(entries) {
  entries.sort((a, b) => compareStrings(a.targetRelativePath, b.targetRelativePath) || compareStrings(a.kind, b.kind));
}

function sortStrings(values) {
  return values.sort(compareStrings);
}

function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toPosixPath(pathValue) {
  return pathValue.split(sep).join("/");
}

function safeStateName(target) {
  return (target || "root").split(sep).join("__").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function stringSet(value) {
  return new Set((Array.isArray(value) ? value : []).map((item) => basename(String(item))).filter(Boolean));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort(compareStrings).map((key) => [key, sortJsonValue(value[key])]));
}

function textResult(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}

async function scanTextResult(scan) {
  const fullText = stableStringify(scan, 2);
  const lineCount = fullText.split("\n").length;
  if (Buffer.byteLength(fullText, "utf8") <= maxToolOutputBytes && lineCount <= maxToolOutputLines) {
    return textResult(fullText, scan);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "pi-folder-refactor-scan-"));
  const fullScanPath = join(tempDir, "scan.json");
  await writeFile(fullScanPath, `${fullText}\n`, "utf8");

  const compact = compactScanForTool(scan, fullScanPath);
  return textResult(stableStringify(compact, 2), { ...scan, fullScanPath });
}

function compactScanForTool(scan, fullScanPath) {
  const entryLimit = Math.min(defaultToolEntryLimit, scan.entries.length);
  return {
    version: scan.version,
    target: scan.target,
    targetAbsolute: scan.targetAbsolute,
    depth: scan.depth,
    offset: scan.offset,
    limit: scan.limit,
    truncated: true,
    totalEntries: scan.totalEntries,
    shownEntries: entryLimit,
    fullScanPath,
    scanHash: scan.scanHash,
    hashAlgorithm: scan.hashAlgorithm,
    rootFiles: scan.rootFiles.slice(0, defaultToolEntryLimit),
    rootFilesTotal: scan.rootFiles.length,
    rootDirs: scan.rootDirs.slice(0, defaultToolEntryLimit),
    rootDirsTotal: scan.rootDirs.length,
    rootSymlinks: scan.rootSymlinks.slice(0, defaultToolEntryLimit),
    rootSymlinksTotal: scan.rootSymlinks.length,
    rootOther: scan.rootOther.slice(0, defaultToolEntryLimit),
    rootOtherTotal: scan.rootOther.length,
    entries: scan.entries.slice(0, entryLimit),
    git: scan.git,
    packages: scan.packages,
    warnings: [
      ...scan.warnings,
      `scan output exceeded ${maxToolOutputBytes} bytes or ${maxToolOutputLines} lines; full deterministic JSON saved to ${fullScanPath}`,
    ],
  };
}

export default function (pi) {
  pi.registerCommand("folder-refactor", {
    description: "Start guarded folder-refactor with deterministic completion audit",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy; queue /folder-refactor after the current turn.", "warning");
        return;
      }
      pi.sendUserMessage(buildFolderRefactorPrompt(args));
    },
  });

  pi.registerTool({
    name: "folder_refactor_scan",
    label: "Folder Refactor Scan",
    description: "Return deterministic JSON inventory for a folder-refactor target: sorted root files/dirs/symlinks/other, git status hints, safety metadata, refactor classification hints, and a scan hash. Read-only; no files are moved.",
    parameters: Type.Object({
      target: Type.String({ description: "Target folder to scan, relative to cwd or absolute" }),
      depth: Type.Optional(Type.Integer({ description: "Scan depth. Default 1; maximum 2 for shallow subfolder preview." })),
      limit: Type.Optional(Type.Integer({ description: "Optional maximum number of flat entries to include from offset; full scan hash still covers the root inventory." })),
      offset: Type.Optional(Type.Integer({ description: "Optional flat-entry offset for pagination." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const scan = await scanFolderRefactorTarget(ctx.cwd, params.target, {
        depth: params.depth ?? defaultScanDepth,
        limit: params.limit,
        offset: params.offset,
        signal,
      });
      return scanTextResult(scan);
    },
  });

  pi.registerTool({
    name: "folder_refactor_audit",
    label: "Folder Refactor Audit",
    description: "Deterministically audit a folder-refactor final report: every remaining root file must be explicitly classified and safe next candidates must not be skipped.",
    parameters: Type.Object({
      target: Type.String({ description: "Target folder to audit, relative to cwd or absolute" }),
      plannedTopologyComplete: Type.Optional(Type.Boolean({ description: "Whether the agent claims the whole target folder topology is complete" })),
      baselineHash: Type.Optional(Type.String({ description: "Optional scanHash from the earlier folder_refactor_scan baseline; mismatch fails the audit" })),
      facadeFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames intentionally left as root facade/compatibility files" })),
      outOfScopeFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames intentionally out of scope for this topology" })),
      nextCandidateFiles: Type.Optional(Type.Array(Type.String(), { description: "Exact basenames that remain move/extraction candidates" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const scan = await scanFolderRefactorTarget(ctx.cwd, params.target, { signal });
      const audit = auditFolderRefactorCompletion(scan, params);
      return textResult(formatAuditResult(audit), audit);
    },
  });

  pi.registerTool({
    name: "folder_refactor_state",
    label: "Folder Refactor State",
    description: "Read or write local .pi/folder-refactor state for long folder-refactor objectives.",
    parameters: Type.Object({
      action: Type.String({ description: "read or write" }),
      target: Type.String({ description: "Target folder, relative to cwd or absolute" }),
      objective: Type.Optional(Type.String({ description: "Current objective/topology summary for write" })),
      completedSlices: Type.Optional(Type.Array(Type.String(), { description: "Validated slices completed so far" })),
      nextCandidates: Type.Optional(Type.Array(Type.String(), { description: "Known next candidate slices" })),
      validationReceipts: Type.Optional(Type.Array(Type.String(), { description: "Validation commands/results" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "read") {
        const state = await readFolderRefactorState(ctx.cwd, params.target);
        return textResult(`state: ${state.file}\n${JSON.stringify(state.payload, null, 2)}`, state);
      }
      if (params.action !== "write") throw new Error("folder_refactor_state action must be read or write");
      const state = await writeFolderRefactorState(ctx.cwd, params.target, {
        objective: params.objective ?? "",
        completedSlices: params.completedSlices ?? [],
        nextCandidates: params.nextCandidates ?? [],
        validationReceipts: params.validationReceipts ?? [],
      });
      return textResult(`state written: ${state.file}`, state);
    },
  });
}
