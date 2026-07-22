#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
let category;
let limit = 8;
const queryParts = [];

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--category") category = args[++i];
  else if (args[i] === "--limit") limit = Number(args[++i]);
  else queryParts.push(args[i]);
}

if (!Number.isInteger(limit) || limit < 1 || limit > 50 || category === undefined && args.includes("--category")) {
  console.error("Usage: search-catalog.mjs [query] [--category slug] [--limit 1..50]");
  process.exit(2);
}

const catalogPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../references/catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const categories = category ? catalog.categories.filter((item) => item.category === category) : catalog.categories;

if (category && categories.length === 0) {
  console.error(`Unknown category: ${category}`);
  process.exit(2);
}

const terms = queryParts.join(" ").toLowerCase().match(/[a-z0-9][a-z0-9+./-]*/g) ?? [];
if (!terms.length && !category) {
  for (const item of catalog.categories) console.log(`${item.category}\t${item.resources.length}`);
  process.exit(0);
}

const matches = categories.flatMap((item) => item.resources.map((resource) => {
  const name = resource.name.toLowerCase();
  const text = `${item.category} ${name} ${resource.description} ${resource.pricing}`.toLowerCase();
  const score = terms.reduce((total, term) => total + (name.includes(term) ? 3 : 0) + (text.includes(term) ? 1 : 0), 0);
  return { ...resource, category: item.category, score };
})).filter((item) => !terms.length || item.score > 0)
  .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  .slice(0, limit);

if (!matches.length) {
  console.log("No matching resources.");
  process.exit(0);
}

for (const item of matches) {
  console.log(`- ${item.name} [${item.category}] — ${item.url}`);
  console.log(`  ${item.description}`);
  console.log(`  Snapshot pricing/license: ${item.pricing}`);
}
