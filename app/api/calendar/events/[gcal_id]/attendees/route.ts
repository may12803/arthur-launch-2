import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function getToken(accountEmail: string): Promise<string | null> {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const db = getSupabaseAdmin();
  const { data: acct } = await db
    .from("arthur_email_accounts")
    .select("google_refresh_token")
    .eq("email", accountEmail)
    .eq("provider", "gmail")
    .single();

  if (!acct?.google_refresh_token) return null;

  const rawToken = acct.google_refresh_token as string;
  const refreshToken = rawToken === "__ENV_GOOGLE_REFRESH_TOKEN__"
    ? (process.env.GOOGLE_REFRESH_TOKEN ?? "")
    : rawToken;

  if (!refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }).toString(),
  });
  const data = await res.json() as { access_token?: string };
  return data.access_token ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gcal_id: string }> }
) {
  const { gcal_id } = await params;
  const body = await req.json() as { email: string; name?: string; calendar_id?: string; account_email?: string };

  if (!body.email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  // Determine account email for token lookup
  const accountEmail = body.account_email ?? "";
  const calendarId   = body.calendar_id ?? "primary";

  const token = await getToken(accountEmail);
  if (!token) {
    return NextResponse.json({ error: "could not get google token" }, { status: 401 });
  }

  // Fetch the existing event
  const evRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcal_id)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!evRes.ok) {
    return NextResponse.json({ error: `gcal fetch failed: ${evRes.status}` }, { status: 502 });
  }
  const event = await evRes.json() as {
    attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  };

  const existingAttendees = event.attendees ?? [];
  const alreadyAdded = existingAttendees.some(a => a.email === body.email);
  if (!alreadyAdded) {
    existingAttendees.push({
      email:       body.email,
      displayName: body.name ?? undefined,
    });
  }

  // PATCH event with updated attendees
  const patchRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gcal_id)}?sendUpdates=all`,
    {
      method:  "PATCH",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attendees: existingAttendees }),
    }
  );

  if (!patchRes.ok) {
    const txt = await patchRes.text();
    return NextResponse.json({ error: `gcal patch failed: ${patchRes.status} ${txt.slice(0, 200)}` }, { status: 502 });
  }

  const updated = await patchRes.json();
  return NextResponse.json(updated);
}
