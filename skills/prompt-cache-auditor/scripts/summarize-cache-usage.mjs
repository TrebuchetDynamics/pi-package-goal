#!/usr/bin/env node
import fs from "node:fs";

const args = process.argv.slice(2);
const requireRead = args.includes("--require-read");
const pathArg = args.find((arg) => arg !== "--require-read" && arg !== "-");

function usage() {
  console.error("usage: summarize-cache-usage.mjs [--require-read] [response.json]");
}

let text;
try {
  text = pathArg ? fs.readFileSync(pathArg, "utf8") : fs.readFileSync(0, "utf8");
} catch (error) {
  usage();
  console.error(`error: ${error.message}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(text);
} catch (error) {
  console.error(`error: input is not JSON: ${error.message}`);
  process.exit(1);
}

const interestingFields = new Set([
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "cached_tokens",
  "cachedContentTokenCount",
  "cached_content_token_count",
  "cacheReadInputTokenCount",
  "cacheWriteInputTokenCount",
  "input_tokens",
  "inputTokens",
  "inputTokenCount",
  "prompt_tokens",
  "promptTokenCount",
  "output_tokens",
  "completion_tokens",
  "candidatesTokenCount",
]);

const readFields = new Set([
  "cache_read_input_tokens",
  "cached_tokens",
  "cachedContentTokenCount",
  "cached_content_token_count",
  "cacheReadInputTokenCount",
]);

const writeFields = new Set([
  "cache_creation_input_tokens",
  "cacheWriteInputTokenCount",
]);

const totalFields = new Set([
  "input_tokens",
  "inputTokens",
  "inputTokenCount",
  "prompt_tokens",
  "promptTokenCount",
]);

const anthropicReadOrWriteFields = new Set([
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
]);

const bedrockReadOrWriteFields = new Set([
  "cacheReadInputTokenCount",
  "cacheWriteInputTokenCount",
]);

const fields = [];

function walk(value, trail = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childTrail = `${trail}.${key}`;
    if (interestingFields.has(key) && typeof child === "number" && Number.isFinite(child)) {
      fields.push({ path: childTrail, key, value: child });
    }
    walk(child, childTrail);
  }
}

walk(data);

const sumBy = (set) => fields
  .filter((field) => set.has(field.key))
  .reduce((total, field) => total + field.value, 0);

const cacheRead = sumBy(readFields);
const cacheWrite = sumBy(writeFields);
const promptTokenTotals = fields.filter((field) => totalFields.has(field.key)).map((field) => field.value);
const promptTokenTotal = promptTokenTotals.length ? Math.max(...promptTokenTotals) : 0;
const nonCachedInput = fields
  .filter((field) => field.key === "input_tokens" || field.key === "inputTokens" || field.key === "inputTokenCount")
  .reduce((total, field) => total + field.value, 0);
const hasAnthropicCounters = fields.some((field) => anthropicReadOrWriteFields.has(field.key));
const hasBedrockCounters = fields.some((field) => bedrockReadOrWriteFields.has(field.key));
const denominator = hasAnthropicCounters || hasBedrockCounters
  ? cacheRead + cacheWrite + nonCachedInput
  : promptTokenTotal || cacheRead + cacheWrite;
const hitRate = denominator > 0 ? cacheRead / denominator : undefined;

console.log(`PROMPT_CACHE_SUMMARY: cache_read_detected=${cacheRead > 0 ? "yes" : "no"}`);
console.log(`cache_read_tokens: ${cacheRead}`);
console.log(`cache_write_tokens: ${cacheWrite}`);
if (promptTokenTotal) console.log(`prompt_or_input_tokens: ${promptTokenTotal}`);
if (hitRate !== undefined) console.log(`hit_rate_estimate: ${(hitRate * 100).toFixed(2)}%`);

if (fields.length) {
  console.log("fields:");
  for (const field of fields.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`- ${field.path}: ${field.value}`);
  }
} else {
  console.log("fields: none");
}

if (requireRead && cacheRead <= 0) process.exit(2);
