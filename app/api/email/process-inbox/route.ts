import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { archiveMessage } from "@/lib/nylas";
import { logDecision, loadActivePrompt } from "@/lib/superlearner/decisions";
import crypto from "crypto";
import { rateLimit } from "@/lib/_auth";

export const runtime = "nodejs";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProcessInboxBody {
  source?: "yahoo" | "all";
  limit?: number;
}

interface NylasMessage {
  id: string;
  subject?: string;
  from?: Array<{ email: string; name?: string }>;
  body?: string;
  snippet?: string;
  date?: number;
  unread?: boolean;
}

interface CalendarInfo {
  has_event: boolean;
  title: string | null;
  start_iso: string | null;
  end_iso: string | null;
  location: string | null;
  description: string | null;
}

interface DraftResult {
  should_reply: boolean;
  reasoning: string;
  draft_subject: string;
  draft_body: string;
  calendar: CalendarInfo;
}

interface Extraction {
  extraction_type: "tracking" | "ticket" | "reservation" | "calendar_event";
  carrier?: string;
  tracking_number?: string;
  tracking_url?: string;
  delivery_eta_iso?: string;
  ticket_event_name?: string;
  ticket_venue?: string;
  ticket_seat?: string;
  ticket_url?: string;
  ticket_barcode_url?: string;
  event_start_iso?: string;
  event_end_iso?: string;
  reservation_type?: string;
  reservation_provider?: string;
  reservation_confirmation?: string;
  reservation_check_in_iso?: string;
  reservation_check_out_iso?: string;
  reservation_location?: string;
  reservation_party_size?: number;
  raw_amount_usd?: number;
  metadata?: Record<string, unknown>;
}

interface ExtractionResult {
  extractions: Extraction[];
}

// ── Nylas helper ───────────────────────────────────────────────────────────────

