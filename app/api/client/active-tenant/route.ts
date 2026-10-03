import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { ACTIVE_TENANT_COOKIE, resolveActiveTenant } from "@/lib/client-portal/active-tenant";

export const runtime = "nodejs";

// Sets the active company for this browser. The choice is validated against the caller's own accepted
// memberships / live staff grants before the cookie is written; the same check runs again on every request.
// Accepts JSON {tenant} or a form post (the /client/select-company page); a form post redirects back into the portal.
export async function POST(req: NextRequest) {
  const supabase = await getLoveleedayRouteClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const isForm = (req.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");
  let tenant = "";
  if (isForm) tenant = String((await req.formData()).get("tenant") || "");
  else tenant = String(((await req.json().catch(() => ({}))) as { tenant?: unknown }).tenant || "");

  const r = await resolveActiveTenant(supabase, userData.user.id, tenant || "none");
  if (!r.ok) return NextResponse.json({ error: "You don't have access to that company." }, { status: 403 });

  const res = isForm ? NextResponse.redirect(new URL("/client", req.url), 303) : NextResponse.json({ ok: true, tenant: r.tenantId });
  res.cookies.set(ACTIVE_TENANT_COOKIE, r.tenantId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
