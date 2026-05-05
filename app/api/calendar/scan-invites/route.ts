import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logDecision } from "@/lib/superlearner/decisions";

export const runtime = "nodejs";

// ── Pushcut calendar invite notification ──────────────────────────────────────
async function sendPushcutInvite(params: {
  title: string;
  organizer: string;
  startIso: string | null;
}): Promise<void> {
  let apiKey: string | null = null;
  try {
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("arthur_secrets")
      .select("value")
      .eq("key", "pushcut_api_key")
      .single();
    apiKey = (data as { value?: string } | null)?.value ?? null;
  } catch { /* ignore */ }

  if (!apiKey) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://arthur-online.fly.dev";
  const startFmt = params.startIso
    ? new Date(params.startIso).toLocaleDateString("en-US", {
        timeZone: "America/Detroit",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  await fetch("https://api.pushcut.io/v1/notifications/arthur-action", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body:    JSON.stringify({
      title: `Calendar invite: ${params.title.slice(0, 60)}`,
      text:  `From ${params.organizer}${startFmt ? ` · ${startFmt}` : ""}`,
      defaultAction: { url: `${siteUrl}/calendar` },
    }),
  }).catch(() => {});
}

// ── Trust list ─────────────────────────────────────────────────────────────────

const TRUST_PATTERNS: RegExp[] = [
  /^kristie\.may@/i,
  /@drinkswithdabney\.com$/i,
  /^daniel\.may@/i,
];

function isTrusted(email: string): boolean {
  return TRUST_PATTERNS.some(p => p.test(email));
}

// ── Google OAuth ───────────────────────────────────────────────────────────────

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

// ── Google Calendar API ────────────────────────────────────────────────────────

interface GCalAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
  organizer?: boolean;
}

interface GCalEventRaw {
  id: string;
  summary?: string;
  status?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  organizer?: { email?: string; displayName?: string };
  attendees?: GCalAttendee[];
}

async function fetchCalendarEvents(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GCalEventRaw[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    showDeleted: "true",
    singleEvents: "true",
    maxResults: "250",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text();
    console.warn("[scan-invites] events fetch failed:", res.status, txt.slice(0, 100));
    return [];
  }
  const data = await res.json() as { items?: GCalEventRaw[] };
  return data.items ?? [];
}