async function nylasRequest(path: string, nylasApiKey: string) {
  const url = `https://api.us.nylas.com${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${nylasApiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nylas ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}


// ── Haiku helpers ──────────────────────────────────────────────────────────────

function parseJSON<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

async function callHaiku(messages: Array<{ role: string; content: string }>, system: string, maxTokens = 1024): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Haiku ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.content?.[0]?.text as string) || "";
}

// Cache active prompt per domain for the lifetime of this request batch
let _replyDraftPromptCache: Awaited<ReturnType<typeof loadActivePrompt>> | undefined;
async function getReplyDraftPrompt() {
  if (_replyDraftPromptCache !== undefined) return _replyDraftPromptCache;
  _replyDraftPromptCache = await loadActivePrompt("reply_draft").catch(() => null);
  return _replyDraftPromptCache;
}

async function generateDraft(
  fromEmail: string,
  fromName: string | undefined,
  subject: string,
  bodyText: string
): Promise<DraftResult> {
  const senderLine = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const bodyTrunc = bodyText.slice(0, 4000);

  const HARDCODED_SYSTEM = `You are Arthur, the AI executive assistant for Daniel May — entrepreneur and co-owner of:
- Dabney & Co. (cocktail bar & lounge, Kalamazoo MI)
- olldae (bar/restaurant operating system SaaS)
- LOVELEEDAY Studios (boutique dev studio)
- Aspen & May (holding company)

Decide if the email warrants a reply, then draft one in Daniel's terse, direct voice. No fluff, no "Hope this finds you well." Sign off only with "— Daniel".

SKIP REPLIES (should_reply: false) for: marketing, newsletters, promotions, security alerts, automated notifications, order confirmations, receipts, social notifications.
DRAFT REPLIES (should_reply: true) for: direct human messages, business inquiries, scheduling requests, catering/venue inquiries, partnership/sales asks, client follow-ups.

Respond with valid JSON only — no markdown fences:
{
  "should_reply": true|false,
  "reasoning": "one sentence",
  "draft_subject": "Re: <subject>",
  "draft_body": "full reply",
  "calendar": {
    "has_event": true|false,
    "title": "title or null",
    "start_iso": "ISO8601 or null",
    "end_iso": "ISO8601 or null",
    "location": "location or null",
    "description": "summary or null"
  }
}`;
  const livePrompt = await getReplyDraftPrompt();
  const systemPrompt = livePrompt ? livePrompt.promptText : HARDCODED_SYSTEM;
  const promptVersion = livePrompt?.version ?? "hardcoded-v1";

  const userMsg = `FROM: ${senderLine}\nSUBJECT: ${subject || "(no subject)"}\nBODY:\n${bodyTrunc}`;
  const raw = await callHaiku([{ role: "user", content: userMsg }], systemPrompt, 1200);
  const parsed = parseJSON<{
    should_reply: boolean;
    reasoning: string;
    draft_subject: string;
    draft_body: string;
    calendar: Partial<CalendarInfo>;
  }>(raw);

  return {
    should_reply: Boolean(parsed.should_reply),
    reasoning: parsed.reasoning || "",
    draft_subject: parsed.draft_subject || `Re: ${subject}`,
    draft_body: parsed.draft_body || "",
    calendar: {
      has_event: Boolean(parsed.calendar?.has_event),
      title: parsed.calendar?.title || null,
      start_iso: parsed.calendar?.start_iso || null,
      end_iso: parsed.calendar?.end_iso || null,
      location: parsed.calendar?.location || null,
      description: parsed.calendar?.description || null,
    },
  };
}

// ── Structured extraction (tracking / tickets / reservations) ──────────────────

const EXTRACTION_SYSTEM = `You are a structured data extraction assistant. Extract tracking numbers, tickets, and reservations from email content. Be precise — never guess or invent data.

Return JSON with one key "extractions" — an array of up to 3 items. Each has "extraction_type": "tracking"|"ticket"|"reservation".

TRACKING:
{ "extraction_type": "tracking", "carrier": "USPS|UPS|FedEx|DHL|Amazon", "tracking_number": "exact number", "delivery_eta_iso": "ISO8601 or null", "metadata": { "match_text": "raw snippet" } }

TICKET:
{ "extraction_type": "ticket", "ticket_event_name": "...", "ticket_venue": "...", "ticket_seat": "...", "ticket_url": "...", "ticket_barcode_url": "...", "event_start_iso": "ISO8601 or null", "event_end_iso": "ISO8601 or null", "metadata": { "match_text": "..." } }

RESERVATION:
{ "extraction_type": "reservation", "reservation_type": "hotel|flight|restaurant|car|train", "reservation_provider": "...", "reservation_confirmation": "...", "reservation_check_in_iso": "ISO8601 or null", "reservation_check_out_iso": "ISO8601 or null", "reservation_location": "...", "reservation_party_size": null, "raw_amount_usd": null, "metadata": { "match_text": "..." } }

Rules: return { "extractions": [] } if nothing found. Strip spaces from tracking numbers. Return ONLY valid JSON, no markdown fences.`;

function buildTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const n = encodeURIComponent(trackingNumber.trim());
  switch ((carrier || "").toUpperCase()) {
    case "USPS":   return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "UPS":    return `https://www.ups.com/track?tracknum=${n}`;
    case "FEDEX":  return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "DHL":    return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}`;
    case "AMAZON": return `https://track.amazon.com/tracking/${n}`;
    default:       return null;
  }
}

