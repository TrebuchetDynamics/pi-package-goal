import { createHash } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const KETCH_VERSION = "0.11.0";
const MAX_OUTPUT_BYTES = 50 * 1024;
const MAX_OUTPUT_LINES = 2000;
const RELEASE_BASE = `https://github.com/1broseidon/ketch/releases/download/v${KETCH_VERSION}`;
const CHECKSUMS = {
  "darwin-arm64": "8cc6039ac4911e3cee326a0fc9d3db43fb8529f7dc8e3e942674f8e7a09f56ed",
  "darwin-x64": "0e2b3defcc89df5ab6d5786b9c276483a23fcb933838d9744c0216b5bd150f54",
  "linux-arm64": "e8a9415220229e50a4610d16a3e8d482a22fe6d9bddd8fde0756a9934ba94db8",
  "linux-x64": "23987ba72fac0d9e58592bdf610b530c6bcf577f47b33a9845dd45fbdf410c92",
  "win32-arm64": "c3e6cfb1a6da168e255a09edb5cd49d5f058a9bbd072c5b1568fb008add46a0d",
  "win32-x64": "d9be9d010981b9d21b4e3fb8c6587ee2c6b2399a8d51b75a9d38017c3bf78ae4",
};
const SURFACES = new Set(["search", "code", "docs", "scrape", "crawl"]);
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

function urlsFrom(request) {
  return (request.match(URL_RE) ?? []).map((url) => url.replace(/[),.;!?]+$/, ""));
}

export function inferSurface({ request = "", surface, language } = {}) {
  if (surface) {
    if (!SURFACES.has(surface)) throw new Error(`Unknown ketch surface: ${surface}`);
    return surface;
  }
  const text = request.toLowerCase();
  const urls = urlsFrom(request);
  if (urls.length && /\b(?:crawl|site|website|all pages)\b/.test(text)) return "crawl";
  if (urls.length) return "scrape";
  if (language || /\b(?:code|source|implementation|example usage|github)\b/.test(text)) return "code";
  if (/\b(?:docs?|documentation|api reference|library)\b/.test(text)) return "docs";
  return "search";
}

export function buildKetchArgs(input = {}) {
  const request = String(input.request ?? "").trim();
  if (!request) throw new Error("ketch requires a request");
  const surface = inferSurface({ ...input, request });
  const limit = Math.min(20, Math.max(1, Number(input.limit) || 5));
  const maxChars = Math.min(20_000, Math.max(100, Number(input.maxChars) || 6000));

  if (surface === "scrape") {
    const urls = urlsFrom(request);
    if (!urls.length) throw new Error("ketch scrape requires at least one URL");
    return ["scrape", ...urls, "--max-chars", String(maxChars), "--trim", "--json"];
  }
  if (surface === "crawl") {
    const [url] = urlsFrom(request);
    if (!url) throw new Error("ketch crawl requires a URL");
    return ["crawl", url, "--depth", "2", "--json"];
  }

  const args = [surface, request, "--limit", String(limit)];
  if (surface === "code" && input.language) args.push("--lang", String(input.language));
  args.push("--json");
  return args;
}

function normalizeKetchOutput(surface, stdout) {
  const text = stdout.trim();
  try {
    if (surface === "crawl") {
      return JSON.stringify(text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)), null, 2);
    }
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    throw new Error(`ketch returned invalid JSON for ${surface}`);
  }
}

