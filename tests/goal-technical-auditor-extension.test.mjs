import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import registerGoalTechnicalAuditor from "../extensions/goal-technical-auditor/index.js";

const execFile = promisify(execFileCallback);
const git = (cwd, args) => execFile("git", args, { cwd });
const fixture = await mkdtemp(join(tmpdir(), "goal-auditor-extension-"));
try {
  await git(fixture, ["init", "-b", "feature/audit"]);
  await git(fixture, ["config", "user.email", "test@example.com"]);
  await git(fixture, ["config", "user.name", "Test User"]);
  await writeFile(join(fixture, "README.md"), "fixture\n");
  await git(fixture, ["add", "."]);
  await git(fixture, ["-c", "commit.gpgsign=false", "commit", "-m", "initial"]);

  const commands = new Map();
  const events = new Map();
  const registeredTools = new Map();
  const entries = [];
  const userMessages = [];
  const notices = [];
  let activeTools = [];
  const pi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    registerTool: (definition) => registeredTools.set(definition.name, definition),
    on: (name, handler) => events.set(name, handler),
    appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
    sendUserMessage: (content, options) => userMessages.push({ content, options }),
    getActiveTools: () => [...activeTools],
    setActiveTools: (names) => { activeTools = [...names]; },
  };
  const ctx = {
    cwd: fixture,
    hasUI: true,
    isIdle: () => true,
    signal: undefined,
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
    },
    ui: {
      notify: (message, level) => notices.push({ message, level }),
      setStatus: () => {},
      confirm: async () => true,
    },
  };

  registerGoalTechnicalAuditor(pi);
  assert.ok(commands.has("goal-technical-auditor"));
  assert.ok(registeredTools.has("technical_auditor_checkpoint"));
  assert.equal(activeTools.includes("technical_auditor_checkpoint"), false);
  await commands.get("goal-technical-auditor").handler("--tokens 300k .", ctx);
  assert.equal(activeTools.includes("technical_auditor_checkpoint"), true);
  assert.equal(entries.at(-1).customType, "goal-technical-auditor-run");
  assert.match(userMessages.at(-1).content, /^\/goal --tokens 300k /);
  assert.equal(entries.at(-1).data.run.branch, "feature/audit");
  const blocked = await events.get("tool_call")({ toolName: "goal_complete", input: { summary: "done" } }, ctx);
  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /controller/);

  await commands.get("goal-technical-auditor").handler("status", ctx);
  assert.match(notices.at(-1).message, /phase: preflight/);

  const checkpointResult = await registeredTools.get("technical_auditor_checkpoint").execute("tool-1", {
    action: "preflight",
    focusedValidationCommands: ["true"],
    projectValidationCommands: ["true"],
  }, undefined, undefined, ctx);
  assert.equal(checkpointResult.details.run.phase, "auditing");
  assert.equal(entries.at(-1).data.run.phase, "auditing");

  await commands.get("goal-technical-auditor").handler("abort", ctx);
  assert.equal(entries.at(-1).data.run.phase, "aborted");
  assert.equal(userMessages.at(-1).content, "/goal pause");

  await events.get("session_start")({ reason: "reload" }, ctx);
  await commands.get("goal-technical-auditor").handler("status", ctx);
  assert.match(notices.at(-1).message, /phase: aborted/);

  const resumable = { ...entries.at(-2).data.run, phase: "preflight", resumePhase: null };
  entries.push({ type: "custom", customType: "goal-technical-auditor-run", data: { run: resumable } });
  await events.get("session_start")({ reason: "reload" }, ctx);
  await events.get("message_end")({ message: { customType: "pi-goal-event", details: { kind: "budget_limited" } } }, ctx);
  assert.equal(entries.at(-1).data.run.phase, "paused");
  assert.match(entries.at(-1).data.run.blocker, /token budget/);

  const ready = {
    ...entries.at(-1).data.run,
    phase: "ready_to_complete",
    resumePhase: null,
    cleanAuditPass: 1,
    findings: [],
    delivery: { remote: "origin", branch: "feature/audit", pushedAt: 1 },
  };
  entries.push({ type: "custom", customType: "goal-technical-auditor-run", data: { run: ready } });
  await events.get("session_start")({ reason: "reload" }, ctx);
  const allowed = await events.get("tool_call")({ toolName: "goal_complete", input: { summary: "verified" } }, ctx);
  assert.equal(allowed, undefined);
  await events.get("tool_result")({ toolName: "goal_complete", isError: false }, ctx);
  assert.equal(entries.at(-1).data.run.phase, "complete");

  console.log("goal-technical-auditor-extension ok");
} finally {
  await rm(fixture, { recursive: true, force: true });
}
