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

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

async function testPackageManifest() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.deepEqual(pkg.bin, { tx: "./tmux/tx", autofolderrefactor: "./skills/engineering/candidates-folder-refactor/scripts/autofolderrefactor" });
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
  assert.match(help, /tx add <dir> <alias\[,\.\.\]>/);
  assert.match(help, /tx add \. <alias\[,\.\.\]>/);
  assert.match(help, /tx init/);
  assert.match(help, /tx config/);
  assert.match(help, /tx install/);
  assert.match(help, /tx completion <shell>/);
  assert.match(help, /tx doctor/);
  assert.match(help, /TX_TMUX/);
}

async function testTxDefaultConfigPath() {
  const tmp = tempDir("tx-default-config-");
  try {
    const env = { HOME: tmp, XDG_CONFIG_HOME: "" };
    assert.equal(run(tx, ["config"], { env }).trim(), path.join(tmp, ".config", "tx", "session.config"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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

    const other = path.join(tmp, "other");
    fs.mkdirSync(other);
    assert.match(run(tx, ["add", "aa,ab", other], { env }), /added: aa,ab=/);
    assert.equal(run(tx, ["which", "a"], { env }).trim(), fs.realpathSync(other));
    assert.match(run(tx, ["doctor"], { env }), /targets: ok \(2 configured paths\)/);

    const duplicate = runFail(tx, ["add", "ga", project], { env });
    assert.match(duplicate.stderr, /duplicate alias 'ga'/);

    const promptProject = path.join(tmp, "prompt-project");
    fs.mkdirSync(promptProject);
    assert.match(run(tx, ["add", promptProject], { env, input: "pp\n" }), /added: pp=/);
    assert.equal(run(tx, ["which", "pp"], { env }).trim(), fs.realpathSync(promptProject));
    assert.match(run(tx, ["add", "."], { env, cwd: promptProject, input: "here\n" }), /updated: pp,here=/);
    assert.equal(run(tx, ["which", "here"], { env }).trim(), fs.realpathSync(promptProject));
    assert.match(run(tx, ["add", ".", "dot2"], { env, cwd: promptProject }), /updated: pp,here,dot2=/);
    assert.equal(run(tx, ["which", "dot2"], { env }).trim(), fs.realpathSync(promptProject));
    const dirFirstProject = path.join(tmp, "dir-first-project");
    fs.mkdirSync(dirFirstProject);
    assert.match(run(tx, ["add", dirFirstProject, "df"], { env }), /added: df=/);
    assert.equal(run(tx, ["which", "df"], { env }).trim(), fs.realpathSync(dirFirstProject));
    assert.deepEqual(run(tx, ["__complete_aliases"], { env }).trim().split(/\n/), ["aa", "ab", "df", "dot2", "ga", "gormes", "here", "pp"]);
    assert.match(run(tx, ["__complete_commands"], { env }), /\bcompletion\b/);
    const bashCompletion = run(tx, ["completion", "bash"], { env });
    assert.match(bashCompletion, /__complete_aliases/);
    assert.match(bashCompletion, /complete -F _tx_completion tx/);
    const zshCompletion = run(tx, ["completion", "zsh"], { env: { ...env, TX_COMPLETION_COMMAND: "tx-dev" } });
    assert.match(zshCompletion, /#compdef tx-dev/);
    const fishCompletion = run(tx, ["completion", "fish"], { env });
    assert.match(fishCompletion, /complete -c tx/);
    assert.match(fs.readFileSync(config, "utf8"), /pp,here,dot2=.*prompt-project/);

    const reserved = runFail(tx, ["add", "help", project], { env });
    assert.match(reserved.stderr, /alias 'help' is reserved/);

    fs.appendFileSync(config, `missing=${path.join(tmp, "missing")}\n`);
    const missing = runFail(tx, ["doctor"], { env });
    assert.match(missing.stdout, /missing target: missing ->/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function testInstallScript() {
  const tmp = tempDir("tx-install-");
  try {
    const home = path.join(tmp, "home");
    const bin = path.join(tmp, "bin");
    const helperDir = path.join(tmp, "helpers");
    const bashCompletionDir = path.join(tmp, "bash-completions");
    const fishCompletionDir = path.join(tmp, "fish-completions");
    const zshCompletionDir = path.join(tmp, "zsh-completions");
    const env = { HOME: home, TX_BIN_DIR: bin, TMUX_HELPER_DIR: helperDir, TX_INSTALL_BACKUP: "0", TX_BASH_COMPLETION_DIR: bashCompletionDir, TX_FISH_COMPLETION_DIR: fishCompletionDir, TX_ZSH_COMPLETION_DIR: zshCompletionDir };
    const linkDir = path.join(tmp, "link-bin");
    fs.mkdirSync(linkDir, { recursive: true });
    const txLink = path.join(linkDir, "tx");
    fs.symlinkSync(tx, txLink);
    const output = run(txLink, ["install"], { env });
    assert.match(output, /installed: .*\.tmux\.conf/);
    const installedConfig = path.join(home, ".tmux.conf");
    assert.ok(fs.existsSync(installedConfig));
    assert.ok(fs.existsSync(path.join(helperDir, "git-status.sh")));
    assert.ok(fs.existsSync(path.join(helperDir, "short-path.sh")));
    assert.ok(fs.existsSync(path.join(bin, "tx")));
    assert.ok(fs.existsSync(path.join(bashCompletionDir, "tx")));
    assert.ok(fs.existsSync(path.join(fishCompletionDir, "tx.fish")));
    assert.ok(fs.existsSync(path.join(zshCompletionDir, "_tx")));
    const installedConfigText = fs.readFileSync(installedConfig, "utf8");
    assert.match(installedConfigText, new RegExp(`${escapeRegExp(helperDir)}.*short-path\\.sh`));
    assert.match(installedConfigText, new RegExp(`${escapeRegExp(helperDir)}.*git-status\\.sh`));
    assert.match(fs.readFileSync(path.join(bashCompletionDir, "tx"), "utf8"), /__complete_aliases/);
    assert.match(run(path.join(bin, "tx"), ["help"], { env }), /doctor --install/);

    const doctorEnv = { ...env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const doctor = run(txLink, ["doctor", "--install"], { env: doctorEnv });
    assert.match(doctor, /PATH: includes/);
    assert.match(doctor, /helper: .*git-status\.sh/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function testTxListFormattingAndColorPortability() {
  const tmp = tempDir("tx-list-format-");
  try {
    const config = path.join(tmp, "sessions.conf");
    const fakeTmux = path.join(tmp, "fake-tmux.sh");
    const present = path.join(tmp, "present");
    const missing = path.join(tmp, "missing");
    fs.mkdirSync(present);
    fs.writeFileSync(config, `run=${present}\nstop=${present}\nmiss=${missing}\n`);
    fs.writeFileSync(fakeTmux, `#!/usr/bin/env sh
case "$1" in
  list-sessions) printf 'run\\n' ;;
esac
`);
    fs.chmodSync(fakeTmux, 0o755);

    const plain = run(tx, ["ls"], { env: { TX_CONFIG: config, TX_TMUX: fakeTmux, TX_COLOR: "never" } });
    assert.match(plain, /run\s+running\s+.*present/);
    assert.match(plain, /stop\s+stopped\s+.*present/);
    assert.match(plain, /miss\s+missing\s+.*missing/);
    assert.doesNotMatch(plain, /\u001b\[/);
    assert.doesNotMatch(plain, /[●○•]/);

    const colored = run(tx, ["ls"], { env: { TX_CONFIG: config, TX_TMUX: fakeTmux, TX_COLOR: "always" } });
    assert.match(colored, /\u001b\[32m/);
    assert.match(colored, /\u001b\[31m/);

    const asciiSymbols = run(tx, ["ls"], { env: { TX_CONFIG: config, TX_TMUX: fakeTmux, TX_COLOR: "never", TX_LS_SYMBOLS: "ascii" } });
    assert.match(asciiSymbols, /\+ running/);
    assert.match(asciiSymbols, /- stopped/);
    assert.match(asciiSymbols, /! missing/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function testKillAllOrdersCurrentSessionLast() {
  const tmp = tempDir("tx-kill-all-");
  try {
    const config = path.join(tmp, "sessions.conf");
    const fakeTmux = path.join(tmp, "fake-tmux.sh");
    const log = path.join(tmp, "tmux.log");
    const one = path.join(tmp, "one");
    const two = path.join(tmp, "two");
    fs.mkdirSync(one);
    fs.mkdirSync(two);
    fs.writeFileSync(config, `one=${one}\ntwo=${two}\n`);
    fs.writeFileSync(fakeTmux, `#!/usr/bin/env sh
case "$1" in
  list-sessions) printf 'one\\ntwo\\n' ;;
  display-message) printf 'one\\n' ;;
  kill-session) printf '%s\\n' "$3" >> "${log}" ;;
esac
`);
    fs.chmodSync(fakeTmux, 0o755);

    const output = run(tx, ["kill-all"], { env: { TX_CONFIG: config, TX_TMUX: fakeTmux, TMUX: "/tmp/tmux-client" } });
    assert.match(output, /2 killed; 0 not running/);
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["=two", "=one"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function testStatusHelpers() {
  assert.equal(run("tmux/short-path.sh", ["/home/xel/git/gormes/gormes-agent"]).trim(), "gormes/gormes-agent");
  assert.equal(run("tmux/short-path.sh", ["/home/xel/git/pi-package-development-goal"]).trim(), "git/pi-package-development-goal");
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
  assert.doesNotMatch(config, /set -g mouse on/);
}

async function testTmuxExtendedKeysEnabled() {
  const config = fs.readFileSync(path.join(root, "tmux", "tmux.conf"), "utf8");
  assert.match(config, /set -g extended-keys on/);
}

async function testTmuxConfigShowsRepoInfo() {
  const config = fs.readFileSync(path.join(root, "tmux", "tmux.conf"), "utf8");
  assert.match(config, /source-file -q ~\/\.tmux\/style\.tmux/);
  assert.match(config, /set -g status-interval 120/);
  assert.match(config, /#\(~\/\.tmux\/short-path\.sh #\{q:pane_current_path\}\)/);
  assert.match(config, /#\(~\/\.tmux\/git-status\.sh #\{q:pane_current_path\}\)/);
  assert.match(config, /set -g status-left-length 100/);
  assert.match(config, /source-file -q ~\/\.tmux\/local\.tmux/);
  assert.doesNotMatch(config, /source-file -q ~\/\.tmux\/status\.tmux/);
}

async function testTmuxUsesDefaultResizeBehavior() {
  const config = fs.readFileSync(path.join(root, "tmux", "tmux.conf"), "utf8");
  assert.doesNotMatch(config, /set -g window-size/);
  assert.doesNotMatch(config, /setw -g aggressive-resize/);
  assert.doesNotMatch(config, /set-hook -g client-(?:resized|focus-in|attached).*resize-window -A/);
  assert.doesNotMatch(config, /bind S if -F '#\{==:#\{window-size\},smallest\}'/);
  assert.doesNotMatch(config, /bind F resize-window -A/);
}

async function testTmuxPluginsAreNotLoaded() {
  const config = fs.readFileSync(path.join(root, "tmux", "tmux.conf"), "utf8");
  assert.doesNotMatch(config, /@plugin/);
  assert.doesNotMatch(config, /tmux\/plugins\/tpm/);
}

async function testTmuxConfigParsesWhenTmuxExists() {
  if (!hasCommand("tmux")) return;
  run("tmux", ["source-file", "-n", "tmux/tmux.conf"]);
}

await testPackageManifest();
await testScriptSyntaxAndHelp();
await testTxDefaultConfigPath();
await testTxConfigLifecycleWithoutTmuxSessions();
await testTxListFormattingAndColorPortability();
await testInstallScript();
await testKillAllOrdersCurrentSessionLast();
await testStatusHelpers();
await testTmuxMouseSelectionDoesNotAutoCopy();
await testTmuxExtendedKeysEnabled();
await testTmuxConfigShowsRepoInfo();
await testTmuxUsesDefaultResizeBehavior();
await testTmuxPluginsAreNotLoaded();
await testTmuxConfigParsesWhenTmuxExists();

console.log("tmux-assets ok");
