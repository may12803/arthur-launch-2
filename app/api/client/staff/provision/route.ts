import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { publicOrigin } from "@/lib/client-portal/api";
import { sendPortalMail } from "@/lib/client-portal/mailer";
import { provisionTenant } from "@/lib/client-portal/provision";
import { staffGate } from "@/lib/client-portal/staff-gate";

export const runtime = "nodejs";

// Staff add a client business: the database creates the tenant + an owner invite in one transaction (idempotent by client supplied key; the database
// checks staff and MFA), then the invite email goes out after the commit. No service-role key and no auth user creation are involved.
// If the email fails, the tenant and invite exist; repeating the same request resends. The owner joins via accept_invite.
export async function POST(req: NextRequest) {
  const staff = await getLoveleedayRouteClient();
  const { data: userData } = await staff.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Authorize before validating the payload: a non-staff caller learns nothing about the payload rules.
  const gate = await staffGate(staff);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const result = await provisionTenant(
    staff,
    ({ to, tenantName, link }) =>
      sendPortalMail(to, `Review ${tenantName}’s work and decisions in LOVELEEDAY`, [
        `You have been invited to manage ${tenantName}’s LOVELEEDAY account. As owner, you can see the work, manage access and billing, and approve consequential actions.`,
        `Open this link to sign in or create an account, then accept the invitation: ${link}`,
        "The link works only for this email address and expires in 7 days.",
      ]),
    body,
    publicOrigin(req),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, tenant: result.tenantId, invite: result.inviteId, created: result.created, accepted: result.accepted, emailSent: result.emailSent });
}
