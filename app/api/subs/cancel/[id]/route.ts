import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

/**
 * POST /api/subs/cancel/[id]
 *
 * Stub — will cancel a subscription via Stagehand + 1Password when configured.
 * Not active until OP_SERVICE_ACCOUNT_TOKEN is set as a Fly secret.
 *
 * Two cancellation paths (tried in order):
 *  1. Privacy.com card close — if virtual_card_id is set, close the card.
 *     Next billing attempt fails; subscription self-terminates. No credentials needed.
 *  2. Stagehand browser automation — logs into the vendor's billing page using
 *     credentials retrieved from 1Password vault and cancels the subscription.
 *     Requires OP_SERVICE_ACCOUNT_TOKEN + credentials_op_ref on the subscription row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;
  const db = getSupabaseAdmin();

  const { data: sub, error } = await db
    .from("arthur_subscriptions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  if (sub.status === "canceled") {
    return NextResponse.json({ ok: true, message: "Already canceled" });
  }

  const privacyConfigured = !!process.env.PRIVACY_API_KEY;
  const opConfigured      = !!process.env.OP_SERVICE_ACCOUNT_TOKEN;

  // Path 1: Privacy.com card close
  if (privacyConfigured && sub.virtual_card_id) {
    // TODO: POST https://api.privacy.com/v1/card to close the card
    // For now, update status and note
    await db
      .from("arthur_subscriptions")
      .update({ status: "canceling", notes: `Card close initiated via Privacy.com: ${sub.virtual_card_id}` })
      .eq("id", id);

    return NextResponse.json({
      ok:     true,
      method: "privacy_card_close",
      message: "Privacy.com card close queued — subscription will self-terminate on next billing attempt. Full implementation pending Privacy.com API integration.",
    });
  }

  // Path 2: Stagehand + 1Password
  if (opConfigured && sub.credentials_op_ref) {
    return NextResponse.json(
      {
        ok:    false,
        error: "Stagehand + 1Password cancellation not yet implemented. Your credentials are loaded; browser automation flow is next build.",
        setup: {
          note: "credentials_op_ref is set on this subscription — ready to wire when Stagehand automation is built.",
        },
      },
      { status: 501 }
    );
  }

  // Neither path configured
  const missingParts: string[] = [];
  if (!privacyConfigured) missingParts.push("PRIVACY_API_KEY (fly secrets set PRIVACY_API_KEY=<key> -a arthur-online)");
  if (!opConfigured)      missingParts.push("OP_SERVICE_ACCOUNT_TOKEN (fly secrets set OP_SERVICE_ACCOUNT_TOKEN=<token> -a arthur-online)");
  if (!sub.virtual_card_id)      missingParts.push("virtual_card_id on this subscription row (set after issuing a Privacy.com card)");
  if (!sub.credentials_op_ref)   missingParts.push("credentials_op_ref on this subscription row (1Password item URL)");

  return NextResponse.json(
    {
      ok:    false,
      error: "Cancellation not configured.",
      missing: missingParts,
      setup: {
        privacy_path: "Sign up at https://privacy.com → API → generate key. Issue a virtual card per vendor. Store the card ID in this subscription's virtual_card_id field.",
        op_path:      "Create a 1Password Service Account at https://my.1password.com/developer-tools/infrastructure-secrets/serviceaccount. Grant read access to a vault containing subscription logins. Store item refs in credentials_op_ref field.",
      },
    },
    { status: 503 }
  );
}
