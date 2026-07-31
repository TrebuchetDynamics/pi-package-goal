import { mkdtemp, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HTTP_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024;
const MAX_OUTPUT_LINES = 500;
const BACKENDS = new Set(["auto", "duckduckgo", "brave", "searxng"]);

function timeoutSignal(signal, timeoutMs = HTTP_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function decodeHtml(value = "") {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"', nbsp: " " };
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (match, code) => {
      const point =
        code[0].toLowerCase() === "x"
          ? Number.parseInt(code.slice(1), 16)
          : Number.parseInt(code, 10);
      return point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(
      /&([a-z]+);/gi,
      (match, name) => named[name.toLowerCase()] ?? match,
    )
    .replace(/\s+/g, " ")
    .trim();
}

const ATTRIBUTE_PATTERNS = {
  class: /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
  href: /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
};

function attribute(attributes, name) {
  return (
    attributes.match(ATTRIBUTE_PATTERNS[name])?.slice(1).find(Boolean) ?? ""
  );
}

export function unwrapDuckDuckGoUrl(value) {
  const decoded = decodeHtml(value);
  try {
    const url = new URL(decoded, "https://duckduckgo.com");
    return url.searchParams.get("uddg") || url.toString();
  } catch {
    return decoded;
  }
}

export function parseDuckDuckGoResults(html, limit = 10) {
  const anchors = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const classes = attribute(match[1], "class").split(/\s+/);
    if (!classes.includes("result__a")) continue;
    anchors.push({
      index: match.index,
      end: match.index + match[0].length,
      href: attribute(match[1], "href"),
      title: decodeHtml(match[2]),
    });
  }

  const results = [];
  const seen = new Set();
  for (
    let index = 0;
    index < anchors.length && results.length < limit;
    index += 1
  ) {
    const anchor = anchors[index];
    const url = unwrapDuckDuckGoUrl(anchor.href);
    if (!anchor.title || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    const tail = html.slice(
      anchor.end,
      anchors[index + 1]?.index ?? Math.min(html.length, anchor.end + 6000),
    );
    const snippetMatch = tail.match(
      /<(?:a|div)[^>]*class=(?:"[^"]*result__snippet[^"]*"|'[^']*result__snippet[^']*')[^>]*>([\s\S]*?)<\/(?:a|div)>/i,
    );
    seen.add(url);
    results.push({
      title: anchor.title,
      url,
      snippet: decodeHtml(snippetMatch?.[1] ?? ""),
    });
  }
  return results;
}

function isPrivateIpv4(host) {
  const parts = host.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPrivateHost(hostname) {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return true;
  if (["metadata.google.internal", "metadata.azure.com"].includes(host))
    return true;
  if (host.startsWith("::ffff:")) return isPrivateIpv4(host.slice(7));
  const version = isIP(host);
  if (version === 4) return isPrivateIpv4(host);
  if (version === 6)
    return host === "::" || host === "::1" || /^(?:fc|fd|fe[89ab])/i.test(host);
  return false;
}

export function normalizePublicUrl(value) {
  const input = String(value ?? "").trim();
  if (!input) throw new Error("web_read requires a URL");
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) {
    throw new Error(`Blocked URL protocol: ${input.split(":", 1)[0]}:`);
  }
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error(`Blocked URL protocol: ${url.protocol}`);
  if (url.username || url.password) throw new Error("Blocked URL credentials");
  if (isPrivateHost(url.hostname))
    throw new Error(`Blocked private or internal host: ${url.hostname}`);
  const port = Number(url.port || 0);
  if (port > 0 && port < 1024 && ![80, 443].includes(port))
    throw new Error(`Blocked privileged port: ${port}`);
  return url.toString();
}

async function readResponseText(response, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new Error(`Response exceeds ${maxBytes} bytes`);
  if (!response.body) return "";

  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sanitizeError(error) {
  return String(error?.message ?? error)
    .replace(
      /(authorization|api[-_ ]?key|token)\s*[:=]?\s*[^\s,;]+/gi,
      "$1 [redacted]",
    )
    .slice(0, 300);
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const text = await readResponseText(response);
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Search backend returned invalid JSON");
  }
}

export async function searchDuckDuckGo(
  query,
  limit,
  { fetchImpl = fetch, signal } = {},
) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.search = new URLSearchParams({ q: query }).toString();
  const response = await fetchImpl(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; pi-search-hub/1.0)" },
    signal: timeoutSignal(signal),
  });
  const html = await readResponseText(response);
  if (!response.ok) throw new Error(`DuckDuckGo HTTP ${response.status}`);
  const results = parseDuckDuckGoResults(html, limit);
  if (!results.length)
    throw new Error("DuckDuckGo returned no parseable results");
  return results;
}

