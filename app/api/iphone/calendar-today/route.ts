import { NextRequest, NextResponse } from "next/server";
import { listAllCalendarEvents } from "@/lib/google/calendar";

export const runtime = "nodejs";

function requireAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.ARTHUR_SECRET;
  return !!secret && authHeader === `Bearer ${secret}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/Detroit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay   = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  try {
    const events = await listAllCalendarEvents(startOfDay.toISOString(), endOfDay.toISOString());
    const filtered = events
      .filter(e => e.status !== "cancelled")
      .sort((a, b) => {
        const aStart = a.start?.dateTime ?? a.start?.date ?? "";
        const bStart = b.start?.dateTime ?? b.start?.date ?? "";
        return aStart.localeCompare(bStart);
      });

    const compact = filtered.map(e => {
      const isAllDay = !e.start?.dateTime;
      const start    = e.start?.dateTime ?? e.start?.date ?? "";
      const end      = e.end?.dateTime   ?? e.end?.date   ?? null;
      return {
        id:       e.id,
        title:    e.summary ?? "(untitled)",
        start,
        end,
        all_day:  isAllDay,
        start_fmt: isAllDay ? "all day" : formatTime(start),
        location: e.location ?? null,
        account:  (e as unknown as Record<string, unknown>).account_email ?? null,
      };
    });

    return NextResponse.json({
      date:      startOfDay.toISOString().slice(0, 10),
      count:     compact.length,
      events:    compact,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      date:   startOfDay.toISOString().slice(0, 10),
      count:  0,
      events: [],
      error:  (err as Error).message,
    });
  }
}
