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

const reportParser = await jiti.import(path.join(root, "lib", "goal", "report-parser.ts"));
assert.equal(typeof reportParser.parseFinalReport, "function");

const worktreeRisk = await jiti.import(path.join(root, "lib", "goal", "worktree-risk.ts"));
assert.equal(typeof worktreeRisk.evaluateWorktreeRisk, "function");

const validationReceipts = await jiti.import(path.join(root, "lib", "goal", "validation-receipts.ts"));
assert.equal(typeof validationReceipts.recordValidationReceipt, "function");

const terminalAudit = await jiti.import(path.join(root, "lib", "goal", "terminal-audit.ts"));
assert.equal(typeof terminalAudit.terminalAuditEvent, "function");

const developmentGoalMain = fs.readFileSync(path.join(root, "extensions", "development-goal", "main.ts"), "utf8");
assert.doesNotMatch(developmentGoalMain, /from "\.\/final-report-gate\.ts"/, "main.ts should delegate Final Report Gate handling to the Goal Run result module");
assert.doesNotMatch(developmentGoalMain, /from "\.\/provider-error\.ts"/, "main.ts should delegate provider-error handling to the Goal Run result module");
assert.match(developmentGoalMain, /from "\.\/goal-run-result\.ts"/, "main.ts should wire the Goal Run result module");
assert.doesNotMatch(developmentGoalMain, /from "\.\/goal-run-transitions\.ts"/, "main.ts should not own Goal Run state transitions directly");
