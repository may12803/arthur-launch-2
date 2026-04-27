import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig) return NextResponse.json({ error: "no sig" }, { status: 400 });
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  // TODO: handle event types: payment_intent.succeeded, customer.subscription.created
  console.log("[stripe] received", event.type);
  return NextResponse.json({ received: true });
}
