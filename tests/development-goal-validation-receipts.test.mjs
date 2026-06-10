import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const require = createRequire(import.meta.url);
const jitiEntry = "/home/xel/.nvm/versions/node/v22.21.1/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.cjs";
const { createJiti } = require(jitiEntry);
const jiti = createJiti(import.meta.url, { interopDefault: true });
const receiptsMod = await jiti.import(path.join(root, "lib", "goal", "validation-receipts.ts"));

assert.equal(typeof receiptsMod.recordValidationReceipt, "function");
assert.equal(typeof receiptsMod.validationReceiptsPassed, "function");

const passingReceipt = receiptsMod.recordValidationReceipt({
  command: "npm test",
  exitCode: 0,
  durationMs: 1234,
  stdout: "line one\nline two\nline three",
  stderr: "warning one\nwarning two",
  tailLines: 2,
});

assert.equal(passingReceipt.command, "npm test");
assert.equal(passingReceipt.exitCode, 0);
assert.equal(passingReceipt.durationMs, 1234);
assert.equal(passingReceipt.passed, true);
assert.equal(passingReceipt.stdoutTail, "line two\nline three");
assert.equal(passingReceipt.stderrTail, "warning one\nwarning two");

const failingReceipt = receiptsMod.recordValidationReceipt({
  command: "git diff --check",
  exitCode: 1,
  durationMs: 27,
  stdout: "",
  stderr: "bad whitespace",
  tailLines: 5,
});

assert.equal(failingReceipt.passed, false);
assert.equal(receiptsMod.validationReceiptsPassed([passingReceipt, failingReceipt], ["npm test", "git diff --check"]), false);
assert.equal(receiptsMod.validationReceiptsPassed([passingReceipt], ["npm test", "git diff --check"]), false);
assert.equal(receiptsMod.validationReceiptsPassed([passingReceipt], ["npm test"]), true);

console.log("development-goal-validation-receipts ok");
