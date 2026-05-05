import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Live benchmark leaderboard — reads from the Fly /data volume so it
// updates in real-time as Arthur's local benchmark runner POSTs new rows.
// Falls back to the static public/benchmarks.json if /data isn't seeded yet.
//
// IMPORTANT: this route lives at /api/bench-live/* (NOT /api/benchmarks/*)
// because /api/benchmarks is in middleware.ts PROXIED_PREFIXES and gets
// rewritten to arthur-ai. The bench-live prefix stays local to arthur-online.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIVE_PATH = "/data/benchmarks/leaderboard.jsonl";

interface BenchRow {
  ts: string;
  benchmark: string;
  score: number;
  total: number;
  pass_rate?: number;
  model?: string;
  opts?: Record<string, unknown>;
  run_dir?: string;
}

function readLeaderboard(): BenchRow[] {
  try {
    if (!fs.existsSync(LIVE_PATH)) return [];
    const txt = fs.readFileSync(LIVE_PATH, "utf8");
    return txt
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) as BenchRow; } catch { return null; }
      })
      .filter((r): r is BenchRow => r !== null);
  } catch {
    return [];
  }
}

export async function GET() {
  const rows = readLeaderboard();
  // Group by benchmark, return latest + history per benchmark.
  const grouped: Record<string, BenchRow[]> = {};
  for (const r of rows) {
    const k = r.benchmark || "unknown";
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(r);
  }
  const benchmarks = Object.entries(grouped).map(([name, runs]) => {
    runs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    const latest = runs[0];
    const passRate = latest.pass_rate ?? latest.score / latest.total;
    return {
      id: name,
      name,
      latest: {
        score: passRate,
        passed: latest.score,
        total: latest.total,
        model: latest.model,
        ranAt: latest.ts,
      },
      history: runs.slice(1, 11).map((r) => ({
        score: r.pass_rate ?? r.score / r.total,
        ranAt: r.ts,
        model: r.model,
        passed: r.score,
        total: r.total,
      })),
      totalRuns: runs.length,
    };
  });
  return NextResponse.json({
    benchmarks,
    totalRows: rows.length,
    lastUpdated: rows[rows.length - 1]?.ts ?? null,
    livePath: LIVE_PATH,
    ok: true,
  });
}
