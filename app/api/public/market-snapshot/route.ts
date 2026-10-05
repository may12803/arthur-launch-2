import { NextResponse } from "next/server";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { shapeRow, type SnapshotRow } from "@/lib/market/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Access-Control-Allow-Origin": "https://loveleedaystudios.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
};

// Public, unauthenticated, no tenant data. Anon role + RLS return only public_ok series, so third-party copyright series
// (UMich sentiment, IMF copper and aluminum) can never appear here regardless of what this code does.
export async function GET() {
  const { data, error } = await loveleedayAnon().rpc("market_snapshot_rows");
  if (error) return NextResponse.json({ error: "Market data is unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  const series = ((data ?? []) as SnapshotRow[]).filter((r) => r.public_ok).map(shapeRow);
  return NextResponse.json({ generated_at: new Date().toISOString(), series }, { headers: HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}
