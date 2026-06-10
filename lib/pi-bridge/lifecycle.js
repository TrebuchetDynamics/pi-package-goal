import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export function commandOutput(result) {
  return [result?.stdout, result?.stderr].filter(Boolean).join("\n").trim();
}

export async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runGit(pi, args, ctx, timeout = 600_000) {
  const result = await pi.exec("git", args, { signal: ctx.signal, timeout });
  if (result.code !== 0) {
    const output = commandOutput(result);
    throw new Error(output || `git ${args.join(" ")} failed with exit code ${result.code}`);
  }
  return result;
}

export function createRepoBackedSkillBridge(config) {
  const {
    bridgeName,
    isInstalled,
    afterInstallOrUpdate,
    installPromptTitle,
    installPromptMessage,
    installCancelledMessage,
    notInstalledMessage,
    buildInvocation,
  } = config;

  async function checkoutPinnedRef(pi, ctx, paths) {
    const repoRef = String(paths.repoRef ?? "").trim();
    if (!repoRef) return;
    await runGit(pi, ["-C", paths.repoDir, "fetch", "--depth", "1", "origin", repoRef], ctx);
    await runGit(pi, ["-C", paths.repoDir, "checkout", "--detach", "FETCH_HEAD"], ctx);
  }

  async function clone(pi, ctx, paths) {
    await mkdir(dirname(paths.repoDir), { recursive: true });
    await runGit(pi, ["clone", "--depth", "1", paths.repoUrl, paths.repoDir], ctx);
    await checkoutPinnedRef(pi, ctx, paths);
    if (afterInstallOrUpdate) await afterInstallOrUpdate(paths, { action: "installed" });
  }

  async function update(pi, ctx, paths) {
    if (!(await isInstalled(paths))) {
      await clone(pi, ctx, paths);
      return "installed";
    }
    if (String(paths.repoRef ?? "").trim()) {
      await checkoutPinnedRef(pi, ctx, paths);
    } else {
      await runGit(pi, ["-C", paths.repoDir, "pull", "--ff-only"], ctx);
    }
    if (afterInstallOrUpdate) await afterInstallOrUpdate(paths, { action: "updated" });
    return "updated";
  }

  async function ensureInstalled(pi, ctx, paths, { prompt = true } = {}) {
    if (await isInstalled(paths)) {
      if (afterInstallOrUpdate) await afterInstallOrUpdate(paths, { action: "present" });
      return;
    }

    if (prompt) {
      if (!ctx.hasUI) {
        throw new Error(notInstalledMessage?.(paths) || `${bridgeName} is not installed. Run the install command first, or clone ${paths.repoUrl} to ${paths.repoDir}.`);
      }
      const ok = await ctx.ui.confirm(installPromptTitle, installPromptMessage(paths));
      if (!ok) throw new Error(installCancelledMessage || `${bridgeName} install cancelled.`);
    }

    await clone(pi, ctx, paths);
  }

  async function readSkillInvocation({ skillPath, skillName, commandName, skillContent, args = "" }) {
    const content = skillContent ?? await readFile(skillPath, "utf8");
    return buildInvocation({ skillName, commandName, skillPath, skillContent: content, args });
  }

  async function sendSkillInvocation(pi, ctx, paths, request) {
    await ensureInstalled(pi, ctx, paths, request.ensureOptions ?? {});
    const message = await readSkillInvocation(request);
    if (ctx.isIdle()) {
      pi.sendUserMessage(message);
    } else {
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    }
  }

  async function checkoutHead(pi, ctx, paths) {
    const result = await runGit(pi, ["-C", paths.repoDir, "rev-parse", "--short", "HEAD"], ctx, 30_000);
    return result.stdout.trim();
  }

  return { clone, update, ensureInstalled, sendSkillInvocation, checkoutHead };
}
