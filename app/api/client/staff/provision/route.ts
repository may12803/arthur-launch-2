import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { publicOrigin } from "@/lib/client-portal/api";
import { sendPortalMail } from "@/lib/client-portal/mailer";
import { provisionTenant } from "@/lib/client-portal/provision";

export const runtime = "nodejs";

// Staff add a client business: the database creates the tenant + an owner invite in one transaction (idempotent by slug; the database
// checks staff and MFA), then the invite email goes out after the commit. No service-role key and no auth user creation are involved.
// If the email fails, the tenant and invite exist; repeating the same request resends. The owner joins via accept_invite.
export async function POST(req: NextRequest) {
  const staff = await getLoveleedayRouteClient();
  const { data: userData } = await staff.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const result = await provisionTenant(
    staff,
    ({ to, tenantName, link }) =>
      sendPortalMail(to, `You're invited to ${tenantName} on LOVELEEDAY`, [
        `You've been invited to join ${tenantName} on LOVELEEDAY as its owner.`,
        `Open this link to create your account or sign in, and accept: ${link}`,
        "The link works only for this email address and expires in 7 days.",
      ]),
    body,
    publicOrigin(req),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, tenant: result.tenantId, invite: result.inviteId, created: result.created, accepted: result.accepted, emailSent: result.emailSent });
}
