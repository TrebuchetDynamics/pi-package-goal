import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
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
  write("src/ignored-refactor/a.ts", "export const ignoredA = 1;\n");
  write("src/ignored-refactor/b.ts", "export const ignoredB = 2;\n");
  write("src/ignored-refactor/c.ts", "export const ignoredC = 3;\n");
  write(".refactorignore", "# scanner ignore rules\nsrc/ignored-refactor/\n");
  write("node_modules/ignored/many.ts", "ignored\n");
  initGitFixture();
  write("src/noisy/api/handler.ts", "export function duplicateThing() { return 3; }\n");
  git("add", "src/noisy/api/handler.ts");
  git("commit", "-m", "touch noisy handler");

  const autoScript = path.join(root, "skills/candidates-folder-refactor/scripts/auto-folder-refactor.sh");
  const autoInstaller = path.join(root, "skills/candidates-folder-refactor/scripts/install.sh");
  accessSync(autoScript, constants.X_OK);
  accessSync(autoInstaller, constants.X_OK);
  const autoHelp = execFileSync(autoScript, ["--help"], { cwd: fixture, encoding: "utf8" });
  assert.match(autoHelp, /auto-folder-refactor\.sh <loops> \[scan-root\]/);
  assert.match(autoHelp, /PI_AUTO_FOLDER_REFACTOR_PI_ARGS/);
  assert.throws(() => execFileSync(autoScript, ["1", ".."], { cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /scan-root must be pwd or a subfolder of pwd/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-auto-folder-refactor-"));
  fs.symlinkSync(outside, path.join(fixture, "outside-link"), "dir");
  assert.throws(() => execFileSync(autoScript, ["1", "outside-link"], { cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /scan-root must be pwd or a subfolder of pwd/);
  fs.rmSync(outside, { recursive: true, force: true });
  const installBin = path.join(fixture, "bin");
  const installOutput = execFileSync("sh", [autoInstaller], {
    cwd: fixture,
    encoding: "utf8",
    env: { ...process.env, AUTO_FOLDER_REFACTOR_BIN_DIR: installBin },
  });
  assert.match(installOutput, /installed wrapper:/);
  assert.match(installOutput, /example: auto-folder-refactor 10/);
  const installedAuto = path.join(installBin, "auto-folder-refactor");
  accessSync(installedAuto, constants.X_OK);
  const installedHelp = execFileSync(installedAuto, ["--help"], { cwd: fixture, encoding: "utf8" });
  assert.match(installedHelp, /auto-folder-refactor\.sh <loops> \[scan-root\]/);

  const fakePi = path.join(fixture, "fake-pi.sh");
  fs.writeFileSync(fakePi, "#!/usr/bin/env bash\necho fake pi noop\n");
  fs.chmodSync(fakePi, 0o755);
  const noopOutput = execFileSync(autoScript, ["2", "src"], { cwd: fixture, encoding: "utf8", env: { ...process.env, PI_AUTO_FOLDER_REFACTOR_PI: fakePi }, stdio: ["ignore", "pipe", "pipe"] });
  assert.match(noopOutput, /fake pi noop/);

  const script = path.join(root, "skills/candidates-folder-refactor/scripts/find-candidates.mjs");
  const repoOutput = execFileSync(process.execPath, [script, "."], { cwd: fixture, encoding: "utf8" });
  assert.match(repoOutput, /src\/noisy/);
  assert.match(repoOutput, /churn [1-9]/);
  assert.match(repoOutput, /callers [1-9]/);
  assert.match(repoOutput, /tests 1/);
  assert.match(repoOutput, /duplicates [1-9]/);
  assert.doesNotMatch(repoOutput, /node_modules/);
  assert.doesNotMatch(repoOutput, /ignored-refactor/);
  assert.match(repoOutput, /Log: .*\.pi\/candidates-folder-refactor\/latest\.json/);
  assert.equal(fs.existsSync(path.join(fixture, ".pi/candidates-folder-refactor/latest.json")), true);
  assert.equal(fs.existsSync(path.join(fixture, ".pi/candidates-folder-refactor/runs.jsonl")), true);
  const cachedOutput = execFileSync(process.execPath, [script, ".", "--from-log"], { cwd: fixture, encoding: "utf8" });
  assert.match(cachedOutput, /From log:/);
  assert.match(cachedOutput, /src\/noisy/);

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
