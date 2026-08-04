import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_BASH_TIMEOUT_SECONDS = 180;
const PROTECTED_SEGMENTS = new Set([
  ".git",
  ".pi",
  ".agents",
  ".ssh",
  ".aws",
  ".gnupg",
  "node_modules",
  ".cache",
]);

function canonicalTarget(target) {
  const suffix = [];
  let current = path.resolve(target);
  while (true) {
    try {
      const real = fs.realpathSync.native(current);
      return path.resolve(real, ...suffix);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`cannot resolve path: ${target}`);
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

function isWithin(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

export function classifyWritePath(inputPath, cwd, temporaryRoot = os.tmpdir()) {
  if (typeof inputPath !== "string" || !inputPath.trim())
    return { allowed: false, reason: "missing write path" };
  const raw = inputPath.trim().replace(/^@/, "");
  let workspace;
  let temporary;
  let target;
  try {
    workspace = canonicalTarget(cwd);
    temporary = canonicalTarget(temporaryRoot);
    target = canonicalTarget(path.resolve(cwd, raw));
  } catch (error) {
    return {
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (!isWithin(workspace, target) && !isWithin(temporary, target)) {
    return {
      allowed: false,
      reason: `write path is outside workspace or temporary directory: ${target}`,
    };
  }
  const basename = path.basename(target);
  if (basename === ".env" || basename.startsWith(".env.")) {
    return {
      allowed: false,
      reason: `secret-bearing environment file is protected: ${target}`,
    };
  }
  const allowedRoot = isWithin(workspace, target) ? workspace : temporary;
  const protectedSegment = path
    .relative(allowedRoot, target)
    .split(path.sep)
    .find((segment) => PROTECTED_SEGMENTS.has(segment));
  if (protectedSegment) {
    return {
      allowed: false,
      reason: `control, credential, or cache path is protected: ${protectedSegment}`,
    };
  }
  return { allowed: true, target };
}

export default function workspaceGuard(pi) {
  pi.registerCommand("workspace-guard", {
    description: "Show workspace write guard coverage",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        `Workspace guard active for ${ctx.cwd}. edit/write are limited to the workspace and ${os.tmpdir()}; control paths and .env files are protected. Bash receives a ${DEFAULT_BASH_TIMEOUT_SECONDS}s default timeout but is not sandboxed.`,
        "info",
      );
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      if (!Number.isFinite(event.input?.timeout))
        event.input.timeout = DEFAULT_BASH_TIMEOUT_SECONDS;
      return;
    }
    if (!new Set(["edit", "write"]).has(event.toolName)) return;
    const result = classifyWritePath(event.input?.path, ctx.cwd);
    if (!result.allowed)
      return {
        block: true,
        reason: `Workspace guard blocked ${event.toolName}: ${result.reason}`,
      };
  });
}