async function extractStructured(
  fromEmail: string,
  subject: string,
  bodyText: string
): Promise<ExtractionResult> {
  const body = bodyText.slice(0, 5000);
  if (!body.trim() && !subject) return { extractions: [] };

  const userMsg = `FROM: ${fromEmail}\nSUBJECT: ${subject || "(no subject)"}\nBODY:\n${body}`;

  try {
    const raw = await callHaiku([{ role: "user", content: userMsg }], EXTRACTION_SYSTEM, 900);
    const result = parseJSON<{ extractions: Extraction[] }>(raw);
    const extractions: Extraction[] = Array.isArray(result.extractions) ? result.extractions.slice(0, 3) : [];

    for (const ex of extractions) {
      if (ex.extraction_type === "tracking") {
        if (!ex.tracking_url && ex.carrier && ex.tracking_number) {
          ex.tracking_url = buildTrackingUrl(ex.carrier, ex.tracking_number) ?? undefined;
        }
        if (ex.carrier) ex.carrier = ex.carrier.toUpperCase();
        if (ex.tracking_number) ex.tracking_number = ex.tracking_number.replace(/\s+/g, "");
      }
    }

    return { extractions };
  } catch (e) {
    console.error("[process-inbox] extractStructured error:", (e as Error).message);
    return { extractions: [] };
  }
}

// ── Telegram helpers ───────────────────────────────────────────────────────────

function escMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");
}

// ── Pushcut approval notification ─────────────────────────────────────────────
// Fires a push notification to Daniel's iPhone with Approve / Skip buttons.
// No-ops silently if PUSHCUT_API_KEY is not set.
async function sendPushcutApproval(params: {
  approvalId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  bodyExcerpt: string;
}): Promise<void> {
  // Load API key from Supabase arthur_secrets
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

  const secret   = process.env.ARTHUR_SECRET ?? "";
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL || "https://arthur-online.fly.dev";
  const hourTs   = Math.floor(Date.now() / 3600000);

  function makeToken(action: string) {
    const payload  = `${action}:${params.approvalId}:${hourTs}`;
    const hmac     = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return `${hmac}:${hourTs}`;
  }

  const approveUrl = `${siteUrl}/api/iphone/approval-action?action=approve&approval_id=${params.approvalId}&token=${makeToken("approve")}`;
  const skipUrl    = `${siteUrl}/api/iphone/approval-action?action=skip&approval_id=${params.approvalId}&token=${makeToken("skip")}`;

  const title = `Reply needed: ${params.subject.slice(0, 60)}`;
  const text  = `From: ${params.fromName || params.fromEmail}\n${params.bodyExcerpt.slice(0, 150)}`;

  const body = {
    title,
    text,
    defaultAction: { url: approveUrl },
    actions: [
      { name: "Approve & Send", url: approveUrl },
      { name: "Skip",           url: skipUrl },
    ],
  };

  await fetch("https://api.pushcut.io/v1/notifications/arthur-action", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body:    JSON.stringify(body),
  });
}

async function sendTelegramApproval(params: {
  botToken: string;
  chatId: string;
  approvalId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  bodyExcerpt: string;
  draftTo: string;
  draftSubject: string;
  draftBody: string;
  calendar: CalendarInfo;
}): Promise<number | null> {
  const { botToken, chatId, approvalId, fromName, fromEmail, subject, bodyExcerpt, draftSubject, draftBody, calendar } = params;

  const calSection = calendar.has_event
    ? `\n\n📅 *Event detected:* ${calendar.title || "untitled"}${calendar.start_iso ? `\n🕐 ${calendar.start_iso}` : ""}${calendar.location ? `\n📍 ${calendar.location}` : ""}`
    : "";

  const text = [
    `📬 *New email needs a reply*`,
    ``,
    `*From:* ${escMd(fromName || fromEmail)} \\<${escMd(fromEmail)}\\>`,
    `*Subject:* ${escMd(subject)}`,
    ``,
    `*Preview:*`,
    `_${escMd(bodyExcerpt.slice(0, 300))}_`,
    ``,
    `*Proposed reply \\(${escMd(draftSubject)}\\):*`,
    `\`\`\``,
    draftBody.slice(0, 800),
    `\`\`\``,
    calSection,
  ].join("\n");

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve & Send", callback_data: JSON.stringify({ t: "approve", a: approvalId }) },
          { text: "✏️ Edit", callback_data: JSON.stringify({ t: "edit", a: approvalId }) },
          { text: "❌ Skip", callback_data: JSON.stringify({ t: "skip", a: approvalId }) },
        ],
      ],
    },
  };

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error("[process-inbox] Telegram send error:", JSON.stringify(data).slice(0, 300));
    return null;
  }
  return data.result?.message_id ?? null;
}

