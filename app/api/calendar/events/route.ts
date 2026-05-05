import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAllCalendarEvents } from "@/lib/google/calendar";
import { listIcloudEvents } from "@/lib/icloud/calendar";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

interface MergedEvent {
  id:           string;
  type:         "gcal" | "tracking" | "ticket" | "reservation" | "approval" | "icloud";
  title:        string;
  start:        string;
  end:          string | null;
  all_day:      boolean;
  location?:    string | null;
  url?:         string | null;
  description?: string | null;
  source:       "google" | "yahoo" | "arthur" | "icloud";
  account_email?: string;
  organizer?:   { email: string; name?: string } | null;
  attendees?:   Array<{ email: string; name?: string; response_status?: string }>;
  html_link?:   string | null;
  gcal_id?:     string | null;
  gcal_cal_id?: string | null;
}

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam   = searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }

  const startDate = new Date(startParam);

  // Daniel's local TZ — used to compute the correct calendar day for ISO timestamps.
  const TZ = "America/Detroit";
  function tzDateStr(iso: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
    return fmt.format(new Date(iso));
  }
  const endDate   = new Date(endParam);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "invalid date format" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const merged: MergedEvent[] = [];

  // 1. Google Calendar — ALL connected accounts
  try {
    const gcalEvents = await listAllCalendarEvents(startDate.toISOString(), endDate.toISOString());
    for (const ev of gcalEvents) {
      if (ev.status === "cancelled") continue;
      const isAllDay = !ev.start?.dateTime;
      const start = ev.start?.dateTime ?? ev.start?.date ?? "";
      const end   = ev.end?.dateTime   ?? ev.end?.date   ?? null;
      merged.push({
        id:           `gcal:${ev.id}`,
        type:         "gcal",
        title:        ev.summary ?? "(untitled)",
        start,
        end,
        all_day:      isAllDay,
        location:     ev.location ?? null,
        url:          ev.htmlLink ?? null,
        description:  ev.description ?? null,
        source:       "google",
        account_email: ev.account_email,
        organizer:    ev.organizer
                        ? { email: ev.organizer.email ?? "", name: ev.organizer.displayName ?? undefined }
                        : null,
        attendees:    (ev.attendees ?? []).map(a => ({
                        email:           a.email ?? "",
                        name:            a.displayName ?? undefined,
                        response_status: a.responseStatus ?? "needsAction",
                      })),
        html_link:    ev.htmlLink ?? null,
        gcal_id:      ev.id,
        gcal_cal_id:  ev.account_email ?? null,
      });
    }
  } catch (e) {
    console.error("[calendar/events] gcal error:", (e as Error).message);
  }

  // 2. iCloud CalDAV (optional — only runs if APPLE_APP_PASSWORD is set)
  try {
    const icloudEvents = await listIcloudEvents(startDate.toISOString(), endDate.toISOString());
    for (const ev of icloudEvents) {
      merged.push({
        id:       `icloud:${ev.id}`,
        type:     "icloud",
        title:    ev.title,
        start:    ev.start,
        end:      ev.end,
        all_day:  ev.all_day,
        location: ev.location,
        source:   "icloud",
      });
    }
  } catch (e) {
    console.error("[calendar/events] icloud error:", (e as Error).message);
  }

  // 3. Email extractions in range — tracking (delivery_eta_iso), tickets (event_start_iso), reservations (reservation_check_in_iso)
  try {
    const { data: extractions } = await db
      .from("arthur_email_extractions")
      .select("id,extraction_type,delivery_eta_iso,event_start_iso,event_end_iso,reservation_check_in_iso,reservation_check_out_iso,ticket_event_name,ticket_venue,ticket_url,carrier,tracking_number,tracking_url,reservation_provider,reservation_type,reservation_location")
      .or(
        `and(delivery_eta_iso.gte.${startParam},delivery_eta_iso.lte.${endParam}),and(event_start_iso.gte.${startParam},event_start_iso.lte.${endParam}),and(reservation_check_in_iso.gte.${startParam},reservation_check_in_iso.lte.${endParam})`
      );

    for (const ex of extractions ?? []) {
      if (ex.extraction_type === "tracking" && ex.delivery_eta_iso) {
        const dateStr = tzDateStr(ex.delivery_eta_iso as string);
        merged.push({
          id:      `tracking:${ex.id as string}`,
          type:    "tracking",
          title:   `${ex.carrier ?? "Package"} delivery — ${ex.tracking_number ? `...${(ex.tracking_number as string).slice(-6)}` : ""}`.trim(),
          start:   dateStr,
          end:     dateStr,
          all_day: true,
          url:     ex.tracking_url as string | null ?? null,
          description: ex.tracking_number as string ?? null,
          source:  "yahoo",
        });
      } else if (ex.extraction_type === "ticket" && ex.event_start_iso) {
        merged.push({
          id:       `ticket:${ex.id as string}`,
          type:     "ticket",
          title:    (ex.ticket_event_name as string | null) ?? "Ticket event",
          start:    ex.event_start_iso as string,
          end:      (ex.event_end_iso as string | null) ?? null,
          all_day:  false,
          location: (ex.ticket_venue as string | null) ?? null,
          url:      (ex.ticket_url as string | null) ?? null,
          description: null,
          source:   "yahoo",
        });
      } else if (ex.extraction_type === "reservation" && ex.reservation_check_in_iso) {
        const checkIn  = ex.reservation_check_in_iso as string;
        const checkOut = (ex.reservation_check_out_iso as string | null) ?? null;
        const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(checkIn);
        merged.push({
          id:       `reservation:${ex.id as string}`,
          type:     "reservation",
          title:    `${ex.reservation_type ?? "Reservation"} — ${ex.reservation_provider ?? ""}`.trim().replace(/—\s*$/, ""),
          start:    checkIn,
          end:      checkOut,
          all_day:  isAllDay,
          location: (ex.reservation_location as string | null) ?? null,
          description: null,
          source:   "yahoo",
        });
      }
    }
  } catch (e) {
    console.error("[calendar/events] extractions error:", (e as Error).message);
  }

  // 4. Pending approvals (email replies needed) — render as all-day on received date
  try {
    const { data: approvals } = await db
      .from("arthur_email_approvals")
      .select("id,from_email,from_name,subject,created_at")
      .eq("status", "pending")
      .gte("created_at", startParam)
      .lte("created_at", endParam);

    for (const ap of approvals ?? []) {
      const dateStr = tzDateStr(ap.created_at as string);
      merged.push({
        id:      `approval:${ap.id as string}`,
        type:    "approval",
        title:   `Reply needed: ${ap.subject as string ?? "(no subject)"}`,
        start:   dateStr,
        end:     dateStr,
        all_day: true,
        description: `From: ${(ap.from_name as string | null) ?? (ap.from_email as string ?? "")}`,
        source:  "arthur",
      });
    }
  } catch (e) {
    console.error("[calendar/events] approvals error:", (e as Error).message);
  }

  // 5. Dedupe across sources — fuzzy token-set match (catches "Gilmore After Dark - Grant Rupp Trio" vs "📅 Gilmore After Dark at Dabney & Co.")
  const SOURCE_PRIORITY: Record<string, number> = { google: 3, icloud: 2, yahoo: 1, arthur: 0 };

  // Strip emoji + lowercase + remove non-word chars + collapse whitespace
  function normalizeTitle(t: string): string {
    return t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/[^\w\s]/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function tokens(t: string): Set<string> {
    return new Set(normalizeTitle(t).split(" ").filter(w => w.length > 2));
  }
  function tokenSim(a: string, b: string): number {
    const A = tokens(a), B = tokens(b);
    if (A.size === 0 || B.size === 0) return 0;
    let common = 0;
    for (const w of A) if (B.has(w)) common++;
    return common / Math.max(A.size, B.size);
  }

  const kept: MergedEvent[] = [];
  for (const ev of merged) {
    const evDay = /^\d{4}-\d{2}-\d{2}/.test(ev.start) ? ev.start.slice(0, 10) : tzDateStr(ev.start);
    const evPrio = SOURCE_PRIORITY[ev.source] ?? 0;
    let mergeIdx = -1;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      const kDay = /^\d{4}-\d{2}-\d{2}/.test(k.start) ? k.start.slice(0, 10) : tzDateStr(k.start);
      if (kDay !== evDay) continue;
      if (tokenSim(k.title, ev.title) >= 0.5) { mergeIdx = i; break; }
    }
    if (mergeIdx === -1) {
      kept.push(ev);
    } else {
      const existPrio = SOURCE_PRIORITY[kept[mergeIdx].source] ?? 0;
      if (evPrio > existPrio) kept[mergeIdx] = ev;
    }
  }
  const fingerprints = new Map<string, MergedEvent>(kept.map((e, i) => [String(i), e]));

  const deduped = [...fingerprints.values()];

  // Sort by start
  deduped.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  return NextResponse.json(deduped);
}
