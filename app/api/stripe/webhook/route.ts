import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { connectorsServerSecret } from "@/lib/client-portal/connector-api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { handleStripeWebhook, type WebhookDb } from "@/lib/billing/webhook";
import { handleAuditCheckoutEvent } from "@/lib/audit/purchase";
import { SupabaseAuditStore } from "@/lib/audit/store";
import { generateForAudit } from "@/lib/audit/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleStripeWebhook(req, {
    stripe,
    whsec: process.env.STRIPE_WEBHOOK_SECRET,
    serverSecret: connectorsServerSecret,
    db: () => loveleedayAnon() as unknown as WebhookDb,
    // A paid audit (ll_audit_*) records the purchase and generates the report with no person in the loop.
    onPaymentCheckout: async (event, { db, secret }) => {
      const store = new SupabaseAuditStore(db as never, secret);
      const result = await handleAuditCheckoutEvent(event, {
        store,
        lineItemLookup: async (id) => {
          const items = await stripe.checkout.sessions.listLineItems(id, { limit: 10, expand: ["data.price"] });
          return items.data.map((item) => item.price?.lookup_key).find((key) => key?.startsWith("ll_audit_")) ?? null;
        },
        tenantForCustomer: async (customer) => {
          const r = await db.rpc("billing_tenant_for_customer", { p_secret: secret, p_customer: customer });
          if (r.error) throw new Error(r.error.message);
          return r.data as string | null;
        },
        generate: (id) => generateForAudit({ store, log: console.error }, id),
      });
      if (result.generation) await result.generation;
    },
  });
}
