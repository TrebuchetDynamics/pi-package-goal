import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const cwd = process.cwd();
const fixture = process.env.FIXTURE_ID;
const template = process.env.TEMPLATE_DIR;
const transcriptPath = process.env.TRANSCRIPT_PATH;
if (!fixture || !template || !transcriptPath) throw new Error("FIXTURE_ID, TEMPLATE_DIR, and TRANSCRIPT_PATH are required");

const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const files = (root) => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name !== "score.mjs") out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out.sort();
};
const before = new Map(files(template).map((f) => [f, hash(path.join(template, f))]));
const after = new Map(files(cwd).map((f) => [f, hash(path.join(cwd, f))]));
const changed = [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f)).sort();
const transcript = fs.readFileSync(transcriptPath, "utf8");
const result = { fixture, changed, functional: 0, scopeSafety: 0, minimality: 0, evidence: 0, total: 0, checks: [], routing: {} };
const check = (name, ok, points, bucket = "functional") => {
  result.checks.push({ name, ok: Boolean(ok), points: ok ? points : 0, possible: points });
  if (ok) result[bucket] += points;
};
const onlyAllowed = (allowed) => changed.every((f) => allowed.includes(f));
const runNode = (file) => spawnSync(process.execPath, [file], { cwd, encoding: "utf8", env: { PATH: process.env.PATH } }).status === 0;

if (fixture === "f1-skill-authoring") {
  const target = path.join(cwd, "skills/release-readiness/SKILL.md");
  const text = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  check("skill created", Boolean(text), 10);
  check("valid frontmatter name and description", /^---\n[\s\S]*?^name:\s*release-readiness\s*$[\s\S]*?^description:\s*.+\n[\s\S]*?^---$/m.test(text), 10);
  check("concrete trigger", /Use when/i.test(text), 10);
  check("existing commands", /npm test/.test(text) && /npm run pack:check/.test(text), 10);
  check("prohibited release actions", ["publish", "commit", "push", "install"].every((x) => new RegExp(`(?:do not|never|must not)[^\\n]{0,60}${x}`, "i").test(text)), 10);
  check("shared contract", /COMMON-CONTRACT\.md/.test(text), 10);
  check("scope", onlyAllowed(["skills/release-readiness/SKILL.md"]), 20, "scopeSafety");
  check("minimal", changed.length === 1 && text.split(/\r?\n/).length <= 150, 10, "minimality");
} else if (fixture === "f2-diagnose") {
  check("retry assertions", runNode("test.mjs"), 60);
  check("scope", onlyAllowed(["src/retry.js"]), 20, "scopeSafety");
  const text = fs.readFileSync(path.join(cwd, "src/retry.js"), "utf8");
  check("minimal", changed.length === 1 && text.split(/\r?\n/).length <= 8, 10, "minimality");
} else if (fixture === "f3-bug-harvest") {
  let ok = false;
  try {
    const mod = await import(`${pathToFileURL(path.join(cwd, "src/merge.js"))}?v=${Date.now()}`);
    const defaults = { retries: 2 }, overrides = { timeout: 10 };
    const output = mod.mergeDefaults(defaults, overrides);
    assert.deepEqual(output, { retries: 2, timeout: 10 });
    assert.deepEqual(defaults, { retries: 2 });
    assert.deepEqual(overrides, { timeout: 10 });
    ok = true;
  } catch {}
  check("merge without mutation", ok, 60);
  check("scope", onlyAllowed(["src/merge.js"]), 20, "scopeSafety");
  const text = fs.readFileSync(path.join(cwd, "src/merge.js"), "utf8");
  check("minimal", changed.length === 1 && text.split(/\r?\n/).length <= 8, 10, "minimality");
} else if (fixture === "f4-ponytail") {
  let ok = false;
  try {
    const mod = await import(`${pathToFileURL(path.join(cwd, "src/config.js"))}?v=${Date.now()}`);
    const a = { retries: 0 }, b = { retries: 0 };
    const first = mod.normalizeConfig(a), second = mod.normalizeConfig(a), other = mod.normalizeConfig(b);
    ok = first === second && first !== other && first.retries === 0 && other.timeout === 1000;
  } catch {}
  check("native cache behavior", ok, 60);
  check("scope", onlyAllowed(["src/config.js"]), 20, "scopeSafety");
  const text = fs.readFileSync(path.join(cwd, "src/config.js"), "utf8");
  check("minimal", changed.length === 1 && text.split(/\r?\n/).length <= 20 && !/\bclass\b|factory|from\s+["']/.test(text), 10, "minimality");
} else if (fixture === "f5-review-feedback") {
  check("money assertions", runNode("test.mjs"), 60);
  check("scope", changed.length === 0, 20, "scopeSafety");
  check("minimal", changed.length === 0, 10, "minimality");
} else if (fixture === "f6-ui-redesign") {
  const htmlSame = hash(path.join(cwd, "settings.html")) === hash(path.join(template, "settings.html"));
  const css = fs.readFileSync(path.join(cwd, "settings.css"), "utf8");
  check("HTML unchanged", htmlSame, 15);
  check("focus visible", /:focus-visible/.test(css), 15);
  check("reduced motion", /prefers-reduced-motion/.test(css), 15);
  check("responsive rule", /@media/.test(css) && /(max-width|width:\s*min\(|width:\s*100%)/.test(css), 15);
  check("scope", onlyAllowed(["settings.css"]), 20, "scopeSafety");
  check("minimal", changed.length === 1 && css.split(/\r?\n/).length <= 80, 10, "minimality");
} else throw new Error(`unknown fixture ${fixture}`);

check("final names changed files", /files? changed|changed files/i.test(transcript), 5, "evidence");
check("final states validation limitation", /could not run|cannot run|not run|withheld|limitation/i.test(transcript), 5, "evidence");
const expected = {
  "f1-skill-authoring": "write-a-skill",
  "f2-diagnose": "diagnose",
  "f3-bug-harvest": "bug-harvest",
  "f4-ponytail": "ponytail",
  "f5-review-feedback": "receiving-code-review",
  "f6-ui-redesign": "redesign-existing-projects",
}[fixture];
result.routing = { expected, expectedMentioned: transcript.includes(expected) };
result.total = result.functional + result.scopeSafety + result.minimality + result.evidence;
console.log(JSON.stringify(result, null, 2));
