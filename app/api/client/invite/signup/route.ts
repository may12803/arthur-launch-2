import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Creates a portal account for someone holding a live invite. Public sign-up is OFF on the LOVELEEDAY project,
// so this is the only way an account comes into existence: the invite must exist, be unaccepted and unexpired,
// and name this exact email. Uses the service-role key, which never leaves the server.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const service = process.env.LOVELEEDAY_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({ error: "Sign-up is unavailable right now." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (token.length < 12 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "That invitation link isn't valid." }, { status: 400 });
  if (password.length < 12) return NextResponse.json({ error: "Use at least 12 characters." }, { status: 400 });

  const H = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const q = `${url}/rest/v1/invites?token=eq.${encodeURIComponent(token)}&accepted_at=is.null&select=email,expires_at`;
  const inv = await fetch(q, { headers: H, cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const invite = Array.isArray(inv) ? inv[0] : null;
  if (!invite || new Date(invite.expires_at) <= new Date()) return NextResponse.json({ error: "This invitation has expired or was already used." }, { status: 410 });
  if (String(invite.email).toLowerCase() !== email) return NextResponse.json({ error: "Use the email address this invitation was sent to." }, { status: 403 });

  const r = await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true }) });
  if (r.ok) {
    // P24: the invite was checked before the account existed. Re-read it now so a token consumed or expired in between is reported
    // with a recovery path instead of a silent account that has no membership.
    const again = await fetch(q, { headers: H, cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    const still = Array.isArray(again) ? again[0] : null;
    if (!still || new Date(still.expires_at) <= new Date()) {
      return NextResponse.json({ created: true, error: "Your account was created, but this invitation is no longer valid. Sign in, then ask for a new invitation." }, { status: 410 });
    }
    return NextResponse.json({ ok: true });
  }
  const t = await r.text();
  if (r.status === 422 || /already (been )?registered|exists/i.test(t)) return NextResponse.json({ exists: true });
  if (/pwned|leaked|weak/i.test(t)) return NextResponse.json({ error: "That password has appeared in a data breach. Choose a different one." }, { status: 400 });
  return NextResponse.json({ error: "We couldn't create your account. Try again." }, { status: 502 });
}