async function patchAttendeeResponse(
  token: string,
  calendarId: string,
  eventId: string,
  responseStatus: "accepted" | "declined" | "tentative"
): Promise<boolean> {
  // Need to patch via the events.patch endpoint, setting the self attendee's responseStatus
  // We use sendUpdates=none to avoid spam
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`;

  // First fetch the event to get current attendees list
  const getRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!getRes.ok) return false;
  const ev = await getRes.json() as GCalEventRaw & { attendees?: GCalAttendee[] };

  const attendees = (ev.attendees ?? []).map(a => {
    if (a.self) return { ...a, responseStatus };
    return a;
  });

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

// ── Telegram ───────────────────────────────────────────────────────────────────

async function sendInviteTelegram(params: {
  botToken: string;
  chatId: string;
  decisionId: string;
  title: string;
  organizer: string;
  startIso: string | null;
  location?: string | null;
}): Promise<number | null> {
  const { botToken, chatId, decisionId, title, organizer, startIso, location } = params;

  let dateStr = "";
  if (startIso) {
    const d = new Date(startIso);
    dateStr = d.toLocaleString("en-US", {
      timeZone: "America/Detroit",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET";
  }

  const lines = [
    `📅 Invite: ${title}`,
    `from ${organizer}${dateStr ? ` · ${dateStr}` : ""}`,
  ];
  if (location) lines.push(location);

  const text = lines.join("\n");

  const payload = {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Accept",           callback_data: JSON.stringify({ t: "inv", a: decisionId, r: "accept" }) },
        { text: "❌ Decline",          callback_data: JSON.stringify({ t: "inv", a: decisionId, r: "decline" }) },
        { text: "💤 Keep tentative",   callback_data: JSON.stringify({ t: "inv", a: decisionId, r: "tentative" }) },
      ]],
    },
  };

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json() as { ok: boolean; result?: { message_id: number } };
  return data.ok ? (data.result?.message_id ?? null) : null;
}

async function sendTelegramFyi(botToken: string, chatId: string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.ARTHUR_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db          = getSupabaseAdmin();
  const botToken    = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId      = process.env.TELEGRAM_CHAT_ID  ?? "";

  const results = {
    scanned:       0,
    auto_accepted: 0,
    tentative:     0,
    cancelled:     0,
    errors:        [] as string[],
  };

  // Fetch all active Gmail accounts with a refresh token
  const { data: accounts, error: acctErr } = await db
    .from("arthur_email_accounts")
    .select("id, email, google_refresh_token")
    .eq("provider", "gmail")
    .eq("is_active", true)
    .not("google_refresh_token", "is", null);

  if (acctErr) {
    return NextResponse.json({ error: acctErr.message }, { status: 500 });
  }

  const now     = new Date();
  const timeMin = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // now-1h
  const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // now+30d

  for (const acct of accounts ?? []) {
    const rawToken = acct.google_refresh_token as string;
    const refreshToken =
      rawToken === "__ENV_GOOGLE_REFRESH_TOKEN__"
        ? (process.env.GOOGLE_REFRESH_TOKEN ?? "")
        : rawToken;

    if (!refreshToken) continue;

    const accountEmail = acct.email as string;
    const token = await exchangeRefreshToken(refreshToken);
    if (!token) {
      results.errors.push(`token_fail:${accountEmail}`);
      continue;
    }

    let events: GCalEventRaw[];
    try {
      events = await fetchCalendarEvents(token, accountEmail, timeMin, timeMax);
    } catch (e) {
      results.errors.push(`fetch_fail:${accountEmail}: ${(e as Error).message}`);
      continue;
    }

    for (const ev of events) {
      results.scanned++;

      // ── Cancelled event handling ────────────────────────────────────────────
      if (ev.status === "cancelled") {
        // Check if we have a decision row for this event
        const { data: existingDecision } = await db
          .from("arthur_invite_decisions")
          .select("id, decision, event_title, event_start_iso")
          .eq("gcal_event_id", ev.id)
          .single();

        if (existingDecision && existingDecision.decision !== "declined") {
          await db
            .from("arthur_invite_decisions")
            .update({ decision: "declined", updated_at: new Date().toISOString() })
            .eq("gcal_event_id", ev.id);

          results.cancelled++;

          if (botToken && chatId) {
            const title   = (existingDecision.event_title as string | null) ?? "Event";
            let dateStr = "";
            if (existingDecision.event_start_iso) {
              const d = new Date(existingDecision.event_start_iso as string);
              dateStr = " on " + d.toLocaleDateString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric" });
            }
            await sendTelegramFyi(botToken, chatId, `📅 Cancelled: ${title}${dateStr} — calendar updated.`);
          }
        }
        continue;
      }

      // ── Confirmed event — check if we need to act ──────────────────────────
      if (ev.status !== "confirmed") continue;

      // Find the current-user attendee with needsAction
      const selfAttendee = (ev.attendees ?? []).find(a => a.self && a.responseStatus === "needsAction");
      if (!selfAttendee) continue;

      // Skip if already in our decisions table
      const { data: existing } = await db
        .from("arthur_invite_decisions")
        .select("id")
        .eq("gcal_event_id", ev.id)
        .limit(1);

      if ((existing?.length ?? 0) > 0) continue;

      const organizerEmail = ev.organizer?.email ?? "";
      const organizerName  = ev.organizer?.displayName ?? organizerEmail;
      const startIso       = ev.start?.dateTime ?? ev.start?.date ?? null;
      const trusted        = isTrusted(organizerEmail);

      if (trusted) {
        // Auto-accept
        const patched = await patchAttendeeResponse(token, accountEmail, ev.id, "accepted");

        const { data: row } = await db
          .from("arthur_invite_decisions")
          .insert({
            gcal_event_id:   ev.id,
            organizer_email: organizerEmail,
            organizer_name:  organizerName,
            event_title:     ev.summary ?? null,
            event_start_iso: startIso,
            decision:        "auto_accepted",
          })
          .select("id")
          .single();

        if (!patched) {
          results.errors.push(`patch_fail:${ev.id} (auto_accept)`);
        }
        if (row) {
          results.auto_accepted++;
          // Log auto-accept to superlearner corpus
          logDecision({
            domain: "calendar_invite",
            source: "rule",
            input: { from: organizerEmail, subject: ev.summary ?? "(untitled)", body_excerpt: ev.summary ?? "" },
            decision: "auto_accepted",
            reason: "trusted organizer",
            confidence: 1.0,
            modelMetadata: { gcal_event_id: ev.id, organizer: organizerEmail },
          }).catch(() => {});
        }
      } else {
        // Mark tentative, send Telegram
        await patchAttendeeResponse(token, accountEmail, ev.id, "tentative");

        const { data: row, error: insertErr } = await db
          .from("arthur_invite_decisions")
          .insert({
            gcal_event_id:   ev.id,
            organizer_email: organizerEmail,
            organizer_name:  organizerName,
            event_title:     ev.summary ?? null,
            event_start_iso: startIso,
            decision:        "tentative",
          })
          .select("id")
          .single();

        if (insertErr || !row) {
          results.errors.push(`insert_fail:${ev.id}: ${insertErr?.message}`);
          continue;
        }

        if (botToken && chatId) {
          const msgId = await sendInviteTelegram({
            botToken,
            chatId,
            decisionId: row.id as string,
            title:      ev.summary ?? "(untitled)",
            organizer:  organizerName,
            startIso,
            location:   ev.location,
          });
          if (msgId) {
            await db
              .from("arthur_invite_decisions")
              .update({ telegram_message_id: msgId })
              .eq("id", row.id);
          }
        }

        // Also send Pushcut (no-ops if key missing)
        sendPushcutInvite({
          title:     ev.summary ?? "(untitled)",
          organizer: organizerName,
          startIso,
        }).catch(() => {});

        // Log tentative to superlearner corpus
        logDecision({
          domain: "calendar_invite",
          source: "rule",
          input: { from: organizerEmail, subject: ev.summary ?? "(untitled)", body_excerpt: ev.summary ?? "" },
          decision: "tentative",
          reason: "untrusted organizer — awaiting Daniel approval",
          confidence: 0.50,
          modelMetadata: { gcal_event_id: ev.id, decision_id: row.id as string },
        }).catch(() => {});

        results.tentative++;
      }
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
