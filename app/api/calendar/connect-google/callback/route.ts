/**
 * GET /api/calendar/connect-google/callback
 * Handles the Google OAuth redirect, exchanges code for refresh_token,
 * and stores it in arthur_email_accounts.google_refresh_token.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const REDIRECT_URI = "https://arthur-online.fly.dev/api/calendar/connect-google/callback";
const SUCCESS_REDIRECT = "https://arthur-online.fly.dev/settings/email?status=gcal_connected";
const ERROR_REDIRECT   = "https://arthur-online.fly.dev/settings/email?status=gcal_error";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${ERROR_REDIRECT}&reason=${encodeURIComponent(error ?? "no_code")}`);
  }

  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${ERROR_REDIRECT}&reason=missing_google_creds`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  REDIRECT_URI,
      grant_type:    "authorization_code",
    }).toString(),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    console.error("[gcal/callback] token exchange failed:", txt.slice(0, 300));
    return NextResponse.redirect(`${ERROR_REDIRECT}&reason=token_exchange_failed`);
  }

  const tokens = await tokenRes.json() as {
    access_token?:  string;
    refresh_token?: string;
    error?:         string;
  };

  if (!tokens.refresh_token) {
    console.error("[gcal/callback] no refresh_token in response:", JSON.stringify(tokens).slice(0, 200));
    return NextResponse.redirect(`${ERROR_REDIRECT}&reason=no_refresh_token`);
  }

  // Get the account email from Google's userinfo
  let accountEmail = "";
  if (tokens.access_token) {
    try {
      const uiRes  = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const ui = await uiRes.json() as { email?: string };
      accountEmail = ui.email ?? "";
    } catch (e) {
      console.warn("[gcal/callback] userinfo failed:", (e as Error).message);
    }
  }

  if (!accountEmail) {
    return NextResponse.redirect(`${ERROR_REDIRECT}&reason=could_not_identify_email`);
  }

  // Upsert the refresh token into the matching account row
  const db = getSupabaseAdmin();
  const { error: upsertErr } = await db
    .from("arthur_email_accounts")
    .update({ google_refresh_token: tokens.refresh_token })
    .eq("email", accountEmail)
    .eq("provider", "gmail");

  if (upsertErr) {
    console.error("[gcal/callback] db update failed:", upsertErr.message);
    // If account doesn't exist yet in the table, insert it
    const { error: insertErr } = await db
      .from("arthur_email_accounts")
      .upsert({
        email:               accountEmail,
        provider:            "gmail",
        display_name:        accountEmail,
        connected_at:        new Date().toISOString(),
        is_active:           true,
        google_refresh_token: tokens.refresh_token,
      }, { onConflict: "email" });

    if (insertErr) {
      console.error("[gcal/callback] insert fallback failed:", insertErr.message);
      return NextResponse.redirect(`${ERROR_REDIRECT}&reason=db_write_failed`);
    }
  }

  return NextResponse.redirect(
    `${SUCCESS_REDIRECT}&email=${encodeURIComponent(accountEmail)}`
  );
}
