import { NextRequest, NextResponse } from "next/server";
import { getApiContext, publicOrigin } from "@/lib/client-portal/api";
import { sendPortalMail } from "@/lib/client-portal/mailer";
import { inviteEmail } from "@/lib/client-portal/team";

export const runtime = "nodejs";

import { INVITABLE_ROLES } from "@/lib/client-portal/roles";

// Creates a pending row in `invites`. Relies entirely on the invites table's
// existing RLS policy (invites_admin_manage: ALL for an owner/admin whose
// own membership.accepted_at is set) to authorize the insert — this route
// does not use a service-role key, it just runs the write through the
// caller's own loveleeday session/cookies, so an attempt by a non-admin (or
// an admin of a different tenant) is rejected by Postgres itself, not by
// application logic here. token/expires_at/id all have table defaults.
export async function POST(req: NextRequest) {
  let body: { email?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const role = (body.role || "member").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!INVITABLE_ROLES.has(role)) {
    return NextResponse.json({ error: "Role must be admin, member, or viewer." }, { status: 400 });
  }

  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  const { supabase } = ctx;
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can invite teammates." }, { status: 403 });
  }

  // One live invite per person: a resend replaces the earlier link instead of stacking another.
  const { error: clearError } = await supabase
    .from("invites")
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("email", email)
    .is("accepted_at", null);
  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 400 });
  }

  const { data: invite, error: insertError } = await supabase
    .from("invites")
    .insert({ tenant_id: ctx.tenantId, email, role })
    .select("id, email, role, token, expires_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // The invite is emailed to the person; the link is still returned so an admin can share it if the email is slow.
  const { data: tenant } = await supabase.from("tenants").select("name").eq("id", ctx.tenantId).maybeSingle();
  const mail = inviteEmail(tenant?.name || "your company", invite.role, `${publicOrigin(req)}/client/invite/${invite.token}`);
  const emailSent = await sendPortalMail(invite.email, mail.subject, mail.lines);

  return NextResponse.json({ invite, emailSent });
}

// Withdraws a pending invite. Authorized by the same invites_admin_manage policy as the insert, so a non-admin or an
// admin of another company deletes nothing; the tenant filter below is belt and braces, not the control.
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({} as { id?: string }));
  const id = String(body.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can withdraw invites." }, { status: 403 });
  }
  const { data, error } = await ctx.supabase.from("invites").delete().eq("id", id).eq("tenant_id", ctx.tenantId).is("accepted_at", null).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "That invite is no longer pending." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
