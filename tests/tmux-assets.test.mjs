import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const tx = path.join(root, "tmux", "tx");

function run(command, args = [], options = {}) {
  const { env, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...spawnOptions,
    env: { ...process.env, ...(env ?? {}) },
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout;
}

function runFail(command, args = [], options = {}) {
  const { env, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...spawnOptions,
    env: { ...process.env, ...(env ?? {}) },
  });
  assert.notEqual(result.status, 0, `${command} ${args.join(" ")} unexpectedly passed`);
  return result;
}

function hasCommand(command) {
  return spawnSync("sh", ["-c", `command -v ${command} >/dev/null 2>&1`]).status === 0;
}

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

async function testPackageManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.deepEqual(pkg.bin, { tx: "./tmux/tx" });
  assert.ok(pkg.files.includes("tmux"));
  assert.equal(pkg.scripts["tmux:install"], "sh tmux/install.sh");
}

async function testScriptSyntaxAndHelp() {
  run("bash", ["-n", "tmux/tx"]);
  run("bash", ["-n", "tmux/git-status.sh"]);
  run("bash", ["-n", "tmux/short-path.sh"]);
  run("bash", ["-n", "tmux/install.sh"]);

  const help = run(tx, ["help"]);
  assert.match(help, /tx add <alias\[,\.\.\]> \[dir\]/);
  assert.match(help, /tx init/);
  assert.match(help, /tx config/);
  assert.match(help, /tx install/);
  assert.match(help, /tx doctor/);
  assert.match(help, /TX_TMUX/);
}

async function testTxConfigLifecycleWithoutTmuxSessions() {
  const tmp = tempDir("tx-test-");
  try {
    const config = path.join(tmp, "config", "sessions.conf");
    const project = path.join(tmp, "project");
    fs.mkdirSync(project, { recursive: true });
    const env = { TX_CONFIG: config, TX_TMUX: process.execPath };

    assert.equal(run(tx, ["config"], { env }).trim(), config);
    assert.match(run(tx, ["init"], { env }), /created config:/);
    assert.ok(fs.existsSync(config));
    assert.match(run(tx, ["add", "ga,gormes", project], { env }), /added: ga,gormes=/);
    assert.equal(run(tx, ["which", "g"], { env }).trim(), fs.realpathSync(project));
    assert.match(run(tx, ["doctor"], { env }), /targets: ok \(1 configured paths\)/);

    const duplicate = runFail(tx, ["add", "ga", project], { env });
    assert.match(duplicate.stderr, /duplicate alias 'ga'/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function testInstallScript() {
  const tmp = tempDir("tx-install-");
  try {
    const home = path.join(tmp, "home");
    const bin = path.join(tmp, "bin");
    const env = { HOME: home, TX_BIN_DIR: bin, TX_INSTALL_BACKUP: "0" };
    const linkDir = path.join(tmp, "link-bin");
    fs.mkdirSync(linkDir, { recursive: true });
    const txLink = path.join(linkDir, "tx");
    fs.symlinkSync(tx, txLink);
    const output = run(txLink, ["install"], { env });
    assert.match(output, /installed: .*\.tmux\.conf/);
    assert.ok(fs.existsSync(path.join(home, ".tmux.conf")));
    assert.ok(fs.existsSync(path.join(home, ".tmux", "git-status.sh")));
    assert.ok(fs.existsSync(path.join(home, ".tmux", "short-path.sh")));
    assert.ok(fs.existsSync(path.join(bin, "tx")));
    assert.match(run(path.join(bin, "tx"), ["help"], { env }), /Usage:/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function testStatusHelpers() {
  assert.equal(run("tmux/short-path.sh", ["/home/xel/git/gormes/gormes-agent"]).trim(), "/gormes/gormes-agent");
  assert.equal(run("tmux/git-status.sh", ["/"]).trim(), "");

  if (!hasCommand("git")) return;

  const repo = tempDir("tx-git-");
  try {
    run("git", ["init", "-b", "main"], { cwd: repo });
    assert.match(run("tmux/git-status.sh", [repo]), /bg=#0f3d2e.* main /);
    fs.writeFileSync(path.join(repo, "file.txt"), "dirty\n");
    assert.match(run("tmux/git-status.sh", [repo]), /bg=#3a1018.* main /);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

async function testTmuxMouseSelectionDoesNotAutoCopy() {
  const config = fs.readFileSync(path.join(root, "tmux", "tmux.conf"), "utf8");
  assert.doesNotMatch(config, /Mouse(?:DragEnd|DoubleClick|TripleClick)1Pane[^\n]*copy-pipe-and-cancel/);
  assert.match(config, /unbind -T copy-mode-vi MouseDragEnd1Pane/);
  assert.match(config, /unbind -T copy-mode MouseDragEnd1Pane/);
  assert.match(config, /bind -T root DoubleClick1Pane[^\n]*select-word/);
  assert.match(config, /bind -T root TripleClick1Pane[^\n]*select-line/);
  assert.match(config, /bind -T copy-mode-vi DoubleClick1Pane[^\n]*select-word/);
  assert.match(config, /bind -T copy-mode-vi TripleClick1Pane[^\n]*select-line/);
  assert.match(config, /bind -T copy-mode DoubleClick1Pane[^\n]*select-word/);
  assert.match(config, /bind -T copy-mode TripleClick1Pane[^\n]*select-line/);
}

async function testTmuxPluginsAreSilentWhenTpmIsMissing() {
  const config = fs.readFileSync(path.join(root, "tmux", "tmux.conf"), "utf8");
  assert.doesNotMatch(config, /TPM not installed; plugins skipped/);
  assert.doesNotMatch(config, /if-shell[^\n]*display-message/);
  assert.match(config, /if-shell -b 'test -x ~\/\.tmux\/plugins\/tpm\/tpm' 'run ~\/\.tmux\/plugins\/tpm\/tpm'/);
}

async function testTmuxConfigParsesWhenTmuxExists() {
  if (!hasCommand("tmux")) return;
  run("tmux", ["source-file", "-n", "tmux/tmux.conf"]);
}

await testPackageManifest();
await testScriptSyntaxAndHelp();
await testTxConfigLifecycleWithoutTmuxSessions();
await testInstallScript();
await testStatusHelpers();
await testTmuxMouseSelectionDoesNotAutoCopy();
await testTmuxPluginsAreSilentWhenTpmIsMissing();
await testTmuxConfigParsesWhenTmuxExists();

console.log("tmux-assets ok");
