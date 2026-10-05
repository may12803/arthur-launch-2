#!/usr/bin/env node
// Prove a DB test can fail: replace one exact snippet in a migration, run `npm run test:db`, expect at least one FAIL, restore.
// Usage: node scripts/sql-mutation-check.mjs <migration-file> <exact-snippet> <replacement>
// Exit 0 = the mutation was caught (tests went red); exit 1 = it survived (the guarded line is not tested); the file is always restored.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [file, from, to] = process.argv.slice(2);
if (!file || from === undefined || to === undefined) { console.error("usage: sql-mutation-check.mjs <file> <snippet> <replacement>"); process.exit(64); }
const original = readFileSync(file, "utf8");
const n = original.split(from).length - 1;
if (n !== 1) { console.error(`snippet must match exactly once, matched ${n}`); process.exit(64); }
try {
  writeFileSync(file, original.replace(from, to));
  const r = spawnSync("npm", ["run", "-s", "test:db"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
  console.log(out.split("\n").find((l) => l.startsWith("RESULT")) || "no RESULT line");
  for (const l of fails.slice(0, 5)) console.log("  " + l);
  console.log(fails.length ? "CAUGHT" : "SURVIVED");
  process.exitCode = fails.length ? 0 : 1;
} finally {
  writeFileSync(file, original);
}