async function searchBrave(query, limit, { fetchImpl, signal, env }) {
  const key = env.BRAVE_API_KEY || env.SEARCH_BRAVE_API_KEY;
  if (!key) throw new Error("Brave is not configured; set BRAVE_API_KEY");
  const params = new URLSearchParams({ q: query, count: String(limit) });
  const data = await fetchJson(
    fetchImpl,
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: { accept: "application/json", "x-subscription-token": key },
      signal: timeoutSignal(signal),
    },
  );
  return (data.web?.results ?? [])
    .slice(0, limit)
    .map((result) => ({
      title: String(result.title ?? "Untitled"),
      url: String(result.url ?? ""),
      snippet: decodeHtml(String(result.description ?? "")),
    }))
    .filter((result) => /^https?:\/\//i.test(result.url));
}

async function searchSearxng(query, limit, { fetchImpl, signal, env }) {
  const base = env.SEARCH_HUB_SEARXNG_URL || env.SEARXNG_URL;
  if (!base)
    throw new Error("SearXNG is not configured; set SEARCH_HUB_SEARXNG_URL");
  const url = new URL("search", base.endsWith("/") ? base : `${base}/`);
  url.search = new URLSearchParams({
    q: query,
    format: "json",
    count: String(limit),
  }).toString();
  const headers = { accept: "application/json" };
  const key = env.SEARCH_HUB_SEARXNG_API_KEY || env.SEARXNG_API_KEY;
  if (key) headers.authorization = `Bearer ${key}`;
  const data = await fetchJson(fetchImpl, url, {
    headers,
    signal: timeoutSignal(signal),
  });
  return (data.results ?? [])
    .slice(0, limit)
    .map((result) => ({
      title: String(result.title ?? "Untitled"),
      url: String(result.url ?? ""),
      snippet: decodeHtml(String(result.content ?? "")),
    }))
    .filter((result) => /^https?:\/\//i.test(result.url));
}

function configuredBackends(env) {
  return [
    ...(env.BRAVE_API_KEY || env.SEARCH_BRAVE_API_KEY ? ["brave"] : []),
    ...(env.SEARCH_HUB_SEARXNG_URL || env.SEARXNG_URL ? ["searxng"] : []),
    "duckduckgo",
  ];
}

async function runBackend(backend, query, limit, options) {
  if (backend === "brave") return searchBrave(query, limit, options);
  if (backend === "searxng") return searchSearxng(query, limit, options);
  return searchDuckDuckGo(query, limit, options);
}

function resultKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

export function mergeSearchResults(sourceResults, limit) {
  const merged = new Map();
  for (const { backend, results } of sourceResults) {
    results.forEach((result, rank) => {
      const key = resultKey(result.url);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...result,
          sources: [backend],
          score: 1 / (61 + rank),
        });
        return;
      }
      existing.score += 1 / (61 + rank);
      existing.sources.push(backend);
      if ((result.snippet?.length ?? 0) > (existing.snippet?.length ?? 0)) {
        existing.title = result.title;
        existing.snippet = result.snippet;
      }
    });
  }
  return [...merged.values()]
    .sort(
      (left, right) =>
        right.score - left.score || right.sources.length - left.sources.length,
    )
    .slice(0, limit)
    .map(({ score: _score, ...result }) => result);
}

