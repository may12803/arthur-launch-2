import { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { connectorsServerSecret } from "@/lib/client-portal/connector-api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { handleStripeWebhook, type WebhookDb } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleStripeWebhook(req, {
    stripe,
    whsec: process.env.STRIPE_WEBHOOK_SECRET,
    serverSecret: connectorsServerSecret,
    db: () => loveleedayAnon() as unknown as WebhookDb,
  });
}
