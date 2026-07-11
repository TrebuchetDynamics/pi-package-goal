import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { applyPatchPayload, expectedCells, parsePatchPayload, scoreFixture, validatePairCompleteness } from "./offline-scorer-lib.mjs";

const root = path.resolve(new URL(".", import.meta.url).pathname);
const validationRoot = path.join(root, "offline-validation");
const templates = path.join(root, "templates");
fs.rmSync(validationRoot, { recursive: true, force: true });
fs.mkdirSync(validationRoot, { recursive: true });

const final = "Files changed: fixture-specific patch. Tests not run in the model harness; offline scorer provides validation and remaining limitations.";
const good = {
  "f1-skill-authoring": { files: { "skills/release-readiness/SKILL.md": `---
name: release-readiness
description: Validate npm package readiness without publishing. Use when preparing a package for release review.
---

# Release Readiness

Run \`npm test\` and \`npm run pack:check\`.

## Boundaries

Never publish. Never commit. Never push. Never install dependencies.

## Shared contract

Follow [the shared contract](../../../package-snapshot/skills/shared/COMMON-CONTRACT.md).
` }, final },
  "f2-diagnose": { files: { "src/retry.js": `export function parseRetryCount(value, fallback = 3) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}
` }, final },
  "f3-bug-harvest": { files: { "src/merge.js": `export function mergeDefaults(defaults, overrides) {
  return { ...defaults, ...overrides };
}
` }, final },
  "f4-ponytail": { files: { "src/config.js": `const cache = new WeakMap();

export function normalizeConfig(config) {
  if (cache.has(config)) return cache.get(config);
  const normalized = {
    retries: config.retries ?? 3,
    timeout: config.timeout ?? 1000,
  };
  cache.set(config, normalized);
  return normalized;
}
` }, final },
  "f5-review-feedback": { files: {}, final: "Files changed: none. Tests not run in the model harness. The integer-cent API and supplied exact-arithmetic tests contradict the proposed float conversion; remaining limitation is offline execution." },
  "f6-ui-redesign": { files: { "settings.css": `:root { color-scheme: light; }
body { margin: 0; color: #242424; background: #f6f5f2; font: 16px/1.5 sans-serif; }
.settings { width: min(900px, calc(100% - 32px)); margin: 48px auto; }
section { display: grid; gap: 20px; border: 1px solid #c9c7c1; padding: 24px; background: white; }
h1 { margin-bottom: 24px; }
button { width: fit-content; margin-top: 8px; transition: transform 160ms ease; }
button:focus-visible, input:focus-visible { outline: 3px solid #2457d6; outline-offset: 3px; }
@media (max-width: 600px) { .settings { width: min(100% - 24px, 900px); margin: 24px auto; } section { padding: 18px; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; } }
` }, final },
};
const bad = {
  "f1-skill-authoring": { files: {}, final },
  "f2-diagnose": { files: {}, final },
  "f3-bug-harvest": { files: {}, final },
  "f4-ponytail": { files: {}, final },
  "f5-review-feedback": { files: { "src/money.js": `export const addCents = (a, b) => a / 100 + b / 100;
export const formatCents = (value) => "$" + value.toFixed(2);
` }, final },
  "f6-ui-redesign": { files: { "settings.html": "<h1>Rebuilt</h1>\n", "settings.css": "body { color: red; }\n" }, final },
};

