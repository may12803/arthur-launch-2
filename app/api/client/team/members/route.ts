import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { teamErrorMessage } from "@/lib/client-portal/team";

export const runtime = "nodejs";

// Change a teammate's role, remove a teammate (or leave), or transfer ownership. Every rule lives in the
// SECURITY DEFINER RPCs (membership_set_role, membership_remove, tenant_transfer_ownership), which re-check the
// caller's role and two-factor session and audit the change; this route only validates shape and maps errors.
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "");
  const membershipId = String(body.membershipId || "");
  if (!UUID.test(membershipId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;

  let rpc;
  if (action === "set_role") rpc = ctx.supabase.rpc("membership_set_role", { p_membership: membershipId, p_role: String(body.role || "") });
  else if (action === "remove") rpc = ctx.supabase.rpc("membership_remove", { p_membership: membershipId });
  else if (action === "transfer_ownership") rpc = ctx.supabase.rpc("tenant_transfer_ownership", { p_membership: membershipId });
  else return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { error } = await rpc;
  if (error) return NextResponse.json({ error: teamErrorMessage(error.message) }, { status: /not allowed|two-factor/.test(error.message) ? 403 : 400 });
  return NextResponse.json({ ok: true });
}