export async function runSearch(
  { query, limit = 5, backend = "auto" },
  { fetchImpl = fetch, signal, env = process.env } = {},
) {
  const normalizedQuery = String(query ?? "").trim();
  if (!normalizedQuery) throw new Error("web_search requires a query");
  if (!BACKENDS.has(backend))
    throw new Error(`Unknown search backend: ${backend}`);
  const boundedLimit = Math.min(20, Math.max(1, Number(limit) || 5));
  const candidates = backend === "auto" ? configuredBackends(env) : [backend];
  const settled = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const results = await runBackend(
          candidate,
          normalizedQuery,
          boundedLimit,
          { fetchImpl, signal, env },
        );
        if (!results.length) throw new Error("no results");
        return { backend: candidate, results };
      } catch (error) {
        return { backend: candidate, error: sanitizeError(error), results: [] };
      }
    }),
  );
  const successful = settled.filter(({ results }) => results.length > 0);
  const errors = settled
    .filter(({ error }) => error)
    .map(({ backend: name, error }) => `${name}: ${error}`);
  if (!successful.length)
    throw new Error(`All search backends failed: ${errors.join("; ")}`);
  if (backend !== "auto" && errors.length) throw new Error(errors[0]);
  return {
    backend: candidates.length > 1 ? "combined" : candidates[0],
    backends: candidates,
    results: mergeSearchResults(successful, boundedLimit),
    errors,
  };
}

function formatResults(query, backend, backends, results, errors) {
  const lines = [
    `## Search results: ${query.replace(/[\r\n]+/g, " ")}`,
    `Mode: ${backend}`,
    `Sources queried: ${backends.join(", ")}`,
    "",
  ];
  if (errors.length) lines.push(`Source failures: ${errors.join("; ")}`, "");
  for (const [index, result] of results.entries()) {
    lines.push(`${index + 1}. ${result.title || "Untitled"}`);
    lines.push(`   ${result.url}`);
    lines.push(`   Sources: ${result.sources.join(", ")}`);
    if (result.snippet) lines.push(`   ${result.snippet.slice(0, 500)}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

export async function boundedOutput(
  output,
  toolCallId,
  {
    maxBytes = MAX_OUTPUT_BYTES,
    maxLines = MAX_OUTPUT_LINES,
    maxChars = Infinity,
  } = {},
) {
  const charBounded = output.slice(0, maxChars);
  const lines = charBounded.split(/\r?\n/);
  const lineBounded = lines.slice(0, maxLines).join("\n");
  const bytes = Buffer.from(lineBounded);
  const text = bytes.subarray(0, maxBytes).toString("utf8");
  const truncated =
    output.length > maxChars ||
    lines.length > maxLines ||
    bytes.length > maxBytes;
  if (!truncated) return { text: output, truncated: false, outputFile: null };

  const directory = await mkdtemp(join(tmpdir(), "pi-search-hub-"));
  const outputFile = join(
    directory,
    `${String(toolCallId).replace(/[^a-z0-9_-]/gi, "-")}.md`,
  );
  await writeFile(outputFile, output, "utf8");
  const limits = [
    `${maxBytes} bytes`,
    `${maxLines} lines`,
    ...(Number.isFinite(maxChars) ? [`${maxChars} characters`] : []),
  ];
  return {
    text: `${text}\n\n[Output truncated at ${limits.join(", ")}. Full output saved to: ${outputFile}]`,
    truncated: true,
    outputFile,
  };
}

export async function readWebPage(
  url,
  { fetchImpl = fetch, signal, env = process.env } = {},
) {
  const normalized = normalizePublicUrl(url);
  const readerUrl = `https://r.jina.ai/${normalized}`;
  const headers = { accept: "text/plain" };
  const key = env.JINA_API_KEY || env.SEARCH_JINA_API_KEY;
  if (key) headers.authorization = `Bearer ${key}`;
  const response = await fetchImpl(readerUrl, {
    headers,
    signal: timeoutSignal(signal),
  });
  const content = await readResponseText(response);
  if (!response.ok)
    throw new Error(
      `Jina Reader HTTP ${response.status}: ${sanitizeError(content)}`,
    );
  return { url: normalized, reader: "jina", content };
}

const searchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Web search query." },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
      description: "Maximum results; default 5.",
    },
    backend: {
      type: "string",
      enum: [...BACKENDS],
      description:
        "Optional backend override; auto queries every available provider and merges results.",
    },
  },
  required: ["query"],
  additionalProperties: false,
};

