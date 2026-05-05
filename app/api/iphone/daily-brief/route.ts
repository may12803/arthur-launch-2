import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAllCalendarEvents } from "@/lib/google/calendar";

export const runtime = "nodejs";

function requireAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.ARTHUR_SECRET;
  return !!secret && authHeader === `Bearer ${secret}`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      timeZone: "America/Detroit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export async function POST(req: NextRequest) {
  if (!requireAuth(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const db = getSupabaseAdmin();
  const now = new Date();
  const tz  = "America/Detroit";
  const todayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });

  // ── 1. Today's calendar (top 5) ───────────────────────────────────────────
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  let calLines: string[] = [];
  try {
    const events = await listAllCalendarEvents(startOfDay.toISOString(), endOfDay.toISOString());
    const sorted = events
      .filter(e => e.status !== "cancelled")
      .sort((a, b) => {
        const aStart = a.start?.dateTime ?? a.start?.date ?? "";
        const bStart = b.start?.dateTime ?? b.start?.date ?? "";
        return aStart.localeCompare(bStart);
      })
      .slice(0, 5);
    calLines = sorted.map(e => {
      const startStr = e.start?.dateTime ? formatTime(e.start.dateTime) : "all day";
      return `  · ${startStr} — ${e.summary ?? "(untitled)"}`;
    });
  } catch {
    calLines = ["  · (calendar unavailable)"];
  }

  // ── 2. Pending approvals ──────────────────────────────────────────────────
  const { count: pendingCount } = await db
    .from("arthur_email_approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // ── 3. Top 3 hardest emails to action ─────────────────────────────────────
  const { data: hardEmails } = await db
    .from("arthur_inbox_emails")
    .select("subject, from_email, from_name, requires_review")
    .eq("direction", "inbound")
    .eq("is_archived", false)
    .eq("is_deleted", false)
    .eq("requires_review", true)
    .order("received_at", { ascending: false })
    .limit(3);

  const hardLines = (hardEmails ?? []).map(e => {
    const sender = (e.from_name as string) || (e.from_email as string) || "Unknown";
    return `  · ${sender}: ${(e.subject as string) || "(no subject)"}`;
  });

  // ── 4. Inbox counts across all grants ─────────────────────────────────────
  const { count: inboxCount } = await db
    .from("arthur_inbox_emails")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("is_archived", false)
    .eq("is_deleted", false);

  // ── 5. iPhone events today ────────────────────────────────────────────────
  const { count: iphoneEventsToday } = await db
    .from("arthur_iphone_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString());

  // ── Build plain text brief ─────────────────────────────────────────────────
  const lines: string[] = [
    `Good morning, Daniel. Here's your brief for ${todayFmt.format(now)}.`,
    "",
    "CALENDAR:",
    ...(calLines.length > 0 ? calLines : ["  · No events today"]),
    "",
    "INBOX:",
    `  · ${inboxCount ?? 0} emails in inbox`,
    `  · ${pendingCount ?? 0} pending approvals waiting for your sign-off`,
    "",
  ];

  if (hardLines.length > 0) {
    lines.push("NEEDS YOUR ATTENTION:");
    lines.push(...hardLines);
    lines.push("");
  }

  lines.push(
    "QUICK ACTIONS:",
    "  · Tap 'What needs my reply?' to action approvals",
    "  · Tap 'Quick task' to capture something while it's in your head",
    "",
    `— Arthur · ${new Date().toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`,
  );

  const brief = lines.join("\n");
  return new NextResponse(brief, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
