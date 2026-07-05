import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  openWikiCliArgs,
  openWikiCompletions,
  OPENWIKI_EXPLANATION,
  OPENWIKI_REPO_URL,
  OPENWIKI_USAGE,
  parseOpenWikiArgs,
} from "./command.js";

function outputText(result) {
  return [result?.stdout, result?.stderr].filter(Boolean).join("\n").trim();
}

function report(ctx, message, level = "info") {
  if (ctx?.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

function truncate(text, limit = 6000) {
  const value = String(text || "").trim();
  return value.length > limit ? `${value.slice(0, limit)}\n\n[openwiki output truncated]` : value;
}

function progressPath(ctx) {
  return ctx?.cwd ? join(ctx.cwd, ".openwiki") : null;
}

async function readProgress(ctx) {
  const file = progressPath(ctx);
  if (!file) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, runs: [] };
    if (error instanceof SyntaxError) return { version: 1, runs: [] };
    throw error;
  }
}

async function recordProgress(ctx, entry) {
  const file = progressPath(ctx);
  if (!file) return;
  try {
    const at = new Date().toISOString();
    const current = await readProgress(ctx);
    const nextEntry = { at, ...entry };
    const runs = [...(Array.isArray(current?.runs) ? current.runs : []), nextEntry].slice(-20);
    await writeFile(file, JSON.stringify({ version: 1, updatedAt: at, last: nextEntry, runs }, null, 2) + "\n", "utf8");
  } catch (error) {
    report(ctx, `OpenWiki progress not written: ${error.message}`, "warning");
  }
}

async function formatProgress(ctx) {
  const file = progressPath(ctx);
  if (!file) return "OpenWiki progress needs a project cwd.";
  const progress = await readProgress(ctx);
  if (!progress?.last) return `No OpenWiki progress yet. Run /openwiki or /openwiki <request>. Progress will be saved to ${file}.`;
  return `OpenWiki progress: ${file}\nlast: ${progress.last.action} ${progress.last.ok ? "ok" : "failed"} at ${progress.last.at}\nruns tracked: ${progress.runs?.length ?? 0}`;
}

function expandHome(path, fallback) {
  const value = String(path || fallback);
  return value === "~" || value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
}

function defaultInstallDir() {
  return process.platform === "win32" ? join(process.env.LOCALAPPDATA || homedir(), "openwiki") : join(homedir(), ".local", "share", "openwiki");
}

function defaultBinDir() {
  return process.platform === "win32" ? join(process.env.LOCALAPPDATA || homedir(), "Microsoft", "WindowsApps") : join(homedir(), ".local", "bin");
}

function wrapperName() {
  return process.platform === "win32" ? "openwiki.cmd" : "openwiki";
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

async function openWikiCommand() {
  if (process.env.OPENWIKI_BIN) return process.env.OPENWIKI_BIN;
  const local = join(defaultBinDir(), wrapperName());
  return (await exists(local)) ? local : "openwiki";
}

async function run(pi, command, args, ctx, timeout = 900_000) {
  const result = await pi.exec(command, args, { signal: ctx.signal, timeout });
  if (result.code !== 0) throw new Error(outputText(result) || `${command} ${args.join(" ")} failed with exit code ${result.code}`);
  return result;
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
    report(ctx, `OpenWiki install: cloning ${OPENWIKI_REPO_URL} into ${installDir}...`);
    await run(pi, "git", ["clone", "--depth", "1", OPENWIKI_REPO_URL, installDir], ctx);
    return;
  }

  const inside = await pi.exec("git", ["-C", installDir, "rev-parse", "--is-inside-work-tree"], { signal: ctx.signal, timeout: 120_000 });
  if (inside.code !== 0 || outputText(inside) !== "true") {
    if (await isEmptyDir(installDir)) {
      report(ctx, `OpenWiki install: cloning ${OPENWIKI_REPO_URL} into empty directory ${installDir}...`);
      await run(pi, "git", ["clone", "--depth", "1", OPENWIKI_REPO_URL, installDir], ctx);
      return;
    }
    throw new Error(`Install directory exists but is not a git repository: ${installDir}\nUse /openwiki install --dir <empty-dir> or move the existing directory.`);
  }
  const remote = await run(pi, "git", ["-C", installDir, "remote", "get-url", "origin"], ctx, 120_000);
  const remoteUrl = outputText(remote);
  if (normalizeRepoUrl(remoteUrl) !== normalizeRepoUrl(OPENWIKI_REPO_URL)) {
    throw new Error(`Install directory is a git repo but origin is not OpenWiki: ${installDir}\norigin: ${remoteUrl}\nUse /openwiki install --dir <empty-dir> or move the existing directory.`);
  }
  report(ctx, `OpenWiki install: updating existing checkout in ${installDir}...`);
  await run(pi, "git", ["-C", installDir, "pull", "--ff-only"], ctx);
}

