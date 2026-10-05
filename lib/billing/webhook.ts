// Stripe webhook handler with its dependencies injected, so it runs under node --test without Next, Stripe or Supabase.
// app/api/stripe/webhook/route.ts is the thin wrapper that supplies the real ones.
import type Stripe from "stripe";
import { resolveLookupKey } from "./plans.ts";

export interface WebhookDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data?: unknown; error?: { message: string } | null }>;
}
export interface WebhookDeps {
  stripe: { webhooks: { constructEvent(body: string, sig: string, secret: string): Stripe.Event }; subscriptions: { retrieve(id: string): Promise<Stripe.Subscription> } };
  whsec: string | undefined;
  serverSecret: () => string | null;
  db: () => WebhookDb;
  // One-time payments (the ll_audit_* offers). Runs after the signature check, inside the same try, so a failure returns 500 and Stripe retries.
  onPaymentCheckout?: (event: Stripe.Event, ctx: { db: WebhookDb; secret: string }) => Promise<void>;
}

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);
const json = (body: unknown, status = 200) => Response.json(body, { status });

// Signature verified against the webhook secret (raw body). Every handled event writes through the billing_* RPCs,
// which are idempotent on the Stripe event id and ignore snapshots older than the stored one.
export async function handleStripeWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const { stripe } = deps;
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig || !deps.whsec) return json({ error: "no sig" }, 400);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, deps.whsec);
  } catch {
    return json({ error: "bad signature" }, 400);
  }
  const secret = deps.serverSecret();
  if (!secret) return json({ error: "Not configured." }, 503);
  const db = deps.db();
  const created = iso(event.created)!;

  async function tenantFor(meta: Stripe.Metadata | null | undefined, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
    if (meta?.tenant_id) return meta.tenant_id;
    const id = typeof customer === "string" ? customer : customer?.id;
    if (!id) return null;
    const r = await db.rpc("billing_tenant_for_customer", { p_secret: secret, p_customer: id });
    return (r.data as string | null) ?? null;
  }

  async function applySubscription(sub: Stripe.Subscription, eventId: string = event.id) {
    const item = sub.items.data[0];
    const lookup = item?.price?.lookup_key ?? sub.metadata?.price_lookup_key ?? null;
    const resolved = lookup ? resolveLookupKey(lookup) : null;
    const tenant = await tenantFor(sub.metadata, sub.customer);
    if (!tenant) { console.warn("[stripe] subscription with no tenant", event.id); return; }
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const r = await db.rpc("billing_subscription_upsert", {
      p_secret: secret, p_event_id: eventId, p_event_type: event.type, p_event_created: created, p_tenant: tenant, p_customer: customer,
      p_subscription: sub.id, p_plan_key: resolved?.planKey ?? sub.metadata?.plan_key ?? null, p_price_lookup_key: lookup,
      p_interval: resolved ? (resolved.interval === "once" ? null : resolved.interval) : item?.price?.recurring?.interval ?? null,
      p_status: sub.status, p_amount_cents: item?.price?.unit_amount ?? null, p_currency: item?.price?.currency ?? null,
      p_period_end: iso(sub.current_period_end), p_cancel_at_period_end: sub.cancel_at_period_end, p_livemode: event.livemode,
    });
    if (r.error) throw new Error(`subscription upsert: ${r.error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode === "subscription" && s.subscription) {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          await applySubscription(await stripe.subscriptions.retrieve(subId), `${event.id}:sub`);
        } else if (s.mode === "payment" && deps.onPaymentCheckout) {
          await deps.onPaymentCheckout(event, { db, secret });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // The event payload follows the endpoint's API version; re-read the subscription at the client's pinned version so its shape is stable.
        await applySubscription(await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id));
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } | null; parent?: { subscription_details?: { subscription?: string } } | null };
        const subId = (typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id) ?? inv.parent?.subscription_details?.subscription;
        if (subId) {
          const args = { p_secret: secret, p_event_id: event.id, p_event_type: event.type, p_event_created: created, p_subscription: subId, p_paid: event.type === "invoice.paid", p_livemode: event.livemode };
          let r = await db.rpc("billing_invoice_record", args);
          if (r.error?.message.includes("not yet known")) {
            // Invoice events can outrun the subscription events: load the subscription now, then record the invoice.
            await applySubscription(await stripe.subscriptions.retrieve(subId), `${event.id}:sub`);
            r = await db.rpc("billing_invoice_record", args);
          }
          if (r.error) throw new Error(`invoice record: ${r.error.message}`);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // A 500 makes Stripe retry; the RPCs are idempotent so a retry is safe.
    console.error("[stripe] handler failed", event.type, (e as Error).message);
    return json({ error: "handler failed" }, 500);
  }
  return json({ received: true });
}
