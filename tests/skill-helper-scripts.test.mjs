import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);

function runNode(script, args = [], options = {}) {
  return execFileSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function testPromptCacheSummary() {
  const response = {
    usage: {
      input_tokens: 1000,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 600,
      output_tokens: 50,
    },
  };
  const output = runNode("skills/engineering/prompt-cache-auditor/scripts/summarize-cache-usage.mjs", [], {
    input: JSON.stringify(response),
  });
  assert.match(output, /PROMPT_CACHE_SUMMARY: cache_read_detected=yes/);
  assert.match(output, /cache_read_tokens: 600/);
  assert.match(output, /cache_write_tokens: 200/);
  assert.match(output, /hit_rate_estimate:/);

  assert.throws(() => runNode("skills/engineering/prompt-cache-auditor/scripts/summarize-cache-usage.mjs", ["--require-read"], {
    input: JSON.stringify({ usage: { input_tokens: 100 } }),
    stdio: ["pipe", "pipe", "pipe"],
  }), { status: 2 });
}

function testPiLogAuditRedactsFreeText() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "pi-log-audit-redaction-"));
  try {
    const piDir = path.join(fixture, ".pi");
    const logDir = path.join(piDir, "development-goal");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(piDir, "development-goal.json"), JSON.stringify({ adapter: "fixture" }));
    const fakeJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyzABCD.abcdefghijklmnopqrstuvwxyzEFGH";
    fs.writeFileSync(path.join(logDir, "logs.jsonl"), `${JSON.stringify({
      event: "blocked",
      at: "2026-06-10T00:00:00.000Z",
      reason: `Bearer sk-testSECRET1234567890 ${fakeJwt} ghp_abcdefghijklmnopqrstuvwxyzABCD user@example.com`,
      blockerState: "hex 0123456789abcdef0123456789abcdef",
      nextAction: "send token abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    })}\n`);

    const output = runNode("skills/engineering/diagnose/scripts/pi-log-audit.mjs", [fixture]);
    assert.match(output, /status=blocked/);
    assert.match(output, /\[REDACTED\]/);
    assert.match(output, /\[REDACTED_EMAIL\]/);
    assert.doesNotMatch(output, /sk-testSECRET/);
    assert.doesNotMatch(output, /ghp_abcdefghijklmnopqrstuvwxyzABCD/);
    assert.doesNotMatch(output, /user@example\.com/);
    assert.doesNotMatch(output, /0123456789abcdef0123456789abcdef/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

function testClaudeSkillsInstaller() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "claude-skills-install-"));
  try {
    const output = execFileSync("sh", [path.join(root, "install-claude-skills.sh")], {
      cwd: root,
      env: { ...process.env, HOME: fixture },
      encoding: "utf8",
    });
    const skillsDir = path.join(fixture, ".claude", "skills");
    const installedSkillFiles = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "shared")
      .filter((entry) => fs.existsSync(path.join(skillsDir, entry.name, "SKILL.md")));

    assert.match(output, /Claude skills dir:/);
    assert.equal(installedSkillFiles.length, 48);
    assert.ok(fs.existsSync(path.join(skillsDir, "shared", "COMMON-CONTRACT.md")));
    assert.match(fs.readFileSync(path.join(skillsDir, "caveman", "SKILL.md"), "utf8"), /\.\.\/shared\/COMMON-CONTRACT\.md/);
    assert.match(fs.readFileSync(path.join(skillsDir, "technical-auditor", "references", "architecture-deepening-mode.md"), "utf8"), /\.\.\/\.\.\/grill-with-docs\/CONTEXT-FORMAT\.md/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

function testStitchSkillUsesBundledResourcePrefix() {
  const skill = fs.readFileSync(path.join(root, "skills/frontend/stitch-react-components/SKILL.md"), "utf8");
  assert.match(skill, /Set `SKILL_DIR` to this skill directory/);
  assert.match(skill, /bash "\$SKILL_DIR\/scripts\/fetch-stitch\.sh"/);
  assert.match(skill, /npm --prefix "\$SKILL_DIR" run validate -- <file_path>/);

  const fetchScript = path.join(root, "skills/frontend/stitch-react-components/scripts/fetch-stitch.sh");
  assert.throws(() => execFileSync("bash", [fetchScript], { cwd: os.tmpdir(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), { status: 1 });
  try {
    execFileSync("bash", [fetchScript], { cwd: os.tmpdir(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    assert.match(error.stdout, /Usage:/);
  }
}

testPromptCacheSummary();
testPiLogAuditRedactsFreeText();
testClaudeSkillsInstaller();
testStitchSkillUsesBundledResourcePrefix();

console.log("skill-helper-scripts ok");
