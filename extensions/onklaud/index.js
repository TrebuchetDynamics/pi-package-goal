import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  buildOnklaudObjective,
  onklaudCompletions,
  ONKLAUD_EXPLANATION,
  ONKLAUD_REPO_URL,
  ONKLAUD_USAGE,
} from "../../lib/onklaud/command.js";

function outputText(result) {
  return [result?.stdout, result?.stderr].filter(Boolean).join("\n").trim();
}

function report(ctx, message, level = "info") {
  if (ctx?.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
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

  await mkdir(dirname(installDir), { recursive: true });
  await run(pi, "git", ["clone", "--depth", "1", ONKLAUD_REPO_URL, installDir], ctx).catch(async (error) => {
    if (!/already exists|exist/i.test(error.message)) throw error;
    await run(pi, "git", ["-C", installDir, "pull", "--ff-only"], ctx);
  });
  if (process.platform === "win32") {
    await run(pi, "py", ["-3", "-m", "venv", join(installDir, ".venv")], ctx);
  } else {
    await run(pi, "python3", ["-m", "venv", join(installDir, ".venv")], ctx);
  }
  await run(pi, python, ["-m", "pip", "install", "--upgrade", "pip"], ctx);
  await run(pi, python, ["-m", "pip", "install", "fpdf2", "pyyaml"], ctx);

  await mkdir(binDir, { recursive: true });
  if (process.platform === "win32") {
    await writeFile(wrapper, `@echo off\r\n"${python}" "${join(installDir, "council.py")}" %*\r\n`, "utf8");
  } else {
    await writeFile(wrapper, `#!/usr/bin/env bash\nset -euo pipefail\nexec "${python}" "${join(installDir, "council.py")}" "$@"\n`, { mode: 0o755 });
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
          report(ctx, text, result.code === 0 ? "info" : "warning");
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

      report(ctx, `Starting Onklaud-backed workflow: this queues a /goal prompt. Token budget: ${tokenBudget}. Pi still owns edits, tests, and validation.`, "info");
      pi.sendUserMessage(goalCommand);
    },
  });
}
