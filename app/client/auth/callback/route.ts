import { NextRequest, NextResponse } from "next/server";
import { getLoveleedayRouteClient } from "@/lib/supabase/loveleeday-server";

export const runtime = "nodejs";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/client") && !raw.startsWith("//") ? raw : "/client";
}

// Lands the PKCE redirect from a client's identity provider (SAML SSO via
// supabase.auth.signInWithSSO): exchanges the one-time code for a session
// cookie on the loveleeday project, then hands off to the portal, whose
// guard still requires an accepted membership. SSO proves who someone is,
// never which client company they belong to.
// Behind Fly's proxy req.url carries the container's bind address
// (0.0.0.0:3000), so redirects are built from the forwarded public host.
function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host && !/^(0\.0\.0\.0|127\.0\.0\.1|localhost)(:|$)/.test(host)) {
    return `${req.headers.get("x-forwarded-proto") || "https"}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "https://arthur-online.fly.dev";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/client/login?error=${encodeURIComponent(reason)}`, origin));

  if (!code) return fail(url.searchParams.get("error_description") || "Single sign-on did not complete.");

  const supabase = await getLoveleedayRouteClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("Single sign-on could not be verified. Try again.");

  return NextResponse.redirect(new URL(next, origin));
}
