import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";

export const runtime = "nodejs";

const INVITABLE_ROLES = new Set(["admin", "member", "viewer"]);

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

  const supabase = await getLoveleedayRouteClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("tenant_id, role, accepted_at")
    .eq("user_id", userData.user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle<{ tenant_id: string; role: string; accepted_at: string }>();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No active company membership found." }, { status: 403 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can invite teammates." }, { status: 403 });
  }

  const { data: invite, error: insertError } = await supabase
    .from("invites")
    .insert({ tenant_id: membership.tenant_id, email, role })
    .select("id, email, role, token, expires_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ invite });
}
