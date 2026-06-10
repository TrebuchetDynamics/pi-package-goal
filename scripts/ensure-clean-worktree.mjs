#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const status = git(["status", "--porcelain", "--untracked-files=all"]);
if (status.trim()) {
  console.error("Refusing release/publish from a dirty worktree. Commit, stash, or revert changes first.");
  console.error(status.trimEnd());
  process.exit(1);
}

console.log("release worktree clean");
