import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import registerPoshifyFollowups from "../extensions/poshify/followups.js";

const poshifyExtension = fs.readFileSync(
  new URL("../extensions/poshify/index.js", import.meta.url),
  "utf8",
);
assert.match(
  poshifyExtension,
  /await registerPosher\(pi\);\s*\/\/ ponytail:[\s\S]*?registerSafeDiagnosticsRenderer\(pi\);/,
);
assert.match(poshifyExtension, /box\.addChild\(new Text\(body, 0, 0\)\);/);

const tools = new Map();
const calls = [];
const Type = {
  Object: (properties) => ({ properties }),
  String: (options) => ({ type: "string", ...options }),
};
let summary = "clean";
const runPoshify = async (_ctx, options) => {
  calls.push(options);
  return { summary, findings: [] };
};

registerPoshifyFollowups({
  pi: { registerTool: (definition) => tools.set(definition.name, definition) },
  Type,
  runPoshify,
  hasIssueOutput: (summary) => summary.includes("⚠️"),
});

assert.deepEqual([...tools.keys()], ["run_poshify_fix", "run_poshify_audit"]);

const ctx = { cwd: "/workspace/project", signal: new AbortController().signal };
const fixResult = await tools
  .get("run_poshify_fix")
  .execute("fix-1", { path: "src/app.py" }, ctx.signal, undefined, ctx);
assert.deepEqual(calls.at(-1).sections, ["fix-tools"]);
assert.equal(fixResult.details.target, path.resolve(ctx.cwd, "src/app.py"));

await tools
  .get("run_poshify_audit")
  .execute("audit-1", { path: "." }, ctx.signal, undefined, ctx);
assert.deepEqual(calls.at(-1).sections, ["tools", "audit-tools"]);

summary = "⚠️ semgrep found unsafe code";
await assert.rejects(
  () =>
    tools
      .get("run_poshify_audit")
      .execute("audit-2", { path: "src/app.py" }, ctx.signal, undefined, ctx),
  /Target: \/workspace\/project\/src\/app\.py\n⚠️ semgrep/,
);

let tildeError;
try {
  await tools
    .get("run_poshify_audit")
    .execute("audit-3", { path: "~/src/app.py" }, ctx.signal, undefined, ctx);
} catch (error) {
  tildeError = error;
}
assert.equal(
  tildeError.message.split("\n")[0],
  `Target: ${path.join(os.homedir(), "src/app.py")}`,
);

console.log("poshify-followups ok");
