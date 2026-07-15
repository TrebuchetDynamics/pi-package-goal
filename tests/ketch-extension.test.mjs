import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import registerKetch, { buildKetchArgs, ensureKetch, inferSurface, releaseAsset, verifyChecksum } from "../extensions/ketch/index.js";

assert.equal(inferSurface({ request: "latest news about Pi coding agent" }), "search");
assert.equal(inferSurface({ request: "find code examples for AbortSignal", language: "typescript" }), "code");
assert.equal(inferSurface({ request: "React useEffect documentation" }), "docs");
assert.equal(inferSurface({ request: "https://example.com/article" }), "scrape");
assert.equal(inferSurface({ request: "crawl https://example.com docs" }), "crawl");
assert.equal(inferSurface({ request: "anything", surface: "code" }), "code");

assert.deepEqual(buildKetchArgs({ request: "Pi agent", limit: 3 }), ["search", "Pi agent", "--limit", "3", "--json"]);
assert.deepEqual(buildKetchArgs({ request: "AbortSignal", language: "typescript", surface: "code" }), ["code", "AbortSignal", "--limit", "5", "--lang", "typescript", "--json"]);
assert.deepEqual(buildKetchArgs({ request: "https://example.com/a", maxChars: 4000 }), ["scrape", "https://example.com/a", "--max-chars", "4000", "--trim", "--json"]);
assert.deepEqual(buildKetchArgs({ request: "crawl https://example.com/docs" }), ["crawl", "https://example.com/docs", "--depth", "2", "--json"]);

const tools = new Map();
const calls = [];
const signal = new AbortController().signal;
const previousKetchBin = process.env.KETCH_BIN;
process.env.KETCH_BIN = "/fake/ketch";
try {
  registerKetch({
    registerTool: (definition) => tools.set(definition.name, definition),
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      if (args[0] === "--version") return { code: 0, stdout: "ketch 0.11.0\n", stderr: "" };
      return { code: 0, stdout: '[{"title":"Pi","url":"https://example.com"}]\n', stderr: "" };
    },
  });
  assert.deepEqual([...tools.keys()], ["ketch"]);
  const result = await tools.get("ketch").execute("tool-1", { request: "Pi agent", limit: 2 }, signal);
  assert.match(result.content[0].text, /https:\/\/example\.com/);
  assert.equal(result.details.surface, "search");
  assert.equal(calls.at(-1).command, "/fake/ketch");
  assert.deepEqual(calls.at(-1).args, ["search", "Pi agent", "--limit", "2", "--json"]);
  assert.equal(calls.at(-1).options.signal, signal);
} finally {
  if (previousKetchBin === undefined) delete process.env.KETCH_BIN;
  else process.env.KETCH_BIN = previousKetchBin;
}

assert.deepEqual(releaseAsset("linux", "x64"), {
  name: "ketch_0.11.0_linux_x86_64.tar.gz",
  checksum: "23987ba72fac0d9e58592bdf610b530c6bcf577f47b33a9845dd45fbdf410c92",
  executable: "ketch",
});
assert.throws(() => releaseAsset("freebsd", "x64"), /Unsupported platform/);
verifyChecksum(Buffer.from("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
assert.throws(() => verifyChecksum(Buffer.from("abc"), "0".repeat(64)), /checksum mismatch/);

let installCalls = 0;
const ensured = await ensureKetch({
  exec: async (command) => ({ code: command === "/cache/ketch" ? 0 : 127, stdout: "", stderr: "" }),
}, {
  env: {},
  install: async () => { installCalls += 1; return "/cache/ketch"; },
});
assert.deepEqual(ensured, { binary: "/cache/ketch", installed: true });
assert.equal(installCalls, 1);

const largeTools = new Map();
const largeOutput = JSON.stringify({ body: "x".repeat(60_000) });
registerKetch({
  registerTool: (definition) => largeTools.set(definition.name, definition),
  exec: async (_command, args) => args[0] === "--version"
    ? { code: 0, stdout: "ketch 0.11.0", stderr: "" }
    : { code: 0, stdout: largeOutput, stderr: "" },
});
process.env.KETCH_BIN = "/fake/ketch";
try {
  const largeResult = await largeTools.get("ketch").execute("large/tool", { request: "large result" }, signal);
  assert.equal(largeResult.details.truncated, true);
  assert.match(largeResult.content[0].text, /Output truncated/);
  assert.equal((await readFile(largeResult.details.outputFile, "utf8")).length > 50_000, true);
  await rm(largeResult.details.outputFile, { force: true });
} finally {
  if (previousKetchBin === undefined) delete process.env.KETCH_BIN;
  else process.env.KETCH_BIN = previousKetchBin;
}

const lineTools = new Map();
registerKetch({
  registerTool: (definition) => lineTools.set(definition.name, definition),
  exec: async (_command, args) => args[0] === "--version"
    ? { code: 0, stdout: "ketch 0.11.0", stderr: "" }
    : { code: 0, stdout: JSON.stringify(Array.from({ length: 2100 }, () => "x")), stderr: "" },
});
process.env.KETCH_BIN = "/fake/ketch";
try {
  const lineResult = await lineTools.get("ketch").execute("many-lines", { request: "many results" }, signal);
  assert.equal(lineResult.details.truncated, true);
  assert.equal(lineResult.content[0].text.split("\n").length <= 2002, true);
  await rm(lineResult.details.outputFile, { force: true });
} finally {
  if (previousKetchBin === undefined) delete process.env.KETCH_BIN;
  else process.env.KETCH_BIN = previousKetchBin;
}

const errorTools = new Map();
registerKetch({
  registerTool: (definition) => errorTools.set(definition.name, definition),
  exec: async (_command, args) => args[0] === "--version"
    ? { code: 0, stdout: "ketch 0.11.0", stderr: "" }
    : { code: 5, stdout: "", stderr: "API key missing" },
});
process.env.KETCH_BIN = "/fake/ketch";
try {
  await assert.rejects(
    () => errorTools.get("ketch").execute("error", { request: "library docs", surface: "docs" }, signal),
    /\[precondition\].*API key missing/,
  );
} finally {
  if (previousKetchBin === undefined) delete process.env.KETCH_BIN;
  else process.env.KETCH_BIN = previousKetchBin;
}

console.log("ketch-extension ok");