async function sendExtractionAlert(params: {
  botToken: string;
  chatId: string;
  type: "tracking" | "ticket" | "reservation";
  summary: string;
  calendarUrl?: string;
}): Promise<void> {
  const { botToken, chatId, type, summary, calendarUrl } = params;

  const icon = type === "tracking" ? "📦" : type === "ticket" ? "🎟️" : "🏨";
  const label = type === "tracking" ? "Tracking captured" : type === "ticket" ? "Tickets stored" : "Reservation stored";
  const text = `${icon} *${label}:* ${summary}`;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };

  if (calendarUrl) {
    payload.reply_markup = { inline_keyboard: [[{ text: "📅 Open Calendar", url: calendarUrl }]] };
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const fallback = { chat_id: chatId, text: `${icon} ${label}: ${summary}`, ...(calendarUrl ? { reply_markup: { inline_keyboard: [[{ text: "📅 Open Calendar", url: calendarUrl }]] } } : {}) };
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fallback),
    });
  }
}

// ── Google Calendar helper ─────────────────────────────────────────────────────

async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn("[process-inbox] Google Calendar creds missing — skipping event creation");
    return null;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error("[process-inbox] Google token refresh failed:", JSON.stringify(tokenData).slice(0, 200));
    return null;
  }
  return tokenData.access_token as string;
}

async function createCalendarEvent(cal: CalendarInfo): Promise<string | null> {
  if (!cal.has_event || !cal.start_iso) return null;

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return null;

  const calendarId = "daniel.may@drinkswithdabney.com";
  const endIso = cal.end_iso || (() => { const s = new Date(cal.start_iso!); s.setHours(s.getHours() + 1); return s.toISOString(); })();

  const event = {
    summary: cal.title || "Meeting",
    description: cal.description || "",
    location: cal.location || "",
    start: { dateTime: cal.start_iso, timeZone: "America/Detroit" },
    end: { dateTime: endIso, timeZone: "America/Detroit" },
  };

  const evRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  const evData = await evRes.json();
  if (!evRes.ok) { console.error("[process-inbox] Calendar event create failed:", JSON.stringify(evData).slice(0, 300)); return null; }
  return (evData.id as string) || null;
}

/**
 * Create a calendar event for an extraction (tracking delivery, reservation, ticket).
 * Returns { id, htmlLink } or null.
 */
