import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "candidates-folder-refactor-"));

try {
  write("src/noisy/api/handler.ts", "export function duplicateThing() { return 1; }\n");
  write("src/noisy/api/route.ts", "export function duplicateThing() { return 2; }\n");
  write("src/noisy/ui/component.tsx", "export const Component = () => null;\n");
  write("src/noisy/model/types.ts", "export type Thing = string;\n");
  write("src/noisy/test/fixture.test.ts", "test('x', () => {});\n");
  write("src/consumer.ts", "import { duplicateThing } from './noisy/api/handler';\nconsole.log(duplicateThing);\n");
  write("src/simple/index.ts", "export const simple = 1;\n");
  write("node_modules/ignored/many.ts", "ignored\n");
  initGitFixture();
  write("src/noisy/api/handler.ts", "export function duplicateThing() { return 3; }\n");
  git("add", "src/noisy/api/handler.ts");
  git("commit", "-m", "touch noisy handler");

  const script = path.join(root, "skills/candidates-folder-refactor/scripts/find-candidates.mjs");
  const repoOutput = execFileSync(process.execPath, [script, "."], { cwd: fixture, encoding: "utf8" });
  assert.match(repoOutput, /src\/noisy/);
  assert.match(repoOutput, /churn [1-9]/);
  assert.match(repoOutput, /callers [1-9]/);
  assert.match(repoOutput, /tests 1/);
  assert.match(repoOutput, /duplicates [1-9]/);
  assert.doesNotMatch(repoOutput, /node_modules/);

  const folderOutput = execFileSync(process.execPath, [script, "src"], { cwd: fixture, encoding: "utf8" });
  assert.match(folderOutput, /src\/noisy/);
  assert.doesNotMatch(folderOutput.split("\n").slice(1).join("\n"), /\.\.\/src/);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("candidates-folder-refactor ok");

function write(relativePath, content) {
  const file = path.join(fixture, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function initGitFixture() {
  git("init");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test User");
  git("add", ".");
  git("commit", "-m", "initial fixture");
}

function git(...args) {
  return execFileSync("git", args, { cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
