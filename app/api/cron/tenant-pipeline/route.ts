import { NextRequest, NextResponse } from "next/server";
import { connectorsServerSecret, safeEqual } from "@/lib/client-portal/connector-api";
import { engineFromEnv } from "@/lib/engine/pg";
import { runClientTenants } from "@/lib/engine/run";
import { isLoopback } from "@/lib/engine/loopback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Client-tenant engine pipeline (ingested_records -> client ontology -> gated task proposals + approvals), on Fly, never the Mac.
// Two guards: loopback only (anything that came through the Fly proxy is refused before the secret is even compared) and the
// constant-time x-connectors-secret, failing closed when unset. Response: per-tenant counts only, never payloads or values.
export async function POST(req: NextRequest) {
  if (!isLoopback(req.headers)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const given = req.headers.get("x-connectors-secret") || "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  let engine;
  try { engine = engineFromEnv(); } catch { return NextResponse.json({ error: "Not configured." }, { status: 503 }); }
  try {
    const results = await runClientTenants(engine);
    return NextResponse.json({ tenants: results.length, results: results.map(({ error, ...r }) => ({ ...r, ...(error ? { error: error.slice(0, 200) } : {}) })) });
  } catch (e) {
    console.log(`[tenant-pipeline] FAILED before any tenant ran: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    return NextResponse.json({ error: "tenant pipeline could not list due tenants" }, { status: 502 });
  }
}
