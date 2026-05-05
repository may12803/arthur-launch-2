#!/usr/bin/env node
/**
 * watch-benchmarks.js
 * Watches ~/.arthur/data/benchmarks/leaderboard.jsonl for changes.
 * On every new line appended, re-runs snapshot-benchmarks.js to refresh
 * public/benchmarks.json. Couple this with a Vercel deploy hook (or a
 * dev-mode `next dev`) to get effectively-real-time benchmark updates
 * on arthur-online.
 *
 * Run:
 *   node scripts/watch-benchmarks.js
 *   nohup node scripts/watch-benchmarks.js > /tmp/bench-watch.log 2>&1 &
 */

import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";

const HOME = os.homedir();
const TARGET = path.join(HOME, ".arthur", "data", "benchmarks", "leaderboard.jsonl");
const SNAPSHOT = path.join(import.meta.dirname, "snapshot-benchmarks.js");

let lastSize = 0;
try { lastSize = fs.statSync(TARGET).size; } catch {}

function snap(reason) {
  console.log(`[${new Date().toISOString()}] ${reason} → re-snapshotting…`);
  const r = spawnSync("node", [SNAPSHOT], { encoding: "utf8" });
  if (r.status === 0) {
    const lastLine = (r.stdout || "").trim().split("\n").pop();
    console.log(`  ✓ ${lastLine}`);
  } else {
    console.error("  ✗ snapshot failed:", (r.stderr || "").slice(0, 300));
  }
}

// Initial snapshot on startup
snap("watcher start");

// Poll every 5s — file watching on macOS is unreliable across editors,
// poll-on-stat is simpler and good enough at this granularity.
setInterval(() => {
  try {
    const sz = fs.statSync(TARGET).size;
    if (sz !== lastSize) {
      lastSize = sz;
      snap(`leaderboard.jsonl changed (now ${sz} bytes)`);
    }
  } catch {}
}, 5000);

console.log(`[watch-benchmarks] watching ${TARGET} every 5s`);
