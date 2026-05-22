import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const jitiEntry = "/home/xel/.nvm/versions/node/v22.21.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs";

const expectedSkills = [
  "modern-web-guidance",
  "chrome-extensions",
  "tdd",
  "diagnose",
  "improve-codebase-architecture",
  "grill-with-docs",
  "prototype",
  "zoom-out",
  "handoff",
  "lgtm",
  "caveman",
  "write-a-skill",
  "greploop",
  "pi-ecosystem-scout",
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function collectMissingPackageManifestPaths(baseDir, pkg) {
  const missing = [];
  for (const file of stringArray(pkg.files)) {
    if (!isManifestExclusion(file) && !pathExists(baseDir, file)) missing.push(`files: ${file}`);
  }
  for (const extension of stringArray(pkg.pi?.extensions)) {
    if (!isManifestExclusion(extension) && !pathExists(baseDir, extension)) missing.push(`pi.extensions: ${extension}`);
  }
  for (const skillPath of stringArray(pkg.pi?.skills)) {
    if (!isManifestExclusion(skillPath) && !pathExists(baseDir, skillPath)) missing.push(`pi.skills: ${skillPath}`);
  }
  return missing;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function isManifestExclusion(target) {
  return target.trim().startsWith("!");
}

function pathExists(baseDir, target) {
  const normalized = normalizeManifestPath(target);
  if (hasGlobPattern(normalized)) return globPathExists(baseDir, normalized);
  return fs.existsSync(path.join(baseDir, normalized));
}

function normalizeManifestPath(target) {
  return target.trim().replace(/^\.\//, "").split(path.sep).join("/");
}

function hasGlobPattern(target) {
  return /[*?]/.test(target);
}

function globPathExists(baseDir, pattern) {
  const matcher = globPatternToRegExp(pattern);
  return listRelativePackagePaths(baseDir).some((item) => matcher.test(item));
}

function listRelativePackagePaths(baseDir) {
  const out = [];
  const skipDirs = new Set([".git", ".pi", "node_modules"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      out.push(path.relative(baseDir, full).split(path.sep).join("/"));
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(baseDir);
  return out;
}

function globPatternToRegExp(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        while (pattern[index + 1] === "*") index += 1;
        if (pattern[index + 1] === "/") {
          source += "(?:.*/)?";
          index += 1;
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`);
}

function escapeRegExp(char) {
  return char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

const piCorePackages = new Set([
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
]);

function collectPiCoreDependencyIssues(baseDir, pkg) {
  const issues = [];
  const importedCorePackages = [...collectImportedPackageNames(baseDir)]
    .filter((packageName) => piCorePackages.has(packageName))
    .sort();
  for (const packageName of importedCorePackages) {
    if (pkg.peerDependencies?.[packageName] !== "*") {
      issues.push(`peerDependencies: ${packageName} must be "*"`);
    }
  }

  const runtimeCorePackages = Object.keys(pkg.dependencies ?? {})
    .filter((packageName) => piCorePackages.has(packageName))
    .sort();
  for (const packageName of runtimeCorePackages) {
    issues.push(`dependencies: ${packageName} must be a peerDependency, not a runtime dependency`);
  }
  return issues;
}

function collectImportedPackageNames(baseDir) {
  const imported = new Set();
  for (const file of listPackageCodeFiles(baseDir)) {
    const content = fs.readFileSync(file, "utf8");
    for (const source of parseImportSources(content)) {
      const packageName = barePackageName(source);
      if (packageName) imported.add(packageName);
    }
  }
  return imported;
}

function listPackageCodeFiles(baseDir) {
  const out = [];
  const extensionsDir = path.join(baseDir, "extensions");
  if (!fs.existsSync(extensionsDir)) return out;
  const codeExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && codeExtensions.has(path.extname(entry.name))) out.push(full);
    }
  };
  walk(extensionsDir);
  return out.sort();
}

function parseImportSources(content) {
  const sources = [];
  const importPatterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of importPatterns) {
    for (const match of content.matchAll(pattern)) {
      sources.push(match[1]);
    }
  }
  return sources;
}

function barePackageName(source) {
  if (source.startsWith(".") || source.startsWith("/")) return undefined;
  const parts = source.split("/");
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function listSkillFiles(baseDir = root) {
  const out = [];
  const base = path.join(baseDir, "skills");
  if (!fs.existsSync(base)) return out;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && entry.name === "SKILL.md") out.push(path.relative(baseDir, full).split(path.sep).join("/"));
    }
  };
  walk(base);
  return out.sort();
}

function collectSkillInventoryIssues(baseDir, expectedNames) {
  const expected = new Set(expectedNames);
  const actual = new Set(listSkillFiles(baseDir)
    .map((file) => file.match(/^skills\/([^/]+)\/SKILL\.md$/)?.[1])
    .filter(Boolean));

  const issues = [];
  for (const name of [...expected].sort()) {
    if (!actual.has(name)) issues.push(`missing skill: ${name}`);
  }
  for (const name of [...actual].sort()) {
    if (!expected.has(name)) issues.push(`unexpected skill: ${name}`);
  }
  return issues;
}

function listMarkdownFiles(baseDir) {
  const out = [];
  const skipDirs = new Set([".git", ".pi", "node_modules"]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  };
  walk(baseDir);
  return out.sort();
}

function collectBrokenMarkdownLinks(baseDir) {
  const broken = [];
  for (const file of listMarkdownFiles(baseDir)) {
    const content = stripMarkdownCodeFences(fs.readFileSync(file, "utf8"));
    for (const match of content.matchAll(/!?\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
      const target = markdownLinkTarget(match[1]);
      if (!target || isExternalMarkdownTarget(target)) continue;
      const localTarget = target.split("#")[0];
      if (!localTarget) continue;
      const resolved = path.resolve(path.dirname(file), localTarget);
      if (!fs.existsSync(resolved)) {
        broken.push({ file: path.relative(baseDir, file), target: localTarget });
      }
    }
  }
  return broken;
}

function stripMarkdownCodeFences(content) {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "");
}

function markdownLinkTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("<")) {
    const closing = trimmed.indexOf(">");
    return closing === -1 ? trimmed.slice(1) : trimmed.slice(1, closing);
  }
  return trimmed.split(/\s+/)[0];
}

function isExternalMarkdownTarget(target) {
  return target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target);
}

function collectThirdPartyNoticePathIssues(baseDir) {
  const noticeFile = path.join(baseDir, "THIRD_PARTY_NOTICES.md");
  if (!fs.existsSync(noticeFile)) return ["THIRD_PARTY_NOTICES.md: missing"];

  const issues = [];
  const content = fs.readFileSync(noticeFile, "utf8");
  for (const match of content.matchAll(/`([^`]+)`/g)) {
    const localPath = match[1].trim();
    if (!isThirdPartyNoticeLocalPath(localPath)) continue;
    if (!fs.existsSync(path.join(baseDir, localPath))) {
      issues.push(`THIRD_PARTY_NOTICES.md: missing local notice path ${localPath}`);
    }
  }
  return issues;
}

function isThirdPartyNoticeLocalPath(localPath) {
  return localPath.startsWith("licenses/") || localPath.startsWith("skills/");
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "SKILL.md must have YAML frontmatter");
  const frontmatter = match[1];
  const name = frontmatter.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*(?:[>|-]\s*)?([\s\S]*?)(?:\n[a-zA-Z_-]+:|$)/m)?.[1]?.trim();
  assert.ok(name, "frontmatter must include name");
  assert.ok(description !== undefined, `frontmatter for ${name} must include description`);
  return { name, description };
}

async function testPackageManifest() {
  const pkg = readJson("package.json");
  assert.equal(pkg.name, "pi-package-development-loop");
  assert.equal(pkg.type, "module");
  assert.ok(pkg.keywords.includes("pi-package"));
  assert.deepEqual(pkg.pi.extensions, ["./extensions/development-loop.ts", "./extensions/e2e-loop.ts"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.equal(pkg.peerDependencies["@earendil-works/pi-coding-agent"], "*");
}

async function testPackageManifestPaths() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-pkg-paths-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "extensions"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "skills"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "README.md"), "fixture\n");
    fs.writeFileSync(path.join(fixtureRoot, "extensions", "good.ts"), "export default () => {};\n");

    const missing = collectMissingPackageManifestPaths(fixtureRoot, {
      files: ["README.md", "skills", "extensions/*.ts", "missing-dir"],
      pi: {
        extensions: ["./extensions/*.ts", "!./extensions/legacy.ts", "./extensions/missing.ts"],
        skills: ["./skills"],
      },
    });
    assert.deepEqual(missing, ["files: missing-dir", "pi.extensions: ./extensions/missing.ts"]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  assert.deepEqual(collectMissingPackageManifestPaths(root, readJson("package.json")), []);
}

async function testPiCoreDependencies() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-core-deps-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "extensions"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "extensions", "bad.ts"), [
      "import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';",
      "import { Box } from '@earendil-works/pi-tui/widgets';",
      "import { Type } from 'typebox';",
      "import './local';",
    ].join("\n"));

    const issues = collectPiCoreDependencyIssues(fixtureRoot, {
      dependencies: { typebox: "^1.0.0" },
      peerDependencies: {
        "@earendil-works/pi-coding-agent": "^1.0.0",
        "@earendil-works/pi-tui": "*",
      },
    });
    assert.deepEqual(issues, [
      "peerDependencies: @earendil-works/pi-coding-agent must be \"*\"",
      "peerDependencies: typebox must be \"*\"",
      "dependencies: typebox must be a peerDependency, not a runtime dependency",
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  assert.deepEqual(collectPiCoreDependencyIssues(root, readJson("package.json")), []);
}

async function testExtensionLoadsAndRegistersCommands() {
  assert.ok(exists("extensions/development-loop.ts"), "development-loop extension missing");
  const { createJiti } = require(jitiEntry);
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const mod = await jiti.import(path.join(root, "extensions", "development-loop.ts"));
  assert.equal(typeof mod.default, "function");
  assert.equal(typeof mod.__test__.resolveProjectAdapter, "function");
  assert.deepEqual(mod.__test__.BUILT_IN_ADAPTERS.map((adapter) => adapter.name), ["generic-git"]);

  assert.equal(mod.__test__.parseLoopDecision("Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: continue"), "continue");
  assert.equal(mod.__test__.parseValidated("Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: continue"), true);
  assert.equal(typeof mod.__test__.parseSinceFilter, "function");
  const parsedTwoHourSince = mod.__test__.parseSinceFilter("2h", Date.parse("2026-05-22T21:00:00.000Z"));
  assert.equal(parsedTwoHourSince?.cutoffIso, "2026-05-22T19:00:00.000Z");
  assert.equal(parsedTwoHourSince?.label, "last 2h");
  assert.equal(typeof mod.__test__.shouldCompactBeforeNextIteration, "function");
  assert.equal(mod.__test__.shouldCompactBeforeNextIteration({ getContextUsage: () => ({ tokens: 120000, contextWindow: 300000 }) }), false, "moderate 40% context usage should continue directly instead of spending a turn on compaction");
  assert.equal(mod.__test__.shouldCompactBeforeNextIteration({ getContextUsage: () => ({ tokens: 220000, contextWindow: 300000 }) }), true, "high 73% context usage should compact before the next iteration");
  assert.equal(mod.__test__.shouldCompactBeforeNextIteration({ getContextUsage: () => ({ tokens: 300000, contextWindow: 1000000 }) }), true, "absolute high token usage should still compact even on very large context windows");
  const typedFinalReport = 'Typed final report.\nDEV_LOOP_REPORT: {"validated":true,"decision":"continue","changedFiles":["README.md"],"validationCommands":["npm test"],"commitHash":"abc1234","pushStatus":"pushed"}';
  assert.equal(mod.__test__.parseLoopDecision(typedFinalReport), "continue");
  assert.equal(mod.__test__.parseValidated(typedFinalReport), true);
  assert.equal(typeof mod.__test__.parseLoopReport, "function");
  assert.deepEqual(mod.__test__.parseLoopReport(typedFinalReport), {
    decision: "continue",
    validated: true,
    deliveryEvidence: {
      changedFiles: ["README.md"],
      validationCommands: ["npm test"],
      commitHash: "abc1234",
      pushStatus: "pushed",
    },
  });
  assert.equal(typeof mod.__test__.parseLoopDeliveryEvidence, "function");
  assert.deepEqual(mod.__test__.parseLoopDeliveryEvidence([
    "Summary: improved report parsing locality.",
    "Changed files:",
    "- `extensions/development-loop-report-parser.ts` — moved prose parser behind report parser module.",
    "Validation evidence:",
    "- `npm test` exited 0",
    "Commit/push evidence: `abc1234` pushed to current branch.",
    "Possible next steps:",
    "- Extract log analysis helpers.",
  ].join("\n")), {
    summary: "improved report parsing locality.",
    nextSteps: ["Extract log analysis helpers."],
    changedFiles: ["extensions/development-loop-report-parser.ts"],
    validationCommands: ["npm test"],
    commitHash: "abc1234",
    pushStatus: "pushed",
  });
  assert.equal(mod.__test__.parseLoopDecision("Instructions only:\nDEV_LOOP_VALIDATED: yes|no\nDEV_LOOP_DECISION: continue|stop|blocked|done"), undefined);
  assert.equal(mod.__test__.parseValidated("Instructions only:\nDEV_LOOP_VALIDATED: yes|no\nDEV_LOOP_DECISION: continue|stop|blocked|done"), undefined);
  assert.equal(mod.__test__.parseLoopDecision("Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: continue\npostscript"), undefined);

  const promptRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-prompt-topic-"));
  fs.mkdirSync(path.join(promptRoot, ".git"));
  try {
    const resolved = mod.__test__.resolveProjectAdapter(promptRoot, "generic-git");
    const prompt = mod.__test__.buildIterationPrompt({
      active: true,
      adapterName: "generic-git",
      topic: "Development loop adapter → [object Object]\n\nDefault objective ───────────────── discover and complete ───────────────── enter\n\nGit delivery policy → [object Object]",
      iteration: 1,
      maxIterations: 1,
      startedAt: new Date(0).toISOString(),
      logPath: path.join(promptRoot, ".pi", "development-loop", "logs.jsonl"),
      phase: "running",
      commit: false,
      push: false,
    }, resolved, promptRoot);
    assert.match(prompt, /Topic\/objective: Development loop adapter → Default objective discover and complete enter Git delivery policy →/);
    assert.doesNotMatch(prompt, /\[object Object\]/);
    assert.doesNotMatch(prompt, /[─━═]{3,}/);
    assert.doesNotMatch(prompt, /Topic\/objective: Development loop adapter → \n/);

    const pushPrompt = mod.__test__.buildIterationPrompt({
      active: true,
      adapterName: "generic-git",
      topic: "delivery hardening",
      iteration: 1,
      maxIterations: 1,
      startedAt: new Date(0).toISOString(),
      logPath: path.join(promptRoot, ".pi", "development-loop", "logs.jsonl"),
      phase: "running",
      commit: true,
      push: true,
    }, resolved, promptRoot);
    assert.match(pushPrompt, /Before pushing, inspect `git status --short --branch` for ahead\/behind\/diverged state/);
    assert.match(pushPrompt, /do not force-push or repair history without explicit approval/);
    assert.match(pushPrompt, /blockerState mentioning git_push_fetch_first/);

    const longTailMarker = "TAIL_SHOULD_NOT_REACH_ITERATION_PROMPT";
    const longPrompt = mod.__test__.buildIterationPrompt({
      active: true,
      adapterName: "generic-git",
      topic: `context_length_exceeded ${"token ".repeat(180)}${longTailMarker}`,
      iteration: 1,
      maxIterations: 1,
      startedAt: new Date(0).toISOString(),
      logPath: path.join(promptRoot, ".pi", "development-loop", "logs.jsonl"),
      phase: "running",
      commit: false,
      push: false,
    }, resolved, promptRoot);
    const objectiveLine = longPrompt.split("\n").find((line) => line.startsWith("Topic/objective: "));
    assert.ok(objectiveLine, "iteration prompt should include an objective line");
    assert.ok(objectiveLine.length <= "Topic/objective: ".length + 600, "iteration prompt objective should be capped before it can bloat provider context");
    assert.match(objectiveLine, /…$/);
    const objectiveIntakeLine = longPrompt.split("\n").find((line) => line.startsWith("Objective intake: "));
    assert.match(objectiveIntakeLine ?? "", /Objective intake: oversized objective · length \d+ · hash [0-9a-f]{12}/);
    assert.doesNotMatch(objectiveIntakeLine ?? "", new RegExp(longTailMarker));
    assert.doesNotMatch(longPrompt, new RegExp(longTailMarker));

    const providerNoiseTopic = "read source loop logs Error: Codex error: {type:error,error:{type:invalid_request_error,code:context_length _exceeded,message:Your input exceeds the context window of this model. Please adjust your input and try again.,param:input},sequence_number:2} Warning: Development loop is waiting for compaction";
    const providerNoisePrompt = mod.__test__.buildIterationPrompt({
      active: true,
      adapterName: "generic-git",
      topic: providerNoiseTopic,
      iteration: 1,
      maxIterations: 1,
      startedAt: new Date(0).toISOString(),
      logPath: path.join(promptRoot, ".pi", "development-loop", "logs.jsonl"),
      phase: "running",
      commit: false,
      push: false,
    }, resolved, promptRoot);
    const providerNoiseObjectiveLine = providerNoisePrompt.split("\n").find((line) => line.startsWith("Topic/objective: "));
    assert.equal(providerNoiseObjectiveLine, "Topic/objective: read source loop logs");
    assert.match(providerNoisePrompt, /Objective intake: provider-noise objective · length \d+ · hash [0-9a-f]{12}/);
    assert.doesNotMatch(providerNoisePrompt, /Codex error|context_length|input exceeds the context window|Warning: Development loop/i);
  } finally {
    fs.rmSync(promptRoot, { recursive: true, force: true });
  }

  const noisyStatus = mod.__test__.statusReport({
    active: true,
    adapterName: "generic-git",
    topic: "Development loop adapter → [object Object] ↑↓ navi\nDefault objective ───────────────── ship it",
    iteration: 1,
    maxIterations: 2,
    startedAt: new Date(0).toISOString(),
    logPath: path.join(promptRoot, ".pi", "development-loop", "logs.jsonl"),
    phase: "running",
    commit: false,
    push: false,
  }, promptRoot);
  assert.match(noisyStatus, /topic: Development loop adapter → Default objective ship it/);
  assert.doesNotMatch(noisyStatus, /\[object Object\]|↑↓|navi|[─━═]{3,}|\nDefault objective/);

  const commands = new Map();
  const handlers = new Map();
  const entries = [];
  const messages = [];
  const sent = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    registerCommand(name, command) { commands.set(name, command); },
    appendEntry(customType, data) { entries.push({ customType, data }); },
    sendUserMessage(content, options) { sent.push({ content, options }); },
    sendMessage(message) { messages.push(message); },
  };
  mod.default(pi);
  assert.ok(commands.has("development-loop"));
  assert.ok(commands.has("dev-loop"));
  assert.ok(handlers.has("session_start"));
  assert.ok(handlers.has("agent_end"));
  assert.ok(handlers.has("input"));
  assert.ok(handlers.has("session_before_compact"));
  assert.ok(handlers.has("session_compact"));

  const command = commands.get("development-loop");
  const e2eRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-e2e-"));
  fs.mkdirSync(path.join(e2eRoot, ".git"));
  try {
    const statusUpdates = [];
    const widgetUpdates = [];
    const contextOverflowCompactCalls = [];
    const ctx = {
      cwd: e2eRoot,
      hasUI: true,
      ui: {
        theme: {
          fg(color, text) { return `<${color}>${text}</${color}>`; },
        },
        notify() {},
        setStatus(key, value) { statusUpdates.push({ key, value }); },
        setWidget(key, value, options) { widgetUpdates.push({ key, value, options }); },
      },
      sessionManager: {
        getCwd: () => e2eRoot,
        getEntries: () => [],
      },
      compact(options) { contextOverflowCompactCalls.push(options); },
      isIdle: () => true,
    };

    await command.handler("start --iterations=2 README polish", ctx);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /Development loop iteration 1\/2/);
    assert.match(sent[0].content, /Run id: dl-[0-9a-z]+-[0-9a-f]{6}/);
    assert.match(sent[0].content, /DEV_LOOP_DECISION/);
    assert.match(sent[0].content, /DEV_LOOP_REPORT/);
    assert.match(sent[0].content, /"summary":"brief result"/);
    assert.match(sent[0].content, /"nextSteps":\["next safe step"\]/);
    assert.match(sent[0].content, /"blockerState":"why blocked"/);
    assert.match(sent[0].content, /Blocked DEV_LOOP_REPORT objects should include blockerState and nextSteps/);
    assert.match(sent[0].content, /Example continue end report/);
    assert.match(sent[0].content, /Validation evidence: npm test \(pass\); git diff --check \(pass\)/);
    assert.match(sent[0].content, /Blocker state: none/);
    assert.match(sent[0].content, /Possible next steps: next smallest verifiable slice/);
    assert.match(sent[0].content, /Example blocked end report/);
    assert.match(sent[0].content, /Validation evidence: npm test \(failed: missing TEST_SERVICE_TOKEN\)/);
    assert.match(sent[0].content, /Blocker state: Missing TEST_SERVICE_TOKEN credential required for integration validation/);
    assert.match(sent[0].content, /Possible next steps: provide TEST_SERVICE_TOKEN; rerun `npm test`; restart \/development-loop with the same objective/);
    assert.match(sent[0].content, /Example stop handoff end report/);
    assert.match(sent[0].content, /Selected slice: final documentation cleanup and handoff/);
    assert.match(sent[0].content, /Blocker state: none; stopping because the selected objective is complete/);
    assert.match(sent[0].content, /Possible next steps: review the pushed commit; open \/development-loop status for recent context; restart with the next objective/);
    assert.match(sent[0].content, /Example done end report/);
    assert.match(sent[0].content, /Selected slice: completed the final objective cleanup/);
    assert.match(sent[0].content, /Blocker state: none; done because the objective is complete and no loop follow-up remains/);
    assert.match(sent[0].content, /Possible next steps: review the delivered commit; archive development-loop state if desired; start a new objective only if new work appears/);
    assert.match(sent[0].content, /Example interrupted resume end report/);
    assert.match(sent[0].content, /Selected slice: resumed the same iteration after compaction without advancing the loop/);
    assert.match(sent[0].content, /Blocker state: none; provider interruption recovered, same slice resumed/);
    assert.match(sent[0].content, /Possible next steps: inspect `.pi\/development-loop\/logs.jsonl`; run `\/development-loop status`; continue the same smallest slice/);
    assert.match(sent[0].content, /Example partial validation end report/);
    assert.match(sent[0].content, /Selected slice: implemented one path but only ran a targeted check/);
    assert.match(sent[0].content, /Validation evidence: targeted test command \(pass\); required validation `npm test` not run/);
    assert.match(sent[0].content, /Blocker state: full required validation is missing, so commit and push are unsafe/);
    assert.match(sent[0].content, /Possible next steps: run `npm test`; run `git diff --check`; commit and push only after both pass/);
    assert.match(sent[0].content, /Decision guide for final markers/);
    assert.match(sent[0].content, /continue: use when validation passed and another smallest slice remains/);
    assert.match(sent[0].content, /blocked: use when validation is red, required evidence is missing, or delivery is unsafe/);
    assert.match(sent[0].content, /stop: use for clean handoff or review before more automation/);
    assert.match(sent[0].content, /done: use when the objective is complete and no follow-up loop work remains/);
    assert.match(sent[0].content, /End report quality checklist/);
    assert.match(sent[0].content, /Scope and slice: exact project path, adapter, and selected slice/);
    assert.match(sent[0].content, /Changes: exact files plus what changed and why/);
    assert.match(sent[0].content, /Validation: each command with pass, fail, or not-run reason/);
    assert.match(sent[0].content, /Delivery: commit hash and push status, or why delivery was skipped/);
    assert.match(sent[0].content, /Next step: one concrete action matched to continue, blocked, stop, or done/);
    assert.match(sent[0].content, /End report anti-patterns to avoid/);
    assert.match(sent[0].content, /Do not write vague summaries like "fixed stuff" or "all good"/);
    assert.match(sent[0].content, /Do not claim tests pass without naming the exact commands and outcomes/);
    assert.match(sent[0].content, /Do not choose continue when validation is red or required evidence is missing/);
    assert.match(sent[0].content, /Do not omit why commit or push was skipped/);
    assert.match(sent[0].content, /Human-readable end report/);
    assert.match(sent[0].content, /What changed and why/);
    assert.match(sent[0].content, /Possible next steps/);
    assert.match(sent[0].content, /For continue: name the next smallest verifiable slice/);
    assert.match(sent[0].content, /For blocked: name concrete unblocking actions/);
    assert.match(sent[0].content, /For stop: name handoff or cleanup actions/);
    assert.match(sent[0].content, /Keep the machine-readable DEV_LOOP_REPORT and final markers last/);
    assert.match(sent[0].content, /Task discovery cues/);
    assert.match(sent[0].content, /TODO\.md/);
    assert.match(sent[0].content, /progress\.json/);
    assert.match(sent[0].content, /repo-local skills/);
    assert.match(sent[0].content, /caveman/);
    assert.match(sent[0].content, /improve-codebase-architecture/);
    assert.match(sent[0].content, /Preferred language: English/);
    assert.match(sent[0].content, /greploop for PR\/MR\/CL review cleanup/);
    assert.match(sent[0].content, /Do not trigger Greptile/);
    assert.equal(entries.at(-1).customType, "development-loop-state");
    assert.equal(entries.at(-1).data.phase, "running");
    const firstRunId = entries.at(-1).data.runId;
    assert.match(firstRunId, /^dl-[0-9a-z]+-[0-9a-f]{6}$/);
    const firstRunLogRecords = fs.readFileSync(path.join(e2eRoot, ".pi", "development-loop", "logs.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(firstRunLogRecords[0].runId, firstRunId);
    assert.match(statusUpdates.at(-1).value, /<accent>● run<\/accent>/);
    assert.match(statusUpdates.at(-1).value, /loop 1\/2 · generic-git · git:manual · README polish/);
    assert.equal(widgetUpdates.at(-1).value.length, 1, "development-loop widget should show only detail because footer already shows status");
    assert.match(widgetUpdates.at(-1).value[0], /last iteration_prompt_sent/);
    assert.doesNotMatch(widgetUpdates.at(-1).value[0], /loop 1\/2/);

    const sentBeforeEmptyRetry = sent.length;
    await handlers.get("agent_end")({ messages: [] }, ctx);
    assert.equal(entries.at(-1).data.active, true, "empty provider-error turns should wait for compaction/retry instead of blocking the loop");
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "empty_agent_response_waiting_for_compaction");

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sent.length, sentBeforeEmptyRetry + 1, "empty provider-error turns should automatically retry the current iteration if no compaction arrives");
    assert.match(sent.at(-1).content, /Retry development loop iteration after empty provider response/);
    assert.match(sent.at(-1).content, /Development loop iteration 1\/2/);
    assert.equal(entries.at(-1).data.lastReason, "retrying_after_empty_provider_response");

    const sentBeforeSecondEmptyRetry = sent.length;
    await handlers.get("agent_end")({ messages: [] }, ctx);
    assert.equal(entries.at(-1).data.active, true, "a second empty provider-error turn should retry once more before blocking");
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "empty_agent_response_waiting_for_compaction");

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sent.length, sentBeforeSecondEmptyRetry + 1, "second empty provider-error turns should get one more automatic retry");
    assert.match(sent.at(-1).content, /Retry development loop iteration after empty provider response/);
    assert.match(sent.at(-1).content, /Development loop iteration 1\/2/);
    assert.equal(entries.at(-1).data.lastReason, "retrying_after_empty_provider_response");

    await handlers.get("session_before_compact")({
      preparation: { tokensBefore: 272879 },
    }, ctx);
    assert.equal(entries.at(-1).customType, "development-loop-state");
    assert.equal(entries.at(-1).data.active, true);
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "preparing_for_compaction");

    const sentBeforeCompactResume = sent.length;
    await handlers.get("session_compact")({
      compactionEntry: { tokensBefore: 272879 },
    }, ctx);
    assert.equal(sent.length, sentBeforeCompactResume + 1, "active loop should resume after compaction");
    assert.match(sent.at(-1).content, /Continue development loop after compaction/);
    assert.match(sent.at(-1).content, /Development loop iteration 1\/2/);
    assert.match(sent.at(-1).content, /DEV_LOOP_DECISION/);
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "resumed_after_compaction");

    const steeringResult = await handlers.get("input")({
      type: "input",
      text: "focus release checks next",
      source: "interactive",
    }, ctx);
    assert.equal(steeringResult.action, "transform");
    assert.match(steeringResult.text, /Development loop steering request/);
    assert.match(steeringResult.text, /focus release checks next/);
    assert.match(steeringResult.text, /DEV_LOOP_DECISION/);
    assert.match(entries.at(-1).data.topic, /latest user steering: focus release checks next/);

    const multilineSteeringResult = await handlers.get("input")({
      type: "input",
      text: "Development loop adapter → generic-git\n\nGit delivery policy → manual",
      source: "interactive",
    }, ctx);
    assert.equal(multilineSteeringResult.action, "transform");
    assert.match(multilineSteeringResult.text, /User steering request: Development loop adapter → generic-git Git delivery policy → manual/);
    assert.match(entries.at(-1).data.topic, /latest user steering: Development loop adapter → generic-git Git delivery policy → manual/);
    assert.doesNotMatch(entries.at(-1).data.topic, /\n/);

    const extensionInputResult = await handlers.get("input")({
      type: "input",
      text: "Use the project instructions and matching skills now.",
      source: "extension",
    }, ctx);
    assert.equal(extensionInputResult.action, "continue");

    const sentBeforeContinue = sent.length;
    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: [
          "Changed files:",
          "- `README.md`",
          "- `extensions/development-loop.ts`",
          "",
          "Validation evidence:",
          "- `git diff --check` exited 0",
          "- `npm test` exited 0",
          "",
          "Committed/pushed slice: `6da2dcd feat: test evidence`",
          "Summary: improved loop final-report delivery evidence extraction.",
          "Possible next steps:",
          "- Add structured nextSteps to status output",
          "- Show recent loop summaries in analyze-logs",
          "",
          "DEV_LOOP_VALIDATED: yes",
          "DEV_LOOP_DECISION: continue",
        ].join("\n"),
      }],
    }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const deliveryEvidenceRecords = fs.readFileSync(path.join(e2eRoot, ".pi", "development-loop", "logs.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const iterationResultWithEvidence = deliveryEvidenceRecords.find((record) => record.event === "iteration_result" && record.decision === "continue");
    assert.equal(iterationResultWithEvidence.runId, firstRunId);
    assert.deepEqual(iterationResultWithEvidence.changedFiles, ["README.md", "extensions/development-loop.ts"]);
    assert.deepEqual(iterationResultWithEvidence.validationCommands, ["git diff --check", "npm test"]);
    assert.equal(iterationResultWithEvidence.commitHash, "6da2dcd");
    assert.equal(iterationResultWithEvidence.pushStatus, "pushed");
    assert.equal(iterationResultWithEvidence.summary, "improved loop final-report delivery evidence extraction.");
    assert.deepEqual(iterationResultWithEvidence.nextSteps, ["Add structured nextSteps to status output", "Show recent loop summaries in analyze-logs"]);
    assert.equal(sent.length, sentBeforeContinue + 1);
    assert.match(sent.at(-1).content, /Development loop iteration 2\/2/);
    assert.equal(sent.at(-1).options, undefined, "automatic loop continuation should start directly instead of waiting as a visible follow-up");

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: "Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: done",
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, false);
    assert.equal(entries.at(-1).data.phase, "done");

    await command.handler("start --iterations=1 typed final report", ctx);
    const typedReportRunId = entries.at(-1).data.runId;
    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: [
          "Typed delivery evidence follows.",
          'DEV_LOOP_REPORT: {"validated":true,"decision":"done","summary":"Profile Control Center TUI shell and draft apply flow","changedFiles":["README.md"],"validationCommands":["git diff --check","npm test"],"commitHash":"abc1234","pushStatus":"pushed","nextSteps":["Exercise real profile apply command","Add profile selection tests"]}',
          "DEV_LOOP_VALIDATED: yes",
          "DEV_LOOP_DECISION: done",
        ].join("\n"),
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, false, "typed final reports should complete the loop without marker recovery");
    assert.equal(entries.at(-1).data.phase, "done");
    const typedReportRecords = fs.readFileSync(path.join(e2eRoot, ".pi", "development-loop", "logs.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const typedReportFinished = typedReportRecords.find((record) => record.event === "loop_finished" && record.runId === typedReportRunId);
    assert.equal(typedReportFinished.decision, "done");
    assert.deepEqual(typedReportFinished.changedFiles, ["README.md"]);
    assert.deepEqual(typedReportFinished.validationCommands, ["git diff --check", "npm test"]);
    assert.equal(typedReportFinished.commitHash, "abc1234");
    assert.equal(typedReportFinished.pushStatus, "pushed");
    assert.equal(typedReportFinished.summary, "Profile Control Center TUI shell and draft apply flow");
    assert.deepEqual(typedReportFinished.nextSteps, ["Exercise real profile apply command", "Add profile selection tests"]);
    const typedStatus = mod.__test__.statusReport(entries.at(-1).data, e2eRoot);
    assert.match(typedStatus, /summary Profile Control Center TUI shell and draft apply flow/);
    assert.match(typedStatus, /next 1 Exercise real profile apply command/);
    assert.match(typedStatus, /next 2 Add profile selection tests/);
    assert.match(typedStatus, /Recent report context:/);
    assert.match(typedStatus, /- i1 · done · summary Profile Control Center TUI shell and draft apply flow/);
    assert.match(widgetUpdates.at(-1).value[0], /summary Profile Control Center TUI shell and draft apply flow/);
    assert.match(widgetUpdates.at(-1).value[0], /next Exercise real profile apply command/);
    assert.match(widgetUpdates.at(-1).value[0], /\+1 more/);

    await command.handler("start --iterations=1 typed blocked report", ctx);
    const typedBlockedRunId = entries.at(-1).data.runId;
    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: [
          "Blocked report.",
          'DEV_LOOP_REPORT: {"validated":false,"decision":"blocked","summary":"Could not validate profile apply flow","blockerState":"Missing GORMES_PROFILE_TOKEN credential for integration validation","nextSteps":["Provide GORMES_PROFILE_TOKEN","Restart /development-loop with the same profile apply objective"]}',
          "DEV_LOOP_VALIDATED: no",
          "DEV_LOOP_DECISION: blocked",
        ].join("\n"),
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, false);
    assert.equal(entries.at(-1).data.phase, "blocked");
    const typedBlockedRecords = fs.readFileSync(path.join(e2eRoot, ".pi", "development-loop", "logs.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const typedBlockedFinished = typedBlockedRecords.find((record) => record.event === "loop_finished" && record.runId === typedBlockedRunId);
    assert.equal(typedBlockedFinished.blockerState, "Missing GORMES_PROFILE_TOKEN credential for integration validation");
    const typedBlockedStatus = mod.__test__.statusReport(entries.at(-1).data, e2eRoot);
    assert.match(typedBlockedStatus, /blocker Missing GORMES_PROFILE_TOKEN credential for integration validation/);
    assert.match(typedBlockedStatus, /next 1 Provide GORMES_PROFILE_TOKEN/);

    await command.handler("start --iterations=1 context overflow", ctx);
    const sentBeforeContextOverflow = sent.length;
    const compactCallsBeforeContextOverflow = contextOverflowCompactCalls.length;
    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: "Error: Codex error: {type:error,error:{type:invalid_request_error,code:context_length\n _exceeded,message:Your input exceeds the context window of this model. Please adjust your input and try again.,param:input},sequence_number:2}\nWarning: Context overflow detected, Auto-compacting...",
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, true, "context-overflow provider errors should wait for compaction instead of blocking the loop");
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "context_overflow_waiting_for_compaction");
    assert.equal(contextOverflowCompactCalls.length, compactCallsBeforeContextOverflow + 1, "context-overflow provider errors should proactively request compaction when available");
    assert.match(contextOverflowCompactCalls.at(-1).customInstructions, /provider reported a context-overflow error/);
    assert.match(contextOverflowCompactCalls.at(-1).customInstructions, /Preserve development loop state/);
    assert.equal(sent.length, sentBeforeContextOverflow, "context-overflow provider errors should not retry before compaction");

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: "Error: Codex error: {type:error,error:{type:invalid_request_error,code:context_length_exceeded,message:Your input exceeds the context window of this model. Please adjust your input and try again.,param:input},sequence_number:3}",
      }],
    }, ctx);
    assert.equal(contextOverflowCompactCalls.length, compactCallsBeforeContextOverflow + 1, "duplicate context-overflow events while waiting should not request duplicate compactions");
    assert.equal(entries.at(-1).data.lastReason, "context_overflow_waiting_for_compaction");
    assert.equal(sent.length, sentBeforeContextOverflow, "duplicate context-overflow events should not retry before compaction");

    await handlers.get("session_before_compact")({ preparation: { tokensBefore: 272879 } }, ctx);
    const sentBeforeContextOverflowResume = sent.length;
    await handlers.get("session_compact")({ compactionEntry: { tokensBefore: 272879 } }, ctx);
    assert.equal(sent.length, sentBeforeContextOverflowResume + 1, "context-overflow provider errors should resume after compaction");
    assert.match(sent.at(-1).content, /Continue development loop after compaction/);
    assert.match(sent.at(-1).content, /Development loop iteration 1\/1/);
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "resumed_after_compaction");

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: "Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: done",
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.phase, "done");

    await command.handler("start --iterations=1 non-assistant context overflow", ctx);
    const sentBeforeNonAssistantContextOverflow = sent.length;
    const compactCallsBeforeNonAssistantContextOverflow = contextOverflowCompactCalls.length;
    await handlers.get("agent_end")({
      messages: [{
        role: "system",
        content: "Error: Codex error: {type:error,error:{type:invalid_request_error,code:context_length_exceeded,message:Your input exceeds the context window of this model. Please adjust your input and try again.,param:input},sequence_number:4}",
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, true, "non-assistant context-overflow provider errors should wait for compaction instead of retrying as empty responses");
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "context_overflow_waiting_for_compaction");
    assert.equal(contextOverflowCompactCalls.length, compactCallsBeforeNonAssistantContextOverflow + 1, "non-assistant context-overflow provider errors should request compaction when available");
    assert.equal(sent.length, sentBeforeNonAssistantContextOverflow, "non-assistant context-overflow provider errors should not retry before compaction");

    await handlers.get("session_compact")({ compactionEntry: { tokensBefore: 272879 } }, ctx);
    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: "Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: done",
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.phase, "done");

    await command.handler("start --iterations=1 marker recovery", ctx);
    const sentBeforeMarkerRecovery = sent.length;
    await handlers.get("agent_end")({
      messages: [{ role: "assistant", content: "Work completed, but I forgot the required final markers." }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, true, "missing marker turns should request one recovery response instead of blocking immediately");
    assert.equal(entries.at(-1).data.phase, "running");
    assert.equal(entries.at(-1).data.lastReason, "missing_final_marker_recovery_requested");
    assert.equal(entries.at(-1).data.markerRecoveryRetries, 1);
    assert.equal(sent.length, sentBeforeMarkerRecovery + 1, "missing marker turns should send exactly one recovery prompt");
    assert.match(sent.at(-1).content, /Return only the development loop final markers/);
    assert.match(sent.at(-1).content, /DEV_LOOP_VALIDATED: yes\|no/);

    await handlers.get("agent_end")({
      messages: [{ role: "assistant", content: "DEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: done" }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, false, "valid recovered markers should complete the loop normally");
    assert.equal(entries.at(-1).data.phase, "done");

    await command.handler("start --iterations=1 blocker", ctx);
    const blockerRunId = entries.at(-1).data.runId;
    const sentBeforeBlockerRecovery = sent.length;
    await handlers.get("agent_end")({
      messages: [{ role: "assistant", content: "No markers here." }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, true);
    assert.equal(entries.at(-1).data.lastReason, "missing_final_marker_recovery_requested");
    assert.equal(sent.length, sentBeforeBlockerRecovery + 1);

    await handlers.get("agent_end")({
      messages: [{ role: "assistant", content: "Still no markers here." }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, false, "a second missing-marker turn should block instead of retrying forever");
    assert.equal(entries.at(-1).data.phase, "blocked");
    assert.equal(entries.at(-1).data.lastReason, "missing DEV_LOOP_DECISION final marker after recovery request");
    assert.match(statusUpdates.at(-1).value, /<error>■ block<\/error>/);
    assert.match(statusUpdates.at(-1).value, /git:manual/);
    assert.doesNotMatch(statusUpdates.at(-1).value, /blocked \(blocked\)/);
    assert.equal(widgetUpdates.at(-1).value.length, 1, "blocked development-loop widget should show only detail because footer already shows status");
    const postmortemRecords = fs.readFileSync(path.join(e2eRoot, ".pi", "development-loop", "logs.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const missingMarkerPostmortem = postmortemRecords.find((record) => record.event === "loop_postmortem" && record.runId === blockerRunId);
    assert.equal(missingMarkerPostmortem.reason, "missing DEV_LOOP_DECISION final marker after recovery request");
    assert.equal(missingMarkerPostmortem.likelyCause, "assistant_response_missing_final_markers");
    assert.equal(missingMarkerPostmortem.nextSafeAction, "reuse completed work if present, then return only DEV_LOOP_VALIDATED and DEV_LOOP_DECISION markers or restart the iteration");

    const providerNoiseTopic = "read source loop logs Error: Codex error: {type:error,error:{type:invalid_request_error,code:context_length _exceeded,message:Your input exceeds the context window of this model. Please adjust your input and try again.,param:input},sequence_number:2} Warning: Development loop is waiting for compaction";
    await command.handler(`start --iterations=1 ${providerNoiseTopic}`, ctx);
    const providerNoiseRecords = fs.readFileSync(path.join(e2eRoot, ".pi", "development-loop", "logs.jsonl"), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const providerNoiseStart = providerNoiseRecords.filter((record) => record.event === "loop_started").at(-1);
    assert.equal(providerNoiseStart.topic, "read source loop logs");
    assert.equal(providerNoiseStart.topicKind, "provider-noise");
    assert.equal(providerNoiseStart.topicSanitized, true);
    assert.ok(providerNoiseStart.topicLength > providerNoiseStart.topic.length, "provider-noise logs should preserve raw topic length for diagnostics");
    assert.doesNotMatch(statusUpdates.at(-1).value, /Codex error|context_length|input exceeds the context window|Warning: Development loop/i);
    await handlers.get("agent_end")({
      messages: [{ role: "assistant", content: "DEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: done" }],
    }, ctx);

    const noisySteeringRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-noisy-steering-"));
    fs.mkdirSync(path.join(noisySteeringRoot, ".git"));
    try {
      const noisySteeringCtx = {
        ...ctx,
        cwd: noisySteeringRoot,
        sessionManager: {
          getCwd: () => noisySteeringRoot,
          getEntries: () => [{
            type: "custom",
            customType: "development-loop-state",
            data: {
              active: true,
              adapterName: "generic-git",
              topic: "Development loop adapter → [object Object] ↑↓ navi\nDefault objective ───────────────── ship it",
              iteration: 1,
              maxIterations: 2,
              startedAt: new Date(0).toISOString(),
              logPath: path.join(noisySteeringRoot, ".pi", "development-loop", "logs.jsonl"),
              phase: "running",
              commit: false,
              push: false,
            },
          }],
        },
      };
      await handlers.get("session_start")({}, noisySteeringCtx);
      const noisySteeringResult = await handlers.get("input")({
        type: "input",
        text: "focus release checks next",
        source: "interactive",
      }, noisySteeringCtx);
      assert.equal(noisySteeringResult.action, "transform");
      assert.match(entries.at(-1).data.topic, /Development loop adapter → Default objective ship it; latest user steering: focus release checks next/);
      assert.doesNotMatch(entries.at(-1).data.topic, /\[object Object\]|↑↓|navi|[─━═]{3,}|\nDefault objective/);
      await command.handler("stop", noisySteeringCtx);
    } finally {
      fs.rmSync(noisySteeringRoot, { recursive: true, force: true });
    }

    fs.mkdirSync(path.join(e2eRoot, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(e2eRoot, ".pi", "development-loop.json"), JSON.stringify({
      adapter: "docs-only",
      defaultTopic: "polish docs",
      validationCommands: ["npm test"],
    }, null, 2));
    await command.handler("adapters", ctx);
    assert.match(messages.at(-1).content, /Detected adapter: generic-git/);
    assert.doesNotMatch(messages.at(-1).content, /Project-configured adapter|docs-only|Built-in adapters:/);

    fs.writeFileSync(path.join(e2eRoot, ".pi", "development-loop.json"), JSON.stringify({
      adapter: {
        value: "gormes",
        label: "Gormes",
        description: "Gormes Go-native Hermes-compatible agent runtime",
      },
      defaultTopic: "legacy object-valued adapter config",
    }, null, 2));
    await command.handler("adapters", ctx);
    assert.match(messages.at(-1).content, /Detected adapter: generic-git/);
    assert.doesNotMatch(messages.at(-1).content, /Detected adapter: gormes|Project-configured adapter/);

    const proactiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-proactive-compact-"));
    fs.mkdirSync(path.join(proactiveRoot, ".git"));
    try {
      const compactCalls = [];
      const proactiveCtx = {
        ...ctx,
        cwd: proactiveRoot,
        sessionManager: {
          getCwd: () => proactiveRoot,
          getEntries: () => [],
        },
        getContextUsage: () => ({ tokens: 300000, contextWindow: 1000000 }),
        compact(options) { compactCalls.push(options); },
      };
      const proactiveTailMarker = "TAIL_SHOULD_NOT_REACH_COMPACTION_INSTRUCTIONS";
      const proactiveTopic = `context_length_exceeded ${"token ".repeat(180)}${proactiveTailMarker}`;
      await command.handler(`start --iterations=2 ${proactiveTopic}`, proactiveCtx);
      const proactiveLogRecord = JSON.parse(fs.readFileSync(path.join(proactiveRoot, ".pi", "development-loop", "logs.jsonl"), "utf8").trim().split(/\r?\n/)[0]);
      assert.ok(proactiveLogRecord.topic.length <= 600, "development-loop logs should compact copied long topics before repeating them in every event");
      assert.equal(proactiveLogRecord.topicLength, proactiveTopic.length, "development-loop logs should preserve original topic length for diagnostics");
      assert.equal(proactiveLogRecord.topicTruncated, true, "development-loop logs should mark truncated topics");
      assert.match(proactiveLogRecord.topicHash, /^[0-9a-f]{12}$/, "development-loop logs should hash long topics for deduplication without repeating the full paste");
      assert.equal(proactiveLogRecord.topicKind, "oversized");
      assert.doesNotMatch(proactiveLogRecord.topic, new RegExp(proactiveTailMarker));
      const proactivePromptObjectiveLine = sent.at(-1).content.split("\n").find((line) => line.startsWith("Topic/objective: "));
      assert.ok(proactivePromptObjectiveLine, "initial prompt should include an objective line");
      assert.ok(proactivePromptObjectiveLine.length <= "Topic/objective: ".length + 600, "initial prompt objective should be capped before it can bloat provider context");
      assert.doesNotMatch(sent.at(-1).content, new RegExp(proactiveTailMarker));
      const sentBeforeProactiveContinue = sent.length;
      await handlers.get("agent_end")({
        messages: [{
          role: "assistant",
          content: "Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: continue",
        }],
      }, proactiveCtx);
      assert.equal(compactCalls.length, 1, "high context usage should compact before next iteration");
      assert.match(compactCalls[0].customInstructions, /development loop state/);
      const compactionObjectiveLine = compactCalls[0].customInstructions.split("\n").find((line) => line.startsWith("- Objective: "));
      assert.ok(compactionObjectiveLine, "compaction instructions should include an objective line");
      assert.ok(compactionObjectiveLine.length <= "- Objective: ".length + 600, "compaction objective should be capped before it can bloat provider context");
      assert.match(compactionObjectiveLine, /…$/);
      assert.doesNotMatch(compactCalls[0].customInstructions, new RegExp(proactiveTailMarker));
      assert.equal(sent.length, sentBeforeProactiveContinue, "next iteration should wait for compaction to finish");
      assert.equal(entries.at(-1).data.iteration, 2);
      assert.equal(entries.at(-1).data.phase, "queued");
      assert.equal(entries.at(-1).data.lastReason, "compaction_before_next_iteration");

      await handlers.get("session_compact")({ compactionEntry: { tokensBefore: 300000 } }, proactiveCtx);
      assert.equal(sent.length, sentBeforeProactiveContinue + 1, "queued loop should continue after compaction");
      assert.match(sent.at(-1).content, /Development loop iteration 2\/2/);
    } finally {
      fs.rmSync(proactiveRoot, { recursive: true, force: true });
    }

    const analysisRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-analysis-"));
    fs.mkdirSync(path.join(analysisRoot, ".git"));
    try {
      const analysisLog = path.join(analysisRoot, ".pi", "development-loop", "logs.jsonl");
      fs.mkdirSync(path.dirname(analysisLog), { recursive: true });
      const oversizedTopic = `${"browser dump ".repeat(80)}TAIL_SHOULD_BE_DIAGNOSTIC_ONLY`;
      fs.writeFileSync(analysisLog, [
        JSON.stringify({ at: new Date(0).toISOString(), event: "loop_started", runId: "run-blocked", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "started" }),
        JSON.stringify({ at: new Date(1).toISOString(), event: "empty_agent_response_waiting_for_compaction", runId: "run-blocked", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "running", reason: "missing_assistant_text" }),
        JSON.stringify({ at: new Date(1).toISOString(), event: "empty_provider_response_retry_sent", runId: "run-blocked", adapterName: "generic-git", iteration: 1, maxIterations: 2, phase: "running", reason: "retry 1/1" }),
        JSON.stringify({ at: new Date(2).toISOString(), event: "iteration_queued", runId: "run-blocked", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "queued", reason: "compaction_before_next_iteration" }),
        JSON.stringify({ at: new Date(2).toISOString(), event: "compaction_before_next_iteration", runId: "run-blocked", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "queued", reason: "tokens=120000 · context_window=272000" }),
        JSON.stringify({ at: new Date(2).toISOString(), event: "compaction_resume_queued", runId: "run-blocked", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "queued" }),
        JSON.stringify({ at: new Date(2).toISOString(), event: "compaction_started", runId: "run-blocked", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "running" }),
        JSON.stringify({ at: new Date(2).toISOString(), event: "compaction_failed_before_next_iteration", runId: "run-blocked", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "queued", reason: "compaction command failed" }),
        JSON.stringify({ at: new Date(2).toISOString(), event: "user_steering", runId: "run-blocked", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "running", reason: "focus release checks next" }),
        JSON.stringify({ at: new Date(2).toISOString(), event: "topic_diagnostic", runId: "run-blocked", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "running", topic: "read source loop logs", topicKind: "provider-noise", topicSanitized: true, topicLength: 2346, topicHash: "cfe480c18f24" }),
        JSON.stringify({ at: new Date(3).toISOString(), event: "provider_error", runId: "run-blocked", adapterName: "generic-git", iteration: 1, maxIterations: 2, phase: "running", error: { type: "invalid_request_error", code: "context_length_exceeded", message: "Your input exceeds the context window of this model." } }),
        JSON.stringify({ at: new Date(4).toISOString(), event: "missing_final_marker_recovery_requested", runId: "run-blocked", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "running", reason: "missing DEV_LOOP_DECISION final marker" }),
        JSON.stringify({ at: new Date(4).toISOString(), event: "loop_blocked", runId: "run-blocked", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "blocked", reason: "missing_final_markers", blockerState: "Missing DEV_LOOP_REPORT blockerState after blocked ending" }),
        JSON.stringify({ at: new Date(5).toISOString(), event: "loop_postmortem", runId: "run-blocked", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "blocked", reason: "missing_final_markers", likelyCause: "assistant_response_missing_final_markers", nextSafeAction: "return only final markers" }),
        JSON.stringify({ at: new Date(6).toISOString(), event: "loop_started", runId: "run-done", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "started" }),
        JSON.stringify({ at: new Date(7).toISOString(), event: "missing_final_marker_recovery_requested", runId: "run-done", adapterName: "generic-git", topic: oversizedTopic, iteration: 2, maxIterations: 2, phase: "running", reason: "missing DEV_LOOP_DECISION final marker" }),
        JSON.stringify({ at: new Date(8).toISOString(), event: "loop_finished", runId: "run-done", adapterName: "generic-git", topic: oversizedTopic, iteration: 2, maxIterations: 2, phase: "done", decision: "done" }),
        JSON.stringify({ at: new Date(9).toISOString(), event: "iteration_result", runId: "run-done", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "reported", decision: "done", summary: "implemented profile control center", nextSteps: ["exercise real profile apply command", "add profile selection tests"], changedFiles: ["README.md"], validationCommands: ["git diff --check"], commitHash: "abc1234", pushStatus: "pushed" }),
        JSON.stringify({ at: new Date(10).toISOString(), event: "iteration_result", runId: "run-done", adapterName: "generic-git", iteration: 2, maxIterations: 2, phase: "reported", decision: "continue", summary: "all good", changedFiles: ["README.md"], commitHash: "unpushed123" }),
        JSON.stringify({ at: new Date(11).toISOString(), event: "loop_started", runId: "run-done", adapterName: "generic-git", topic: oversizedTopic, iteration: 1, maxIterations: 2, phase: "started" }),
      ].join("\n") + "\n", "utf8");
      const analysisMessagesBefore = messages.length;
      await command.handler(`analyze-logs ${analysisLog}`, {
        ...ctx,
        cwd: analysisRoot,
        sessionManager: {
          getCwd: () => analysisRoot,
          getEntries: () => [],
        },
      });
      assert.equal(messages.length, analysisMessagesBefore + 1);
      assert.equal(messages.at(-1).customType, "development-loop-log-analysis");
      assert.match(messages.at(-1).content, /Development loop log analysis:/);
      assert.match(messages.at(-1).content, /Records: 20/);
      assert.match(messages.at(-1).content, /Loops started: 3/);
      assert.match(messages.at(-1).content, /Finished loops: 1/);
      assert.match(messages.at(-1).content, /Finished-without-validation records: 1/);
      assert.match(messages.at(-1).content, /Finished-without-delivery records: 1/);
      assert.match(messages.at(-1).content, /Iteration result records: 2/);
      assert.match(messages.at(-1).content, /Iteration-result-without-validation records: 1/);
      assert.match(messages.at(-1).content, /Iteration prompt sent records: 0/);
      assert.match(messages.at(-1).content, /Prompt\/result imbalance: 2 more results than prompts/);
      assert.match(messages.at(-1).content, /Duplicate prompt-sent groups: 0/);
      assert.match(messages.at(-1).content, /Duplicate prompt-sent extra records: 0/);
      assert.match(messages.at(-1).content, /Top finish decision: done \(1 record\)/);
      assert.match(messages.at(-1).content, /Blocked loops: 1/);
      assert.match(messages.at(-1).content, /Top block reason: missing_final_markers \(1 record\)/);
      assert.match(messages.at(-1).content, /Top blocked log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Postmortems: 1/);
      assert.match(messages.at(-1).content, /Top postmortem cause: assistant_response_missing_final_markers \(1 record\)/);
      assert.match(messages.at(-1).content, /Top next safe action: return only final markers \(1 record\)/);
      assert.match(messages.at(-1).content, /Final-marker recovery requests: 2/);
      assert.match(messages.at(-1).content, /Top final-marker recovery log source: \.pi\/development-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /Top final-marker recovery reason: missing DEV_LOOP_DECISION final marker \(2 records\)/);
      assert.match(messages.at(-1).content, /Final-marker recovery successes: 1/);
      assert.match(messages.at(-1).content, /Final-marker recovery blocks: 1/);
      assert.match(messages.at(-1).content, /Top final-marker recovery block log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top final-marker recovery block reason: missing_final_markers \(1 record\)/);
      assert.match(messages.at(-1).content, /Delivery evidence records: 3/);
      assert.match(messages.at(-1).content, /Changed-file evidence records: 2/);
      assert.match(messages.at(-1).content, /Validation evidence records: 1/);
      assert.match(messages.at(-1).content, /Commit evidence records: 2/);
      assert.match(messages.at(-1).content, /Push evidence records: 1/);
      assert.match(messages.at(-1).content, /Report summary records: 2/);
      assert.match(messages.at(-1).content, /Report blocker-state records: 1/);
      assert.match(messages.at(-1).content, /Report next-step items: 2/);
      assert.match(messages.at(-1).content, /Report missing-next-steps records: 1/);
      assert.match(messages.at(-1).content, /Top report missing-next-steps decision: continue \(1 record\)/);
      assert.match(messages.at(-1).content, /Missing report next steps: include nextSteps for continue and blocked reports so queued follow-up work has a concrete next action/);
      assert.match(messages.at(-1).content, /Report quality warning records: 1/);
      assert.match(messages.at(-1).content, /Top report quality warning: vague report summary "all good" \(1 record\)/);
      assert.match(messages.at(-1).content, /Report quality warnings: replace vague or incomplete summaries with scope, changes, validation, delivery, blocker state, and next-step evidence/);
      assert.match(messages.at(-1).content, /Top report summary: implemented profile control center \(1 record\)/);
      assert.match(messages.at(-1).content, /Top report blocker state: Missing DEV_LOOP_REPORT blockerState after blocked ending \(1 record\)/);
      assert.match(messages.at(-1).content, /Top report next step: exercise real profile apply command \(1 record\)/);
      assert.match(messages.at(-1).content, /Commit-without-push records: 1/);
      assert.match(messages.at(-1).content, /Top commit-without-push log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top push status: pushed \(1 record\)/);
      assert.match(messages.at(-1).content, /Unresolved loop starts: 0/);
      assert.match(messages.at(-1).content, /Empty provider responses: 2/);
      assert.match(messages.at(-1).content, /Empty provider retry records: 1/);
      assert.match(messages.at(-1).content, /Top empty provider log source: \.pi\/development-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /Top empty provider reason: missing_assistant_text \(1 record\)/);
      assert.match(messages.at(-1).content, /Queued iteration records: 2/);
      assert.match(messages.at(-1).content, /Top queued iteration log source: \.pi\/development-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /Top queued iteration reason: compaction_before_next_iteration \(1 record\)/);
      assert.match(messages.at(-1).content, /Provider error records: 1/);
      assert.match(messages.at(-1).content, /Top provider error log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top provider error code: context_length_exceeded \(1 record\)/);
      assert.match(messages.at(-1).content, /Top provider error category: context-overflow \(1 record\)/);
      assert.match(messages.at(-1).content, /Context overflow responses: 1/);
      assert.match(messages.at(-1).content, /Compaction events: 4/);
      assert.match(messages.at(-1).content, /Top compaction log source: \.pi\/development-loop\/logs\.jsonl \(4 records\)/);
      assert.match(messages.at(-1).content, /Premature compaction records: 1/);
      assert.match(messages.at(-1).content, /Top premature compaction log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Premature compaction churn: reload stale Pi sessions or inspect compaction policy when compaction happens below current token and context-ratio thresholds/);
      assert.match(messages.at(-1).content, /Compaction resume records: 1/);
      assert.match(messages.at(-1).content, /Compaction failure records: 1/);
      assert.match(messages.at(-1).content, /Top compaction failure reason: compaction command failed \(1 record\)/);
      assert.match(messages.at(-1).content, /User steering records: 1/);
      assert.match(messages.at(-1).content, /Max user steering length: 25/);
      assert.match(messages.at(-1).content, /Provider-noise topic records: 1/);
      assert.match(messages.at(-1).content, /Sanitized topic records: 1/);
      assert.match(messages.at(-1).content, /Oversized topic records: 11/);
      assert.match(messages.at(-1).content, /Most repeated oversized topic: 10 records/);
      assert.match(messages.at(-1).content, /Max topic length: 2346/);
      assert.match(messages.at(-1).content, /Oversized topics: cap prompt and log objective text/);

      const blockerKindRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-blocker-kind-"));
      try {
        const blockerKindLog = path.join(blockerKindRoot, ".pi", "fetch-first-loop", "logs.jsonl");
        fs.mkdirSync(path.dirname(blockerKindLog), { recursive: true });
        fs.writeFileSync(blockerKindLog, [
          JSON.stringify({ at: new Date(18).toISOString(), event: "loop_finished", runId: "run-fetch-first", iteration: 1, maxIterations: 1, phase: "blocked", decision: "blocked", reason: "blocked", blockerState: "git push origin main rejected with fetch-first" }),
        ].join("\n") + "\n", "utf8");
        const blockerKindMessagesBefore = messages.length;
        await command.handler(`analyze-logs ${blockerKindLog}`, {
          ...ctx,
          cwd: blockerKindRoot,
          sessionManager: {
            getCwd: () => blockerKindRoot,
            getEntries: () => [],
          },
        });
        assert.equal(messages.length, blockerKindMessagesBefore + 1);
        assert.match(messages.at(-1).content, /Finished loops: 1/);
        assert.match(messages.at(-1).content, /Blocked loops: 1/);
        assert.match(messages.at(-1).content, /Blocker kind records: 1/);
        assert.match(messages.at(-1).content, /Top blocker kind: git_push_fetch_first \(1 record\)/);
        assert.match(messages.at(-1).content, /Fetch-first push blockers: approve fetch\/rebase\/merge workflow, rerun validation, then push/);

        const blockerKindJsonMessagesBefore = messages.length;
        await command.handler(`analyze-logs --json ${blockerKindLog}`, {
          ...ctx,
          cwd: blockerKindRoot,
          sessionManager: {
            getCwd: () => blockerKindRoot,
            getEntries: () => [],
          },
        });
        assert.equal(messages.length, blockerKindJsonMessagesBefore + 1);
        const blockerKindJson = JSON.parse(messages.at(-1).content);
        assert.equal(blockerKindJson.source, ".pi/fetch-first-loop/logs.jsonl");
        assert.equal(blockerKindJson.blockedLoops, 1);
        assert.equal(blockerKindJson.blockerKindRecords, 1);
        assert.equal(blockerKindJson.topBlockerKind, "git_push_fetch_first");
        assert.ok(blockerKindJson.recommendations.includes("Fetch-first push blockers: approve fetch/rebase/merge workflow, rerun validation, then push."));

        const validationBlockerLog = path.join(blockerKindRoot, ".pi", "validation-loop", "logs.jsonl");
        fs.mkdirSync(path.dirname(validationBlockerLog), { recursive: true });
        fs.writeFileSync(validationBlockerLog, [
          JSON.stringify({ at: new Date(19).toISOString(), event: "loop_finished", runId: "run-validation-failed", iteration: 1, maxIterations: 1, phase: "blocked", decision: "blocked", reason: "blocked", blockerState: "flutter test failed twice; first failing assertion in test/e2e/connect_and_talk_web_e2e_test.dart:74 expected http://127.0.0.1:8765 but got null" }),
        ].join("\n") + "\n", "utf8");
        const validationBlockerMessagesBefore = messages.length;
        await command.handler(`analyze-logs ${validationBlockerLog}`, {
          ...ctx,
          cwd: blockerKindRoot,
          sessionManager: {
            getCwd: () => blockerKindRoot,
            getEntries: () => [],
          },
        });
        assert.equal(messages.length, validationBlockerMessagesBefore + 1);
        assert.match(messages.at(-1).content, /Blocker kind records: 1/);
        assert.match(messages.at(-1).content, /Top blocker kind: validation_failed_twice \(1 record\)/);
        assert.match(messages.at(-1).content, /Validation failed twice blockers: fix the first failing assertion, rerun required validation, then commit\/push only after green/);
      } finally {
        fs.rmSync(blockerKindRoot, { recursive: true, force: true });
      }

      const customLog = path.join(analysisRoot, ".pi", "navivox-loop", "logs.jsonl");
      fs.mkdirSync(path.dirname(customLog), { recursive: true });
      fs.writeFileSync(customLog, [
        JSON.stringify({ timestamp: new Date(10).toISOString(), event: "loop_start", topic: "custom delivery", iteration: 1, maxIterations: 3 }),
        JSON.stringify({ timestamp: new Date(10).toISOString(), event: "iteration_prompt_sent", topic: "custom delivery", iteration: 1, maxIterations: 3 }),
        JSON.stringify({ timestamp: new Date(10).toISOString(), event: "iteration_prompt_sent", topic: "custom delivery", iteration: 1, maxIterations: 3 }),
        JSON.stringify({ timestamp: new Date(11).toISOString(), event: "assistant_decision", iteration: 1, decision: "continue", ciGreen: true, finalLine: "LOOP_DECISION: continue" }),
        JSON.stringify({ timestamp: new Date(12).toISOString(), event: "iteration_result", iteration: 1, decision: "continue", files: ["lib/profile.dart"], validation: ["flutter test"], commit: "def5678", pushed: "origin/main", ci_green: "yes" }),
        JSON.stringify({ timestamp: new Date(12).toISOString(), type: "iteration_result", iteration: "1/3", loop_decision: "continue", validation: ["npm test"], commit: "typed123", push: "origin/main", ci_gate: "local_full_gate_passed" }),
        JSON.stringify({ timestamp: new Date(13).toISOString(), event: "done", iteration: 1, reason: "assistant reported LOOP_DECISION: done with CI_GREEN: yes" }),
        JSON.stringify({ timestamp: new Date(14).toISOString(), event: "loop_start", topic: "custom blocked", iteration: 1, maxIterations: 3 }),
        JSON.stringify({ timestamp: new Date(15).toISOString(), event: "blocked", iteration: 1, reason: "assistant_decision_missing", ciGreen: false }),
        JSON.stringify({ timestamp: new Date(16).toISOString(), event: "ci_gate_missing", iteration: 1, reason: "missing_CI_GREEN_yes", decision: "continue", ciGreen: false }),
        JSON.stringify({ timestamp: new Date(17).toISOString(), event: "self_improvement_queued", iteration: 1, reason: "ci_gate_missing", nextAction: "tighten final marker prompt" }),
      ].join("\n") + "\n", "utf8");
      const customAnalysisMessagesBefore = messages.length;
      await command.handler(`analyze-logs ${customLog}`, {
        ...ctx,
        cwd: analysisRoot,
        sessionManager: {
          getCwd: () => analysisRoot,
          getEntries: () => [],
        },
      });
      assert.equal(messages.length, customAnalysisMessagesBefore + 1);
      assert.match(messages.at(-1).content, /Records: 11/);
      assert.match(messages.at(-1).content, /Loops started: 2/);
      assert.match(messages.at(-1).content, /Finished loops: 1/);
      assert.match(messages.at(-1).content, /Finished-without-validation records: 1/);
      assert.match(messages.at(-1).content, /Finished-without-delivery records: 1/);
      assert.match(messages.at(-1).content, /Iteration result records: 2/);
      assert.match(messages.at(-1).content, /Iteration prompt sent records: 2/);
      assert.match(messages.at(-1).content, /Prompt\/result imbalance: 0/);
      assert.match(messages.at(-1).content, /Duplicate prompt-sent groups: 1/);
      assert.match(messages.at(-1).content, /Duplicate prompt-sent extra records: 1/);
      assert.match(messages.at(-1).content, /Assistant decision records: 1/);
      assert.match(messages.at(-1).content, /Top assistant decision: continue \(1 record\)/);
      assert.match(messages.at(-1).content, /Top finish decision: done \(1 record\)/);
      assert.match(messages.at(-1).content, /Blocked loops: 1/);
      assert.match(messages.at(-1).content, /Top block reason: assistant_decision_missing \(1 record\)/);
      assert.match(messages.at(-1).content, /Delivery evidence records: 2/);
      assert.match(messages.at(-1).content, /Top push status: origin\/main \(2 records\)/);
      assert.match(messages.at(-1).content, /CI-green records: 3/);
      assert.match(messages.at(-1).content, /CI-red records: 2/);
      assert.match(messages.at(-1).content, /Top CI-red log source: \.pi\/navivox-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /CI-gate missing records: 1/);
      assert.match(messages.at(-1).content, /Top CI-gate missing log source: \.pi\/navivox-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top CI-gate missing reason: missing_CI_GREEN_yes \(1 record\)/);
      assert.match(messages.at(-1).content, /Self-improvement queued records: 1/);
      assert.match(messages.at(-1).content, /Top self-improvement log source: \.pi\/navivox-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top self-improvement reason: ci_gate_missing \(1 record\)/);
      assert.match(messages.at(-1).content, /Top self-improvement action: tighten final marker prompt \(1 record\)/);
      assert.match(messages.at(-1).content, /Unresolved loop starts: 0/);

      const unresolvedLog = path.join(analysisRoot, ".pi", "megabot-loop", "logs.jsonl");
      fs.mkdirSync(path.dirname(unresolvedLog), { recursive: true });
      fs.writeFileSync(unresolvedLog, [
        JSON.stringify({ timestamp: new Date(18).toISOString(), event: "loop_start", topic: "custom unresolved", iteration: 1, maxIterations: 3 }),
      ].join("\n") + "\n", "utf8");

      const aggregateAnalysisMessagesBefore = messages.length;
      await command.handler(`analyze-logs ${path.join(analysisRoot, ".pi")}`, {
        ...ctx,
        cwd: analysisRoot,
        sessionManager: {
          getCwd: () => analysisRoot,
          getEntries: () => [],
        },
      });
      assert.equal(messages.length, aggregateAnalysisMessagesBefore + 1);
      assert.match(messages.at(-1).content, /Development loop log analysis: \.pi \(3 log files\)/);
      assert.match(messages.at(-1).content, /Records: 32/);
      assert.match(messages.at(-1).content, /Loops started: 6/);
      assert.match(messages.at(-1).content, /Finished loops: 2/);
      assert.match(messages.at(-1).content, /Finished-without-validation records: 2/);
      assert.match(messages.at(-1).content, /Finished-without-delivery records: 2/);
      assert.match(messages.at(-1).content, /Iteration result records: 4/);
      assert.match(messages.at(-1).content, /Iteration-result-without-validation records: 1/);
      assert.match(messages.at(-1).content, /Iteration prompt sent records: 2/);
      assert.match(messages.at(-1).content, /Prompt\/result imbalance: 2 more results than prompts/);
      assert.match(messages.at(-1).content, /Top prompt\/result imbalance source: \.pi\/development-loop\/logs\.jsonl \(2 more results than prompts\)/);
      assert.match(messages.at(-1).content, /Duplicate prompt-sent groups: 1/);
      assert.match(messages.at(-1).content, /Duplicate prompt-sent extra records: 1/);
      assert.match(messages.at(-1).content, /Assistant decision records: 1/);
      assert.match(messages.at(-1).content, /Top assistant decision: continue \(1 record\)/);
      assert.match(messages.at(-1).content, /Blocked loops: 2/);
      assert.match(messages.at(-1).content, /Top blocked log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Postmortems: 1/);
      assert.match(messages.at(-1).content, /Final-marker recovery requests: 2/);
      assert.match(messages.at(-1).content, /Top final-marker recovery log source: \.pi\/development-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /Top final-marker recovery reason: missing DEV_LOOP_DECISION final marker \(2 records\)/);
      assert.match(messages.at(-1).content, /Final-marker recovery successes: 1/);
      assert.match(messages.at(-1).content, /Final-marker recovery blocks: 1/);
      assert.match(messages.at(-1).content, /Top final-marker recovery block log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top final-marker recovery block reason: missing_final_markers \(1 record\)/);
      assert.match(messages.at(-1).content, /Delivery evidence records: 5/);
      assert.match(messages.at(-1).content, /Validation evidence records: 3/);
      assert.match(messages.at(-1).content, /Commit evidence records: 4/);
      assert.match(messages.at(-1).content, /Push evidence records: 3/);
      assert.match(messages.at(-1).content, /Commit-without-push records: 1/);
      assert.match(messages.at(-1).content, /Top commit-without-push log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /CI-red records: 2/);
      assert.match(messages.at(-1).content, /Top CI-red log source: \.pi\/navivox-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /CI-gate missing records: 1/);
      assert.match(messages.at(-1).content, /Top CI-gate missing log source: \.pi\/navivox-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Self-improvement queued records: 1/);
      assert.match(messages.at(-1).content, /Top self-improvement log source: \.pi\/navivox-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top self-improvement reason: ci_gate_missing \(1 record\)/);
      assert.match(messages.at(-1).content, /Top self-improvement action: tighten final marker prompt \(1 record\)/);
      assert.match(messages.at(-1).content, /Unresolved loop starts: 1/);
      assert.match(messages.at(-1).content, /Top unresolved log source: \.pi\/megabot-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Empty provider responses: 2/);
      assert.match(messages.at(-1).content, /Empty provider retry records: 1/);
      assert.match(messages.at(-1).content, /Top empty provider log source: \.pi\/development-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /Top empty provider reason: missing_assistant_text \(1 record\)/);
      assert.match(messages.at(-1).content, /Queued iteration records: 2/);
      assert.match(messages.at(-1).content, /Top queued iteration log source: \.pi\/development-loop\/logs\.jsonl \(2 records\)/);
      assert.match(messages.at(-1).content, /Top queued iteration reason: compaction_before_next_iteration \(1 record\)/);
      assert.match(messages.at(-1).content, /Provider error records: 1/);
      assert.match(messages.at(-1).content, /Top provider error log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Top provider error code: context_length_exceeded \(1 record\)/);
      assert.match(messages.at(-1).content, /Top provider error category: context-overflow \(1 record\)/);
      assert.match(messages.at(-1).content, /Context overflow responses: 1/);
      assert.match(messages.at(-1).content, /Compaction events: 4/);
      assert.match(messages.at(-1).content, /Top compaction log source: \.pi\/development-loop\/logs\.jsonl \(4 records\)/);
      assert.match(messages.at(-1).content, /Premature compaction records: 1/);
      assert.match(messages.at(-1).content, /Top premature compaction log source: \.pi\/development-loop\/logs\.jsonl \(1 record\)/);
      assert.match(messages.at(-1).content, /Compaction resume records: 1/);
      assert.match(messages.at(-1).content, /Compaction failure records: 1/);
      assert.match(messages.at(-1).content, /Top compaction failure reason: compaction command failed \(1 record\)/);
      assert.match(messages.at(-1).content, /User steering records: 1/);
      assert.match(messages.at(-1).content, /Max user steering length: 25/);
      assert.match(messages.at(-1).content, /Provider-noise topic records: 1/);
      assert.match(messages.at(-1).content, /Sanitized topic records: 1/);
      assert.match(messages.at(-1).content, /Oversized topic records: 11/);

      const sinceAnalysisMessagesBefore = messages.length;
      await command.handler(`analyze-logs --since=1970-01-01T00:00:00.012Z ${path.join(analysisRoot, ".pi")}`, {
        ...ctx,
        cwd: analysisRoot,
        sessionManager: {
          getCwd: () => analysisRoot,
          getEntries: () => [],
        },
      });
      assert.equal(messages.length, sinceAnalysisMessagesBefore + 1);
      assert.match(messages.at(-1).content, /Development loop log analysis: \.pi \(3 log files\)/);
      assert.match(messages.at(-1).content, /Since: 1970-01-01T00:00:00.012Z/);
      assert.match(messages.at(-1).content, /Since-filtered records: 24/);
      assert.match(messages.at(-1).content, /Records: 8/);
      assert.match(messages.at(-1).content, /Loops started: 2/);
      assert.match(messages.at(-1).content, /Finished loops: 1/);
      assert.match(messages.at(-1).content, /Iteration result records: 2/);
      assert.match(messages.at(-1).content, /Iteration prompt sent records: 0/);
      assert.match(messages.at(-1).content, /Self-improvement queued records: 1/);
      assert.match(messages.at(-1).content, /CI-red records: 2/);
      assert.match(messages.at(-1).content, /Unresolved loop starts: 0/);
      assert.match(messages.at(-1).content, /Top unresolved log source: \.pi\/megabot-loop\/logs\.jsonl \(1 record\)/);

      const htmlMessagesBefore = messages.length;
      await command.handler(`analyze-logs --html ${path.join(analysisRoot, ".pi")}`, {
        ...ctx,
        cwd: analysisRoot,
        sessionManager: {
          getCwd: () => analysisRoot,
          getEntries: () => [],
        },
      });
      assert.equal(messages.length, htmlMessagesBefore + 1);
      assert.match(messages.at(-1).content, /Development loop log analysis: \.pi \(3 log files\)/);
      const htmlMatch = messages.at(-1).content.match(/HTML health report: (.+\.html)/);
      assert.ok(htmlMatch, "analyze-logs --html should report the generated HTML health report path");
      const htmlPath = htmlMatch[1].trim();
      try {
        assert.ok(fs.existsSync(htmlPath), "analyze-logs --html should write the HTML health report file");
        const html = fs.readFileSync(htmlPath, "utf8");
        assert.match(html, /<html lang="en">/);
        assert.match(html, /Development Loop Health Report/);
        assert.match(html, /Iteration result records/);
        assert.match(html, /Iteration-result-without-validation records/);
        assert.match(html, /Iteration prompt sent records/);
        assert.match(html, /Prompt\/result imbalance/);
        assert.match(html, /Top prompt\/result imbalance source/);
        assert.match(html, /Duplicate prompt-sent groups/);
        assert.match(html, /Duplicate prompt-sent extra records/);
        assert.match(html, /Finished-without-validation records/);
        assert.match(html, /Finished-without-delivery records/);
        assert.match(html, /Assistant decision records/);
        assert.match(html, /Top blocked log source/);
        assert.match(html, /Top unresolved log source/);
        assert.match(html, /Final-marker recovery requests/);
        assert.match(html, /Top final-marker recovery log source/);
        assert.match(html, /Top final-marker recovery reason/);
        assert.match(html, /Top final-marker recovery block log source/);
        assert.match(html, /Top final-marker recovery block reason/);
        assert.match(html, /Delivery evidence records/);
        assert.match(html, /Report summary records/);
        assert.match(html, /Report blocker-state records/);
        assert.match(html, /Report next-step items/);
        assert.match(html, /Report missing-next-steps records/);
        assert.match(html, /Top report missing-next-steps decision/);
        assert.match(html, /Missing report next steps/);
        assert.match(html, /Report quality warning records/);
        assert.match(html, /Top report quality warning/);
        assert.match(html, /Report quality warnings/);
        assert.match(html, /Top report summary/);
        assert.match(html, /Top report blocker state/);
        assert.match(html, /Top report next step/);
        assert.match(html, /Commit-without-push records/);
        assert.match(html, /Top commit-without-push log source/);
        assert.match(html, /Empty provider retry records/);
        assert.match(html, /Top empty provider log source/);
        assert.match(html, /Top empty provider reason/);
        assert.match(html, /Queued iteration records/);
        assert.match(html, /Top queued iteration log source/);
        assert.match(html, /Top queued iteration reason/);
        assert.match(html, /Provider error records/);
        assert.match(html, /Top provider error log source/);
        assert.match(html, /Top provider error code/);
        assert.match(html, /Top provider error category/);
        assert.match(html, /Top compaction log source/);
        assert.match(html, /Premature compaction records/);
        assert.match(html, /Top premature compaction log source/);
        assert.match(html, /Compaction resume records/);
        assert.match(html, /Compaction failure records/);
        assert.match(html, /Top compaction failure reason/);
        assert.match(html, /User steering records/);
        assert.match(html, /Max user steering length/);
        assert.match(html, /Provider-noise topic records/);
        assert.match(html, /Sanitized topic records/);
        assert.match(html, /CI-red records/);
        assert.match(html, /Top CI-red log source/);
        assert.match(html, /CI-gate missing records/);
        assert.match(html, /Top CI-gate missing log source/);
        assert.match(html, /Self-improvement queued records/);
        assert.match(html, /Top self-improvement log source/);
        assert.match(html, /Top self-improvement reason/);
        assert.match(html, /Top self-improvement action/);
        assert.match(html, /Blocked loops/);
      } finally {
        fs.rmSync(htmlPath, { force: true });
      }
    } finally {
      fs.rmSync(analysisRoot, { recursive: true, force: true });
    }

    await command.handler("help", ctx);
    assert.match(messages.at(-1).content, /\/development-loop init --dry-run/);
    assert.match(messages.at(-1).content, /--iterations <n>/);
    assert.match(messages.at(-1).content, /--push implies --commit/);
    assert.match(messages.at(-1).content, /--skill <name-or-note>/);
    assert.match(messages.at(-1).content, /greploop/);
    assert.match(messages.at(-1).content, /--stop-condition <text>/);

    const restoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-empty-restore-"));
    fs.mkdirSync(path.join(restoreRoot, ".git"));
    try {
      const sentBeforeRestoreRetry = sent.length;
      await handlers.get("session_start")({}, {
        ...ctx,
        cwd: restoreRoot,
        sessionManager: {
          getCwd: () => restoreRoot,
          getEntries: () => [{
            type: "custom",
            customType: "development-loop-state",
            data: {
              active: true,
              adapterName: "generic-git",
              topic: "recover empty provider response",
              iteration: 1,
              maxIterations: 3,
              startedAt: new Date(0).toISOString(),
              logPath: path.join(restoreRoot, ".pi", "development-loop", "logs.jsonl"),
              phase: "running",
              lastReason: "empty_agent_response_waiting_for_compaction",
              commit: false,
              push: false,
              emptyResponseRetries: 1,
            },
          }],
        },
        isIdle: () => true,
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(sent.length, sentBeforeRestoreRetry + 1, "restored empty provider-response states should retry instead of staying stuck");
      assert.match(sent.at(-1).content, /Retry development loop iteration after empty provider response/);
      assert.match(sent.at(-1).content, /recover empty provider response/);
    } finally {
      fs.rmSync(restoreRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(e2eRoot, { recursive: true, force: true });
  }

  const initRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-init-"));
  fs.mkdirSync(path.join(initRoot, ".git"));
  try {
    const initPrompts = [];
    const recordUnexpectedPrompt = (name) => (...args) => {
      initPrompts.push({ name, args });
      throw new Error(`/development-loop init --yes should not prompt with ${name}`);
    };
    const initCtx = {
      cwd: initRoot,
      hasUI: true,
      ui: {
        select: recordUnexpectedPrompt("select"),
        input: recordUnexpectedPrompt("input"),
        editor: recordUnexpectedPrompt("editor"),
        confirm: recordUnexpectedPrompt("confirm"),
        notify() {},
        setStatus() {},
        setWidget() {},
      },
      sessionManager: {
        getCwd: () => initRoot,
        getEntries: () => [],
      },
      isIdle: () => true,
    };

    await command.handler("init --yes", initCtx);
    assert.deepEqual(initPrompts, []);
    const written = JSON.parse(fs.readFileSync(path.join(initRoot, ".pi", "development-loop.json"), "utf8"));
    assert.equal(written.adapter, "generic-git");
    assert.equal(written.commit, false);
    assert.equal(written.push, false);
    assert.equal(written.maxIterations, 3);
    assert.equal(written.language, "English");
    assert.equal(written.skills[0], "caveman");
    assert.equal(written.skills[1], "improve-codebase-architecture");
    assert.ok(written.skills.some((skill) => /repo-local skills/.test(skill)));
    assert.ok(written.skills.some((skill) => /greploop/.test(skill)));
    assert.ok(written.stopConditions.some((condition) => /TODO\.md/.test(condition)));
  } finally {
    fs.rmSync(initRoot, { recursive: true, force: true });
  }

  const interactiveInitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-interactive-init-"));
  fs.mkdirSync(path.join(interactiveInitRoot, ".git"));
  try {
    fs.mkdirSync(path.join(interactiveInitRoot, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(interactiveInitRoot, ".pi", "development-loop.json"), JSON.stringify({ adapter: "old" }, null, 2));

    const promptCalls = [];
    const interactiveCtx = {
      cwd: interactiveInitRoot,
      hasUI: true,
      ui: {
        select(title, items) {
          promptCalls.push({ name: "select", title, items });
          assert.ok(items.every((item) => typeof item === "string"), `${title} select choices must be strings for Pi TUI rendering`);
          assert.doesNotMatch(title, /adapter/i, "interactive init should not ask for an adapter when only generic-git exists");
          if (/language/i.test(title)) {
            assert.equal(items.length, 20, "language picker should offer 20 common languages");
            assert.deepEqual(items.slice(0, 5), ["English", "Spanish", "French", "German", "Portuguese"]);
            assert.ok(items.includes("Japanese"));
            assert.ok(items.includes("Swahili"));
            return "Spanish";
          }
          if (/delivery/i.test(title)) return items.find((item) => item === "push");
          throw new Error(`unexpected select: ${title}`);
        },
        input(title, placeholder) {
          promptCalls.push({ name: "input", title, placeholder });
          if (/iterations/i.test(title)) return "4";
          if (/log path/i.test(title)) return ".dev-loop/logs.jsonl";
          throw new Error(`unexpected input: ${title}`);
        },
        editor(title, text) {
          promptCalls.push({ name: "editor", title, text });
          if (/objective/i.test(title)) return "ship interactive init";
          if (/validation/i.test(title)) return "npm test\ngit diff --check";
          if (/preflight/i.test(title)) return "git status --short";
          if (/skills/i.test(title)) return "tdd\nverification-before-completion";
          if (/stop conditions/i.test(title)) return "credentials missing";
          throw new Error(`unexpected editor: ${title}`);
        },
        confirm(title, message) {
          promptCalls.push({ name: "confirm", title, message });
          return true;
        },
        notify() {},
        setStatus() {},
        setWidget() {},
      },
      sessionManager: {
        getCwd: () => interactiveInitRoot,
        getEntries: () => [],
      },
      isIdle: () => true,
    };

    await command.handler("init --force", interactiveCtx);
    assert.ok(!promptCalls.some((call) => call.name === "select" && /adapter/i.test(call.title)), "interactive init must not ask for adapter when only generic-git exists");
    assert.ok(promptCalls.some((call) => call.name === "editor" && /objective/i.test(call.title)), "interactive init must ask for objective");
    assert.ok(promptCalls.some((call) => call.name === "input" && /iterations/i.test(call.title)), "interactive init must ask for iterations");
    assert.ok(promptCalls.some((call) => call.name === "select" && /language/i.test(call.title)), "interactive init must ask for preferred language");
    assert.ok(promptCalls.some((call) => call.name === "select" && /delivery/i.test(call.title)), "interactive init must ask for git delivery");
    assert.ok(promptCalls.some((call) => call.name === "confirm"), "interactive init must confirm before writing");

    const configured = JSON.parse(fs.readFileSync(path.join(interactiveInitRoot, ".pi", "development-loop.json"), "utf8"));
    assert.equal(configured.adapter, "generic-git");
    assert.equal(configured.defaultTopic, "ship interactive init");
    assert.equal(configured.language, "Spanish");
    assert.equal(configured.maxIterations, 4);
    assert.equal(configured.commit, true, "push delivery selected in the wizard should imply commit delivery");
    assert.equal(configured.push, true);
    assert.deepEqual(configured.validationCommands, ["npm test", "git diff --check"]);
    assert.deepEqual(configured.preflightCommands, ["git status --short"]);
    assert.deepEqual(configured.skills, ["caveman", "improve-codebase-architecture", "tdd", "verification-before-completion"]);
    assert.deepEqual(configured.stopConditions, ["credentials missing"]);
    assert.equal(configured.logPath, ".dev-loop/logs.jsonl");
  } finally {
    fs.rmSync(interactiveInitRoot, { recursive: true, force: true });
  }

  const configurableInitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-configurable-init-"));
  fs.mkdirSync(path.join(configurableInitRoot, ".git"));
  try {
    const configurableCtx = {
      cwd: configurableInitRoot,
      hasUI: true,
      ui: {
        notify() {},
        setStatus() {},
        setWidget() {},
      },
      sessionManager: {
        getCwd: () => configurableInitRoot,
        getEntries: () => [],
      },
      isIdle: () => true,
    };

    await command.handler("init --yes --iterations=7 --push --test 'npm test' --test 'git diff --check' --preflight 'git status --short' --skill=grill-me --skill=tdd --stop-condition 'review blockers are unresolved' --log-path .dev-loop/logs.jsonl 'release hardening'", configurableCtx);
    const configured = JSON.parse(fs.readFileSync(path.join(configurableInitRoot, ".pi", "development-loop.json"), "utf8"));
    assert.equal(configured.defaultTopic, "release hardening");
    assert.equal(configured.maxIterations, 7);
    assert.equal(configured.commit, true, "--push should imply commit delivery");
    assert.equal(configured.push, true);
    assert.deepEqual(configured.validationCommands, ["npm test", "git diff --check"]);
    assert.deepEqual(configured.preflightCommands, ["git status --short"]);
    assert.deepEqual(configured.skills, ["caveman", "improve-codebase-architecture", "grill-me", "tdd"]);
    assert.deepEqual(configured.stopConditions, ["review blockers are unresolved"]);
    assert.equal(configured.logPath, ".dev-loop/logs.jsonl");

    const before = JSON.stringify(configured, null, 2) + "\n";
    await command.handler("init --yes --iterations=2 --force=false overwrite attempt", configurableCtx);
    assert.equal(fs.readFileSync(path.join(configurableInitRoot, ".pi", "development-loop.json"), "utf8"), before, "init must not overwrite existing config without --force");

    await command.handler("init --yes --force --iterations=2 --no-push forced replacement", configurableCtx);
    const replaced = JSON.parse(fs.readFileSync(path.join(configurableInitRoot, ".pi", "development-loop.json"), "utf8"));
    assert.equal(replaced.defaultTopic, "forced replacement");
    assert.equal(replaced.maxIterations, 2);
    assert.equal(replaced.push, false);
  } finally {
    fs.rmSync(configurableInitRoot, { recursive: true, force: true });
  }

  const dryRunInitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-dry-run-init-"));
  fs.mkdirSync(path.join(dryRunInitRoot, ".git"));
  try {
    const dryRunNotifications = [];
    const dryRunCtx = {
      cwd: dryRunInitRoot,
      hasUI: true,
      ui: {
        notify(message) { dryRunNotifications.push(message); },
        setStatus() {},
        setWidget() {},
      },
      sessionManager: {
        getCwd: () => dryRunInitRoot,
        getEntries: () => [],
      },
      isIdle: () => true,
    };

    await command.handler("init --yes --dry-run --iterations=4 --push --skill=grill-me preview config", dryRunCtx);
    assert.equal(fs.existsSync(path.join(dryRunInitRoot, ".pi", "development-loop.json")), false, "dry-run init must not write config");
    assert.match(dryRunNotifications.at(-1), /Development-loop init preview/);
    assert.match(dryRunNotifications.at(-1), /"defaultTopic": "preview config"/);
    assert.match(dryRunNotifications.at(-1), /"maxIterations": 4/);
    assert.match(dryRunNotifications.at(-1), /"commit": true/);
    assert.match(dryRunNotifications.at(-1), /"push": true/);
  } finally {
    fs.rmSync(dryRunInitRoot, { recursive: true, force: true });
  }
}

async function testE2ELoopExtensionLoadsAndRegistersCommands() {
  assert.ok(exists("extensions/e2e-loop.ts"), "e2e-loop extension missing");
  const { createJiti } = require(jitiEntry);
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const mod = await jiti.import(path.join(root, "extensions", "e2e-loop.ts"));
  assert.equal(typeof mod.default, "function");
  assert.equal(typeof mod.__test__.buildE2EPrompt, "function");
  assert.equal(mod.__test__.parseE2EDecision("Validated.\nE2E_LOOP_VALIDATED: yes\nE2E_LOOP_DECISION: continue"), "continue");
  assert.equal(mod.__test__.parseE2EValidated("Validated.\nE2E_LOOP_VALIDATED: yes\nE2E_LOOP_DECISION: continue"), true);
  assert.equal(mod.__test__.parseE2EDecision("Blocked.\nE2E_LOOP_VALIDATED: no\nE2E_LOOP_DECISION: blocked"), "blocked");
  assert.equal(mod.__test__.parseE2EValidated("Blocked.\nE2E_LOOP_VALIDATED: no\nE2E_LOOP_DECISION: blocked"), false);
  assert.equal(mod.__test__.parseE2EDecision("Instructions only:\nE2E_LOOP_VALIDATED: yes|no\nE2E_LOOP_DECISION: continue|blocked|stop"), undefined);
  assert.equal(mod.__test__.parseE2EValidated("Instructions only:\nE2E_LOOP_VALIDATED: yes|no\nE2E_LOOP_DECISION: continue|blocked|stop"), undefined);
  assert.equal(mod.__test__.parseE2EDecision("Validated.\nE2E_LOOP_VALIDATED: yes\nE2E_LOOP_DECISION: continue\npostscript"), undefined);
  assert.equal(mod.__test__.parseE2EValidated("Validated.\nE2E_LOOP_VALIDATED: yes\nE2E_LOOP_DECISION: continue\npostscript"), undefined);

  const commands = new Map();
  const handlers = new Map();
  const messages = [];
  const sent = [];
  const statusUpdates = [];
  const entries = [];
  const pi = {
    on(name, handler) { handlers.set(name, handler); },
    appendEntry(customType, data) { entries.push({ type: "custom", customType, data }); },
    registerCommand(name, command) { commands.set(name, command); },
    sendUserMessage(content, options) { sent.push({ content, options }); },
    sendMessage(message) { messages.push(message); },
  };
  mod.default(pi);
  assert.ok(commands.has("e2e-loop"));
  assert.ok(commands.has("e2e"));

  const command = commands.get("e2e-loop");
  const e2eRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-e2e-loop-"));
  fs.mkdirSync(path.join(e2eRoot, ".git"));
  try {
    const ctx = {
      cwd: e2eRoot,
      hasUI: true,
      ui: {
        notify() {},
        setStatus(key, value) { statusUpdates.push({ key, value }); },
      },
      sessionManager: {
        getCwd: () => e2eRoot,
        getEntries: () => entries,
      },
      isIdle: () => true,
    };

    await command.handler("start --iterations=2 checkout flow", ctx);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /E2E loop run/);
    assert.match(sent[0].content, /checkout flow/);
    assert.match(sent[0].content, /Playwright/);
    assert.match(sent[0].content, /Maestro/);
    assert.match(sent[0].content, /screenshots/);
    assert.match(sent[0].content, /feature inventory/i);
    assert.match(sent[0].content, /coverage matrix/i);
    assert.match(sent[0].content, /public endpoint/i);
    assert.match(sent[0].content, /API contract/i);
    assert.match(sent[0].content, /TUI transcript/i);
    assert.match(sent[0].content, /E2E_LOOP_DECISION/);
    assert.equal(sent[0].options, undefined, "idle e2e-loop start should send immediately");
    assert.match(statusUpdates.at(-1).value, /e2e 1\/2/);
    assert.equal(entries.at(-1).customType, "e2e-loop-state");
    assert.equal(entries.at(-1).data.objective, "checkout flow");
    assert.equal(entries.at(-1).data.maxIterations, 2);
    assert.match(entries.at(-1).data.logPath, /\.pi[/\\]e2e-loop[/\\]logs\.jsonl$/);

    const logPath = path.join(e2eRoot, ".pi", "e2e-loop", "logs.jsonl");
    assert.equal(fs.existsSync(logPath), true, "e2e-loop should write a JSONL loop log");
    const logRecords = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(logRecords[0].event, "loop_started");
    assert.equal(logRecords[0].objective, "checkout flow");
    assert.equal(logRecords.at(-1).event, "iteration_prompt_sent");

    await handlers.get("agent_end")({ messages: [{ role: "assistant", content: "E2E_LOOP_VALIDATED: yes\nE2E_LOOP_DECISION: continue" }] }, ctx);
    assert.equal(sent.length, 2);
    assert.match(sent[1].content, /E2E loop run 2\/2/);
    assert.equal(entries.at(-1).data.iteration, 2);
    assert.match(fs.readFileSync(logPath, "utf8"), /"event":"iteration_result"/);

    await command.handler("help", ctx);
    assert.match(messages.at(-1).content, /\/e2e-loop start/);
    assert.match(messages.at(-1).content, /Playwright/);

    await command.handler("status", ctx);
    assert.match(messages.at(-1).content, /checkout flow/);
    assert.match(messages.at(-1).content, /running/);
    assert.match(messages.at(-1).content, /\.pi\/e2e-loop\/logs\.jsonl/);
  } finally {
    fs.rmSync(e2eRoot, { recursive: true, force: true });
  }
}

async function testSkills() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-skill-inventory-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "skills", "expected"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "skills", "extra"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "skills", "expected", "SKILL.md"), "---\nname: expected\ndescription: Expected skill\n---\n");
    fs.writeFileSync(path.join(fixtureRoot, "skills", "extra", "SKILL.md"), "---\nname: extra\ndescription: Extra skill\n---\n");

    assert.deepEqual(collectSkillInventoryIssues(fixtureRoot, ["expected"]), ["unexpected skill: extra"]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  assert.deepEqual(collectSkillInventoryIssues(root, expectedSkills), []);

  const skillFiles = listSkillFiles();
  for (const skill of expectedSkills) {
    assert.ok(skillFiles.includes(`skills/${skill}/SKILL.md`), `missing ${skill}`);
  }
  for (const file of skillFiles) {
    const { name } = parseFrontmatter(read(file));
    assert.equal(file, `skills/${name}/SKILL.md`, `${file} should live under skills/${name}`);
  }
}

async function testMarkdownLinks() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-md-links-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "docs"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "docs", "ok.md"), "ok\n");
    fs.writeFileSync(path.join(fixtureRoot, "README.md"), [
      "[good](docs/ok.md)",
      "[external](https://example.com)",
      "[anchor](#section)",
      "```md",
      "[template](REFERENCE.md)",
      "```",
      "[missing](docs/missing.md)",
    ].join("\n"));

    const fixtureBroken = collectBrokenMarkdownLinks(fixtureRoot).map((item) => `${item.file} -> ${item.target}`);
    assert.deepEqual(fixtureBroken, ["README.md -> docs/missing.md"]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  const broken = collectBrokenMarkdownLinks(root);
  assert.deepEqual(broken, [], `broken Markdown links:\n${broken.map((item) => `${item.file} -> ${item.target}`).join("\n")}`);
}

async function testThirdPartyNoticePaths() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-notice-paths-"));
  try {
    fs.mkdirSync(path.join(fixtureRoot, "licenses"), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, "skills", "present"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "licenses", "present-LICENSE"), "MIT\n");
    fs.writeFileSync(path.join(fixtureRoot, "THIRD_PARTY_NOTICES.md"), [
      "# Notices",
      "- Bundled path: `skills/present/`",
      "- Bundled path: `skills/missing/`",
      "- Full license copy: `licenses/present-LICENSE`",
      "- Full license copy: `licenses/missing-LICENSE`",
      "- Snapshot inspected: `abc123`",
    ].join("\n"));

    assert.deepEqual(collectThirdPartyNoticePathIssues(fixtureRoot), [
      "THIRD_PARTY_NOTICES.md: missing local notice path skills/missing/",
      "THIRD_PARTY_NOTICES.md: missing local notice path licenses/missing-LICENSE",
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  assert.deepEqual(collectThirdPartyNoticePathIssues(root), []);
}

async function testCodexStorageCleanupScript() {
  const scriptRel = "skills/diagnose/scripts/codex-storage-cleanup.sh";
  assert.ok(exists(scriptRel), "missing safe Codex cleanup script");
  assert.notEqual(fs.statSync(path.join(root, scriptRel)).mode & 0o111, 0, "Codex cleanup script must be executable");

  const source = read(scriptRel);
  assert.match(source, /--dry-run/);
  assert.match(source, /--execute/);
  assert.match(source, /--codex-dir/);
  assert.match(source, /--tmp-only/);
  assert.match(source, /--delete-state/);
  assert.match(source, /--i-understand-local-state-will-be-lost/);
  assert.match(source, /Top-level HOME path sizes/);
  assert.match(source, /du -x -h -d 1 "\$HOME"/);
  assert.doesNotMatch(source, /rm -rf "?\$\{?CODEX_DIR\}?"?\s*$/m);
  assert.doesNotMatch(source, /rm -rf "?\$\{?codex_dir\}?"?\s*$/m);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-codex-cleanup-"));
  try {
    const codexDir = path.join(fixtureRoot, ".codex");
    fs.mkdirSync(path.join(codexDir, "tmp"), { recursive: true });
    fs.writeFileSync(path.join(codexDir, "config.toml"), "model = \"codex\"\n");
    fs.writeFileSync(path.join(codexDir, "tmp", "arg0"), "temporary wrapper state\n");
    fs.writeFileSync(path.join(codexDir, "state_5.sqlite"), "sqlite\n");
    fs.writeFileSync(path.join(codexDir, "state_5.sqlite-shm"), "shm\n");
    fs.writeFileSync(path.join(codexDir, "state_5.sqlite-wal"), "wal\n");

    const script = path.join(root, scriptRel);
    const unsafeDir = path.join(fixtureRoot, "not-codex");
    fs.mkdirSync(path.join(unsafeDir, "tmp"), { recursive: true });
    fs.writeFileSync(path.join(unsafeDir, "tmp", "arg0"), "temporary wrapper state\n");
    assert.throws(
      () => execFileSync("bash", [script, "--execute", "--codex-dir", unsafeDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /path must end in \/\.codex/,
    );
    assert.ok(fs.existsSync(path.join(unsafeDir, "tmp", "arg0")), "unsafe Codex dir removed temp files");

    const dryRun = execFileSync("bash", [script, "--codex-dir", codexDir], {
      encoding: "utf8",
      env: { ...process.env, HOME: fixtureRoot },
    });
    assert.match(dryRun, /Dry run/);
    assert.match(dryRun, /Disk space containing Codex directory/);
    assert.match(dryRun, /Inode usage containing Codex directory/);
    assert.match(dryRun, /Codex path sizes/);
    assert.match(dryRun, /Top-level HOME path sizes/);
    assert.match(dryRun, /Would remove transient temp directory/);
    assert.ok(fs.existsSync(path.join(codexDir, "tmp", "arg0")), "dry run removed temp files");
    assert.ok(fs.existsSync(path.join(codexDir, "state_5.sqlite")), "dry run moved sqlite state");

    const explicitDryRun = execFileSync("bash", [script, "--dry-run", "--codex-dir", codexDir], {
      encoding: "utf8",
      env: { ...process.env, HOME: fixtureRoot },
    });
    assert.match(explicitDryRun, /Dry run/);
    assert.ok(fs.existsSync(path.join(codexDir, "tmp", "arg0")), "explicit dry run removed temp files");

    assert.throws(
      () => execFileSync("bash", [script, "--dry-run", "--execute", "--codex-dir", codexDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /--dry-run cannot be combined with --execute/,
    );
    assert.ok(fs.existsSync(path.join(codexDir, "tmp", "arg0")), "conflicting dry run executed cleanup");

    const noTmpDir = path.join(fixtureRoot, "no-tmp-case", ".codex");
    fs.mkdirSync(noTmpDir, { recursive: true });
    fs.writeFileSync(path.join(noTmpDir, "state_9.sqlite"), "sqlite\n");
    const noTmpDryRun = execFileSync("bash", [script, "--codex-dir", noTmpDir], { encoding: "utf8" });
    assert.match(noTmpDryRun, /Dry run/);
    assert.match(noTmpDryRun, /No transient temp directory found/);

    const tmpOnlyDir = path.join(fixtureRoot, "tmp-only-case", ".codex");
    fs.mkdirSync(path.join(tmpOnlyDir, "tmp"), { recursive: true });
    fs.writeFileSync(path.join(tmpOnlyDir, "config.toml"), "model = \"codex\"\n");
    fs.writeFileSync(path.join(tmpOnlyDir, "tmp", "arg0"), "temporary wrapper state\n");
    fs.writeFileSync(path.join(tmpOnlyDir, "state_7.sqlite"), "sqlite\n");

    const tmpOnly = execFileSync("bash", [script, "--execute", "--tmp-only", "--codex-dir", tmpOnlyDir], { encoding: "utf8" });
    assert.match(tmpOnly, /Left Codex state files unchanged/);
    assert.equal(fs.existsSync(path.join(tmpOnlyDir, "tmp")), false);
    assert.equal(fs.existsSync(path.join(tmpOnlyDir, "state_7.sqlite")), true);
    assert.equal(fs.existsSync(path.join(tmpOnlyDir, "backup")), false);

    const executed = execFileSync("bash", [script, "--execute", "--codex-dir", codexDir], { encoding: "utf8" });
    assert.match(executed, /Removed transient temp directory/);
    assert.match(executed, /Backed up Codex state files/);
    assert.match(executed, /Post-cleanup disk report/);
    assert.match(executed, /Disk space containing Codex directory/);
    assert.match(executed, /Inode usage containing Codex directory/);
    assert.equal(fs.existsSync(path.join(codexDir, "tmp")), false);
    assert.equal(fs.existsSync(path.join(codexDir, "state_5.sqlite")), false);
    assert.equal(fs.readFileSync(path.join(codexDir, "config.toml"), "utf8"), "model = \"codex\"\n");

    const backupRoot = path.join(codexDir, "backup");
    const backupDirs = fs.readdirSync(backupRoot);
    assert.equal(backupDirs.length, 1);
    assert.deepEqual(fs.readdirSync(path.join(backupRoot, backupDirs[0])).sort(), [
      "state_5.sqlite",
      "state_5.sqlite-shm",
      "state_5.sqlite-wal",
    ]);

    const fakeBin = path.join(fixtureRoot, "fake-bin");
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(path.join(fakeBin, "date"), "#!/usr/bin/env bash\nprintf '20240101-000000\\n'\n");
    fs.chmodSync(path.join(fakeBin, "date"), 0o755);

    const collisionDir = path.join(fixtureRoot, "collision-case", ".codex");
    const existingBackup = path.join(collisionDir, "backup", "codex-state-20240101-000000");
    fs.mkdirSync(path.join(collisionDir, "tmp"), { recursive: true });
    fs.mkdirSync(existingBackup, { recursive: true });
    fs.writeFileSync(path.join(collisionDir, "state_8.sqlite"), "new state\n");
    fs.writeFileSync(path.join(existingBackup, "state_8.sqlite"), "old backup\n");

    execFileSync("bash", [script, "--execute", "--codex-dir", collisionDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
    });
    assert.equal(fs.readFileSync(path.join(existingBackup, "state_8.sqlite"), "utf8"), "old backup\n");
    const collisionBackups = fs.readdirSync(path.join(collisionDir, "backup")).sort();
    assert.equal(collisionBackups.length, 2);
    assert.ok(collisionBackups.some((entry) => /^codex-state-20240101-000000\./.test(entry)));
    const newBackup = collisionBackups.find((entry) => entry !== "codex-state-20240101-000000");
    assert.equal(fs.readFileSync(path.join(collisionDir, "backup", newBackup, "state_8.sqlite"), "utf8"), "new state\n");

    const deleteDir = path.join(fixtureRoot, "delete-case", ".codex");
    fs.mkdirSync(path.join(deleteDir, "tmp"), { recursive: true });
    fs.writeFileSync(path.join(deleteDir, "config.toml"), "model = \"codex\"\n");
    fs.writeFileSync(path.join(deleteDir, "state_6.sqlite"), "sqlite\n");

    const deleteDryRun = execFileSync("bash", [script, "--delete-state", "--codex-dir", deleteDir], { encoding: "utf8" });
    assert.match(deleteDryRun, /Would delete Codex state files/);
    assert.match(deleteDryRun, /Executing --delete-state requires --i-understand-local-state-will-be-lost/);
    assert.ok(fs.existsSync(path.join(deleteDir, "state_6.sqlite")), "delete dry run removed sqlite state");

    assert.throws(
      () => execFileSync("bash", [script, "--execute", "--delete-state", "--codex-dir", deleteDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /requires --i-understand-local-state-will-be-lost/,
    );
    assert.ok(fs.existsSync(path.join(deleteDir, "state_6.sqlite")), "unguarded delete removed sqlite state");

    const deleted = execFileSync("bash", [
      script,
      "--execute",
      "--delete-state",
      "--i-understand-local-state-will-be-lost",
      "--codex-dir",
      deleteDir,
    ], { encoding: "utf8" });
    assert.match(deleted, /Deleted Codex state files/);
    assert.equal(fs.existsSync(path.join(deleteDir, "tmp")), false);
    assert.equal(fs.existsSync(path.join(deleteDir, "state_6.sqlite")), false);
    assert.equal(fs.readFileSync(path.join(deleteDir, "config.toml"), "utf8"), "model = \"codex\"\n");
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function testPiLogAuditScript() {
  const scriptRel = "skills/diagnose/scripts/pi-log-audit.mjs";
  assert.ok(exists(scriptRel), "missing Pi log audit script");
  assert.notEqual(fs.statSync(path.join(root, scriptRel)).mode & 0o111, 0, "Pi log audit script must be executable");

  const source = read(scriptRel);
  assert.match(source, /development-loop/);
  assert.match(source, /e2e-loop/);
  assert.match(source, /node_modules/);
  assert.match(source, /bad_json/);
  assert.match(source, /Did you mean/);
  assert.match(source, /--attention-only/);
  assert.match(source, /--since/);
  assert.match(source, /since_filtered/);
  assert.match(source, /pi_dirs_without_logs/);
  assert.match(source, /pi_dirs_with_configs_without_logs/);
  assert.match(source, /findLoopConfigs/);
  assert.match(source, /logs_without_configs/);
  assert.match(source, /missing_config/);
  assert.match(source, /HISTORY/);
  assert.match(source, /last_at/);
  assert.match(source, /mtime=/);
  assert.match(source, /failure_at/);
  assert.match(source, /last_result_at/);
  assert.match(source, /last_push/);
  assert.match(source, /run_id=/);
  assert.match(source, /adapter=/);
  assert.match(source, /next_action=/);
  assert.match(source, /blocker=/);
  assert.match(source, /blocker_kind=/);
  assert.match(source, /config_bad_json/);
  assert.match(source, /log_path=/);
  assert.match(source, /config_path=/);
  assert.match(source, /attention_logs/);
  assert.match(source, /blocker_kind_records/);
  assert.match(source, /top_blocker_kind/);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-log-audit-"));
  try {
    const typoParent = path.join(fixtureRoot, "typo-parent");
    fs.mkdirSync(path.join(typoParent, "sages-openclaw"), { recursive: true });
    assert.throws(
      () => execFileSync("node", [path.join(root, scriptRel), path.join(typoParent, "sages-opencalw")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /Root directory not found: .*sages-opencalw[\s\S]*Did you mean: .*sages-openclaw/,
    );

    const repoA = path.join(fixtureRoot, "repo-a");
    fs.mkdirSync(path.join(repoA, ".pi", "development-loop"), { recursive: true });
    fs.writeFileSync(path.join(repoA, ".pi", "development-loop", "logs.jsonl"), [
      JSON.stringify({ at: "2026-05-22T01:00:00.000Z", event: "loop_started", runId: "run-fixture", iteration: 1, maxIterations: 3, phase: "started" }),
      JSON.stringify({ at: "2026-05-22T01:01:00.000Z", event: "iteration_result", iteration: 1, maxIterations: 3, phase: "reported", decision: "continue", commitHash: "abc123", pushStatus: "pushed" }),
      JSON.stringify({ at: "2026-05-22T01:02:00.000Z", event: "compaction_failed_before_next_iteration", iteration: 2, maxIterations: 3, phase: "queued", reason: "Summarization failed: WebSocket error" }),
    ].join("\n") + "\n");
    fs.writeFileSync(path.join(repoA, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");

    const repoB = path.join(fixtureRoot, "repo-b");
    fs.mkdirSync(path.join(repoB, ".pi", "e2e-loop"), { recursive: true });
    fs.writeFileSync(path.join(repoB, ".pi", "e2e-loop", "logs.jsonl"), [
      JSON.stringify({ at: "2026-05-22T02:00:00.000Z", event: "loop_blocked", iteration: 1, maxIterations: 1, phase: "blocked", reason: "missing E2E_LOOP_DECISION final marker" }),
      "not json",
    ].join("\n") + "\n");
    fs.writeFileSync(path.join(repoB, ".pi", "e2e-loop.json"), JSON.stringify({ adapter: "playwright" }) + "\n");

    const repoD = path.join(fixtureRoot, "repo-d");
    fs.mkdirSync(path.join(repoD, ".pi", "development-loop"), { recursive: true });
    fs.writeFileSync(path.join(repoD, ".pi", "development-loop", "logs.jsonl"), [
      JSON.stringify({ at: "2026-05-22T02:50:00.000Z", event: "loop_blocked", iteration: 1, maxIterations: 1, phase: "blocked", reason: "temporary missing marker" }),
      JSON.stringify({ event: "loop_finished", iteration: 1, maxIterations: 1, phase: "done", decision: "done" }),
    ].join("\n") + "\n");
    fs.writeFileSync(path.join(repoD, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");

    const repoE = path.join(fixtureRoot, "repo-e");
    fs.mkdirSync(path.join(repoE, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(repoE, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");
    fs.writeFileSync(path.join(repoE, ".pi", "navivox-loop.json"), JSON.stringify({ adapter: "navivox" }) + "\n");

    const repoF = path.join(fixtureRoot, "repo-f");
    fs.mkdirSync(path.join(repoF, ".pi", "custom-loop"), { recursive: true });
    const repoFLog = path.join(repoF, ".pi", "custom-loop", "logs.jsonl");
    fs.writeFileSync(repoFLog, JSON.stringify({
      event: "iteration_queued",
      iteration: 2,
      maxIterations: 4,
      phase: "queued",
    }) + "\n");
    fs.utimesSync(repoFLog, new Date("2026-05-22T04:00:00.000Z"), new Date("2026-05-22T04:00:00.000Z"));

    const repoG = path.join(fixtureRoot, "repo-g");
    fs.mkdirSync(path.join(repoG, ".pi", "development-loop"), { recursive: true });
    fs.writeFileSync(path.join(repoG, ".pi", "development-loop", "logs.jsonl"), [
      JSON.stringify({ event: "loop_finished", iteration: 1, maxIterations: 1, phase: "done", decision: "done" }),
    ].join("\n") + "\n");
    fs.writeFileSync(path.join(repoG, ".pi", "development-loop.json"), "{bad json\n");

    fs.mkdirSync(path.join(fixtureRoot, "repo-c", "node_modules", "ignored", ".pi", "development-loop"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "repo-c", "node_modules", "ignored", ".pi", "development-loop", "logs.jsonl"), "{}\n");

    const output = execFileSync("node", [path.join(root, scriptRel), fixtureRoot], { encoding: "utf8" });
    assert.match(output, /PI_DIR_COUNT 6/);
    assert.match(output, /LOG\tdevelopment-loop\t.*repo-a\tlog_path=\.pi\/development-loop\/logs\.jsonl\tconfig_path=\.pi\/development-loop\.json/);
    assert.match(output, /config=present\tadapter=generic-git\tattention=yes/);
    assert.match(output, /decision=-\trun_id=run-fixture\tlast_result_at=2026-05-22T01:01:00.000Z/);
    assert.match(output, /last_result_at=2026-05-22T01:01:00.000Z\tlast_decision=continue\tlast_commit=abc123\tlast_push=pushed/);
    assert.match(output, /latest=compaction_failed_before_next_iteration/);
    assert.match(output, /status=needs_attention/);
    assert.match(output, /attention=yes/);
    assert.match(output, /failure=compaction_failed_before_next_iteration\tfailure_at=2026-05-22T01:02:00.000Z/);
    assert.match(output, /Summarization failed: WebSocket error/);
    assert.match(output, /next_action=inspect failure reason then resume or clear the loop/);
    assert.match(output, /LOG\te2e-loop\t.*repo-b\tlog_path=\.pi\/e2e-loop\/logs\.jsonl\tconfig_path=\.pi\/e2e-loop\.json/);
    assert.match(output, /status=blocked/);
    assert.match(output, /bad_json=1/);
    assert.match(output, /missing E2E_LOOP_DECISION final marker/);
    assert.match(output, /LOG\tdevelopment-loop\t.*repo-d.*at=-\tlast_at=2026-05-22T02:50:00.000Z/);
    assert.match(output, /status=done/);
    assert.match(output, /attention=no/);
    assert.match(output, /HISTORY\tdevelopment-loop\t.*repo-d\tfailure=loop_blocked\tfailure_at=2026-05-22T02:50:00.000Z\treason=temporary missing marker/);
    assert.doesNotMatch(output, /ISSUE\tdevelopment-loop\t.*repo-d/);
    assert.match(output, /PI_DIR\t.*repo-e\tlogs=-\tconfigs=development-loop\.json,navivox-loop\.json/);
    assert.match(output, /ISSUE\t\.pi-config\t.*repo-e\tconfigs=development-loop\.json,navivox-loop\.json\treason=config files present but no loop logs\tnext_action=start a loop for these configs or remove stale config files/);
    assert.match(output, /LOG\tcustom-loop\t.*repo-f\tlog_path=\.pi\/custom-loop\/logs\.jsonl\tconfig_path=\.pi\/custom-loop\.json.*at=-\tlast_at=-\tmtime=2026-05-22T04:00:00.000Z.*status=queued.*config=missing\tadapter=-\tattention=yes/);
    assert.match(output, /ISSUE\tcustom-loop\t.*repo-f\tmissing_config=\.pi\/custom-loop\.json\treason=log directory has no matching loop config\tnext_action=restore matching loop config or archive\/remove stale log directory/);
    assert.match(output, /LOG\tdevelopment-loop\t.*repo-g.*status=done.*config=present\tadapter=bad_json\tattention=yes/);
    assert.match(output, /ISSUE\tdevelopment-loop\t.*repo-g\tconfig=\.pi\/development-loop\.json\treason=matching loop config is not valid JSON\tnext_action=repair or regenerate the loop config/);
    assert.match(output, /SUMMARY\tlogs=5\tneeds_attention=1\tblocked=1\trunning=0\tqueued=1\tdone=2\tunknown=0\tattention_logs=4\tblocker_kind_records=0\tissues=5\tbad_json=1\tlogs_without_configs=1\tconfig_bad_json=1\tpi_dirs=6\tpi_dirs_without_logs=1\tpi_dirs_with_configs_without_logs=1\tconfig_files=6/);
    assert.doesNotMatch(output, /node_modules/);

    const sinceOutput = execFileSync("node", [path.join(root, scriptRel), "--since=2026-05-22T02:30:00.000Z", fixtureRoot], { encoding: "utf8" });
    assert.match(sinceOutput, /PI_DIR_COUNT 6\tsince=2026-05-22T02:30:00.000Z/);
    assert.match(sinceOutput, /LOG\tdevelopment-loop\t.*repo-d.*parsed=1\tsince_filtered=1.*latest=loop_blocked.*status=blocked/);
    assert.doesNotMatch(sinceOutput, /LOG\tdevelopment-loop\t.*repo-d.*status=done/);
    assert.match(sinceOutput, /SUMMARY\t.*since=2026-05-22T02:30:00.000Z\tsince_filtered=/);

    const sinceAttentionOnly = execFileSync("node", [path.join(root, scriptRel), "--attention-only", "--since=2026-05-22T02:30:00.000Z", fixtureRoot], { encoding: "utf8" });
    assert.match(sinceAttentionOnly, /LOG\tdevelopment-loop\t.*repo-d.*parsed=1\tsince_filtered=1.*latest=loop_blocked.*status=blocked.*attention=yes/);
    assert.doesNotMatch(sinceAttentionOnly, /repo-a/);
    assert.doesNotMatch(sinceAttentionOnly, /repo-e/);
    assert.doesNotMatch(sinceAttentionOnly, /repo-f/);
    assert.doesNotMatch(sinceAttentionOnly, /repo-g/);
    assert.match(sinceAttentionOnly, /SUMMARY\t.*attention_logs=1\tblocker_kind_records=0\tissues=1.*filtered_out=4.*since=2026-05-22T02:30:00.000Z\tsince_filtered=/);

    const attentionOnly = execFileSync("node", [path.join(root, scriptRel), "--attention-only", fixtureRoot], { encoding: "utf8" });
    assert.match(attentionOnly, /LOG\tdevelopment-loop\t.*repo-a\tlog_path=\.pi\/development-loop\/logs\.jsonl\tconfig_path=\.pi\/development-loop\.json/);
    assert.match(attentionOnly, /LOG\te2e-loop\t.*repo-b\tlog_path=\.pi\/e2e-loop\/logs\.jsonl\tconfig_path=\.pi\/e2e-loop\.json/);
    assert.match(attentionOnly, /LOG\tcustom-loop\t.*repo-f\tlog_path=\.pi\/custom-loop\/logs\.jsonl\tconfig_path=\.pi\/custom-loop\.json.*mtime=2026-05-22T04:00:00.000Z.*config=missing\tadapter=-\tattention=yes/);
    assert.match(attentionOnly, /ISSUE\tcustom-loop\t.*repo-f\tmissing_config=\.pi\/custom-loop\.json\treason=log directory has no matching loop config\tnext_action=restore matching loop config or archive\/remove stale log directory/);
    assert.doesNotMatch(attentionOnly, /repo-d/);
    assert.match(attentionOnly, /PI_DIR\t.*repo-e\tlogs=-\tconfigs=development-loop\.json,navivox-loop\.json/);
    assert.match(attentionOnly, /ISSUE\t\.pi-config\t.*repo-e\tconfigs=development-loop\.json,navivox-loop\.json\treason=config files present but no loop logs\tnext_action=start a loop for these configs or remove stale config files/);
    assert.match(attentionOnly, /LOG\tdevelopment-loop\t.*repo-g.*adapter=bad_json\tattention=yes/);
    assert.match(attentionOnly, /ISSUE\tdevelopment-loop\t.*repo-g\tconfig=\.pi\/development-loop\.json\treason=matching loop config is not valid JSON\tnext_action=repair or regenerate the loop config/);
    assert.match(attentionOnly, /SUMMARY\tlogs=5\tneeds_attention=1\tblocked=1\trunning=0\tqueued=1\tdone=2\tunknown=0\tattention_logs=4\tblocker_kind_records=0\tissues=5\tbad_json=1\tlogs_without_configs=1\tconfig_bad_json=1\tfiltered_out=1\tpi_dirs=6\tpi_dirs_without_logs=1\tpi_dirs_with_configs_without_logs=1\tconfig_files=6/);

    const blockedReportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-log-audit-blocked-report-"));
    try {
      const blockedReportRepo = path.join(blockedReportRoot, "repo-j");
      fs.mkdirSync(path.join(blockedReportRepo, ".pi", "development-loop"), { recursive: true });
      fs.writeFileSync(path.join(blockedReportRepo, ".pi", "development-loop", "logs.jsonl"), JSON.stringify({
        at: "2026-05-22T03:10:00.000Z",
        event: "loop_finished",
        iteration: 1,
        maxIterations: 12,
        phase: "blocked",
        decision: "blocked",
        reason: "blocked",
        blockerState: "git push origin main rejected with fetch-first",
        nextSteps: ["Approve fetch/rebase/merge workflow, rerun validation, then push commits 650edde and e969435."],
      }) + "\n");
      fs.writeFileSync(path.join(blockedReportRepo, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");

      const fetchFirstFallbackRepo = path.join(blockedReportRoot, "repo-l");
      fs.mkdirSync(path.join(fetchFirstFallbackRepo, ".pi", "development-loop"), { recursive: true });
      fs.writeFileSync(path.join(fetchFirstFallbackRepo, ".pi", "development-loop", "logs.jsonl"), JSON.stringify({
        at: "2026-05-22T03:11:00.000Z",
        event: "loop_finished",
        iteration: 2,
        maxIterations: 12,
        phase: "blocked",
        decision: "blocked",
        reason: "blocked",
        blockerState: "git push origin main rejected with fetch-first",
      }) + "\n");
      fs.writeFileSync(path.join(fetchFirstFallbackRepo, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");

      const validationFailedRepo = path.join(blockedReportRoot, "repo-m");
      fs.mkdirSync(path.join(validationFailedRepo, ".pi", "development-loop"), { recursive: true });
      fs.writeFileSync(path.join(validationFailedRepo, ".pi", "development-loop", "logs.jsonl"), JSON.stringify({
        at: "2026-05-22T03:12:00.000Z",
        event: "loop_finished",
        iteration: 1,
        maxIterations: 10,
        phase: "blocked",
        decision: "blocked",
        reason: "blocked",
        blockerState: "flutter test failed twice; first failing assertion in test/e2e/connect_and_talk_web_e2e_test.dart:74 expected http://127.0.0.1:8765 but got null",
      }) + "\n");
      fs.writeFileSync(path.join(validationFailedRepo, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");

      const blockedReportOutput = execFileSync("node", [path.join(root, scriptRel), "--attention-only", "--since=2026-05-22T02:30:00.000Z", blockedReportRoot], { encoding: "utf8" });
      assert.match(blockedReportOutput, /ISSUE\tdevelopment-loop\t.*repo-j\tfailure=loop_finished\tfailure_at=2026-05-22T03:10:00.000Z\treason=blocked\tblocker=git push origin main rejected with fetch-first\tblocker_kind=git_push_fetch_first\tnext_action=Approve fetch\/rebase\/merge workflow, rerun validation, then push commits 650edde and e969435\./);
      assert.match(blockedReportOutput, /ISSUE\tdevelopment-loop\t.*repo-l\tfailure=loop_finished\tfailure_at=2026-05-22T03:11:00.000Z\treason=blocked\tblocker=git push origin main rejected with fetch-first\tblocker_kind=git_push_fetch_first\tnext_action=approve fetch\/rebase\/merge workflow, rerun validation, then push/);
      assert.match(blockedReportOutput, /ISSUE\tdevelopment-loop\t.*repo-m\tfailure=loop_finished\tfailure_at=2026-05-22T03:12:00.000Z\treason=blocked\tblocker=flutter test failed twice; first failing assertion.*\tblocker_kind=validation_failed_twice\tnext_action=fix first failing validation failure, rerun required validation, then commit\/push only after green/);
      assert.match(blockedReportOutput, /SUMMARY\t.*attention_logs=3\tblocker_kind_records=3\ttop_blocker_kind=git_push_fetch_first:2\tissues=3/);
    } finally {
      fs.rmSync(blockedReportRoot, { recursive: true, force: true });
    }

    const recoveredRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-log-audit-recovered-"));
    try {
      const recoveredRepo = path.join(recoveredRoot, "repo-i");
      fs.mkdirSync(path.join(recoveredRepo, ".pi", "development-loop"), { recursive: true });
      fs.writeFileSync(path.join(recoveredRepo, ".pi", "development-loop", "logs.jsonl"), [
        JSON.stringify({ at: "2026-05-22T02:40:00.000Z", event: "compaction_failed_before_next_iteration", iteration: 2, maxIterations: 3, phase: "queued", reason: "Summarization failed: WebSocket error" }),
        JSON.stringify({ at: "2026-05-22T02:40:01.000Z", event: "iteration_prompt_sent", iteration: 2, maxIterations: 3, phase: "running" }),
      ].join("\n") + "\n");
      fs.writeFileSync(path.join(recoveredRepo, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");

      const compactionProgressRepo = path.join(recoveredRoot, "repo-k");
      fs.mkdirSync(path.join(compactionProgressRepo, ".pi", "development-loop"), { recursive: true });
      fs.writeFileSync(path.join(compactionProgressRepo, ".pi", "development-loop", "logs.jsonl"), [
        JSON.stringify({ at: "2026-05-22T02:41:00.000Z", event: "compaction_failed_before_next_iteration", iteration: 2, maxIterations: 3, phase: "queued", reason: "Summarization failed: WebSocket error" }),
        JSON.stringify({ at: "2026-05-22T02:42:00.000Z", event: "compaction_started", iteration: 3, maxIterations: 3, phase: "queued", reason: "tokens_before=120000" }),
      ].join("\n") + "\n");
      fs.writeFileSync(path.join(compactionProgressRepo, ".pi", "development-loop.json"), JSON.stringify({ adapter: "generic-git" }) + "\n");

      const recoveredOutput = execFileSync("node", [path.join(root, scriptRel), "--since=2026-05-22T02:30:00.000Z", recoveredRoot], { encoding: "utf8" });
      assert.match(recoveredOutput, /LOG\tdevelopment-loop\t.*repo-i.*latest=iteration_prompt_sent.*status=running\tconfig=present\tadapter=generic-git\tattention=no/);
      assert.match(recoveredOutput, /HISTORY\tdevelopment-loop\t.*repo-i\tfailure=compaction_failed_before_next_iteration\tfailure_at=2026-05-22T02:40:00.000Z\treason=Summarization failed: WebSocket error/);
      assert.doesNotMatch(recoveredOutput, /ISSUE\tdevelopment-loop\t.*repo-i/);
      assert.match(recoveredOutput, /LOG\tdevelopment-loop\t.*repo-k.*latest=compaction_started.*status=queued\tconfig=present\tadapter=generic-git\tattention=no/);
      assert.match(recoveredOutput, /HISTORY\tdevelopment-loop\t.*repo-k\tfailure=compaction_failed_before_next_iteration\tfailure_at=2026-05-22T02:41:00.000Z\treason=Summarization failed: WebSocket error/);
      assert.doesNotMatch(recoveredOutput, /ISSUE\tdevelopment-loop\t.*repo-k/);

      const recoveredAttentionOnly = execFileSync("node", [path.join(root, scriptRel), "--attention-only", "--since=2026-05-22T02:30:00.000Z", recoveredRoot], { encoding: "utf8" });
      assert.doesNotMatch(recoveredAttentionOnly, /repo-i/);
      assert.doesNotMatch(recoveredAttentionOnly, /repo-k/);
      assert.match(recoveredAttentionOnly, /SUMMARY\tlogs=2\tneeds_attention=0\tblocked=0\trunning=1\tqueued=1\tdone=0\tunknown=0\tattention_logs=0\tblocker_kind_records=0\tissues=0\tbad_json=0\tlogs_without_configs=0\tconfig_bad_json=0\tfiltered_out=2\tsince=2026-05-22T02:30:00.000Z\tsince_filtered=0\tpi_dirs=2\tpi_dirs_without_logs=0\tpi_dirs_with_configs_without_logs=0\tconfig_files=2/);
    } finally {
      fs.rmSync(recoveredRoot, { recursive: true, force: true });
    }

    const hygieneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-log-audit-hygiene-"));
    try {
      const doneMissingConfigRepo = path.join(hygieneRoot, "repo-h");
      fs.mkdirSync(path.join(doneMissingConfigRepo, ".pi", "development-loop"), { recursive: true });
      fs.writeFileSync(path.join(doneMissingConfigRepo, ".pi", "development-loop", "logs.jsonl"), [
        JSON.stringify({ at: "2026-05-22T03:00:00.000Z", event: "loop_finished", iteration: 1, maxIterations: 1, phase: "done", decision: "done" }),
      ].join("\n") + "\n");

      const sinceHygieneOutput = execFileSync("node", [path.join(root, scriptRel), "--since=2026-05-22T02:30:00.000Z", hygieneRoot], { encoding: "utf8" });
      assert.match(sinceHygieneOutput, /LOG\tdevelopment-loop\t.*repo-h.*status=done.*config=missing\tadapter=-\tattention=no/);
      assert.doesNotMatch(sinceHygieneOutput, /ISSUE\tdevelopment-loop\t.*repo-h/);

      const sinceAttentionOnlyHygieneOutput = execFileSync("node", [path.join(root, scriptRel), "--attention-only", "--since=2026-05-22T02:30:00.000Z", hygieneRoot], { encoding: "utf8" });
      assert.doesNotMatch(sinceAttentionOnlyHygieneOutput, /repo-h/);
      assert.match(sinceAttentionOnlyHygieneOutput, /SUMMARY\tlogs=1\tneeds_attention=0\tblocked=0\trunning=0\tqueued=0\tdone=1\tunknown=0\tattention_logs=0\tblocker_kind_records=0\tissues=0\tbad_json=0\tlogs_without_configs=0\tconfig_bad_json=0\tfiltered_out=1\tsince=2026-05-22T02:30:00.000Z\tsince_filtered=0\tpi_dirs=1\tpi_dirs_without_logs=0\tpi_dirs_with_configs_without_logs=0\tconfig_files=0/);
    } finally {
      fs.rmSync(hygieneRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function testDiagnoseCodexStorageReference() {
  const skill = read("skills/diagnose/SKILL.md");
  assert.match(skill, /\[Codex local storage failures\]\(references\/codex-storage\.md\)/);
  assert.match(skill, /\[Pi loop log audits\]\(references\/pi-log-audit\.md\)/);
  assert.ok(exists("skills/diagnose/references/codex-storage.md"), "missing Codex storage reference");
  assert.ok(exists("skills/diagnose/references/pi-log-audit.md"), "missing Pi log audit reference");

  const reference = read("skills/diagnose/references/codex-storage.md");
  assert.match(reference, /No space left on device/);
  assert.match(reference, /database or disk is full/);
  assert.match(reference, /df -h "\$HOME"/);
  assert.match(reference, /df -ih "\$HOME"/);
  assert.match(reference, /du -x -h -d 1 "\$HOME" 2>\/dev\/null \| sort -h \| tail -20/);
  assert.match(reference, /## Likely causes/);
  assert.match(reference, /home filesystem is full/);
  assert.match(reference, /PATH wrapper files under `~\/\.codex\/tmp`/);
  assert.match(reference, /SQLite cannot extend the state database/);
  assert.match(reference, /prints free space, inode usage, Codex path sizes, and top-level `\$HOME` usage/);
  assert.match(reference, /inode exhaustion can also cause `No space left on device`/);
  assert.match(reference, /post-cleanup disk report/);
  assert.match(reference, /unique timestamped backup directory/);
  assert.match(reference, /scripts\/codex-storage-cleanup\.sh/);
  assert.match(reference, /codex-storage-cleanup\.sh --dry-run/);
  assert.match(reference, /--tmp-only/);
  assert.match(reference, /leave `state_\*\.sqlite\*` untouched/);
  assert.match(reference, /path must end in `\/\.codex`/);
  assert.match(reference, /--delete-state/);
  assert.match(reference, /--i-understand-local-state-will-be-lost/);
  assert.match(reference, /rm -rf ~\/\.codex\/tmp/);
  assert.match(reference, /mkdir -p "\$HOME\/\.codex\/backup"/);
  assert.match(reference, /backup_dir="\$\(mktemp -d "\$HOME\/\.codex\/backup\/codex-state-\$\(date \+%Y%m%d-%H%M%S\)\.XXXXXX"\)"/);
  assert.match(reference, /mv ~\/\.codex\/state_\*\.sqlite\* "\$backup_dir"\//);
  assert.match(reference, /rm -f ~\/\.codex\/state_\*\.sqlite/);
  assert.match(reference, /Do not run `rm -rf ~\/\.codex`/);

  const logAuditReference = read("skills/diagnose/references/pi-log-audit.md");
  assert.match(logAuditReference, /pi-log-audit\.mjs/);
  assert.match(logAuditReference, /development-loop/);
  assert.match(logAuditReference, /e2e-loop/);
  assert.match(logAuditReference, /WebSocket error/);
  assert.match(logAuditReference, /missing E2E_LOOP_DECISION final marker/);
  assert.match(logAuditReference, /status=/);
  assert.match(logAuditReference, /SUMMARY/);
  assert.match(logAuditReference, /Did you mean/);
  assert.match(logAuditReference, /--attention-only/);
  assert.match(logAuditReference, /--since=2h/);
  assert.match(logAuditReference, /since_filtered/);
  assert.match(logAuditReference, /pi_dirs_without_logs/);
  assert.match(logAuditReference, /pi_dirs_with_configs_without_logs/);
  assert.match(logAuditReference, /custom loop configs/);
  assert.match(logAuditReference, /logs_without_configs/);
  assert.match(logAuditReference, /matching loop config/);
  assert.match(logAuditReference, /historical failure/);
  assert.match(logAuditReference, /last_at/);
  assert.match(logAuditReference, /mtime=/);
  assert.match(logAuditReference, /failure_at/);
  assert.match(logAuditReference, /last_push/);
  assert.match(logAuditReference, /run_id=/);
  assert.match(logAuditReference, /adapter=/);
  assert.match(logAuditReference, /next_action=/);
  assert.match(logAuditReference, /config_bad_json/);
  assert.match(logAuditReference, /log_path=/);
  assert.match(logAuditReference, /config_path=/);
}

async function testNoticesAndDocs() {
  const readme = read("README.md");
  assert.match(readme, /## Quick start/);
  assert.match(readme, /### Step 1: Install the Pi agent/);
  assert.match(readme, /### Step 2: Install this package/);
  assert.match(readme, /### Step 3: Start `\/development-loop`/);
  assert.match(readme, /## Development-loop instructions and tips/);
  assert.match(readme, /## Included extensions/);
  assert.match(readme, /\/e2e-loop/);
  assert.match(readme, /Playwright/);
  assert.match(readme, /Maestro/);
  assert.match(readme, /screenshots/);
  assert.match(readme, /\.pi\/e2e-loop\/logs\.jsonl/);
  assert.match(readme, /## Included skills/);
  assert.match(readme, /Project-local configuration for any repo/);
  assert.match(readme, /"adapter": "generic-git"/);
  assert.doesNotMatch(readme, /"adapter": "docs-loop"/);
  assert.doesNotMatch(readme, /--adapter <name>/);
  assert.doesNotMatch(readme, /wizard in the Pi TUI for adapter,/);
  assert.match(readme, /Preferred language/);
  assert.match(readme, /caveman/);
  assert.match(readme, /improve-codebase-architecture/);
  assert.match(readme, /## Update or remove/);
  assert.match(readme, /### Status bar integration/);
  assert.match(readme, /pi-powerline-footer/);
  assert.match(readme, /"statusKey": "development-loop"/);
  assert.match(readme, /below-editor widget includes the last report summary, first next step, and count of additional next steps/);
  assert.match(readme, /status report includes recent report context/);
  assert.match(readme, /### Steer an active loop/);
  assert.match(readme, /plain text becomes a steering request/);
  assert.match(readme, /`\/development-loop init` opens an interactive setup wizard/);
  assert.match(readme, /TODO\.md, progress\.json, plans/);
  assert.match(readme, /`--force` only when you intentionally want an atomic replacement/);
  assert.match(readme, /`--iterations <n>`/);
  assert.match(readme, /`--test <command>`/);
  assert.match(readme, /`--skill <name-or-note>`/);
  assert.match(readme, /`--dry-run`/);
  assert.match(readme, /preview the generated config without writing/);
  assert.match(readme, /`--yes`/);
  assert.match(readme, /starts the next iteration automatically/);
  assert.match(readme, /Human-readable end report/);
  assert.match(readme, /structured `summary`, `blockerState`, and `nextSteps`/);
  assert.match(readme, /report summary, blocker-state, next-step, missing-next-steps, and report quality warning counts/);
  assert.match(readme, /Possible next steps/);
  assert.match(readme, /decision-specific next steps/);
  assert.match(readme, /continue should name the next smallest verifiable slice/);
  assert.match(readme, /blocked should name concrete unblocking actions/);
  assert.match(readme, /blocked typed reports should include `blockerState`/);
  assert.match(readme, /Example continue end report/);
  assert.match(readme, /Validation evidence: npm test \(pass\); git diff --check \(pass\)/);
  assert.match(readme, /Blocker state: none/);
  assert.match(readme, /Possible next steps: next smallest verifiable slice/);
  assert.match(readme, /Example blocked end report/);
  assert.match(readme, /Validation evidence: npm test \(failed: missing TEST_SERVICE_TOKEN\)/);
  assert.match(readme, /Blocker state: Missing TEST_SERVICE_TOKEN credential required for integration validation/);
  assert.match(readme, /Possible next steps: provide TEST_SERVICE_TOKEN; rerun `npm test`; restart \/development-loop with the same objective/);
  assert.match(readme, /Example stop handoff end report/);
  assert.match(readme, /Selected slice: final documentation cleanup and handoff/);
  assert.match(readme, /Blocker state: none; stopping because the selected objective is complete/);
  assert.match(readme, /Possible next steps: review the pushed commit; open \/development-loop status for recent context; restart with the next objective/);
  assert.match(readme, /Example done end report/);
  assert.match(readme, /Selected slice: completed the final objective cleanup/);
  assert.match(readme, /Blocker state: none; done because the objective is complete and no loop follow-up remains/);
  assert.match(readme, /Possible next steps: review the delivered commit; archive development-loop state if desired; start a new objective only if new work appears/);
  assert.match(readme, /DEV_LOOP_DECISION: done/);
  assert.match(readme, /Example interrupted resume end report/);
  assert.match(readme, /Selected slice: resumed the same iteration after compaction without advancing the loop/);
  assert.match(readme, /Blocker state: none; provider interruption recovered, same slice resumed/);
  assert.match(readme, /Possible next steps: inspect `.pi\/development-loop\/logs.jsonl`; run `\/development-loop status`; continue the same smallest slice/);
  assert.match(readme, /Example partial validation end report/);
  assert.match(readme, /Selected slice: implemented one path but only ran a targeted check/);
  assert.match(readme, /Validation evidence: targeted test command \(pass\); required validation `npm test` not run/);
  assert.match(readme, /Blocker state: full required validation is missing, so commit and push are unsafe/);
  assert.match(readme, /Possible next steps: run `npm test`; run `git diff --check`; commit and push only after both pass/);
  assert.match(readme, /Decision guide for final markers/);
  assert.match(readme, /continue: use when validation passed and another smallest slice remains/);
  assert.match(readme, /blocked: use when validation is red, required evidence is missing, or delivery is unsafe/);
  assert.match(readme, /stop: use for clean handoff or review before more automation/);
  assert.match(readme, /done: use when the objective is complete and no follow-up loop work remains/);
  assert.match(readme, /End report quality checklist/);
  assert.match(readme, /Scope and slice: exact project path, adapter, and selected slice/);
  assert.match(readme, /Changes: exact files plus what changed and why/);
  assert.match(readme, /Validation: each command with pass, fail, or not-run reason/);
  assert.match(readme, /Delivery: commit hash and push status, or why delivery was skipped/);
  assert.match(readme, /Next step: one concrete action matched to continue, blocked, stop, or done/);
  assert.match(readme, /End report anti-patterns to avoid/);
  assert.match(readme, /Do not write vague summaries like "fixed stuff" or "all good"/);
  assert.match(readme, /Do not claim tests pass without naming the exact commands and outcomes/);
  assert.match(readme, /Do not choose continue when validation is red or required evidence is missing/);
  assert.match(readme, /Do not omit why commit or push was skipped/);
  assert.match(readme, /Keep the machine-readable DEV_LOOP_REPORT and final markers last/);
  assert.match(readme, /continues automatically after compaction/);
  assert.match(readme, /WebSocket error/);
  assert.match(readme, /context_length_exceeded/);
  assert.match(readme, /empty provider response/);
  assert.match(readme, /### Troubleshooting local Codex storage failures/);
  assert.match(readme, /No space left on device/);
  assert.match(readme, /database or disk is full/);
  assert.match(readme, /df -ih "\$HOME"/);
  assert.match(readme, /du -x -h -d 1 "\$HOME" 2>\/dev\/null \| sort -h \| tail -20/);
  assert.match(readme, /Likely causes include a full home filesystem/);
  assert.match(readme, /PATH wrapper files under `~\/\.codex\/tmp`/);
  assert.match(readme, /SQLite cannot extend the state database/);
  assert.match(readme, /rm -rf ~\/\.codex\/tmp/);
  assert.match(readme, /skills\/diagnose\/scripts\/codex-storage-cleanup\.sh/);
  assert.match(readme, /codex-storage-cleanup\.sh --dry-run/);
  assert.match(readme, /--tmp-only/);
  assert.match(readme, /leave `state_\*\.sqlite\*` untouched/);
  assert.match(readme, /prints free space, inode usage, Codex path sizes, and top-level `\$HOME` usage/);
  assert.match(readme, /inode exhaustion can also cause `No space left on device`/);
  assert.match(readme, /post-cleanup disk report/);
  assert.match(readme, /unique timestamped backup directory/);
  assert.match(readme, /path must end in `\/\.codex`/);
  assert.match(readme, /codex-storage-cleanup\.sh --execute/);
  assert.match(readme, /--delete-state --i-understand-local-state-will-be-lost/);
  assert.match(readme, /mkdir -p "\$HOME\/\.codex\/backup"/);
  assert.match(readme, /backup_dir="\$\(mktemp -d "\$HOME\/\.codex\/backup\/codex-state-\$\(date \+%Y%m%d-%H%M%S\)\.XXXXXX"\)"/);
  assert.match(readme, /mv ~\/\.codex\/state_\*\.sqlite\* "\$backup_dir"\//);
  assert.match(readme, /rm -f ~\/\.codex\/state_\*\.sqlite/);
  assert.match(readme, /\/development-loop status/);
  assert.match(readme, /`grill-me`/);
  assert.match(readme, /`greploop`/);
  assert.match(readme, /Greptile review loop/);
  assert.match(readme, /`lgtm`/);
  assert.match(readme, /pi update git:github\.com\/TrebuchetDynamics\/pi-package-development-loop/);
  assert.match(readme, /pi remove git:github\.com\/TrebuchetDynamics\/pi-package-development-loop/);
  assert.doesNotMatch(readme, /works across Gormes, Navivox, and generic Git projects/);
  assert.match(readme, /pi install git:github\.com\/TrebuchetDynamics\/pi-package-development-loop/);
  assert.match(readme, /\/development-loop start/);
  assert.match(readme, /\/development-loop help/);
  assert.match(readme, /Pi package manifest shape, referenced bundle paths, and Pi glob\/exclusion entries/);
  assert.match(readme, /Pi core imports are peerDependencies with \"\*\"/);
  assert.match(readme, /Skill frontmatter and exact expected bundle contents/);
  assert.match(readme, /Markdown relative links outside code-fence templates/);
  assert.match(readme, /Third-party notices, local notice paths, and license copies/);

  const notices = read("THIRD_PARTY_NOTICES.md");
  assert.match(notices, /GoogleChrome\/modern-web-guidance/);
  assert.match(notices, /Apache-2\.0/);
  assert.match(notices, /mattpocock\/skills/);
  assert.match(notices, /MIT/);
  assert.match(notices, /qualisero\/awesome-pi-agent/);
  assert.match(notices, /greptileai\/skills/);
  assert.match(notices, /skills\/greploop\//);

  assert.ok(exists("licenses/GoogleChrome-modern-web-guidance-LICENSE"));
  assert.ok(exists("licenses/mattpocock-skills-LICENSE"));
  assert.ok(exists("licenses/qualisero-awesome-pi-agent-LICENSE"));
  assert.ok(exists("licenses/greptileai-skills-LICENSE"));
}

await testPackageManifest();
await testPackageManifestPaths();
await testPiCoreDependencies();
await testExtensionLoadsAndRegistersCommands();
await testE2ELoopExtensionLoadsAndRegistersCommands();
await testSkills();
await testMarkdownLinks();
await testThirdPartyNoticePaths();
await testCodexStorageCleanupScript();
await testPiLogAuditScript();
await testDiagnoseCodexStorageReference();
await testNoticesAndDocs();
console.log("pi-package-development-loop validation ok");
