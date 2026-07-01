import { chmod, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  buildOnklaudObjective,
  onklaudCompletions,
  ONKLAUD_EXPLANATION,
  ONKLAUD_REPO_URL,
  ONKLAUD_USAGE,
} from "./command.js";

function outputText(result) {
  return [result?.stdout, result?.stderr].filter(Boolean).join("\n").trim();
}

function report(ctx, message, level = "info") {
  if (ctx?.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

function classifyStatus(text, code) {
  const parsed = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .findLast(Boolean);
  const status = String(parsed?.status || "").toLowerCase();
  const missingKey = parsed?.api_key === false || /OpenRouter key:\s*MISSING|api_key"\s*:\s*false/i.test(text);
  if (code !== 0 || (status && status !== "operational") || missingKey) {
    const reason = missingKey ? "API key missing" : status ? `status: ${status}` : `exit code ${code}`;
    return {
      level: "warning",
      message: `${text}\n\nOnklaud advisory gates unavailable (${reason}). Configure Onklaud/OpenRouter credentials and rerun /onklaud status; until then skip Onklaud loop/gate and rely on normal Pi validation.`,
    };
  }
  return { level: "info", message: text };
}

function expandHome(path, fallback) {
  const value = String(path || fallback);
  return value === "~" || value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

function defaultInstallDir() {
  return process.platform === "win32" ? join(process.env.LOCALAPPDATA || homedir(), "onklaud-5") : join(homedir(), ".local", "share", "onklaud-5");
}

function defaultBinDir() {
  return process.platform === "win32" ? join(process.env.LOCALAPPDATA || homedir(), "Microsoft", "WindowsApps") : join(homedir(), ".local", "bin");
}

async function run(pi, command, args, ctx, timeout = 600_000) {
  const result = await pi.exec(command, args, { signal: ctx.signal, timeout });
  if (result.code !== 0) throw new Error(outputText(result) || `${command} ${args.join(" ")} failed with exit code ${result.code}`);
  return result;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function normalizeRepoUrl(url) {
  let value = String(url || "").trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  value = value.replace(/^git\+/, "");
  const scp = /^git@([^:]+):(.+)$/.exec(value);
  if (scp) value = `${scp[1]}/${scp[2]}`;
  else value = value.replace(/^[a-z]+:\/\/(?:git@)?/, "");
  return value.toLowerCase();
}

async function isEmptyDir(path) {
  try {
    return (await readdir(path)).length === 0;
  } catch (error) {
    if (error?.code === "ENOTDIR") return false;
    throw error;
  }
}

async function prepareRepo(pi, installDir, ctx) {
  if (!(await exists(installDir))) {
    report(ctx, `Onklaud install: cloning ${ONKLAUD_REPO_URL} into ${installDir}...`);
    await run(pi, "git", ["clone", "--depth", "1", ONKLAUD_REPO_URL, installDir], ctx);
    return;
  }

  const inside = await pi.exec("git", ["-C", installDir, "rev-parse", "--is-inside-work-tree"], { signal: ctx.signal, timeout: 120_000 });
  if (inside.code !== 0 || outputText(inside) !== "true") {
    if (await isEmptyDir(installDir)) {
      report(ctx, `Onklaud install: cloning ${ONKLAUD_REPO_URL} into empty directory ${installDir}...`);
      await run(pi, "git", ["clone", "--depth", "1", ONKLAUD_REPO_URL, installDir], ctx);
      return;
    }
    throw new Error(`Install directory exists but is not a git repository: ${installDir}\nUse /onklaud install --dir <empty-dir> or move the existing directory.`);
  }
  const remote = await run(pi, "git", ["-C", installDir, "remote", "get-url", "origin"], ctx, 120_000);
  const remoteUrl = outputText(remote);
  if (normalizeRepoUrl(remoteUrl) !== normalizeRepoUrl(ONKLAUD_REPO_URL)) {
    throw new Error(`Install directory is a git repo but origin is not Onklaud: ${installDir}\norigin: ${remoteUrl}\nUse /onklaud install --dir <empty-dir> or move the existing directory.`);
  }
  report(ctx, `Onklaud install: updating existing checkout in ${installDir}...`);
  await run(pi, "git", ["-C", installDir, "pull", "--ff-only"], ctx);
}

async function installOnklaud(pi, params, ctx) {
  const installDir = resolve(expandHome(params.installDir, defaultInstallDir()));
  const binDir = resolve(expandHome(params.binDir, defaultBinDir()));
  const python = process.platform === "win32" ? join(installDir, ".venv", "Scripts", "python.exe") : join(installDir, ".venv", "bin", "python");
  const wrapper = process.platform === "win32" ? join(binDir, "onklaud.cmd") : join(binDir, "onklaud");

  const plan = `Install Onklaud 5 from ${ONKLAUD_REPO_URL}\nrepo: ${installDir}\ncommand: ${wrapper}`;
  if (params.dryRun) return `DRY RUN:\n${plan}`;
  if (!params.yes) {
    if (!ctx.hasUI) return `${plan}\nRun /onklaud install --yes to install non-interactively.`;
    const ok = await ctx.ui.confirm("Install Onklaud 5?", `${plan}\n\nThis clones a GitHub repo and installs Python packages into a local virtualenv.`);
    if (!ok) return "Onklaud install cancelled.";
  }

  report(ctx, `Onklaud install: repo ${installDir}; launcher ${wrapper}.`);
  await mkdir(dirname(installDir), { recursive: true });
  await prepareRepo(pi, installDir, ctx);
  report(ctx, `Onklaud install: creating Python virtualenv at ${join(installDir, ".venv")}...`);
  if (process.platform === "win32") {
    await run(pi, "py", ["-3", "-m", "venv", join(installDir, ".venv")], ctx);
  } else {
    await run(pi, "python3", ["-m", "venv", join(installDir, ".venv")], ctx);
  }
  report(ctx, "Onklaud install: upgrading pip...");
  await run(pi, python, ["-m", "pip", "install", "--upgrade", "pip"], ctx);
  report(ctx, "Onklaud install: installing fpdf2 and pyyaml...");
  await run(pi, python, ["-m", "pip", "install", "fpdf2", "pyyaml"], ctx);

  await mkdir(binDir, { recursive: true });
  report(ctx, `Onklaud install: writing launcher ${wrapper}...`);
  if (process.platform === "win32") {
    await writeFile(wrapper, `@echo off\r\n"${python}" "${join(installDir, "council.py")}" %*\r\n`, "utf8");
  } else {
    await writeFile(wrapper, `#!/usr/bin/env bash\nset -euo pipefail\nif [ -f "${join(installDir, ".env")}" ]; then\n  set -a\n  . "${join(installDir, ".env")}"\n  set +a\nfi\nexec "${python}" "${join(installDir, "council.py")}" "$@"\n`, { mode: 0o755 });
    await chmod(wrapper, 0o755);
  }
  return `Installed Onklaud 5. If needed, add ${binDir} to PATH, then run: onklaud status`;
}

export default function onklaud(pi) {
  pi.registerCommand("onklaud", {
    description: "Start an Onklaud-council-backed autonomous Pi goal, or check Onklaud status",
    getArgumentCompletions: (prefix) => onklaudCompletions(prefix),
    handler: async (args, ctx) => {
      const objective = buildOnklaudObjective(args);
      const { action, tokenBudget, dryRun, help, error, goalCommand } = objective;

      if (help) {
        report(ctx, `${ONKLAUD_USAGE}\n\n${ONKLAUD_EXPLANATION}`, "info");
        return;
      }
      if (error) {
        report(ctx, error, "warning");
        return;
      }
      if (action === "explain") {
        report(ctx, ONKLAUD_EXPLANATION, "info");
        return;
      }
      if (action === "status") {
        try {
          const result = await pi.exec("onklaud", ["status"], { signal: ctx.signal, timeout: 120_000 });
          const text = outputText(result) || `onklaud status exited with code ${result.code}`;
          const status = classifyStatus(text, result.code);
          report(ctx, status.message, status.level);
        } catch (error) {
          report(ctx, `Onklaud status failed: ${error.message}`, "warning");
        }
        return;
      }
      if (action === "install") {
        try {
          report(ctx, await installOnklaud(pi, objective, ctx), "info");
        } catch (error) {
          report(ctx, `Onklaud install failed: ${error.message}`, "warning");
        }
        return;
      }
      if (dryRun) {
        report(ctx, `DRY RUN: ${goalCommand}`, "info");
        return;
      }

      const options = typeof ctx.isIdle === "function" && !ctx.isIdle() ? { deliverAs: "followUp" } : undefined;
      report(ctx, `Starting Onklaud-backed workflow: this queues a /goal prompt. Token budget: ${tokenBudget}. Pi still owns edits, tests, and validation.`, "info");
      pi.sendUserMessage(goalCommand, options);
    },
  });
}
