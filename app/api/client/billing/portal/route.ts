import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

// Creates a Stripe Billing Portal session for the caller's tenant and
// returns the redirect URL. Auth is enforced entirely off the caller's own
// loveleeday session (no service-role key): an accepted membership row is
// required, and the tenant's stripe_customer_id (nullable — see task report
// SQL, not applied yet) must already be set. This route never creates a
// Stripe customer; that's provisioned elsewhere when a tenant is set up for
// billing.
export async function POST(req: NextRequest) {
  const supabase = await getLoveleedayRouteClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userData.user.id)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle<{ tenant_id: string }>();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No active company membership found." }, { status: 403 });
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", membership.tenant_id)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  if (tenantError || !tenant?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account is set up for this company yet." }, { status: 400 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${req.nextUrl.origin}/client/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Couldn't open the billing portal." }, { status: 500 });
  }
}
