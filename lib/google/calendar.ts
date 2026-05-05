/**
 * Google Calendar helper — OAuth2 refresh-token flow.
 * Supports multiple Google accounts stored in arthur_email_accounts.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

async function exchangeRefreshToken(refreshToken: string): Promise<string | null> {
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("[google/calendar] GOOGLE_OAUTH_CLIENT_ID / SECRET missing");
    return null;
  }

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

  const data = await res.json() as { access_token?: string; error?: string };
  if (!data.access_token) {
    console.error("[google/calendar] token refresh failed:", JSON.stringify(data).slice(0, 200));
    return null;
  }
  return data.access_token;
}

/** @deprecated Use listAllCalendarEvents() instead. */
export async function getGoogleAccessToken(): Promise<string | null> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    console.warn("[google/calendar] GOOGLE_REFRESH_TOKEN missing — skipping");
    return null;
  }
  return exchangeRefreshToken(refreshToken);
}

/**
 * Get an access token for a specific Google account by email — uses the
 * per-account refresh token stored in arthur_email_accounts. Used by
 * create_calendar_event tool to honor the "calendar events go to Dabney" rule.
 */
export async function getAccessTokenForEmail(email: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any).from("arthur_email_accounts").select("google_refresh_token").eq("email", email).single();
  if (error || !data?.google_refresh_token) {
    console.warn(`[google/calendar] no refresh_token for ${email}`);
    return null;
  }
  return exchangeRefreshToken(data.google_refresh_token as string);
}

/**
 * Create a calendar event on a specific Google account. Defaults to "primary".
 */
export async function createCalendarEvent(opts: {
  email: string;
  title: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
  description?: string;
  location?: string;
  attendees?: string[];
  calendarId?: string;
}): Promise<{ eventId: string; htmlLink: string } | { error: string }> {
  const token = await getAccessTokenForEmail(opts.email);
  if (!token) return { error: `No Google refresh token for ${opts.email} in arthur_email_accounts` };

  const calendarId = opts.calendarId || "primary";
  const body: Record<string, unknown> = {
    summary: opts.title,
    description: opts.description,
    location: opts.location,
    start: { dateTime: opts.start, timeZone: "America/Detroit" },
    end:   { dateTime: opts.end,   timeZone: "America/Detroit" },
  };
  if (opts.attendees?.length) body.attendees = opts.attendees.map(e => ({ email: e }));

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    return { error: `Google Calendar ${res.status}: ${txt.slice(0, 250)}` };
  }
  const data = await res.json() as { id?: string; htmlLink?: string };
  return { eventId: data.id ?? "(no id)", htmlLink: data.htmlLink ?? "" };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?:   { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  status?: string;
  account_email?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string; self?: boolean; organizer?: boolean }>;
}

// ---------------------------------------------------------------------------
// Per-account calendar list + event fetch
// ---------------------------------------------------------------------------

async function listCalendarIds(token: string): Promise<string[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    console.warn("[google/calendar] calendarList failed:", res.status);
    return ["primary"];
  }
  const data = await res.json() as { items?: { id: string; accessRole?: string }[] };
  return (data.items ?? []).map(c => c.id).filter(Boolean);
}

async function listEventsForCalendar(
  token: string,
  calendarId: string,
  start: string,
  end: string
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin:      start,
    timeMax:      end,
    singleEvents: "true",
    orderBy:      "startTime",
    maxResults:   "250",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text();
    console.warn("[google/calendar] events fetch failed:", res.status, calendarId, txt.slice(0, 100));
    return [];
  }
  const data = await res.json() as { items?: GCalEvent[] };
  return data.items ?? [];
}

// ---------------------------------------------------------------------------
// Multi-account entry point
// ---------------------------------------------------------------------------

/**
 * Queries ALL active Gmail accounts in arthur_email_accounts that have a
 * google_refresh_token, fetches every calendar for each, and returns a
 * merged + per-account-deduped list of events with account_email set.
 */
export async function listAllCalendarEvents(
  start: string,
  end: string
): Promise<GCalEvent[]> {
  const db = getSupabaseAdmin();

  // Fetch accounts that have a refresh token stored
  const { data: accounts, error } = await db
    .from("arthur_email_accounts")
    .select("id, email, google_refresh_token, google_calendar_ids")
    .eq("provider", "gmail")
    .eq("is_active", true)
    .not("google_refresh_token", "is", null);

  if (error) {
    console.error("[google/calendar] account query failed:", error.message);
    return [];
  }

  const allEvents: GCalEvent[] = [];

  for (const acct of accounts ?? []) {
    const rawToken = acct.google_refresh_token as string;
    // Sentinel: use the env var for the drinkswithdabney account
    const refreshToken =
      rawToken === "__ENV_GOOGLE_REFRESH_TOKEN__"
        ? (process.env.GOOGLE_REFRESH_TOKEN ?? "")
        : rawToken;

    if (!refreshToken) continue;

    const token = await exchangeRefreshToken(refreshToken);
    if (!token) continue;

    const accountEmail = acct.email as string;

    // Use stored calendar IDs if present, otherwise discover from API
    let calendarIds: string[] = (acct.google_calendar_ids as string[] | null) ?? [];
    if (calendarIds.length === 0) {
      calendarIds = await listCalendarIds(token);
    }

    // Dedup within this account by event id
    const seenIds = new Set<string>();
    for (const calId of calendarIds) {
      const events = await listEventsForCalendar(token, calId, start, end);
      for (const ev of events) {
        if (seenIds.has(ev.id)) continue;
        seenIds.add(ev.id);
        allEvents.push({ ...ev, account_email: accountEmail });
      }
    }
  }

  return allEvents;
}

// ---------------------------------------------------------------------------
// Legacy single-account (deprecated)
// ---------------------------------------------------------------------------

const LEGACY_CALENDAR_ID = "daniel.may@drinkswithdabney.com";

/** @deprecated Use listAllCalendarEvents() instead. */
export async function listCalendarEvents(
  start: string,
  end: string
): Promise<GCalEvent[]> {
  const token = await getGoogleAccessToken();
  if (!token) return [];

  const params = new URLSearchParams({
    timeMin:      start,
    timeMax:      end,
    singleEvents: "true",
    orderBy:      "startTime",
    maxResults:   "250",
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(LEGACY_CALENDAR_ID)}/events?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("[google/calendar] events fetch failed:", res.status, txt.slice(0, 200));
    return [];
  }

  const data = await res.json() as { items?: GCalEvent[] };
  return data.items ?? [];
}
