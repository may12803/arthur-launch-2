import { NextResponse } from "next/server";
import { connectorsServerSecret, safeEqual } from "@/lib/client-portal/connector-api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { deliverWebhook, type Delivery } from "@/lib/client-portal/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const given = req.headers.get("x-connectors-secret") || "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const db = loveleedayAnon();
  const due = await db.rpc("webhook_deliveries_due", { p_secret: secret, p_limit: 20 });
  if (due.error) return NextResponse.json({ error: "Deliveries could not be loaded." }, { status: 502 });
  let delivered = 0, retry = 0, failed = 0;
  for (const row of (due.data ?? []) as Delivery[]) {
    const result = await deliverWebhook(row, { record: async (id, update) => {
      const saved = await db.rpc("webhook_delivery_record", { p_secret: secret, p_id: id, p_status: update.status, p_response_code: update.response_code, p_attempt: update.attempt, p_next_at: update.next_at });
      if (saved.error) throw new Error("Delivery result could not be saved.");
    } });
    if (result.status === "delivered") delivered++;
    else if (result.status === "retry") retry++;
    else failed++;
  }
  return NextResponse.json({ delivered, retry, failed });
}

export const GET = handle;
export const POST = handle;
