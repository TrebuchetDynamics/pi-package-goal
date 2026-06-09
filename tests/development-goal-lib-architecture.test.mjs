import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const jitiEntry = "/home/xel/.nvm/versions/node/v22.21.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs";
const { createJiti } = require(jitiEntry);
const jiti = createJiti(import.meta.url, { interopDefault: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.ok(pkg.files.includes("lib"), "published package must include lib goal modules");
assert.equal(pkg.files.includes("extensions"), true, "published package must include package extensions");
assert.deepEqual(pkg.pi.extensions, ["./extensions/goal", "./extensions/understand.js", "./extensions/folder-refactor.js", "./extensions/rtk.js", "./extensions/graphify.js"], "package must register package extensions");
assert.deepEqual(pkg.pi.themes, ["./themes"], "package must register package themes");

const reportParser = await jiti.import(path.join(root, "lib", "goal", "report-parser.ts"));
assert.equal(typeof reportParser.parseFinalReport, "function");

const finalReportGate = await jiti.import(path.join(root, "lib", "goal", "final-report-gate.ts"));
assert.equal(typeof finalReportGate.evaluateFinalReportGate, "function");

const worktreeRisk = await jiti.import(path.join(root, "lib", "goal", "worktree-risk.ts"));
assert.equal(typeof worktreeRisk.evaluateWorktreeRisk, "function");

const validationReceipts = await jiti.import(path.join(root, "lib", "goal", "validation-receipts.ts"));
assert.equal(typeof validationReceipts.recordValidationReceipt, "function");

const terminalAudit = await jiti.import(path.join(root, "lib", "goal", "terminal-audit.ts"));
assert.equal(typeof terminalAudit.terminalAuditEvent, "function");
