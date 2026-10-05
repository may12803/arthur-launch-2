#!/usr/bin/env node
// Builds lib/client-portal/connector-reads.json ({key: reads}) from the public site's integrations.json.
// Usage: node scripts/gen-connector-reads.mjs [path/to/integrations.json]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2] || process.env.INTEGRATIONS_JSON || "/Users/danielmay/wt/ll-guard/src/content/integrations.json";
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../lib/client-portal/connector-reads.json");
const items = JSON.parse(readFileSync(src, "utf8")).items ?? [];
const map = {};
for (const i of items) if (i.key && typeof i.reads === "string" && i.reads.trim()) map[i.key] = i.reads.trim();
writeFileSync(out, JSON.stringify(map, null, 2) + "\n");
console.log(`${Object.keys(map).length} connectors -> ${out}`);
