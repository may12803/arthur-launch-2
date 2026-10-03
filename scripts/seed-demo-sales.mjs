#!/usr/bin/env node
/**
 * Harbor & Vine (demo) — synthetic nightly sales in the SAME row format as the
 * Dabney Toast export (~/.arthur/data/dabney-toast-sales.jsonl):
 *   {date, orders, checks, guests, netSales, grossSales, avgCheck}
 * Deterministic (seeded). Plants three effects of KNOWN additive size on netSales.
 *
 *   node scripts/seed-demo-sales.mjs [--out DIR] [--seed N] [--print-truth]
 * Default out: ~/.arthur/data/tenants/harbor-vine-demo/  (toast-sales.jsonl + planted-effects.json)
 * Fictional data. Not a real business.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEED = Number(opt("--seed", 20261003));
const OUT = opt("--out", join(homedir(), ".arthur/data/tenants/harbor-vine-demo"));
const END = "2026-10-02", DAYS = 90;

function rng(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(SEED);
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

// Baseline mean net sales by weekday (Sun=0). Monday closed.
const BASE = { 0: 1250, 1: null, 2: 780, 3: 1010, 4: 1380, 5: 2650, 6: 3050 };
const NOISE = 0.11; // multiplicative sd

// Planted effects: additive dollars on netSales, applied after noise so truth is exact.
export const EFFECTS = [
  { id: "thursday_flight_night", kind: "recurring_lift", label: "Vine & Vinyl Thursday wine-flight night launched", deltaNet: 420,
    dates: ["2026-08-13", "2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"] },
  { id: "cellar_release_first_friday", kind: "calendar_lift", label: "Cellar Release first-Friday event", deltaNet: 650,
    dates: ["2026-08-07", "2026-09-04", "2026-10-02"] },
  { id: "water_main_outage", kind: "one_off_drop", label: "Water main break, early close", deltaNet: -1000, dates: ["2026-09-12"] },
];
const delta = new Map();
for (const e of EFFECTS) for (const d of e.dates) delta.set(d, (delta.get(d) || 0) + e.deltaNet);

const rows = [];
const end = Date.parse(END + "T00:00:00Z");
for (let i = DAYS - 1; i >= 0; i--) {
  const t = end - i * 86400000;
  const date = new Date(t).toISOString().slice(0, 10);
  const dow = new Date(t).getUTCDay();
  const base = BASE[dow];
  if (base == null) continue;
  // draw for every open day so the stream is stable when effects change
  const z = normal(), g = rand(), c = rand();
  let net = base * Math.exp(NOISE * z - (NOISE * NOISE) / 2) + (delta.get(date) || 0);
  net = Math.max(120, Math.round(net * 100) / 100);
  const avgCheck = 41 + 9 * g + (dow >= 5 ? 5 : 0);
  const checks = Math.max(4, Math.round(net / avgCheck));
  const guests = Math.round(checks * (1.9 + 0.5 * c));
  const orders = Math.max(checks - 2, Math.round(checks * (0.95 + 0.1 * c)));
  const grossSales = Math.round(net * (1.28 + 0.06 * g) * 100) / 100;
  rows.push({ date, orders, checks, guests, netSales: net, grossSales, avgCheck: Math.round((net / checks) * 100) / 100 });
}
rows.reverse(); // Dabney's export is newest-first

const truth = { tenant: "Harbor & Vine (demo)", synthetic: true, seed: SEED, window: { start: rows.at(-1).date, end: rows[0].date }, nights: rows.length,
  note: "deltaNet is added to netSales after noise: exact truth. Baseline weekday means: " + JSON.stringify(BASE), effects: EFFECTS };

if (args.includes("--print-truth")) { console.log(JSON.stringify(truth, null, 2)); process.exit(0); }
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "toast-sales.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(join(OUT, "planted-effects.json"), JSON.stringify(truth, null, 2) + "\n");
console.log(`wrote ${rows.length} nights ${truth.window.start}..${truth.window.end} -> ${OUT}`);
