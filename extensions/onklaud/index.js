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

function missingHelperLauncherMessage(action, text) {
  if (action === "gate" || !/council\.py: error: argument mode: invalid choice/i.test(text)) return "";
  return "\n\nThis installed onklaud launcher does not expose zero-cost helpers yet. Run /onklaud install --yes to rewrite it, or rerun /onklaud install with your custom --dir/--bin-dir.";
}

async function checkHelperLauncher(pi, ctx) {
  try {
    const result = await pi.exec("onklaud", ["ponytail", "--task", "read JSON", "--json"], { signal: ctx.signal, timeout: 30_000 });
    const text = outputText(result);
    const hint = result.code === 0 ? "" : missingHelperLauncherMessage("ponytail", text);
    if (hint) report(ctx, hint.trim(), "warning");
  } catch {
    // ponytail: status already proved council.py works; helper smoke failures are advisory.
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
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

function validateGateArgs(args = []) {
  let hasText = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (arg === "--domain") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return "Missing value for gate --domain.";
      index += 1;
      continue;
    }
    if (arg.startsWith("--domain=")) {
      if (arg.length === "--domain=".length) return "Missing value for gate --domain.";
      continue;
    }
    if (arg === "--text") {
      const value = args[index + 1];
      if (!value) return "Missing value for gate --text.";
      hasText = true;
      index += 1;
      continue;
    }
    if (arg.startsWith("--text=")) {
      if (arg.length === "--text=".length) return "Missing value for gate --text.";
      hasText = true;
      continue;
    }
    return `Unsupported gate option: ${arg}. Use --domain, --text, and optional --json.`;
  }
  return hasText ? null : "Gate requires --text to avoid waiting for stdin.";
}

function validatePonytailArgs(args = []) {
  let hasTask = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (arg === "--task" || arg === "--project-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return `Missing value for ponytail ${arg}.`;
      if (arg === "--task") hasTask = true;
      index += 1;
      continue;
    }
    if (arg.startsWith("--task=")) {
      if (arg.length === "--task=".length) return "Missing value for ponytail --task.";
      hasTask = true;
      continue;
    }
    if (arg.startsWith("--project-dir=")) {
      if (arg.length === "--project-dir=".length) return "Missing value for ponytail --project-dir.";
      continue;
    }
    if (arg === "--lang") {
      const value = args[index + 1];
      if (value !== "python" && value !== "js") return "Ponytail --lang must be python or js.";
      index += 1;
      continue;
    }
    if (arg.startsWith("--lang=")) {
      const value = arg.slice("--lang=".length);
      if (value !== "python" && value !== "js") return "Ponytail --lang must be python or js.";
      continue;
    }
    return `Unsupported ponytail option: ${arg}. Use --task, --lang, --project-dir, and optional --json.`;
  }
  return hasTask ? null : "Ponytail requires --task.";
}

function validatePreCheckArgs(args = []) {
  let inputs = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (arg === "--task" || arg === "--file") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return `Missing value for pre-check ${arg}.`;
      inputs += 1;
      index += 1;
      continue;
    }
    if (arg.startsWith("--task=") || arg.startsWith("--file=")) {
      const [flag, value] = arg.split("=", 2);
      if (!value) return `Missing value for pre-check ${flag}.`;
      inputs += 1;
      continue;
    }
    return `Unsupported pre-check option: ${arg}. Use --task or --file and optional --json.`;
  }
  if (inputs === 0) return "Pre-check requires --task or --file.";
  return inputs === 1 ? null : "Pre-check accepts either --task or --file, not both.";
}

function validateFastGateArgs(args = []) {
  let files = 0;
  let offline = false;
  for (const arg of args) {
    if (arg === "--syntax-only" || arg === "--skip-kimi") {
      offline = true;
      continue;
    }
    if (arg === "--prompt" || arg.startsWith("--prompt=")) return "Fast-gate prompt review is model-backed; use /onklaud goal workflow instead.";
    if (arg.startsWith("--")) return `Unsupported fast-gate option: ${arg}. Use --syntax-only or --skip-kimi plus file paths.`;
    files += 1;
  }
  if (!offline) return "Fast-gate requires --syntax-only or --skip-kimi to stay offline.";
  return files > 0 ? null : "Fast-gate requires at least one file.";
}

const DIRECT_VALIDATORS = {
  gate: validateGateArgs,
  ponytail: validatePonytailArgs,
  "pre-check": validatePreCheckArgs,
  "fast-gate": validateFastGateArgs,
};

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
  const venvBin = process.platform === "win32" ? join(installDir, ".venv", "Scripts") : join(installDir, ".venv", "bin");
  const python = process.platform === "win32" ? join(venvBin, "python.exe") : join(venvBin, "python");
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
    const dispatcher = `import os, runpy, sys; root=r'${installDir}'; os.environ['PATH']=r'${venvBin}'+os.pathsep+os.environ.get('PATH',''); helpers={'ponytail':'ponytail_ladder.py','pre-check':'pre_check.py','fast-gate':'fast_gate.py'}; cmd=sys.argv[1] if len(sys.argv)>1 else ''; script=helpers.get(cmd,'council.py'); sys.argv=[script]+(sys.argv[2:] if cmd in helpers else sys.argv[1:]); runpy.run_path(os.path.join(root, script), run_name='__main__')`;
    await writeFile(wrapper, `@echo off\r\n"${python}" -c "${dispatcher}" %*\r\n`, "utf8");
  } else {
    await writeFile(wrapper, `#!/usr/bin/env bash\nset -euo pipefail\nexport PATH=${shellQuote(venvBin)}:$PATH\nif [ -f ${shellQuote(join(installDir, ".env"))} ]; then\n  set -a\n  . ${shellQuote(join(installDir, ".env"))}\n  set +a\nfi\ncase "\${1:-}" in\n  ponytail) shift; exec ${shellQuote(python)} ${shellQuote(join(installDir, "ponytail_ladder.py"))} "$@" ;;\n  pre-check) shift; exec ${shellQuote(python)} ${shellQuote(join(installDir, "pre_check.py"))} "$@" ;;\n  fast-gate) shift; exec ${shellQuote(python)} ${shellQuote(join(installDir, "fast_gate.py"))} "$@" ;;\n  *) exec ${shellQuote(python)} ${shellQuote(join(installDir, "council.py"))} "$@" ;;\nesac\n`, { mode: 0o755 });
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
          if (status.level === "info") await checkHelperLauncher(pi, ctx);
        } catch (error) {
          report(ctx, `Onklaud status failed: ${error.message}`, "warning");
        }
        return;
      }
      if (DIRECT_VALIDATORS[action]) {
        if (dryRun) {
          report(ctx, `DRY RUN: onklaud ${action} ${objective.passThroughArgs.join(" ")}`, "info");
          return;
        }
        const directError = DIRECT_VALIDATORS[action](objective.passThroughArgs);
        if (directError) {
          report(ctx, directError, "warning");
          return;
        }
        try {
          const result = await pi.exec("onklaud", [action, ...objective.passThroughArgs], { signal: ctx.signal, timeout: 120_000 });
          let text = outputText(result) || `onklaud ${action} exited with code ${result.code}`;
          if (result.code !== 0) text += missingHelperLauncherMessage(action, text);
          report(ctx, text, result.code === 0 ? "info" : "warning");
        } catch (error) {
          report(ctx, `Onklaud ${action} failed: ${error.message}`, "warning");
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
