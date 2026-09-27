import { NextRequest, NextResponse } from "next/server";
import { getApiContext, rpcErrorResponse } from "@/lib/client-portal/api";

export const runtime = "nodejs";

// Client connection actions. Every one runs under the client's own two-factor session through a SECURITY DEFINER
// RPC that checks the role, writes audit_log, and (for keys) encrypts with the client's Vault key. Nothing here
// ever returns a stored key.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  const body = await req.json().catch(() => ({}));
  const connector = String(body.connector || "");
  const action = String(body.action || "");
  let res;
  if (action === "invited" || action === "request") {
    res = await ctx.supabase.rpc("connection_request", { p_tenant: ctx.tenantId, p_connector: connector, p_kind: action });
  } else if (action === "key") {
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const clean = Object.fromEntries(Object.entries(payload).map(([k, v]) => [String(k).slice(0, 40), String(v).trim().slice(0, 500)]).filter(([, v]) => v));
    if (!Object.keys(clean).length) return NextResponse.json({ error: "Enter the key first." }, { status: 400 });
    res = await ctx.supabase.rpc("connection_set_key", { p_tenant: ctx.tenantId, p_connector: connector, p_payload: clean });
  } else if (action === "disconnect") {
    res = await ctx.supabase.rpc("connection_disconnect", { p_tenant: ctx.tenantId, p_connector: connector });
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (res.error) {
    if (/only an owner|unknown platform|missing key/i.test(res.error.message)) return NextResponse.json({ error: res.error.message.charAt(0).toUpperCase() + res.error.message.slice(1) + "." }, { status: 403 });
    return rpcErrorResponse(res.error.message);
  }
  return NextResponse.json({ ok: true, status: res.data });
}
