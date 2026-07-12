import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(pkg.files.includes("lib"), false, "published package must not keep root lib modules");
assert.equal(pkg.files.includes("extensions"), true, "published package must include package extensions and extension-owned libs");
assert.deepEqual(pkg.pi.extensions, ["./extensions/goal", "./extensions/goal-technical-auditor", "./extensions/understand", "./extensions/folder-refactor", "./extensions/rtk", "./extensions/ponytail", "./extensions/onklaud"], "package must register package extensions");
assert.deepEqual(pkg.pi.themes, ["./themes"], "package must register package themes");

const reportParserSource = fs.readFileSync(path.join(root, "extensions", "goal", "lib", "report-parser.ts"), "utf8");
assert.doesNotMatch(reportParserSource, /\bas LoopDecision\b/, "report parser must not carry stale unimported LoopDecision casts");

const reportParser = await import(path.join(root, "extensions", "goal", "lib", "report-parser.ts"));
assert.equal(typeof reportParser.parseFinalReport, "function");

const finalReportGate = await import(path.join(root, "extensions", "goal", "lib", "final-report-gate.ts"));
assert.equal(typeof finalReportGate.evaluateFinalReportGate, "function");

const worktreeRisk = await import(path.join(root, "extensions", "goal", "lib", "worktree-risk.ts"));
assert.equal(typeof worktreeRisk.evaluateWorktreeRisk, "function");

const validationReceipts = await import(path.join(root, "extensions", "goal", "lib", "validation-receipts.ts"));
assert.equal(typeof validationReceipts.recordValidationReceipt, "function");

const terminalAudit = await import(path.join(root, "extensions", "goal", "lib", "terminal-audit.ts"));
assert.equal(typeof terminalAudit.terminalAuditEvent, "function");

console.log("development-goal-lib-architecture ok");
