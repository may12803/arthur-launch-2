/**
 * POST /api/inbound/sms — Telnyx inbound SMS webhook.
 * Parses message.received events, auto-categorizes OTPs, writes to arthur_communications.
 * Fails closed: invalid/missing signature → 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyTelnyxSignature } from "@/lib/telnyx/sign-verify";

export const runtime = "nodejs";

// Known OTP sender prefixes / numbers (partial match against from_address)
const OTP_SENDER_PATTERNS = [
  /stripe/i,
  /amazon/i,
  /aws/i,
  /plaid/i,
  /twilio/i,
  /microsoft/i,
  /google/i,
  /apple/i,
  /^MICHGWL$/i,
  /^33748$/,  // Stripe shortcode
  /^40107$/,  // Google
];

function detectCategory(from: string, body: string): string {
  // OTP: body contains 4–8 digit code
  if (/\b\d{4,8}\b/.test(body)) {
    // Also check if sender looks like a known service
    const senderOtp = OTP_SENDER_PATTERNS.some(p => p.test(from));
    if (senderOtp) return "otp";
    // Short codes (5-6 digits) are almost always OTP
    if (/^\d{5,6}$/.test(from.trim())) return "otp";
  }
  if (/reserv|booking|confirm|table|opentable/i.test(body)) return "reservation";
  if (/invoice|bill|payment|due|receipt/i.test(body)) return "transactional";
  if (/vendor|order|shipment|delivery/i.test(body)) return "vendor";
  return "other";
}

interface TelnyxMessageEvent {
  data: {
    event_type: string;
    payload: {
      id: string;
      from: { phone_number: string };
      to:   Array<{ phone_number: string }>;
      text: string;
      cost?: { amount?: string };
      direction: string;
    };
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody  = await req.text();
  const sig      = req.headers.get("Telnyx-Signature-Ed25519");
  const ts       = req.headers.get("Telnyx-Timestamp");

  // Signature check — fail closed
  if (!verifyTelnyxSignature(rawBody, sig, ts)) {
    console.warn("[inbound/sms] signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  let event: TelnyxMessageEvent;
  try {
    event = JSON.parse(rawBody) as TelnyxMessageEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { event_type, payload } = event.data ?? {};

  // Only handle message.received for inbound SMS
  if (event_type !== "message.received") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const from = payload?.from?.phone_number ?? "";
  const to   = payload?.to?.[0]?.phone_number ?? "";
  const body = payload?.text ?? "";
  const id   = payload?.id ?? "";
  const costRaw = parseFloat(payload?.cost?.amount ?? "0");
  const costCents = isNaN(costRaw) ? 0 : Math.round(costRaw * 100);

  const category = detectCategory(from, body);

  const db = getSupabaseAdmin();
  const { error } = await db.from("arthur_communications").insert({
    ts:           new Date().toISOString(),
    channel:      "sms",
    direction:    "inbound",
    from_address: from,
    to_address:   to,
    body,
    status:       "received",
    external_id:  id,
    cost_cents:   costCents,
    category,
    metadata:     { raw_event: event_type },
  });

  if (error) {
    console.error("[inbound/sms] DB insert error:", error.message);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
