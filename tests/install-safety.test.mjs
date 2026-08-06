import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const autoInstaller = path.join(
  root,
  "skills/engineering/candidates-folder-refactor/scripts/install.sh",
);
const tmuxInstaller = path.join(root, "tmux/install.sh");
const agentSkillsInstaller = path.join(root, "install-agent-skills.sh");

function run(script, env) {
  return execFileSync("sh", [script], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

for (const script of [
  "install.sh",
  "install-omniroute-pi.sh",
  "install-agent-skills.sh",
  "install-claude-skills.sh",
  "install-autofolderrefactor.sh",
  "tmux/install.sh",
  "skills/engineering/candidates-folder-refactor/scripts/install.sh",
]) {
  execFileSync("sh", ["-n", path.join(root, script)]);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "install-safety-"));
try {
  const quoteHome = path.join(fixture, "quote-home");
  const quoteBin = path.join(fixture, "quote-bin");
  const quoteApp = path.join(fixture, "app\"quote it's");
  fs.mkdirSync(quoteHome);
  run(autoInstaller, {
    HOME: quoteHome,
    AUTO_FOLDER_REFACTOR_BIN_DIR: quoteBin,
    AUTO_FOLDER_REFACTOR_INSTALL_DIR: quoteApp,
    AUTO_FOLDER_REFACTOR_INSTALL_BACKUP: "0",
  });
  const wrapper = path.join(quoteBin, "autofolderrefactor");
  execFileSync("sh", ["-n", wrapper]);
  assert.match(
    execFileSync(wrapper, ["--help"], { encoding: "utf8" }),
    /autofolderrefactor <loops>/,
  );

  const fileHome = path.join(fixture, "file-home");
  const fileApp = path.join(fixture, "file-app");
  fs.mkdirSync(fileHome);
  fs.writeFileSync(fileApp, "keep\n");
  assert.throws(
    () =>
      run(autoInstaller, {
        HOME: fileHome,
        AUTO_FOLDER_REFACTOR_BIN_DIR: path.join(fileHome, "bin"),
        AUTO_FOLDER_REFACTOR_INSTALL_DIR: fileApp,
        AUTO_FOLDER_REFACTOR_INSTALL_BACKUP: "0",
      }),
    /install path exists and is not a directory/,
  );
  assert.equal(fs.readFileSync(fileApp, "utf8"), "keep\n");

  const forceHome = path.join(fixture, "force-home");
  const foreignApp = path.join(fixture, "foreign-app");
  fs.mkdirSync(forceHome);
  fs.mkdirSync(foreignApp);
  fs.writeFileSync(path.join(foreignApp, "keep.txt"), "keep\n");
  assert.throws(
    () =>
      run(autoInstaller, {
        HOME: forceHome,
        AUTO_FOLDER_REFACTOR_BIN_DIR: path.join(forceHome, "bin"),
        AUTO_FOLDER_REFACTOR_INSTALL_DIR: foreignApp,
        AUTO_FOLDER_REFACTOR_INSTALL_FORCE: "1",
      }),
    /force replacement is limited to HOME/,
  );
  assert.equal(
    fs.readFileSync(path.join(foreignApp, "keep.txt"), "utf8"),
    "keep\n",
  );

  const aliasHome = path.join(fixture, "alias-home");
  fs.mkdirSync(path.join(aliasHome, "child"), { recursive: true });
  fs.writeFileSync(path.join(aliasHome, "keep.txt"), "keep\n");
  assert.throws(
    () =>
      run(autoInstaller, {
        HOME: aliasHome,
        AUTO_FOLDER_REFACTOR_BIN_DIR: path.join(aliasHome, "bin"),
        AUTO_FOLDER_REFACTOR_INSTALL_DIR: path.join(aliasHome, "child", ".."),
        AUTO_FOLDER_REFACTOR_INSTALL_FORCE: "1",
      }),
    /refusing unsafe install dir/,
  );
  assert.equal(
    fs.readFileSync(path.join(aliasHome, "keep.txt"), "utf8"),
    "keep\n",
  );

  const backupHome = path.join(fixture, "backup-home");
  const backupBin = path.join(backupHome, "bin");
  const backupApp = path.join(backupHome, "app");
  const fakeBin = path.join(fixture, "fake-bin");
  fs.mkdirSync(backupHome);
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(
    path.join(fakeBin, "date"),
    "#!/bin/sh\nprintf '20260101000000\\n'\n",
    {
      mode: 0o755,
    },
  );
  const backupEnv = {
    HOME: backupHome,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
    AUTO_FOLDER_REFACTOR_BIN_DIR: backupBin,
    AUTO_FOLDER_REFACTOR_INSTALL_DIR: backupApp,
  };
  run(autoInstaller, backupEnv);
  fs.writeFileSync(path.join(backupApp, "local-change"), "first\n");
  run(autoInstaller, backupEnv);
  fs.writeFileSync(path.join(backupApp, "local-change"), "second\n");
  run(autoInstaller, backupEnv);
  assert.equal(
    fs
      .readdirSync(backupHome)
      .filter((name) => name.startsWith("app.bak.20260101000000.")).length,
    2,
    "same-second installs must preserve both app backups",
  );

  assert.throws(
    () =>
      run(tmuxInstaller, {
        HOME: path.join(fixture, "tmux-home"),
        TX_INSTALL_BACKUP: "sometimes",
        TX_INSTALL_COMPLETIONS: "0",
      }),
    /TX_INSTALL_BACKUP must be 0 or 1/,
  );
  assert.throws(
    () =>
      run(tmuxInstaller, {
        HOME: path.join(fixture, "tmux-home"),
        TX_BIN_NAME: "..",
        TX_INSTALL_COMPLETIONS: "0",
      }),
    /TX_BIN_NAME must be a file name/,
  );
  assert.throws(
    () =>
      run(autoInstaller, {
        HOME: backupHome,
        AUTO_FOLDER_REFACTOR_INSTALL_BACKUP: "sometimes",
      }),
    /AUTO_FOLDER_REFACTOR_INSTALL_BACKUP must be 0 or 1/,
  );
  assert.throws(
    () =>
      run(autoInstaller, {
        HOME: backupHome,
        AUTO_FOLDER_REFACTOR_BIN_NAME: ".",
      }),
    /AUTO_FOLDER_REFACTOR_BIN_NAME must be a file name/,
  );

  const skillsHome = path.join(fixture, "skills-home");
  const skillsDir = path.join(skillsHome, "skills");
  const backupDir = path.join(skillsHome, "backups");
  fs.mkdirSync(path.join(skillsDir, "shared"), { recursive: true });
  fs.writeFileSync(path.join(skillsDir, "shared", "owner-file"), "keep\n");
  fs.mkdirSync(path.join(backupDir, "Codex", "shared"), { recursive: true });
  assert.throws(
    () =>
      run(agentSkillsInstaller, {
        HOME: skillsHome,
        CODEX_SKILLS_DIR: skillsDir,
        AGENT_SKILLS_BACKUP_DIR: backupDir,
      }),
    /backup already exists/,
  );
  assert.equal(
    fs.readdirSync(skillsDir).some((name) => name.startsWith("shared.tmp.")),
    false,
    "failed skill installs must clean staging directories",
  );
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log("install-safety ok");
