import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

function listSkillFiles() {
  const out = [];
  const base = path.join(root, "skills");
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      if (entry.isFile() && entry.name === "SKILL.md") out.push(path.relative(root, full));
    }
  };
  walk(base);
  return out.sort();
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

async function testExtensionLoadsAndRegistersCommands() {
  assert.ok(exists("extensions/development-loop.ts"), "development-loop extension missing");
  const { createJiti } = require(jitiEntry);
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const mod = await jiti.import(path.join(root, "extensions", "development-loop.ts"));
  assert.equal(typeof mod.default, "function");
  assert.equal(typeof mod.__test__.resolveProjectAdapter, "function");
  assert.deepEqual(mod.__test__.BUILT_IN_ADAPTERS.map((adapter) => adapter.name), ["generic-git"]);

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
      isIdle: () => true,
    };

    await command.handler("start --iterations=2 README polish", ctx);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content, /Development loop iteration 1\/2/);
    assert.match(sent[0].content, /DEV_LOOP_DECISION/);
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
        content: "Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: continue",
      }],
    }, ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));
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

    await command.handler("start --iterations=1 blocker", ctx);
    await handlers.get("agent_end")({
      messages: [{ role: "assistant", content: "No markers here." }],
    }, ctx);
    assert.match(statusUpdates.at(-1).value, /<error>■ block<\/error>/);
    assert.match(statusUpdates.at(-1).value, /git:manual/);
    assert.doesNotMatch(statusUpdates.at(-1).value, /blocked \(blocked\)/);
    assert.equal(widgetUpdates.at(-1).value.length, 1, "blocked development-loop widget should show only detail because footer already shows status");

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
      await command.handler("start --iterations=2 compaction threshold", proactiveCtx);
      const sentBeforeProactiveContinue = sent.length;
      await handlers.get("agent_end")({
        messages: [{
          role: "assistant",
          content: "Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: continue",
        }],
      }, proactiveCtx);
      assert.equal(compactCalls.length, 1, "high context usage should compact before next iteration");
      assert.match(compactCalls[0].customInstructions, /development loop state/);
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
  assert.match(readme, /continues automatically after compaction/);
  assert.match(readme, /WebSocket error/);
  assert.match(readme, /empty provider response/);
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
  assert.match(readme, /Markdown relative links outside code-fence templates/);

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
await testExtensionLoadsAndRegistersCommands();
await testE2ELoopExtensionLoadsAndRegistersCommands();
await testSkills();
await testMarkdownLinks();
await testNoticesAndDocs();
console.log("pi-package-development-loop validation ok");
