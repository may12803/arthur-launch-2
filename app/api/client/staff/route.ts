import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { rpcErrorResponse } from "@/lib/client-portal/api";
import { ACTIVE_TENANT_COOKIE } from "@/lib/client-portal/active-tenant";
import { sendPortalMail } from "@/lib/client-portal/mailer";
import { staffGate, signedInGate, UUID_RE } from "@/lib/client-portal/staff-gate";

export const runtime = "nodejs";

// Staff open a time-limited, reasoned grant into one client (POST), or end one
// (DELETE ?grant=). A client owner/admin may also end any grant on their account.
// Opening access emails the client's owners and admins, so it is never silent.
export async function POST(req: NextRequest) {
  const supabase = await getLoveleedayRouteClient();
  const gate = await staffGate(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  if (!UUID_RE.test(String(body.tenant || ""))) return NextResponse.json({ error: "Choose a client." }, { status: 400 });
  const { data: grantId, error } = await supabase.rpc("staff_open_access", {
    p_tenant: String(body.tenant || ""), p_reason: String(body.reason || ""), p_hours: Number(body.hours || 0),
  });
  if (error) {
    const m = error.message;
    if (/reason|hours|client not found/i.test(m)) return NextResponse.json({ error: m.charAt(0).toUpperCase() + m.slice(1) + "." }, { status: 400 });
    if (/staff only/i.test(m)) return NextResponse.json({ error: "Only LOVELEEDAY staff can open access." }, { status: 403 });
    return rpcErrorResponse(m);
  }

  // With the grant live, the staff session can read this client's team to notify it.
  const [{ data: team }, { data: tenant }, { data: me }] = await Promise.all([
    supabase.rpc("list_tenant_team", { p_tenant: body.tenant }),
    supabase.from("tenants").select("name").eq("id", body.tenant).maybeSingle<{ name: string }>(),
    supabase.auth.getUser(),
  ]);
  const admins = ((team as { email: string; role: string; accepted: boolean }[] | null) || [])
    .filter((m) => m.accepted && (m.role === "owner" || m.role === "admin"))
    .map((m) => m.email);
  if (admins.length) {
    await sendPortalMail(admins, `LOVELEEDAY opened access to ${tenant?.name || "your account"}`, [
      `${me.user?.email || "A LOVELEEDAY staff member"} opened access to ${tenant?.name || "your account"} for ${Number(body.hours)} hour${Number(body.hours) === 1 ? "" : "s"}.`,
      `Reason given: ${String(body.reason).trim()}`,
      `It ends on its own when the time is up. You can end it sooner, and see everything done during it, under Access history in your portal.`,
    ]);
  }
  const res = NextResponse.json({ ok: true, grant: grantId, notified: admins.length });
  // Opening access makes that client the explicit active company for this staff browser.
  res.cookies.set(ACTIVE_TENANT_COOKIE, String(body.tenant), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return res;
}

// Staff set a client's data classification (standard | regulated).
export async function PATCH(req: NextRequest) {
  const supabase = await getLoveleedayRouteClient();
  const gate = await staffGate(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = await req.json().catch(() => ({}));
  if (!UUID_RE.test(String(body.tenant || ""))) return NextResponse.json({ error: "Choose a client." }, { status: 400 });
  const { error } = await supabase.rpc("staff_set_data_class", { p_tenant: String(body.tenant || ""), p_class: String(body.data_class || "") });
  if (error) return rpcErrorResponse(error.message);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getLoveleedayRouteClient();
  const gate = await signedInGate(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const grant = new URL(req.url).searchParams.get("grant") || "";
  if (!UUID_RE.test(grant)) return NextResponse.json({ error: "Choose an access grant." }, { status: 400 });
  const { error } = await supabase.rpc("staff_close_access", { p_grant: grant });
  if (error) return rpcErrorResponse(error.message);
  return NextResponse.json({ ok: true });
}
