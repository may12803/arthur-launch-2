import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logCorrection } from "@/lib/superlearner/decisions";

export const runtime = "nodejs";

async function exchangeRefreshToken(refreshToken: string): Promise<string | null> {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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

interface GCalAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
}

async function patchAttendeeResponse(
  token: string,
  calendarId: string,
  eventId: string,
  responseStatus: "accepted" | "declined" | "tentative"
): Promise<boolean> {
  const getRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!getRes.ok) return false;
  const ev = await getRes.json() as { attendees?: GCalAttendee[] };

  const attendees = (ev.attendees ?? []).map(a => {
    if (a.self) return { ...a, responseStatus };
    return a;
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`;
  const patchRes = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ attendees }),
  });
  return patchRes.ok;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.ARTHUR_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { decision_id?: string; decision?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { decision_id, decision } = body;
  if (!decision_id || !decision) {
    return NextResponse.json({ error: "decision_id and decision required" }, { status: 400 });
  }
  if (!["accepted", "declined", "tentative"].includes(decision)) {
    return NextResponse.json({ error: "invalid decision value" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Fetch the decision row
  const { data: row, error: fetchErr } = await db
    .from("arthur_invite_decisions")
    .select("*")
    .eq("id", decision_id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "decision not found" }, { status: 404 });
  }

  const gcalEventId = row.gcal_event_id as string;

  // Find the Gmail account to get a refresh token
  const { data: accounts } = await db
    .from("arthur_email_accounts")
    .select("email, google_refresh_token")
    .eq("provider", "gmail")
    .eq("is_active", true)
    .not("google_refresh_token", "is", null)
    .limit(10);

  let patched = false;
  for (const acct of accounts ?? []) {
    const rawToken = acct.google_refresh_token as string;
    const refreshToken =
      rawToken === "__ENV_GOOGLE_REFRESH_TOKEN__"
        ? (process.env.GOOGLE_REFRESH_TOKEN ?? "")
        : rawToken;
    if (!refreshToken) continue;

    const token = await exchangeRefreshToken(refreshToken);
    if (!token) continue;

    const accountEmail = acct.email as string;
    const ok = await patchAttendeeResponse(
      token,
      accountEmail,
      gcalEventId,
      decision as "accepted" | "declined" | "tentative"
    );
    if (ok) { patched = true; break; }
  }

  // Update the decision row
  await db
    .from("arthur_invite_decisions")
    .update({
      decision,
      approved_by: "telegram",
      updated_at: new Date().toISOString(),
    })
    .eq("id", decision_id);

  // Log correction to superlearner corpus
  const priorDecision = (row.decision as string) ?? "tentative";
  const reward = decision === "accepted" && priorDecision === "tentative" ? 1
    : decision === "declined" && priorDecision === "auto_accepted" ? -1
    : decision === "declined" && priorDecision === "tentative" ? 0
    : 0;
  const createdAt = row.created_at as string | null;
  logCorrection({
    domain: "calendar_invite",
    priorDecision,
    correctDecision: decision,
    reward,
    source: "telegram",
    latencyMs: createdAt ? Date.now() - new Date(createdAt).getTime() : undefined,
    notes: `gcal_event_id:${gcalEventId}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, gcal_event_id: gcalEventId, response_status: decision, patched });
}
