import { NextResponse } from "next/server";
import { buildCatalog } from "@/lib/client-portal/connector-ui";
import { connectorAvailable } from "@/lib/client-portal/connector-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Access-Control-Allow-Origin": "https://loveleedaystudios.com",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "public, max-age=300",
};

// Public, unauthenticated, no tenant data: only whether each catalog connector can be connected today.
export async function GET() {
  const connectors: Record<string, "available" | "coming_soon"> = {};
  for (const e of buildCatalog([])) connectors[e.key] = connectorAvailable(e) ? "available" : "coming_soon";
  return NextResponse.json({ updated_at: new Date().toISOString(), connectors }, { headers: HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}
