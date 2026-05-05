/**
 * POST /api/calendar/connect-google
 * Initiates direct Google OAuth (not Nylas) to get a Calendar-scoped
 * refresh token that we store in arthur_email_accounts.google_refresh_token.
 *
 * Body: { email?: string }  — optional hint for which Google account to use
 */
import { NextRequest, NextResponse } from "next/server";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

const REDIRECT_URI = "https://arthur-online.fly.dev/api/calendar/connect-google/callback";

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID not set" }, { status: 503 });
  }

  let email: string | undefined;
  try {
    const body = await req.json() as { email?: string };
    email = body.email;
  } catch {
    // body is optional
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email",
    access_type:   "offline",
    prompt:        "consent",   // force refresh_token to be returned
  });

  if (email) {
    params.set("login_hint", email);
  }

  const auth_url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.json({ auth_url });
}
