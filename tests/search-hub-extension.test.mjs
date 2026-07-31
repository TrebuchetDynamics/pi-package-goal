import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import {
  boundedOutput,
  isPrivateHost,
  normalizePublicUrl,
  parseDuckDuckGoResults,
  registerSearchHub,
  runSearch,
  unwrapDuckDuckGoUrl,
} from "../extensions/search-hub/index.js";

const ddgHtml = `
<div class="result results_links">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example &amp; Docs</a>
  <a class="result__snippet">Useful <b>documentation</b>.</a>
</div>
<div class="result results_links">
  <a class='result__a' href='https://example.org/news'>Latest news</a>
  <div class='result__snippet'>Current details.</div>
</div>`;

assert.equal(unwrapDuckDuckGoUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs"), "https://example.com/docs");
assert.deepEqual(parseDuckDuckGoResults(ddgHtml, 2), [
  { title: "Example & Docs", url: "https://example.com/docs", snippet: "Useful documentation ." },
  { title: "Latest news", url: "https://example.org/news", snippet: "Current details." },
]);
assert.equal(isPrivateHost("127.0.0.2"), true);
assert.equal(isPrivateHost("192.168.1.1"), true);
assert.equal(isPrivateHost("::ffff:127.0.0.1"), true);
assert.equal(isPrivateHost("example.com"), false);
assert.equal(normalizePublicUrl("example.com/docs"), "https://example.com/docs");
assert.throws(() => normalizePublicUrl("http://localhost/admin"), /private or internal/);
assert.throws(() => normalizePublicUrl("https://user:pass@example.com"), /credentials/);
assert.throws(() => normalizePublicUrl("file:\/\/\/etc\/passwd"), /protocol/);

const fallbackCalls = [];
const fallback = await runSearch({ query: "Pi agent", limit: 2 }, {
  env: { BRAVE_API_KEY: "secret" },
  fetchImpl: async (url, options) => {
    fallbackCalls.push({ url: String(url), options });
    if (String(url).includes("api.search.brave.com")) return new Response("unavailable", { status: 503 });
    return new Response(ddgHtml, { status: 200, headers: { "content-type": "text/html" } });
  },
});
assert.equal(fallback.backend, "combined");
assert.deepEqual(fallback.backends, ["brave", "duckduckgo"]);
assert.equal(fallback.results.length, 2);
assert.match(fallback.errors[0], /^brave: HTTP 503/);
assert.equal(fallbackCalls.length, 2);
assert.match(fallbackCalls[1].url, /\?q=Pi\+agent$/);
assert.equal(fallbackCalls[1].options.method, undefined);

const allSourceCalls = [];
const combined = await runSearch({ query: "Pi agent", limit: 5 }, {
  env: { BRAVE_API_KEY: "secret", SEARCH_HUB_SEARXNG_URL: "https://search.example/" },
  fetchImpl: async (url) => {
    const value = String(url);
    allSourceCalls.push(value);
    if (value.includes("api.search.brave.com")) {
      return Response.json({ web: { results: [
        { title: "Brave docs", url: "https://example.com/docs", description: "A richer Brave description." },
        { title: "Brave only", url: "https://brave.example/result", description: "Brave result." },
      ] } });
    }
    if (value.startsWith("https://search.example/")) {
      return Response.json({ results: [
        { title: "SearXNG news", url: "https://example.org/news", content: "SearXNG result." },
        { title: "SearXNG only", url: "https://searx.example/result", content: "SearXNG-only result." },
      ] });
    }
    return new Response(ddgHtml, { status: 200 });
  },
});
assert.equal(combined.backend, "combined");
assert.deepEqual(combined.backends, ["brave", "searxng", "duckduckgo"]);
assert.equal(allSourceCalls.length, 3);
assert.equal(combined.results.length, 4);
assert.deepEqual(combined.results.find(({ url }) => url === "https://example.com/docs").sources, ["brave", "duckduckgo"]);
assert.deepEqual(combined.results.find(({ url }) => url === "https://example.org/news").sources, ["searxng", "duckduckgo"]);

await assert.rejects(
  () => runSearch({ query: "Pi agent", backend: "brave" }, { env: {}, fetchImpl: async () => new Response() }),
  /BRAVE_API_KEY/,
);
await assert.rejects(
  () => runSearch({ query: "Pi agent", backend: "unknown" }, { env: {} }),
  /Unknown search backend/,
);

const tools = new Map();
const commands = new Map();
const queued = [];
const notices = [];
const statuses = [];
const updates = [];
registerSearchHub({
  registerTool: (tool) => tools.set(tool.name, tool),
  registerCommand: (name, command) => commands.set(name, command),
  sendUserMessage: (content, options) => queued.push({ content, options }),
}, {
  env: {},
  fetchImpl: async (url) => String(url).startsWith("https://r.jina.ai/")
    ? new Response("# Example\n\n" + "line\n".repeat(600), { status: 200 })
    : new Response(ddgHtml, { status: 200 }),
});
assert.deepEqual([...tools.keys()], ["web_search", "web_read"]);
assert.deepEqual([...commands.keys()], ["search-hub"]);

const commandContext = { ui: { notify: (message) => notices.push(message) } };
commands.get("search-hub").handler("", commandContext);
assert.match(notices.at(-1), /Usage: \/search-hub/);
commands.get("search-hub").handler("latest Pi news", commandContext);
assert.match(queued.at(-1).content, /latest Pi news/);
assert.deepEqual(queued.at(-1).options, { deliverAs: "followUp" });

const toolContext = { ui: { setStatus: (...args) => statuses.push(args) } };
const signal = new AbortController().signal;
const searchResult = await tools.get("web_search").execute(
  "search-1",
  { query: "Pi agent", limit: 1 },
  signal,
  (update) => updates.push(update),
  toolContext,
);
assert.equal(searchResult.details.backend, "duckduckgo");
assert.equal(searchResult.details.resultCount, 1);
assert.deepEqual(searchResult.details.backends, ["duckduckgo"]);
assert.match(searchResult.content[0].text, /Sources queried: duckduckgo/);
assert.match(searchResult.content[0].text, /https:\/\/example\.com\/docs/);
assert.equal(updates.at(-1).content[0].text, "Searching...");
assert.deepEqual(statuses.at(-1), ["search-hub", undefined]);

const readResult = await tools.get("web_read").execute(
  "read/1",
  { url: "https://example.com", maxChars: 1000 },
  signal,
  undefined,
  toolContext,
);
assert.equal(readResult.details.reader, "jina");
assert.equal(readResult.details.truncated, true);
assert.match(readResult.content[0].text, /Output truncated/);
assert.match(await readFile(readResult.details.outputFile, "utf8"), /^# Example/);
await rm(readResult.details.outputFile.split("/").slice(0, -1).join("/"), { recursive: true, force: true });

const bounded = await boundedOutput(Array.from({ length: 550 }, (_, index) => `line ${index}`).join("\n"), "lines");
assert.equal(bounded.truncated, true);
assert.equal(bounded.text.split("\n").length <= 502, true);
await rm(bounded.outputFile.split("/").slice(0, -1).join("/"), { recursive: true, force: true });

console.log("search-hub-extension ok");
