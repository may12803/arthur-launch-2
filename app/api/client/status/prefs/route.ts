import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { clip, dbFail } from "@/lib/client-portal/connector-api";
import { NOTIFY_EVENTS } from "@/lib/client-portal/connector-ui";

export const runtime = "nodejs";

// Per-member notification preferences for the status page. Each person sets their own; the RPC keys the row by the
// caller's user id. CONTRACT GAP: notification_prefs_set(p_tenant, p_events text[], p_email boolean) and its table
// are not in CONTRACT.md. Until they exist the screen shows this route's error rather than pretending it saved.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  const body = await req.json().catch(() => ({}));
  const events = (Array.isArray(body.events) ? body.events.map((e: unknown) => clip(e, 40)) : []).filter((e: string) => NOTIFY_EVENTS.includes(e));
  const { error } = await ctx.supabase.rpc("notification_prefs_set", { p_tenant: ctx.tenantId, p_events: events, p_email: body.email !== false });
  if (error) return dbFail(error.message, "Could not save notification preferences");
  return NextResponse.json({ ok: true });
}