async function createExtractionCalendarEvent(extraction: Extraction, emailSubject: string): Promise<{ id: string; htmlLink: string } | null> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return null;

  const calendarId = "daniel.may@drinkswithdabney.com";
  let event: Record<string, unknown> | null = null;

  if (extraction.extraction_type === "tracking" && extraction.delivery_eta_iso) {
    const dateOnly = extraction.delivery_eta_iso.slice(0, 10);
    const carrier = extraction.carrier || "Package";
    const shortSubject = emailSubject.slice(0, 40);
    event = {
      summary: `📦 ${carrier} delivery (${shortSubject})`,
      description: extraction.tracking_url || extraction.tracking_number || "",
      start: { date: dateOnly },
      end: { date: dateOnly },
    };
  } else if (extraction.extraction_type === "ticket" && extraction.event_start_iso) {
    const endIso = extraction.event_end_iso || (() => {
      const s = new Date(extraction.event_start_iso!);
      s.setHours(s.getHours() + 3);
      return s.toISOString();
    })();
    event = {
      summary: `🎟️ ${extraction.ticket_event_name || "Event"}`,
      location: extraction.ticket_venue || "",
      description: extraction.ticket_url || "",
      start: { dateTime: extraction.event_start_iso, timeZone: "America/Detroit" },
      end: { dateTime: endIso, timeZone: "America/Detroit" },
    };
  } else if (extraction.extraction_type === "reservation") {
    const provider = extraction.reservation_provider || "Reservation";
    const resType = extraction.reservation_type || "reservation";
    const checkIn = extraction.reservation_check_in_iso;
    const checkOut = extraction.reservation_check_out_iso;
    const confirmation = extraction.reservation_confirmation ? `Confirmation: ${extraction.reservation_confirmation}` : "";

    if (checkIn) {
      const isDateOnly = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);
      if (isDateOnly(checkIn) || !checkOut) {
        const dateStr = checkIn.slice(0, 10);
        const endDate = checkOut ? checkOut.slice(0, 10) : dateStr;
        event = {
          summary: `🏨 ${resType} — ${provider}`,
          location: extraction.reservation_location || "",
          description: confirmation,
          start: { date: dateStr },
          end: { date: endDate },
        };
      } else {
        event = {
          summary: `🏨 ${resType} — ${provider}`,
          location: extraction.reservation_location || "",
          description: confirmation,
          start: { dateTime: checkIn, timeZone: "America/Detroit" },
          end: { dateTime: checkOut, timeZone: "America/Detroit" },
        };
      }
    }
  }

  if (!event) return null;

  const evRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  const evData = await evRes.json();
  if (!evRes.ok) { console.error("[process-inbox] Extraction calendar event failed:", JSON.stringify(evData).slice(0, 300)); return null; }
  return { id: evData.id as string, htmlLink: evData.htmlLink as string };
}

// ── Dedup helper ───────────────────────────────────────────────────────────────

async function isAlreadyProcessed(db: ReturnType<typeof getSupabaseAdmin>, yahooMsgId: string): Promise<boolean> {
  const { data } = await db.from("arthur_email_approvals").select("id").eq("yahoo_msg_id", yahooMsgId).limit(1);
  return (data?.length ?? 0) > 0;
}

async function hasExistingExtractions(db: ReturnType<typeof getSupabaseAdmin>, yahooMsgId: string): Promise<boolean> {
  const { data } = await db.from("arthur_email_extractions").select("id").eq("yahoo_msg_id", yahooMsgId).limit(1);
  return (data?.length ?? 0) > 0;
}

// ── Insert extractions + create calendar events + send Telegram alerts ─────────

