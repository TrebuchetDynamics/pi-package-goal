import * as fs from "node:fs";
import * as path from "node:path";

export type CwdLikeContext = {
  cwd?: string;
  sessionManager?: {
    getCwd?: () => string;
  };
};

export function contextCwd(ctx: CwdLikeContext): string {
  return ctx.sessionManager?.getCwd?.() || ctx.cwd || process.cwd();
}

export function absoluteLogPath(cwd: string, configured: string | undefined, defaultRelative = path.join(".pi", "development-loop", "logs.jsonl")): string {
  const target = configured || defaultRelative;
  return path.isAbsolute(target) ? target : path.join(cwd, target);
}

export function relativeToCwd(cwd: string, target: string): string {
  const absolute = path.isAbsolute(target) ? target : path.join(cwd, target);
  const relative = path.relative(cwd, absolute);
  return relative && !relative.startsWith("..") ? relative : absolute;
}

export function writeJsonFileAtomic(target: string, value: unknown) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      // Best effort cleanup; keep the original file untouched when possible.
    }
    throw error;
  }
}

export function safeRead(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function dirExists(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
