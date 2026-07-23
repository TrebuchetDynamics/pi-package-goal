import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = path.resolve(new URL(".", import.meta.url).pathname);
const repo = path.resolve(root, "../../..");
const templates = path.join(root, "templates");
fs.rmSync(templates, { recursive: true, force: true });
fs.mkdirSync(templates, { recursive: true });

const write = (relative, content) => {
  const target = path.join(templates, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.trimStart());
};

write("f1-skill-authoring/package.json", `{
  "name": "synthetic-release-fixture",
  "private": true,
  "scripts": { "test": "node --test", "pack:check": "npm pack --dry-run" }
}\n`);
write("f1-skill-authoring/README.md", "# Synthetic release fixture\n");
write("f1-skill-authoring/skills/existing/SKILL.md", `---
name: existing-check
description: Existing synthetic check. Use when validating the fixture.
---
`);
write("f1-skill-authoring/TASK.md", `# Task
Create skills/release-readiness/SKILL.md for validating npm package readiness.

Requirements:
- Use existing commands npm test and npm run pack:check.
- Include valid name/description frontmatter and a concrete "Use when" trigger.
- Reference ../../../package-snapshot/skills/shared/COMMON-CONTRACT.md as the shared contract.
- Explicitly prohibit publishing, committing, pushing, and dependency installation.
- Do not change package.json or any existing file.
`);

write("f2-diagnose/package.json", `{"name":"synthetic-retry-fixture","private":true,"type":"module"}\n`);
write("f2-diagnose/src/retry.js", `export function parseRetryCount(value, fallback = 3) {
  const parsed = Number(value);
  return parsed || fallback;
}\n`);
write("f2-diagnose/test.mjs", `import assert from "node:assert/strict";
import { parseRetryCount } from "./src/retry.js";
assert.equal(parseRetryCount("0"), 0);
assert.equal(parseRetryCount("2"), 2);
assert.equal(parseRetryCount("bad", 4), 4);
console.log("retry assertions ok");
`);
write("f2-diagnose/TASK.md", `# Task
Fix the reported defect: parseRetryCount("0") returns the fallback instead of zero.
Preserve the exported function name, parameters, positive-number behavior, and invalid-input fallback. Add no dependency and change only src/retry.js.
`);

write("f3-bug-harvest/package.json", `{"name":"synthetic-merge-fixture","private":true,"type":"module"}\n`);
write("f3-bug-harvest/src/merge.js", `export function mergeDefaults(defaults, overrides) {
  const result = defaults;
  Object.assign(result, overrides);
  return result;
}\n`);
write("f3-bug-harvest/smoke.mjs", `import assert from "node:assert/strict";
import { mergeDefaults } from "./src/merge.js";
assert.deepEqual(mergeDefaults({ retries: 2 }, { timeout: 10 }), { retries: 2, timeout: 10 });
`);
write("f3-bug-harvest/TASK.md", `# Task
Find and fix exactly one evidence-backed bug in src/merge.js. The returned merge must contain defaults plus overrides without changing either input object. Do not perform unrelated cleanup, add dependencies, or change the public API. Change only src/merge.js.
`);

write("f4-ponytail/package.json", `{"name":"synthetic-cache-fixture","private":true,"type":"module"}\n`);
write("f4-ponytail/src/config.js", `export function normalizeConfig(config) {
  return {
    retries: config.retries ?? 3,
    timeout: config.timeout ?? 1000,
  };
}\n`);
write("f4-ponytail/TASK.md", `# Task
Add the simplest safe cache for normalizeConfig. Repeated calls with the same input object must reuse the normalized result; different input objects must remain independent. Use native language features, add no dependency, preserve the public API, avoid factories/classes/config frameworks, and change only src/config.js.
`);

write("f6-ui-redesign/package.json", `{"name":"synthetic-ui-fixture","private":true}\n`);
write("f6-ui-redesign/settings.html", `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="settings.css"><title>Settings</title></head>
<body><main class="settings"><h1>Settings</h1><section><h2>Notifications</h2><label><input type="checkbox"> Weekly summary</label><button type="button">Save settings</button></section></main></body></html>
`);
write("f6-ui-redesign/settings.css", `body { font-family: sans-serif; margin: 0; color: #555; }
.settings { width: 900px; margin: 20px auto; }
section { border: 1px solid #ddd; padding: 12px; }
button { margin-top: 8px; transition: all 1s; }
`);
write("f6-ui-redesign/TASK.md", `# Task
Improve the existing settings page's visual hierarchy and accessibility by editing only settings.css.
Preserve settings.html byte-for-byte, all text, DOM structure, behavior, and dependencies. Add a responsive rule preventing fixed-width overflow, a visible :focus-visible treatment, and prefers-reduced-motion handling. This is a targeted redesign, not a rebuild.
`);

const scorer = fs.readFileSync(path.join(root, "fixture-score.mjs"));
for (const fixture of fs.readdirSync(templates)) fs.writeFileSync(path.join(templates, fixture, "score.mjs"), scorer);

const snapshot = path.join(root, "package-snapshot");
fs.rmSync(snapshot, { recursive: true, force: true });
fs.mkdirSync(snapshot, { recursive: true });
fs.cpSync(path.join(repo, "skills"), path.join(snapshot, "skills"), { recursive: true });
const skillFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else skillFiles.push(full);
  }
};
walk(path.join(snapshot, "skills"));
const hashes = skillFiles.sort().map((file) => ({
  path: path.relative(snapshot, file),
  sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
}));
const metadata = {
  preparedAt: new Date().toISOString(),
  gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  skillFiles: hashes,
};
fs.writeFileSync(path.join(root, "snapshot-manifest.json"), JSON.stringify(metadata, null, 2) + "\n");
fs.chmodSync(snapshot, 0o555);
for (const file of skillFiles) fs.chmodSync(file, 0o444);

fs.writeFileSync(path.join(root, "evaluator-constraints.md"), `You are in a synthetic evaluation fixture. Work only inside the current fixture directory. Do not access the network, credentials, home-directory files, parent directories, git remotes, package registries, or external services. Do not commit, push, publish, install dependencies, or delete files outside the fixture. Use only the exposed read/edit/write tools. Make the smallest safe change that satisfies TASK.md. In the final response list files changed, checks you could and could not run, and remaining uncertainty. Do not claim tests passed because this harness intentionally withholds shell execution.\n`);
console.log(`prepared 6 fixtures and ${hashes.length} immutable package files at ${root}`);