async function installOpenWiki(pi, params, ctx) {
  const installDir = resolve(expandHome(params.installDir, defaultInstallDir()));
  const binDir = resolve(expandHome(params.binDir, defaultBinDir()));
  const wrapper = join(binDir, wrapperName());
  const cli = join(installDir, "dist", "cli.js");
  const plan = `Install OpenWiki from ${OPENWIKI_REPO_URL}\nrepo: ${installDir}\ncommand: ${wrapper}`;

  if (params.dryRun) return `DRY RUN:\n${plan}`;
  if (!params.yes) {
    if (!ctx.hasUI) return `${plan}\nRun /openwiki install --yes to install non-interactively.`;
    const ok = await ctx.ui.confirm("Install OpenWiki?", `${plan}\n\nThis clones a GitHub repo and installs/builds Node dependencies with pnpm.`);
    if (!ok) return "OpenWiki install cancelled.";
  }

  report(ctx, `OpenWiki install: repo ${installDir}; launcher ${wrapper}.`);
  await mkdir(dirname(installDir), { recursive: true });
  await prepareRepo(pi, installDir, ctx);
  report(ctx, "OpenWiki install: installing dependencies with pnpm...");
  await run(pi, "pnpm", ["--dir", installDir, "install", "--frozen-lockfile"], ctx);
  report(ctx, "OpenWiki install: building CLI...");
  await run(pi, "pnpm", ["--dir", installDir, "build"], ctx);

  await mkdir(binDir, { recursive: true });
  report(ctx, `OpenWiki install: writing launcher ${wrapper}...`);
  if (process.platform === "win32") {
    await writeFile(wrapper, `@echo off\r\nnode "${cli}" %*\r\n`, "utf8");
  } else {
    await writeFile(wrapper, `#!/usr/bin/env bash\nset -euo pipefail\nexec node "${cli}" "$@"\n`, { mode: 0o755 });
    await chmod(wrapper, 0o755);
  }
  return `Installed OpenWiki. Run: /openwiki status\nSecrets/config remain in ~/.openwiki/.env when OpenWiki asks for provider setup.`;
}

async function resolveAutoAction(parsed, ctx) {
  if (parsed.action !== "auto") return parsed;
  const hasWiki = Boolean(ctx?.cwd) && await exists(join(ctx.cwd, "openwiki"));
  return { ...parsed, action: hasWiki ? "update" : "init", yes: true };
}

async function runOpenWiki(pi, parsed, ctx) {
  const selected = await resolveAutoAction(parsed, ctx);
  const command = await openWikiCommand();
  const args = openWikiCliArgs(selected);
  if (selected.dryRun) {
    await recordProgress(ctx, { action: selected.action, ok: true, dryRun: true, args });
    return `DRY RUN: ${command} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`;
  }
  if ((selected.action === "init" || selected.action === "update") && !selected.yes) {
    const label = selected.action === "init" ? "initialize" : "update";
    if (!ctx.hasUI) return `OpenWiki ${label} can edit docs. Rerun /openwiki ${selected.action} --yes non-interactively.`;
    const ok = await ctx.ui.confirm(`OpenWiki ${label}?`, `This runs ${command} ${args.join(" ")} and may edit openwiki/, AGENTS.md, or CLAUDE.md.`);
    if (!ok) return `OpenWiki ${label} cancelled.`;
  }
  const result = await pi.exec(command, args, { signal: ctx.signal, timeout: 900_000 });
  const text = truncate(outputText(result) || `openwiki exited with code ${result.code}`);
  const ok = result.code === 0;
  await recordProgress(ctx, { action: selected.action, ok, exitCode: result.code, args, request: selected.request || undefined });
  if (!ok) return { text, level: "warning" };
  return { text: `${text || "OpenWiki completed."}\n\nProgress saved to .openwiki`, level: "info" };
}

export default function openwiki(pi) {
  pi.registerCommand("openwiki", {
    description: "Install and run the external langchain-ai OpenWiki documentation CLI",
    getArgumentCompletions: (prefix) => openWikiCompletions(prefix),
    handler: async (args, ctx) => {
      const parsed = parseOpenWikiArgs(args);
      if (parsed.help) {
        report(ctx, `${OPENWIKI_USAGE}\n\n${OPENWIKI_EXPLANATION}`, "info");
        return;
      }
      if (parsed.error) {
        report(ctx, parsed.error, "warning");
        return;
      }
      if (parsed.action === "explain") {
        report(ctx, OPENWIKI_EXPLANATION, "info");
        return;
      }
      if (parsed.action === "progress") {
        report(ctx, await formatProgress(ctx), "info");
        return;
      }
      if (parsed.action === "install") {
        try {
          const message = await installOpenWiki(pi, parsed, ctx);
          await recordProgress(ctx, { action: "install", ok: !/^OpenWiki install cancelled/.test(message), dryRun: parsed.dryRun || undefined });
          report(ctx, message, "info");
        } catch (error) {
          await recordProgress(ctx, { action: "install", ok: false, error: error.message });
          report(ctx, `OpenWiki install failed: ${error.message}`, "warning");
        }
        return;
      }
      if (parsed.action === "status") {
        try {
          const command = await openWikiCommand();
          const result = await pi.exec(command, ["--help"], { signal: ctx.signal, timeout: 120_000 });
          const text = outputText(result);
          await recordProgress(ctx, { action: "status", ok: result.code === 0, exitCode: result.code });
          report(ctx, result.code === 0 ? `OpenWiki available via ${command}.\n${truncate(text, 2000)}\n\nProgress saved to .openwiki` : `OpenWiki status failed. Run /openwiki install --yes.\n${truncate(text, 2000)}`, result.code === 0 ? "info" : "warning");
        } catch (error) {
          await recordProgress(ctx, { action: "status", ok: false, error: error.message });
          report(ctx, `OpenWiki not available: ${error.message}\nRun /openwiki install --yes.`, "warning");
        }
        return;
      }

      try {
        const result = await runOpenWiki(pi, parsed, ctx);
        if (typeof result === "string") report(ctx, result, "info");
        else report(ctx, result.text, result.level);
      } catch (error) {
        await recordProgress(ctx, { action: parsed.action, ok: false, error: error.message, request: parsed.request || undefined });
        report(ctx, `OpenWiki failed: ${error.message}`, "warning");
      }
    },
  });
}
