import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { clip, dbFail, isAdminRole } from "@/lib/client-portal/connector-api";
import { WEBHOOK_EVENTS } from "@/lib/client-portal/connector-ui";

export const runtime = "nodejs";

// A webhook target must be public HTTPS. Literal private, loopback and link-local hosts are refused here; the sender
// repeats the check on the resolved address before every delivery (DNS can change after this validation).
function badTarget(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "That is not a valid address."; }
  if (u.protocol !== "https:") return "Webhook addresses must start with https://.";
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return "Webhook addresses must be public.";
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "[::1]" || /^\[(fc|fd|fe80)/i.test(h)) return "Webhook addresses must be public.";
  if (u.username || u.password) return "Do not put credentials in the address.";
  return null;
}

// webhook_upsert returns the signing secret only when an endpoint is first created; it is passed straight through
// once and cannot be read again.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isAdminRole(ctx.role)) return NextResponse.json({ error: "Only an owner or admin can manage webhooks." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = clip(body.action, 10);

  if (action === "save") {
    const url = clip(body.url, 500);
    const bad = badTarget(url);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const events = (Array.isArray(body.events) ? body.events.map((s: unknown) => clip(s, 40)) : []).filter((s: string) => WEBHOOK_EVENTS.includes(s));
    if (!events.length) return NextResponse.json({ error: "Choose at least one event." }, { status: 400 });
    const { data, error } = await ctx.supabase.rpc("webhook_upsert", { p_tenant: ctx.tenantId, p_id: body.id ? clip(body.id, 64) : null, p_url: url, p_events: events, p_active: body.active !== false });
    if (error) return dbFail(error.message, "Could not save the webhook");
    const d = (Array.isArray(data) ? data[0] : data) as { id?: string; signing_secret?: string } | null;
    return NextResponse.json({ ok: true, id: d?.id, secret: d?.signing_secret ?? null }, { headers: { "cache-control": "no-store" } });
  }
  if (action === "delete") {
    const id = clip(body.id, 64);
    if (!id) return NextResponse.json({ error: "Unknown webhook." }, { status: 400 });
    const { error } = await ctx.supabase.rpc("webhook_delete", { p_id: id });
    if (error) return dbFail(error.message, "Could not delete the webhook");
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
