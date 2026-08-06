import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.ok(pkg.files.includes("install.sh"), "published package must include the universal installer");
assert.match(pkg.scripts["test:package"], /universal-install\.test\.mjs/);
const installer = fs.readFileSync(path.join(root, "install.sh"), "utf8");
assert.match(installer, /pacman -S --needed --noconfirm tmux/);
assert.doesNotMatch(installer, /pacman -Sy\b/, "Arch install must not perform a partial package database refresh");
assert.match(installer, /install-agent-skills\.sh/);
assert.doesNotMatch(installer, /install-autofolderrefactor\.sh/, "autofolderrefactor must remain opt-in");
assert.match(installer, /install-omniroute-pi\.sh/);
assert.match(installer, /RTK_INSTALL_URL/);
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert.match(readme, /sh install\.sh/);
assert.match(readme, /Pi, this package, tmux with `tx`, Search Hub, Understand-Anything, RTK, OmniRoute, and global Codex\/Claude skill copies/);

function run(args, options = {}) {
  const result = spawnSync("sh", ["install.sh", ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
    env: { ...process.env, ...(options.env ?? {}) },
  });
  assert.equal(result.status, 0, `install.sh failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

const help = run(["--help"]);
assert.match(help, /Pi coding agent/);
assert.match(help, /tmux and tx/);
assert.match(help, /Search Hub/);
assert.match(help, /Understand-Anything/);
assert.match(help, /RTK/);
assert.match(help, /OmniRoute/);
assert.match(help, /Codex and Claude/);
assert.doesNotMatch(help, /autofolderrefactor/);

const dryHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-goal-install-dry-"));
try {
  const output = run(["--dry-run"], { env: { HOME: dryHome } });
  assert.match(output, /would install: Pi coding agent/);
  assert.match(output, /would install: pi-toolset/);
  assert.match(output, /would install: tmux and tx/);
  assert.match(output, /would install: Understand-Anything/);
  assert.match(output, /would install: RTK/);
  assert.match(output, /would install: OmniRoute/);
  assert.match(output, /would install: global Codex and Claude skill copies/);
  assert.match(output, /without duplicate package skills/);
  assert.doesNotMatch(output, /autofolderrefactor/);
  assert.deepEqual(fs.readdirSync(dryHome), []);

  const skippedOutput = run(["--dry-run"], {
    env: { HOME: dryHome, PI_GOAL_SKIP_OMNIROUTE: "1" },
  });
  assert.match(skippedOutput, /would skip: OmniRoute/);
  assert.doesNotMatch(skippedOutput, /would install: OmniRoute/);
} finally {
  fs.rmSync(dryHome, { recursive: true, force: true });
}

const partialHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-goal-install-partial-"));
try {
  const partialBin = path.join(partialHome, "bin");
  const partialMarker = path.join(partialHome, "partial-ran");
  fs.mkdirSync(partialBin);
  fs.writeFileSync(
    path.join(partialBin, "curl"),
    "#!/bin/sh\nprintf '%s\\n' '#!/bin/sh' 'touch \"$MARKER\"'\nexit 22\n",
    { mode: 0o755 },
  );
  const result = spawnSync("sh", ["install.sh"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: partialHome,
      PATH: `${partialBin}:/usr/bin:/bin`,
      MARKER: partialMarker,
      PI_GOAL_SKIP_OMNIROUTE: "1",
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(partialMarker), false, "partial remote installer downloads must never execute");
} finally {
  fs.rmSync(partialHome, { recursive: true, force: true });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-goal-install-"));
try {
  const home = path.join(tmp, "home");
  const bin = path.join(tmp, "bin");
  const understand = path.join(tmp, "understand");
  const agentDir = path.join(tmp, "agent");
  const log = path.join(tmp, "pi.log");
  fs.mkdirSync(path.join(understand, "understand-anything-plugin", "skills", "understand"), { recursive: true });
  fs.writeFileSync(path.join(understand, "understand-anything-plugin", "skills", "understand", "SKILL.md"), "# Understand\n");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, "settings.json"),
    `${JSON.stringify({ theme: "keep", packages: ["git:github.com/TrebuchetDynamics/pi-toolset", { source: "npm:keep", skills: ["keep"] }] }, null, 2)}\n`,
  );
  const wrongUnderstandPlugin = path.join(tmp, "wrong-understand-plugin");
  fs.mkdirSync(wrongUnderstandPlugin);
  fs.symlinkSync(wrongUnderstandPlugin, path.join(home, ".understand-anything-plugin"));
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "pi"), `#!/bin/sh\ncase "$1" in\n  list) printf '%s\\n' "$PI_LIST_OUTPUT" ;;\n  install) printf '%s\\n' "$*" >> '${log}' ;;\nesac\n`);
  fs.writeFileSync(path.join(bin, "tmux"), "#!/bin/sh\nexit 0\n");
  fs.writeFileSync(path.join(bin, "rtk"), "#!/bin/sh\nprintf 'rtk test\\n'\n");
  for (const name of ["pi", "tmux", "rtk"]) fs.chmodSync(path.join(bin, name), 0o755);

  const output = run([], {
    env: {
      HOME: home,
      PATH: `${bin}:${path.dirname(process.execPath)}:${process.env.PATH}`,
      UA_DIR: understand,
      TMUX_CONF_TARGET: path.join(tmp, "tmux.conf"),
      TMUX_HELPER_DIR: path.join(tmp, "tmux-helpers"),
      TX_BIN_DIR: path.join(tmp, "tx-bin"),
      TX_INSTALL_BACKUP: "0",
      TX_INSTALL_COMPLETIONS: "0",
      CODEX_SKILLS_DIR: path.join(tmp, "codex-skills"),
      CLAUDE_SKILLS_DIR: path.join(tmp, "claude-skills"),
      AGENT_SKILLS_BACKUP: "0",
      PI_CODING_AGENT_DIR: agentDir,
      PI_GOAL_SKIP_OMNIROUTE: "1",
      PI_LIST_OUTPUT: "git:github.com/TrebuchetDynamics/pi-toolset-extra",
    },
  });

  assert.match(fs.readFileSync(log, "utf8"), /install git:github\.com\/TrebuchetDynamics\/pi-toolset/);
  assert.ok(fs.existsSync(path.join(tmp, "tx-bin", "tx")));
  assert.equal(fs.readlinkSync(path.join(home, ".understand-anything-plugin")), path.join(understand, "understand-anything-plugin"));
  assert.match(output, /installed: Understand-Anything/);
  assert.match(output, /installed: RTK/);
  assert.match(output, /Codex skills dir:/);
  assert.match(output, /Claude skills dir:/);
  const settings = JSON.parse(fs.readFileSync(path.join(agentDir, "settings.json"), "utf8"));
  assert.equal(settings.theme, "keep");
  assert.deepEqual(settings.packages[0], {
    source: "git:github.com/TrebuchetDynamics/pi-toolset",
    skills: [],
  });
  assert.deepEqual(settings.packages[1], { source: "npm:keep", skills: ["keep"] });
  assert.equal(fs.statSync(path.join(agentDir, "settings.json")).mode & 0o777, 0o600);
  assert.equal(
    fs.readdirSync(agentDir).filter((name) => name.startsWith("settings.json.bak.")).length,
    1,
  );
  assert.match(output, /disabled duplicate package skills/);
  assert.match(output, /skipped: OmniRoute/);
  assert.match(output, /installation complete/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("universal-install ok");
