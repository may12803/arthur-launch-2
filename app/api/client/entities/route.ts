import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { clip, dbFail, isAdminRole } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";
const KINDS = ["org", "entity", "location", "department"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hierarchy editor (G08) and scoped membership (G09). Owners and admins only; the RPCs re-check the role.
//   action upsert -> entity_upsert, delete -> entity_delete, scope -> membership_scope_set
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isAdminRole(ctx.role)) return NextResponse.json({ error: "Only an owner or admin can change the organization structure." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = clip(body.action, 12);

  if (action === "upsert") {
    const name = clip(body.name, 120);
    const kind = clip(body.kind, 16);
    const parent = body.parent_id ? clip(body.parent_id, 64) : null;
    const id = body.id ? clip(body.id, 64) : null;
    if (!name) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "Choose a type." }, { status: 400 });
    if ((parent && !UUID.test(parent)) || (id && !UUID.test(id))) return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
    if (id && parent && id === parent) return NextResponse.json({ error: "An entity cannot sit under itself." }, { status: 400 });
    const { data, error } = await ctx.supabase.rpc("entity_upsert", { p_tenant: ctx.tenantId, p_id: id, p_parent: parent, p_kind: kind, p_name: name, p_code: clip(body.code, 40) || null });
    if (error) return dbFail(error.message, "Could not save");
    return NextResponse.json({ ok: true, id: data ?? id });
  }
  if (action === "delete") {
    const id = clip(body.id, 64);
    if (!UUID.test(id)) return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
    const { error } = await ctx.supabase.rpc("entity_delete", { p_id: id });
    if (error) return dbFail(error.message, "Could not delete");
    return NextResponse.json({ ok: true });
  }
  if (action === "scope") {
    const membership = clip(body.membership_id, 64);
    const ids: string[] = Array.isArray(body.entity_ids) ? body.entity_ids.map((x: unknown) => clip(x, 64)) : [];
    if (!UUID.test(membership) || ids.some((i) => !UUID.test(i))) return NextResponse.json({ error: "Unknown member or entity." }, { status: 400 });
    const { error } = await ctx.supabase.rpc("membership_scope_set", { p_membership: membership, p_entities: ids });
    if (error) return dbFail(error.message, "Could not save access");
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