async function probeBinary(pi, binary, signal) {
  try {
    const result = await pi.exec(binary, ["--version"], { signal, timeout: 10_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

export function releaseAsset(platform = process.platform, arch = process.arch) {
  const checksum = CHECKSUMS[`${platform}-${arch}`];
  if (!checksum) throw new Error(`Unsupported platform for automatic Ketch install: ${platform}/${arch}`);
  const os = platform === "win32" ? "windows" : platform;
  const cpu = arch === "x64" ? "x86_64" : arch;
  const extension = platform === "win32" ? "zip" : "tar.gz";
  return {
    name: `ketch_${KETCH_VERSION}_${os}_${cpu}.${extension}`,
    checksum,
    executable: platform === "win32" ? "ketch.exe" : "ketch",
  };
}

export function verifyChecksum(data, expected) {
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expected) throw new Error(`Ketch release checksum mismatch: expected ${expected}, got ${actual}`);
}

function cacheDirectory(env = process.env) {
  return join(env.XDG_CACHE_HOME || join(env.HOME || homedir(), ".cache"), "pi-package-goal", "ketch", `v${KETCH_VERSION}`);
}

function cachedBinary(env = process.env, platform = process.platform, arch = process.arch) {
  return join(cacheDirectory(env), releaseAsset(platform, arch).executable);
}

export async function installKetch(pi, {
  signal,
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = fetch,
} = {}) {
  const asset = releaseAsset(platform, arch);
  const directory = cacheDirectory(env);
  const binary = join(directory, asset.executable);
  const archive = join(directory, platform === "win32" ? `ketch-${process.pid}.zip` : `ketch-${process.pid}.tar.gz`);
  await mkdir(directory, { recursive: true });

  const response = await fetchImpl(`${RELEASE_BASE}/${asset.name}`, { signal });
  if (!response.ok) throw new Error(`Ketch download failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  verifyChecksum(data, asset.checksum);
  await writeFile(archive, data);

  try {
    const result = platform === "win32"
      ? await pi.exec("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archive,
        directory,
      ], { signal, timeout: 60_000 })
      : await pi.exec("tar", ["-xzf", archive, "-C", directory], { signal, timeout: 60_000 });
    if (result.code !== 0) throw new Error(`Ketch extraction failed: ${(result.stderr || result.stdout).trim()}`);
    if (platform !== "win32") await chmod(binary, 0o755);
  } finally {
    await rm(archive, { force: true });
  }
  return binary;
}

let installPromise;

export async function ensureKetch(pi, {
  signal,
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  install,
} = {}) {
  if (env.KETCH_BIN) {
    if (await probeBinary(pi, env.KETCH_BIN, signal)) return { binary: env.KETCH_BIN, installed: false };
    throw new Error(`KETCH_BIN is not executable: ${env.KETCH_BIN}`);
  }
  if (await probeBinary(pi, "ketch", signal)) return { binary: "ketch", installed: false };

  const cached = cachedBinary(env, platform, arch);
  if (await probeBinary(pi, cached, signal)) return { binary: cached, installed: false };

  const binary = install
    ? await install(pi, { signal, env, platform, arch })
    : await (installPromise ??= installKetch(pi, { signal, env, platform, arch }).finally(() => { installPromise = undefined; }));
  if (!await probeBinary(pi, binary, signal)) throw new Error(`Ketch installation did not produce an executable binary: ${binary}`);
  return { binary, installed: true };
}

function classifyError(code) {
  return ({ 2: "validation", 3: "not_found", 4: "upstream", 5: "precondition", 6: "cancelled" })[code] ?? "failed";
}

async function boundedOutput(output, toolCallId) {
  const lines = output.split(/\r?\n/);
  const lineBounded = lines.length > MAX_OUTPUT_LINES ? lines.slice(0, MAX_OUTPUT_LINES).join("\n") : output;
  const byteBounded = Buffer.from(lineBounded).subarray(0, MAX_OUTPUT_BYTES).toString("utf8");
  const truncated = lineBounded !== output || byteBounded !== lineBounded;
  if (!truncated) return { text: output, truncated: false, outputFile: null };

  const outputFile = join(tmpdir(), `pi-ketch-${String(toolCallId).replace(/[^a-z0-9_-]/gi, "-")}.json`);
  await writeFile(outputFile, output, "utf8");
  return {
    text: `${byteBounded}\n\n[Output truncated at 50KB or 2000 lines. Full output saved to: ${outputFile}]`,
    truncated: true,
    outputFile,
  };
}

const parameters = {
  type: "object",
  properties: {
    request: { type: "string", description: "Natural-language research request or URL. The ketch surface is inferred automatically." },
    surface: { type: "string", enum: ["search", "code", "docs", "scrape", "crawl"], description: "Optional override when automatic routing is wrong." },
    language: { type: "string", description: "Optional language hint for public code search." },
    limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum search results; default 5." },
    maxChars: { type: "integer", minimum: 100, maximum: 20000, description: "Per-page scrape limit; default 6000." },
  },
  required: ["request"],
  additionalProperties: false,
};

export default function ketchExtension(pi) {
  pi.registerTool({
    name: "ketch",
    label: "Ketch",
    description: "Automatically route a research request to Ketch web search, public code search, library docs, page scraping, or bounded site crawling. Installs a pinned Ketch binary into the user cache when missing.",
    promptSnippet: "Research the live web, public code, library docs, or a URL through Ketch",
    promptGuidelines: [
      "Use ketch for external research and known public URLs; use repository tools for the local codebase.",
      "Cite source URLs returned by ketch in research answers.",
    ],
    parameters,
    async execute(toolCallId, params, signal) {
      const surface = inferSurface(params);
      const args = buildKetchArgs(params);
      const resolved = await ensureKetch(pi, { signal });
      const result = await pi.exec(resolved.binary, args, { signal, timeout: surface === "crawl" ? 180_000 : 60_000 });
      if (result.code !== 0) {
        const detail = (result.stderr || result.stdout || "unknown error").trim().slice(0, 4000);
        throw new Error(`[${classifyError(result.code)}] ketch ${surface} failed (${result.code}): ${detail}`);
      }
      const output = normalizeKetchOutput(surface, result.stdout);
      const bounded = await boundedOutput(output, toolCallId);
      return {
        content: [{ type: "text", text: bounded.text }],
        details: {
          surface,
          args,
          binary: resolved.binary,
          installed: resolved.installed,
          truncated: bounded.truncated,
          outputFile: bounded.outputFile,
        },
      };
    },
  });
}
