import { NextRequest, NextResponse } from "next/server";
import { getApiContext, publicOrigin } from "@/lib/client-portal/api";
import { connectorsServerSecret } from "@/lib/client-portal/connector-api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { resolveLookupKey } from "@/lib/billing/plans";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { lookup_key } -> { url }. Signed-in, owner/admin of the active tenant. The price is resolved from a fixed
// catalog lookup key (never a client-supplied price id), one Stripe customer per tenant, and tenant_id rides on the
// session and subscription metadata so the webhook can attribute every event.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (ctx.role !== "owner" && ctx.role !== "admin") return NextResponse.json({ error: "Only owners and admins can start a plan." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { lookup_key?: string };
  const offer = body.lookup_key ? resolveLookupKey(body.lookup_key) : null;
  if (!offer || !body.lookup_key) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });

  try {
    const prices = await stripe.prices.list({ lookup_keys: [body.lookup_key], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) return NextResponse.json({ error: "That plan is not available yet." }, { status: 404 });

    const { data: tenant } = await ctx.supabase.from("tenants").select("name, stripe_customer_id").eq("id", ctx.tenantId).maybeSingle<{ name: string; stripe_customer_id: string | null }>();
    if (!tenant) return NextResponse.json({ error: "Company not found." }, { status: 404 });
    let customer = tenant.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({ name: tenant.name, metadata: { tenant_id: ctx.tenantId } }, { idempotencyKey: `ll-customer-${ctx.tenantId}` });
      const saved = await loveleedayAnon().rpc("billing_set_customer", { p_secret: secret, p_tenant: ctx.tenantId, p_customer: created.id });
      if (saved.error) throw new Error("customer could not be saved");
      customer = saved.data as string;
    }

    const origin = publicOrigin(req);
    const meta = { tenant_id: ctx.tenantId, plan_key: offer.planKey, price_lookup_key: body.lookup_key };
    const session = await stripe.checkout.sessions.create({
      mode: offer.mode,
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${origin}/client/billing?checkout=success`,
      cancel_url: `${origin}/client/billing?checkout=cancelled`,
      client_reference_id: ctx.tenantId,
      metadata: meta,
      ...(offer.mode === "subscription" ? { subscription_data: { metadata: meta } } : { payment_intent_data: { metadata: meta } }),
    });
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error("billing checkout failed", (e as Error).message);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 500 });
  }
}