function treeDigest(dir) {
  const hash = crypto.createHash("sha256");
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name), relative = path.relative(dir, full);
      hash.update(relative);
      if (entry.isDirectory()) walk(full);
      else if (entry.isSymbolicLink()) hash.update(`link:${fs.readlinkSync(full)}`);
      else hash.update(fs.readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function runCase(fixtureId, label, payload, iteration) {
  const caseDir = path.join(validationRoot, `${fixtureId}-${label}-${iteration}`);
  const fixtureDir = path.join(caseDir, "fixture");
  fs.mkdirSync(caseDir, { recursive: true });
  fs.cpSync(path.join(templates, fixtureId), fixtureDir, { recursive: true });
  const parsed = parsePatchPayload(JSON.stringify(payload));
  applyPatchPayload(fixtureDir, parsed);
  const transcript = path.join(caseDir, "transcript.txt");
  fs.writeFileSync(transcript, parsed.final);
  const score = scoreFixture({ fixtureId, fixtureDir, templateDir: path.join(templates, fixtureId), transcriptPath: transcript });
  fs.writeFileSync(path.join(caseDir, "score.json"), JSON.stringify(score, null, 2) + "\n");
  return score;
}

const cases = [];
for (const fixtureId of Object.keys(good)) {
  const goodA = runCase(fixtureId, "good", good[fixtureId], 1);
  const goodB = runCase(fixtureId, "good", good[fixtureId], 2);
  const badA = runCase(fixtureId, "bad", bad[fixtureId], 1);
  const badB = runCase(fixtureId, "bad", bad[fixtureId], 2);
  assert.deepEqual(goodA, goodB, `${fixtureId} good scoring must be deterministic`);
  assert.deepEqual(badA, badB, `${fixtureId} bad scoring must be deterministic`);
  assert.equal(goodA.total, 100, `${fixtureId} known-good patch must score 100`);
  assert.ok(badA.total < goodA.total, `${fixtureId} known-bad patch must score lower`);
  cases.push({ fixtureId, goodScore: goodA.total, badScore: badA.total, deterministic: true });
}

const malformedDir = path.join(validationRoot, "malformed");
fs.cpSync(path.join(templates, "f2-diagnose"), malformedDir, { recursive: true });
const malformedBefore = treeDigest(malformedDir);
assert.throws(() => parsePatchPayload("{not json"), /valid JSON/);
assert.throws(() => parsePatchPayload(JSON.stringify({ files: { "../escape": "bad" }, final })), /unsafe patch path/);
assert.throws(() => parsePatchPayload(JSON.stringify({ files: {}, final, extra: true })), /unexpected patch keys/);
assert.equal(treeDigest(malformedDir), malformedBefore, "malformed payloads must not mutate fixture");
const outside = path.join(validationRoot, "outside.txt");
fs.writeFileSync(outside, "sentinel");
fs.symlinkSync(outside, path.join(malformedDir, "linked"));
const symlinkBefore = treeDigest(malformedDir);
assert.throws(() => applyPatchPayload(malformedDir, parsePatchPayload(JSON.stringify({ files: { "linked": "overwrite" }, final }))), /symlink patch path rejected/);
assert.equal(treeDigest(malformedDir), symlinkBefore, "symlink rejection must be fail-closed");
assert.equal(fs.readFileSync(outside, "utf8"), "sentinel");

const completeRecords = expectedCells.map((cell) => {
  const [fixtureId, condition] = cell.split(":");
  return { fixtureId, condition, status: "scored", score: 100 };
});
const complete = validatePairCompleteness(completeRecords);
assert.equal(complete.complete, true);
const missing = validatePairCompleteness(completeRecords.slice(0, -1));
assert.equal(missing.complete, false);
assert.ok(missing.errors.includes("missing cell: f6-ui-redesign:on"));
const duplicate = validatePairCompleteness([...completeRecords, completeRecords[0]]);
assert.equal(duplicate.complete, false);
assert.ok(duplicate.errors.some((error) => error.startsWith("duplicate cell:")));
const unknown = validatePairCompleteness([...completeRecords.slice(1), { fixtureId: "unknown", condition: "on", status: "scored", score: 1 }]);
assert.equal(unknown.complete, false);
assert.ok(unknown.errors.some((error) => error.startsWith("unknown cell:")));
const unscored = validatePairCompleteness(completeRecords.map((record, index) => index ? record : { ...record, status: "malformed", score: null }));
assert.equal(unscored.complete, false);
assert.ok(unscored.errors.some((error) => error.startsWith("unscored cell:")));

const receipt = {
  timestamp: new Date().toISOString(),
  mode: "offline-only",
  providerCalls: 0,
  spendUsd: 0,
  claim: "scorer determinism and fail-closed validation only; no behavioral-gain claim",
  cases,
  malformed: { invalidJsonRejected: true, traversalRejected: true, extraKeysRejected: true, symlinkRejected: true, fixtureUnchanged: true },
  pairCompleteness: { completeAccepted: true, missingRejected: true, duplicateRejected: true, unknownRejected: true, unscoredRejected: true },
};
fs.writeFileSync(path.join(root, "offline-validation-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
fs.rmSync(validationRoot, { recursive: true, force: true });
console.log(JSON.stringify(receipt, null, 2));
