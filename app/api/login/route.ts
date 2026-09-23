import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseRouteClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Session token derived from server-only secrets — an attacker can't forge it
// without ARTHUR_ONLINE_PASSWORD + ARTHUR_SECRET. Mirror of middleware's edge
// computation (crypto.subtle) so the cookie validates on every request.
function sessionToken(user: string, pass: string): string {
  const secret = process.env.ARTHUR_SECRET || pass;
  return crypto.createHash("sha256").update(`${user}:${pass}:${secret}`).digest("hex");
}

export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string } = {};
  try { body = await req.json(); } catch {}

  const expectedUser = process.env.ARTHUR_ONLINE_USER || "daniel";
  const expectedPass = process.env.ARTHUR_ONLINE_PASSWORD;
  if (!expectedPass) {
    return NextResponse.json({ error: "auth not configured on the server" }, { status: 500 });
  }

  const user = (body.username || expectedUser).trim();
  const pass = body.password || "";
  if (user !== expectedUser || pass !== expectedPass) {
    return NextResponse.json({ error: "That password didn't match." }, { status: 401 });
  }

  // Bridge into a real Supabase Auth (AAL1) session so supabase.auth.mfa.*
  // has something to challenge. arthur-online has no per-user accounts —
  // ARTHUR_ONLINE_EMAIL/ARTHUR_ONLINE_SUPABASE_PASSWORD name the one Supabase
  // Auth identity created by scripts/bootstrap-mfa-user.mjs that stands in
  // for the shared password gate above. Best-effort: if this fails (env not
  // set, Supabase hiccup), the existing arthur_session cookie still gets set
  // below and the app works exactly as it did before MFA existed — this
  // never blocks Daniel's own login.
  let mfaRedirect: string | null = null;
  const bridgeEmail = process.env.ARTHUR_ONLINE_EMAIL;
  const bridgePassword = process.env.ARTHUR_ONLINE_SUPABASE_PASSWORD;
  if (bridgeEmail && bridgePassword) {
    try {
      const supabase = await getSupabaseRouteClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: bridgeEmail,
        password: bridgePassword,
      });
      if (!signInError && signInData.session) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
          mfaRedirect = "/mfa/challenge";
        } else if (process.env.ARTHUR_REQUIRE_MFA === "1" && (aal?.nextLevel ?? "aal1") !== "aal2") {
          // No verified factor yet, and MFA is mandatory org-wide — force enrollment.
          mfaRedirect = "/settings/security?enroll=1";
        }
      }
    } catch (err) {
      console.error("[api/login] Supabase MFA bridge sign-in failed:", err);
    }
  }

  const res = NextResponse.json({ ok: true, mfaRedirect });
  res.cookies.set("arthur_session", sessionToken(expectedUser, expectedPass), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