const readParameters = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "Public HTTP(S) URL or bare domain to read.",
    },
    maxChars: {
      type: "integer",
      minimum: 100,
      maximum: 20000,
      description: "Maximum returned characters; default 12000.",
    },
  },
  required: ["url"],
  additionalProperties: false,
};

export function registerSearchHub(
  pi,
  { fetchImpl = fetch, env = process.env } = {},
) {
  pi.registerCommand?.("search-hub", {
    description: "Search the web or read a public URL through Search Hub",
    handler(args, ctx) {
      const request = String(args ?? "").trim();
      if (!request) {
        ctx.ui.notify("Usage: /search-hub <research request or URL>", "info");
        return;
      }
      pi.sendUserMessage(
        [
          "Use web_search for discovery and web_read for relevant source pages.",
          "Answer concisely and cite the returned source URLs.",
          "",
          request,
        ].join("\n"),
        { deliverAs: "followUp" },
      );
    },
  });

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the live web through Search Hub. Auto mode queries every available source in parallel (configured Brave/SearXNG plus keyless DuckDuckGo), then merges and deduplicates results. Returns at most 20KB or 500 lines.",
    promptSnippet: "Search the live web through keyless or configured backends",
    promptGuidelines: [
      "Use web_search for current external facts, public code, and documentation; use repository tools for local code.",
      "Cite source URLs returned by web_search in research answers.",
    ],
    parameters: searchParameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      ctx.ui.setStatus("search-hub", "searching");
      onUpdate?.({ content: [{ type: "text", text: "Searching..." }] });
      try {
        const result = await runSearch(params, { fetchImpl, signal, env });
        const bounded = await boundedOutput(
          formatResults(
            params.query,
            result.backend,
            result.backends,
            result.results,
            result.errors,
          ),
          toolCallId,
        );
        return {
          content: [{ type: "text", text: bounded.text }],
          details: {
            backend: result.backend,
            backends: result.backends,
            resultCount: result.results.length,
            sourceErrors: result.errors,
            truncated: bounded.truncated,
            outputFile: bounded.outputFile,
          },
        };
      } finally {
        ctx.ui.setStatus("search-hub", undefined);
      }
    },
  });

  pi.registerTool({
    name: "web_read",
    label: "Read Web Page",
    description:
      "Read a public HTTP(S) URL as clean markdown through Jina Reader. Private/internal hosts are blocked. Returns at most 20KB or 500 lines.",
    promptSnippet: "Read a public web page as clean markdown",
    promptGuidelines: [
      "Use web_read after web_search when a source page must be inspected.",
      "Cite the original URL supplied to web_read, not the Jina Reader proxy URL.",
    ],
    parameters: readParameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      ctx.ui.setStatus("search-hub", "reading");
      onUpdate?.({ content: [{ type: "text", text: "Reading..." }] });
      try {
        const result = await readWebPage(params.url, {
          fetchImpl,
          signal,
          env,
        });
        const maxChars = Math.min(
          20_000,
          Math.max(100, Number(params.maxChars) || 12_000),
        );
        const bounded = await boundedOutput(result.content, toolCallId, {
          maxChars,
        });
        return {
          content: [{ type: "text", text: bounded.text }],
          details: {
            url: result.url,
            reader: result.reader,
            length: result.content.length,
            truncated: bounded.truncated,
            outputFile: bounded.outputFile,
          },
        };
      } finally {
        ctx.ui.setStatus("search-hub", undefined);
      }
    },
  });
}

export default function searchHubExtension(pi) {
  registerSearchHub(pi);
}
