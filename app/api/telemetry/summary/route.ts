import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hoursParam = req.nextUrl.searchParams.get("hours");
  const hours = hoursParam ? Math.min(Math.max(parseInt(hoursParam) || 24, 1), 168) : 24;

  try {
    const telemetryPath = process.env.HOME
      ? join(process.env.HOME, "arthur/lib/telemetry.js")
      : null;
    if (!telemetryPath || !existsSync(telemetryPath)) {
      throw new Error("telemetry module not found");
    }
    // Dynamic require so the module resolves at runtime on the server, not at build time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getTelemetrySummary } = require(telemetryPath);
    const data = await getTelemetrySummary({ hours });
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("[telemetry/summary]", err);
    // If telemetry lib isn't available (e.g. on hosted Fly build), return a stub
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      range_hours: hours,
      error: "telemetry temporarily unavailable",
      kpi: {
        queries_today: 0,
        avg_confidence: null,
        total_cost_usd: 0,
        p99_latency_ms: 0,
        p50_latency_ms: 0,
        hallucination_count: 0,
        daniel_corrections: { minor: 0, major: 0, complete_reroute: 0 },
        golden_pass_rate: null,
      },
      queries_per_hour: [],
      specialist_hit_rates: [],
      composite_score_trend: [],
      cost_breakdown: [],
      low_confidence_turns: [],
      golden_last_run: null,
    });
  }
}