async function processExtractions(
  db: ReturnType<typeof getSupabaseAdmin>,
  extractions: Extraction[],
  yahooMsgId: string,
  subject: string,
  botToken: string,
  chatId: string,
  approvalId?: string,
  calendarEventsOut?: string[]
): Promise<number> {
  let inserted = 0;

  for (const ex of extractions) {
    // Create calendar event
    let calEventId: string | null = null;
    let calEventUrl: string | null = null;

    const needsCalendar =
      (ex.extraction_type === "tracking" && !!ex.delivery_eta_iso) ||
      (ex.extraction_type === "ticket" && !!ex.event_start_iso) ||
      (ex.extraction_type === "reservation" && !!ex.reservation_check_in_iso);

    if (needsCalendar) {
      try {
        const calResult = await createExtractionCalendarEvent(ex, subject);
        if (calResult) {
          calEventId = calResult.id;
          calEventUrl = calResult.htmlLink;
          if (calendarEventsOut) calendarEventsOut.push(calEventId);
        }
      } catch (e) {
        console.error("[process-inbox] Calendar create error:", (e as Error).message);
      }
    }

    // Insert extraction row
    const row: Record<string, unknown> = {
      yahoo_msg_id: yahooMsgId,
      extraction_type: ex.extraction_type,
      metadata: ex.metadata || {},
      calendar_event_id: calEventId,
    };
    if (approvalId) row.approval_id = approvalId;
    if (ex.carrier) row.carrier = ex.carrier;
    if (ex.tracking_number) row.tracking_number = ex.tracking_number;
    if (ex.tracking_url) row.tracking_url = ex.tracking_url;
    if (ex.delivery_eta_iso) row.delivery_eta_iso = ex.delivery_eta_iso;
    if (ex.ticket_event_name) row.ticket_event_name = ex.ticket_event_name;
    if (ex.ticket_venue) row.ticket_venue = ex.ticket_venue;
    if (ex.ticket_seat) row.ticket_seat = ex.ticket_seat;
    if (ex.ticket_url) row.ticket_url = ex.ticket_url;
    if (ex.ticket_barcode_url) row.ticket_barcode_url = ex.ticket_barcode_url;
    if (ex.reservation_type) row.reservation_type = ex.reservation_type;
    if (ex.reservation_provider) row.reservation_provider = ex.reservation_provider;
    if (ex.reservation_confirmation) row.reservation_confirmation = ex.reservation_confirmation;
    if (ex.reservation_check_in_iso) row.reservation_check_in_iso = ex.reservation_check_in_iso;
    if (ex.reservation_check_out_iso) row.reservation_check_out_iso = ex.reservation_check_out_iso;
    if (ex.reservation_location) row.reservation_location = ex.reservation_location;
    if (ex.reservation_party_size) row.reservation_party_size = ex.reservation_party_size;
    if (ex.raw_amount_usd) row.raw_amount_usd = ex.raw_amount_usd;

    const { error } = await db.from("arthur_email_extractions").insert(row);
    if (error) {
      console.error("[process-inbox] Extraction insert error:", error.message);
      continue;
    }
    inserted++;

    // Build Telegram alert summary
    let alertSummary = "";
    let alertType: "tracking" | "ticket" | "reservation" = "tracking";

    if (ex.extraction_type === "tracking") {
      alertType = "tracking";
      const num = ex.tracking_number ? ex.tracking_number.slice(-6) : "?";
      alertSummary = `${ex.carrier || "Carrier"} ...${num} — ${subject.slice(0, 50)}`;
    } else if (ex.extraction_type === "ticket") {
      alertType = "ticket";
      alertSummary = ex.ticket_event_name || subject.slice(0, 60);
      if (ex.event_start_iso) {
        const d = new Date(ex.event_start_iso);
        alertSummary += ` (${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })})`;
      }
    } else if (ex.extraction_type === "reservation") {
      alertType = "reservation";
      const p = ex.reservation_provider || ex.reservation_type || "Reservation";
      alertSummary = p;
      if (ex.reservation_check_in_iso) {
        const d = new Date(ex.reservation_check_in_iso);
        alertSummary += ` — check-in ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      }
    } else {
      continue; // calendar_event handled elsewhere
    }

    // Send Telegram alert (non-blocking, don't fail the loop on error)
    try {
      await sendExtractionAlert({
        botToken,
        chatId,
        type: alertType,
        summary: alertSummary,
        calendarUrl: calEventUrl || undefined,
      });
    } catch (e) {
      console.error("[process-inbox] sendExtractionAlert error:", (e as Error).message);
    }
  }

  return inserted;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("authorization") ?? "";
  const secret1 = process.env.AUTOMATION_SECRET;
  const secret2 = process.env.ARTHUR_SECRET;
  if (
    (!secret1 || authHeader !== `Bearer ${secret1}`) &&
    (!secret2 || authHeader !== `Bearer ${secret2}`)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: max 10 inbox runs/min (each run calls LLM for every message)
  const rl = await rateLimit("process-inbox", 10, 60);
  if (rl) return rl;

  let body: ProcessInboxBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const limit = Math.min(body.limit ?? 20, 50);

  const nylasApiKey = process.env.NYLAS_API_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!nylasApiKey) return NextResponse.json({ error: "NYLAS_API_KEY not set" }, { status: 500 });
  if (!botToken || !chatId) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set" }, { status: 500 });

  const db = getSupabaseAdmin();

  // Resolve which grant(s) to process
  // If source=all (or omitted), iterate all is_active=true accounts from DB
  // If source=yahoo (legacy), fall back to the hardcoded Yahoo grant for backwards compat
  let grantsToProcess: Array<{ grant_id: string; email: string; provider: string }> = [];

  if (!body.source || body.source === "all") {
    const { data: accounts } = await db
      .from("arthur_email_accounts")
      .select("grant_id,email,provider")
      .eq("is_active", true);
    grantsToProcess = (accounts ?? []) as Array<{ grant_id: string; email: string; provider: string }>;
    if (grantsToProcess.length === 0) {
      // Fallback to hardcoded Yahoo grant if table is empty
      grantsToProcess = [{
        grant_id: process.env.NYLAS_GRANT_YAHOO || "bccc3ee8-42a4-4acd-8663-ac0533d90135",
        email: "may.dj@yahoo.com",
        provider: "imap",
      }];
    }
  } else {
    // Legacy source=yahoo
    grantsToProcess = [{
      grant_id: process.env.NYLAS_GRANT_YAHOO || "bccc3ee8-42a4-4acd-8663-ac0533d90135",
      email: "may.dj@yahoo.com",
      provider: "imap",
    }];
  }

  // Fetch messages from all grants
  let messages: NylasMessage[] = [];
  // Track which grant each message belongs to (for archive routing)
  const msgGrantMap = new Map<string, string>();
  for (const grantInfo of grantsToProcess) {
    try {
      const inboxFolderId = `v0:${grantInfo.grant_id}:INBOX`;
      const nylasData = await nylasRequest(
        `/v3/grants/${grantInfo.grant_id}/messages?in=${encodeURIComponent(inboxFolderId)}&limit=${limit}`,
        nylasApiKey
      );
      const grantMessages = (nylasData.data || []) as NylasMessage[];
      for (const m of grantMessages) msgGrantMap.set(m.id, grantInfo.grant_id);
      messages = messages.concat(grantMessages);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[process-inbox] grant ${grantInfo.email} failed: ${msg}`);
      // Don't hard-fail on one grant — continue with others
    }
  }

  // Update last_synced_at for processed grants
  for (const grantInfo of grantsToProcess) {
    await db.from("arthur_email_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("grant_id", grantInfo.grant_id);
  }

  const results = {
    total: messages.length,
    grants_processed: grantsToProcess.length,
    processed: 0,
    skipped_no_reply: 0,
    skipped_dedup: 0,
    approval_ids: [] as string[],
    calendar_events: [] as string[],
    extractions_inserted: 0,
    errors: [] as string[],
  };

  for (const msg of messages) {
    const msgId = msg.id;
    const fromEmail = msg.from?.[0]?.email || "";
    const fromName = msg.from?.[0]?.name || "";
    const subject = msg.subject || "(no subject)";
    const bodyText = msg.body || msg.snippet || "";

    try {
      // Dedup — skip if already in approvals
      if (await isAlreadyProcessed(db, msgId)) {
        results.skipped_dedup++;
        continue;
      }

      // Run draft generation + structured extraction in parallel
      const [draft, extractionResult] = await Promise.all([
        generateDraft(fromEmail, fromName, subject, bodyText).catch((e: Error) => {
          results.errors.push(`draft_error:${msgId}: ${e.message}`);
          return null;
        }),
        extractStructured(fromEmail, subject, bodyText),
      ]);

      if (!draft) continue;

      // Log reply_draft decision to superlearner corpus (non-blocking)
      logDecision({
        domain: "reply_draft",
        source: "haiku_4_5",
        input: {
          from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
          subject,
          body_excerpt: bodyText.slice(0, 500),
          msg_id: msgId,
          grant_id: msgGrantMap.get(msgId),
        },
        decision: draft.should_reply ? "should_reply" : "skip_reply",
        reason: draft.reasoning,
        confidence: 0.85,
        modelMetadata: { model: "claude-haiku-4-5" },
      }).catch(() => {});

      // Process extractions (insert rows, create calendar events, send alerts)
      // Only run if we haven't extracted this message before
      if (extractionResult.extractions.length > 0) {
        const alreadyExtracted = await hasExistingExtractions(db, msgId);
        if (!alreadyExtracted) {
          const inserted = await processExtractions(
            db,
            extractionResult.extractions,
            msgId,
            subject,
            botToken,
            chatId,
            undefined,
            results.calendar_events
          );
          results.extractions_inserted += inserted;
        }
      }

      // Create calendar event from draft (meeting/event detection)
      let calEventId: string | null = null;
      if (draft.calendar.has_event) {
        calEventId = await createCalendarEvent(draft.calendar);
        if (calEventId) results.calendar_events.push(calEventId);
      }

      if (!draft.should_reply) {
        results.skipped_no_reply++;

        // Still store calendar event reference if we made one
        if (calEventId) {
          await db.from("arthur_email_approvals").insert({
            yahoo_msg_id: msgId,
            from_email: fromEmail,
            from_name: fromName || null,
            subject,
            body_excerpt: bodyText.slice(0, 500),
            draft_to: fromEmail,
            draft_subject: draft.draft_subject || `Re: ${subject}`,
            draft_body: draft.draft_body || "(no reply needed)",
            status: "skipped",
            calendar_event_id: calEventId,
          });
        }

        // Archive the source message — no reply needed, move it out of INBOX
        const sourceGrantId = msgGrantMap.get(msgId);
        if (sourceGrantId) {
          const archiveErr = await archiveMessage(msgId, sourceGrantId, nylasApiKey);
          if (archiveErr) {
            results.errors.push(`archive_error ${msgId.slice(-8)}: ${archiveErr}`);
            console.warn(`[process-inbox] archive failed: ${archiveErr}`);
          } else {
            console.log(`[process-inbox] archived ${msgId.slice(-8)} (no reply needed)`);
          }
        }

        continue;
      }

      // Insert approval row
      const { data: approvalRow, error: insertErr } = await db
        .from("arthur_email_approvals")
        .insert({
          yahoo_msg_id: msgId,
          from_email: fromEmail,
          from_name: fromName || null,
          subject,
          body_excerpt: bodyText.slice(0, 500),
          draft_to: fromEmail,
          draft_subject: draft.draft_subject,
          draft_body: draft.draft_body,
          status: "pending",
          calendar_event_id: calEventId,
        })
        .select("id")
        .single();

      if (insertErr || !approvalRow) {
        results.errors.push(`insert_error:${msgId}: ${insertErr?.message}`);
        continue;
      }

      const approvalId: string = approvalRow.id;

      // Send Telegram approval request
      const telegramMsgId = await sendTelegramApproval({
        botToken,
        chatId,
        approvalId,
        fromName,
        fromEmail,
        subject,
        bodyExcerpt: bodyText.slice(0, 400),
        draftTo: fromEmail,
        draftSubject: draft.draft_subject,
        draftBody: draft.draft_body,
        calendar: draft.calendar,
      });

      // Send Pushcut notification (fires in parallel with Telegram — no-ops if key missing)
      sendPushcutApproval({
        approvalId,
        fromName,
        fromEmail,
        subject,
        bodyExcerpt: bodyText.slice(0, 200),
      }).catch(e => console.warn("[process-inbox] pushcut error:", (e as Error).message));

      // Store telegram_message_id for in-place editing later
      if (telegramMsgId) {
        await db.from("arthur_email_approvals").update({ telegram_message_id: telegramMsgId }).eq("id", approvalId);
      }

      results.approval_ids.push(approvalId);
      results.processed++;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.errors.push(`msg:${msgId}: ${errMsg}`);
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
