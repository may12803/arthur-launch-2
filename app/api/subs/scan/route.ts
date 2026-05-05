import { NextRequest, NextResponse } from "next/server";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

/**
 * POST /api/subs/scan
 *
 * Stub — will scan connected bank/credit accounts via Plaid to detect recurring charges.
 * Not active until PLAID_CLIENT_ID + PLAID_SECRET are set as Fly secrets.
 *
 * When live:
 *  1. Fetch 90 days of transactions via /transactions/get
 *  2. Group by merchant name + approximate amount
 *  3. Flag items with ≥2 charges ~30 days apart as likely subscriptions
 *  4. Upsert into arthur_subscriptions with status=active
 */
export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;
  const plaidConfigured =
    !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET;

  if (!plaidConfigured) {
    return NextResponse.json(
      {
        ok:    false,
        error: "Plaid not configured. Set PLAID_CLIENT_ID and PLAID_SECRET as Fly secrets, then connect a bank account at /subscriptions.",
        setup: {
          step1: "Sign up at https://dashboard.plaid.com (free dev tier)",
          step2: "Create a new app in Plaid dashboard",
          step3: "Copy client_id and secret",
          step4: "fly secrets set PLAID_CLIENT_ID=<id> PLAID_SECRET=<secret> -a arthur-online",
          step5: "Visit /subscriptions and click 'Connect Bank Account' to link your accounts via Plaid Link",
        },
      },
      { status: 503 }
    );
  }

  // TODO: Implement Plaid /transactions/get scan when configured
  return NextResponse.json({ ok: false, error: "Plaid scan not yet implemented" }, { status: 501 });
}
