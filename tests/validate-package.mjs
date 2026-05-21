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
  "caveman",
  "write-a-skill",
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
  assert.deepEqual(pkg.pi.extensions, ["./extensions/development-loop.ts"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);
  assert.equal(pkg.peerDependencies["@earendil-works/pi-coding-agent"], "*");
}

async function testExtensionLoadsAndRegistersCommands() {
  assert.ok(exists("extensions/development-loop.ts"), "development-loop extension missing");
  const { createJiti } = require(jitiEntry);
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const mod = await jiti.import(path.join(root, "extensions", "development-loop.ts"));
  assert.equal(typeof mod.default, "function");
  assert.equal(typeof mod.__test__.resolveProjectAdapter, "function");

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

  const e2eRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dev-loop-e2e-"));
  fs.mkdirSync(path.join(e2eRoot, ".git"));
  try {
    const command = commands.get("development-loop");
    const ctx = {
      cwd: e2eRoot,
      hasUI: true,
      ui: {
        notify() {},
        setStatus() {},
        setWidget() {},
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
    assert.equal(entries.at(-1).customType, "development-loop-state");
    assert.equal(entries.at(-1).data.phase, "running");

    await handlers.get("agent_end")({
      messages: [{
        role: "assistant",
        content: "Validated.\nDEV_LOOP_VALIDATED: yes\nDEV_LOOP_DECISION: done",
      }],
    }, ctx);
    assert.equal(entries.at(-1).data.active, false);
    assert.equal(entries.at(-1).data.phase, "done");

    fs.mkdirSync(path.join(e2eRoot, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(e2eRoot, ".pi", "development-loop.json"), JSON.stringify({
      adapter: "docs-only",
      defaultTopic: "polish docs",
      validationCommands: ["npm test"],
    }, null, 2));
    await command.handler("adapters", ctx);
    assert.match(messages.at(-1).content, /Project-configured adapter docs-only/);
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

async function testNoticesAndDocs() {
  const readme = read("README.md");
  assert.match(readme, /## Quick start/);
  assert.match(readme, /### Step 1: Install the Pi agent/);
  assert.match(readme, /### Step 2: Install this package/);
  assert.match(readme, /### Step 3: Start `\/development-loop`/);
  assert.match(readme, /## Development-loop instructions and tips/);
  assert.match(readme, /## Included extensions/);
  assert.match(readme, /## Included skills/);
  assert.match(readme, /Project-local configuration for any repo/);
  assert.match(readme, /"adapter": "docs-loop"/);
  assert.doesNotMatch(readme, /works across Gormes, Navivox, and generic Git projects/);
  assert.match(readme, /pi install git:github\.com\/TrebuchetDynamics\/pi-package-development-loop/);
  assert.match(readme, /\/development-loop start/);

  const notices = read("THIRD_PARTY_NOTICES.md");
  assert.match(notices, /GoogleChrome\/modern-web-guidance/);
  assert.match(notices, /Apache-2\.0/);
  assert.match(notices, /mattpocock\/skills/);
  assert.match(notices, /MIT/);
  assert.match(notices, /qualisero\/awesome-pi-agent/);

  assert.ok(exists("licenses/GoogleChrome-modern-web-guidance-LICENSE"));
  assert.ok(exists("licenses/mattpocock-skills-LICENSE"));
  assert.ok(exists("licenses/qualisero-awesome-pi-agent-LICENSE"));
}

await testPackageManifest();
await testExtensionLoadsAndRegistersCommands();
await testSkills();
await testNoticesAndDocs();
console.log("pi-package-development-loop validation ok");
