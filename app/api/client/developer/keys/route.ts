import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { clip, dbFail, isAdminRole } from "@/lib/client-portal/connector-api";
import { API_KEY_SCOPES } from "@/lib/client-portal/connector-ui";

export const runtime = "nodejs";

// api_key_create returns the plaintext key exactly once; only its hash is stored. This route passes it straight
// through to the response and never logs it. Revoking is immediate and recorded in the audit trail by the RPC.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isAdminRole(ctx.role)) return NextResponse.json({ error: "Only an owner or admin can manage API keys." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = clip(body.action, 10);

  if (action === "create") {
    const name = clip(body.name, 80);
    if (!name) return NextResponse.json({ error: "Name the key so you can recognize it later." }, { status: 400 });
    const scopes = (Array.isArray(body.scopes) ? body.scopes.map((s: unknown) => clip(s, 40)) : []).filter((s: string) => API_KEY_SCOPES.includes(s));
    if (!scopes.length) return NextResponse.json({ error: "Choose at least one permission." }, { status: 400 });
    const { data, error } = await ctx.supabase.rpc("api_key_create", { p_tenant: ctx.tenantId, p_name: name, p_scopes: scopes });
    if (error) return dbFail(error.message, "Could not create the key");
    const d = (Array.isArray(data) ? data[0] : data) as { id?: string; prefix?: string; api_key?: string } | string | null;
    const plaintext = typeof d === "string" ? d : d?.api_key;
    if (!plaintext) return NextResponse.json({ error: "The key was created but the database did not return it. Revoke it and create another." }, { status: 502 });
    return NextResponse.json({ ok: true, key: plaintext, id: typeof d === "object" && d ? d.id : undefined, prefix: typeof d === "object" && d ? d.prefix : plaintext.slice(0, 8) }, { headers: { "cache-control": "no-store" } });
  }
  if (action === "revoke") {
    const id = clip(body.id, 64);
    if (!id) return NextResponse.json({ error: "Unknown key." }, { status: 400 });
    const { error } = await ctx.supabase.rpc("api_key_revoke", { p_id: id });
    if (error) return dbFail(error.message, "Could not revoke the key");
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
