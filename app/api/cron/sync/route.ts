import { NextRequest, NextResponse } from "next/server";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { connectorsServerSecret, safeEqual } from "@/lib/client-portal/connector-api";
import { runDueConnections, type DueConnection } from "@/lib/client-portal/connector-runner-shim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled sync entry point. Guarded by the x-connectors-secret header, compared in constant time against the
// connectors server secret; no cookie, no session. Fails closed when the secret is not configured.
async function handle(req: NextRequest) {
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const given = req.headers.get("x-connectors-secret") || "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { data, error } = await loveleedayAnon().rpc("connections_due", { p_secret: secret });
  if (error) return NextResponse.json({ error: `connections_due: ${error.message}` }, { status: 502 });
  const summary = await runDueConnections((data ?? []) as DueConnection[]);
  return NextResponse.json(summary, { status: summary.runner === "unmerged" && summary.due > 0 ? 202 : 200 });
}

export const GET = handle;
export const POST = handle;
