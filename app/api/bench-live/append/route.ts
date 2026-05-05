import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// POST endpoint — Arthur's local benchmark runner calls this after each
// benchmark run to append a leaderboard row to the Fly /data volume.
// Authentication: relies on the middleware.ts Bearer-injection (any caller
// hitting this endpoint already passed Basic Auth + carries the bearer).
//
// Request body: { ts, benchmark, score, total, pass_rate?, model?, opts?, run_dir? }
// Or array of those for batch.

export const dynamic = "force-dynamic";

const LIVE_PATH = "/data/benchmarks/leaderboard.jsonl";

function ensureDir() {
  try { fs.mkdirSync(path.dirname(LIVE_PATH), { recursive: true }); } catch {}
}

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

function isValid(r: unknown): r is BenchRow {
  if (!r || typeof r !== "object") return false;
  const row = r as Record<string, unknown>;
  return (
    typeof row.ts === "string" &&
    typeof row.benchmark === "string" &&
    typeof row.score === "number" &&
    typeof row.total === "number"
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const rows = Array.isArray(body) ? body : [body];
  const valid = rows.filter(isValid);
  if (valid.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no valid rows. need {ts, benchmark, score, total}" },
      { status: 400 }
    );
  }
  ensureDir();
  const lines = valid.map((r) => JSON.stringify(r)).join("\n") + "\n";
  try {
    fs.appendFileSync(LIVE_PATH, lines);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true, appended: valid.length, livePath: LIVE_PATH });
}
