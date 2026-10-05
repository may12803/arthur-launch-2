import { NextResponse } from "next/server";
import { connectorsServerSecret, safeEqual } from "@/lib/client-portal/connector-api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { refreshMarket } from "@/lib/market/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily market data refresh (FRED, BLS, EIA). Re-pulls the last two years so revised prints overwrite; upserts, so reruns are safe.
async function handle(req: Request) {
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const given = req.headers.get("x-connectors-secret") || "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const db = loveleedayAnon();
  const report = await refreshMarket({
    years: 2,
    keys: { FRED_API_KEY: process.env.FRED_API_KEY, BLS_API_KEY: process.env.BLS_API_KEY, EIA_API_KEY: process.env.EIA_API_KEY },
    sink: async (series, obs) => {
      for (let i = 0; i === 0 || i < obs.length; i += 2500) {
        const r = await db.rpc("market_upsert", { p_secret: secret, p_series: i === 0 ? series : [], p_obs: obs.slice(i, i + 2500) });
        if (r.error) throw new Error(`market_upsert failed: ${r.error.message}`);
      }
    },
  });
  const failed = report.filter((r) => r.error);
  const fetched = report.reduce((n, r) => n + r.fetched, 0);
  console.log(`[market-refresh] series=${report.length} fetched=${fetched} failed=${failed.length}${failed.length ? " " + failed.map((f) => `${f.series}:${f.error}`).join("; ") : ""}`);
  return NextResponse.json({ series: report.length, fetched, failed: failed.map((f) => ({ series: f.series, error: f.error })) }, { status: failed.length ? 207 : 200 });
}

export const GET = handle;
export const POST = handle;
