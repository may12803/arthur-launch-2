import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NYLAS_BASE = "https://api.us.nylas.com";
const REDIRECT_URI = "https://arthur-online.fly.dev/api/email/connect/callback";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  if (errorParam || !code) {
    const msg = errorParam || "no code returned";
    return NextResponse.redirect(`https://arthur-online.fly.dev/settings/email?status=error&reason=${encodeURIComponent(msg)}`);
  }

  const clientId = process.env.NYLAS_CLIENT_ID;
  const clientSecret = process.env.NYLAS_CLIENT_SECRET;
  const nylasApiKey = process.env.NYLAS_API_KEY;

  if (!clientId) {
    return NextResponse.redirect(`https://arthur-online.fly.dev/settings/email?status=error&reason=NYLAS_CLIENT_ID+missing`);
  }

  // Exchange code for grant
  const tokenRes = await fetch(`${NYLAS_BASE}/v3/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret ?? "",
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    console.error("[connect/callback] token exchange failed:", txt.slice(0, 300));
    return NextResponse.redirect(`https://arthur-online.fly.dev/settings/email?status=error&reason=token_exchange_failed`);
  }

  const tokenData = await tokenRes.json() as {
    grant_id?: string;
    email?: string;
    provider?: string;
    access_token?: string;
  };

  const grantId = tokenData.grant_id;
  if (!grantId) {
    return NextResponse.redirect(`https://arthur-online.fly.dev/settings/email?status=error&reason=no_grant_id`);
  }

  // Fetch grant details to get email
  let email = tokenData.email ?? "";
  let provider = tokenData.provider ?? "gmail";

  if (!email && nylasApiKey) {
    try {
      const grantRes = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}`, {
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      });
      if (grantRes.ok) {
        const grantData = await grantRes.json() as { data?: { email?: string; provider?: string } };
        email = grantData.data?.email ?? email;
        provider = grantData.data?.provider ?? provider;
      }
    } catch (e) {
      console.warn("[connect/callback] grant fetch failed:", (e as Error).message);
    }
  }

  // Upsert into arthur_email_accounts
  const db = getSupabaseAdmin();
  const { error: upsertErr } = await db
    .from("arthur_email_accounts")
    .upsert({
      email,
      provider: provider === "google" ? "gmail" : provider,
      grant_id: grantId,
      display_name: email,
      connected_at: new Date().toISOString(),
      is_active: true,
    }, { onConflict: "email" });

  if (upsertErr) {
    console.error("[connect/callback] upsert failed:", upsertErr.message);
    return NextResponse.redirect(`https://arthur-online.fly.dev/settings/email?status=error&reason=db_insert_failed`);
  }

  return NextResponse.redirect(`https://arthur-online.fly.dev/settings/email?status=connected&email=${encodeURIComponent(email)}`);
}
