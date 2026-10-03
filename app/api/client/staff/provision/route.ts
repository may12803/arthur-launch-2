import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { publicOrigin } from "@/lib/client-portal/api";
import { provisionTenant } from "@/lib/client-portal/provision";

export const runtime = "nodejs";

// Staff add a client business: invite the owner by email, then create the tenant + owner membership +
// audit row through staff_provision_tenant (SECURITY DEFINER; the database checks staff and MFA).
// The service-role key is used only here, server side, only for the Auth invite; it never reaches the client.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const service = process.env.LOVELEEDAY_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({ error: "Provisioning is unavailable right now." }, { status: 503 });

  const staff = await getLoveleedayRouteClient();
  const { data: userData } = await staff.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
  const result = await provisionTenant(staff, admin, body, `${publicOrigin(req)}/client/login`);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, tenant: result.tenantId, owner: result.ownerId, invited: result.invited });
}
