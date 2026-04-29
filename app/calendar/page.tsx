"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Nav, Footer } from "../_components/Layout";

// ── Types ────────────────────────────────────────────────────────────────────

type EventType = "gcal" | "tracking" | "ticket" | "reservation" | "approval";
type ViewMode  = "day" | "week" | "month";

interface CalEvent {
  id:          string;
  type:        EventType;
  title:       string;
  start:       string;
  end:         string | null;
  all_day:     boolean;
  location?:   string | null;
  url?:        string | null;
  description?: string | null;
  source:      "google" | "yahoo" | "arthur";
}

// ── Colors by type ────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<EventType, { bg: string; border: string; text: string; label: string }> = {
  gcal:        { bg: "#1a73e820", border: "#1a73e8",  text: "#60a5fa", label: "Google" },
  tracking:    { bg: "#f97316, 0.12)",  border: "#f97316",  text: "#fb923c", label: "Delivery" },
  ticket:      { bg: "#a78bfa20", border: "#a78bfa",  text: "#a78bfa", label: "Ticket" },
  reservation: { bg: "#4ade8020", border: "#4ade80",  text: "#4ade80", label: "Reservation" },
  approval:    { bg: "#ef444420", border: "#ef4444",  text: "#f87171", label: "Reply needed" },
};

// Fix tracking bg (template string issue above)
TYPE_COLORS.tracking.bg = "rgba(249,115,22,0.12)";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToDate(iso: string): Date {
  // Handle both date-only (YYYY-MM-DD) and datetime strings
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function startOf(d: Date, view: ViewMode): Date {
  const r = new Date(d);
  if (view === "day") {
    r.setHours(0, 0, 0, 0);
    return r;
  }
  if (view === "week") {
    // Start of week = Sunday
    const day = r.getDay();
    r.setDate(r.getDate() - day);
    r.setHours(0, 0, 0, 0);
    return r;
  }
  // month
  r.setDate(1);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOf(d: Date, view: ViewMode): Date {
  const r = new Date(startOf(d, view));
  if (view === "day") { r.setDate(r.getDate() + 1); return r; }
  if (view === "week") { r.setDate(r.getDate() + 7); return r; }
  r.setMonth(r.getMonth() + 1);
  return r;
}

function formatDayHeader(date: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Tomorrow · ${label}`;
  return label;
}

function formatTime(iso: string, allDay: boolean): string {
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" });
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // Default to Day view on mobile
  const isMobileDefault = typeof window !== "undefined" && window.innerWidth < 640;
  const [view, setView]               = useState<ViewMode>(isMobileDefault ? "day" : "week");
  const [anchor, setAnchor]           = useState<Date>(today);
  const [events, setEvents]           = useState<CalEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [focusList, setFocusList]     = useState<string>("");
  const [focusLoading, setFocusLoading] = useState(true);
  const [selected, setSelected]       = useState<CalEvent | null>(null);

  const rangeStart = useMemo(() => startOf(anchor, view), [anchor, view]);
  const rangeEnd   = useMemo(() => endOf(anchor, view),   [anchor, view]);

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const url = `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      setEvents(await res.json());
    } catch (e) {
      console.error("[calendar]", (e as Error).message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFocus = useCallback(async (evts: CalEvent[]) => {
    setFocusLoading(true);
    try {
      const todayEvts = evts.filter(e => {
        const d = isoToDate(e.start);
        return sameDay(d, today);
      });
      if (todayEvts.length === 0) {
        setFocusList("No items on your calendar today.");
        return;
      }
      const summary = todayEvts.slice(0, 10).map(e =>
        `- [${e.type}] ${e.title}${e.location ? ` @ ${e.location}` : ""}`
      ).join("\n");

      // Call the server-side API route for focus generation (keeps API key server-only)
      const focusRes = await fetch("/api/calendar/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: todayEvts.slice(0, 10) }),
      });
      if (focusRes.ok) {
        const data = await focusRes.json() as { focus?: string };
        setFocusList(data.focus ?? "Nothing urgent today.");
      } else {
        // Fallback: local priority sort
        const prioritized = todayEvts
          .sort((a, b) => {
            const order: Record<EventType, number> = { approval: 0, reservation: 1, gcal: 2, ticket: 3, tracking: 4 };
            return (order[a.type] ?? 5) - (order[b.type] ?? 5);
          })
          .slice(0, 5)
          .map(e => `• ${e.title}`)
          .join("\n");
        setFocusList(prioritized || "Nothing urgent today.");
      }
    } catch (e) {
      setFocusList("Could not generate focus list.");
      console.error("[calendar/focus]", (e as Error).message);
    } finally {
      setFocusLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadEvents(rangeStart, rangeEnd);
  }, [loadEvents, rangeStart, rangeEnd]);

  useEffect(() => {
    if (!loading) loadFocus(events);
  }, [loading, events, loadFocus]);

  // ── Counts for today ──
  const todayCounts = useMemo(() => {
    const todayEvts = events.filter(e => sameDay(isoToDate(e.start), today));
    return {
      meetings:    todayEvts.filter(e => e.type === "gcal").length,
      deliveries:  todayEvts.filter(e => e.type === "tracking").length,
      reservations:todayEvts.filter(e => e.type === "reservation").length,
      replies:     todayEvts.filter(e => e.type === "approval").length,
    };
  }, [events, today]);

  // ── Generate days for view ──
  const days = useMemo(() => {
    const result: Date[] = [];
    if (view === "day") {
      result.push(new Date(rangeStart));
    } else if (view === "week") {
      for (let i = 0; i < 7; i++) result.push(addDays(rangeStart, i));
    } else {
      // month — show full weeks
      const cur = new Date(rangeStart);
      // Back up to Sunday before first of month
      const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const firstDay = new Date(monthStart);
      firstDay.setDate(firstDay.getDate() - firstDay.getDay());
      const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      const lastSat = new Date(lastDay);
      lastSat.setDate(lastSat.getDate() + (6 - lastSat.getDay()));
      let d = firstDay;
      while (d <= lastSat) { result.push(new Date(d)); d = addDays(d, 1); }
      void cur;
    }
    return result;
  }, [view, rangeStart, anchor]);

  function eventsForDay(day: Date): CalEvent[] {
    return events.filter(e => {
      const start = isoToDate(e.start);
      return sameDay(start, day);
    });
  }

  function navigate(dir: 1 | -1) {
    if (view === "day")   setAnchor(a => addDays(a, dir));
    if (view === "week")  setAnchor(a => addDays(a, dir * 7));
    if (view === "month") setAnchor(a => {
      const r = new Date(a);
      r.setMonth(r.getMonth() + dir);
      return r;
    });
  }

  const rangeLabel = view === "month"
    ? anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : `${rangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(rangeEnd, -1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <>
      <Nav />
      <main className="wrap" style={{ padding: "32px 32px 80px" }}>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}>calendar.</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: 13 }}>
            google events + email extractions + pending replies — one view.
          </p>
        </div>

        {/* Today summary bar */}
        <div style={{
          display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap",
        }}>
          {[
            { label: "meetings",    count: todayCounts.meetings,     color: "#60a5fa" },
            { label: "deliveries",  count: todayCounts.deliveries,   color: "#fb923c" },
            { label: "reservations",count: todayCounts.reservations, color: "#4ade80" },
            { label: "replies",     count: todayCounts.replies,      color: "#f87171" },
          ].map(({ label, count, color }) => (
            <div key={label} style={{
              padding: "8px 14px", borderRadius: 8,
              background: "var(--panel)", border: "1px solid var(--border)",
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 700, fontSize: 16, color }}>{count}</span>
              <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>{label} today</span>
            </div>
          ))}
        </div>

        {/* Focus section */}
        <div style={{
          marginBottom: 24, padding: "16px 20px",
          background: "var(--panel-elev)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          borderLeft: "3px solid var(--accent)",
          overflow: "hidden",
          maxWidth: "100%",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", marginBottom: 8 }}>
            what to focus on today
          </div>
          {focusLoading ? (
            <div style={{ color: "var(--text-dim)", fontSize: 13 }}>generating…</div>
          ) : (
            <pre style={{ margin: 0, fontFamily: "inherit", fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.7, wordBreak: "break-word", overflowWrap: "break-word", maxWidth: "100%" }}>
              {focusList}
            </pre>
          )}
        </div>

        {/* Calendar nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => navigate(-1)} style={navBtnStyle}>←</button>
            <button onClick={() => setAnchor(today)} style={{ ...navBtnStyle, fontSize: 11, padding: "6px 12px" }}>today</button>
            <button onClick={() => navigate(1)} style={navBtnStyle}>→</button>
            <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 14 }}>{rangeLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["day", "week", "month"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                ...navBtnStyle,
                background: view === v ? "var(--accent)" : "var(--panel)",
                color:      view === v ? "#fff" : "var(--text-dim)",
                border:     view === v ? "1px solid var(--accent)" : "1px solid var(--border)",
                fontWeight: view === v ? 700 : 400,
              }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Color legend */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {(Object.entries(TYPE_COLORS) as [EventType, typeof TYPE_COLORS[EventType]][]).map(([type, colors]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-dim)" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: colors.border, opacity: 0.8 }} />
              {colors.label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>Loading events…</div>
        ) : view === "month" ? (
          <MonthGrid days={days} anchor={anchor} events={events} today={today} onSelect={setSelected} />
        ) : (
          <WeekDayGrid days={days} eventsForDay={eventsForDay} today={today} onSelect={setSelected} />
        )}

        {/* Event drawer */}
        {selected && (
          <EventDrawer event={selected} onClose={() => setSelected(null)} />
        )}

        <style>{`
          @media (max-width: 640px) {
            .cal-view-week { display: none !important; }
          }
        `}</style>
      </main>
      <Footer />
    </>
  );
}

// ── WeekDayGrid ───────────────────────────────────────────────────────────────

function formatDayHeaderShort(date: Date): string {
  // Short label for mobile: "Mon 28"
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

function WeekDayGrid({ days, eventsForDay, today, onSelect }: {
  days: Date[];
  eventsForDay: (d: Date) => CalEvent[];
  today: Date;
  onSelect: (e: CalEvent) => void;
}) {
  return (
    <>
      <style>{`
        @media (max-width: 700px) {
          .week-day-grid { gap: 4px !important; }
          .week-day-header { padding: 6px 6px 4px !important; font-size: 10px !important; }
          .week-day-col { min-height: 80px !important; }
          .week-day-header-full { display: none !important; }
          .week-day-header-short { display: block !important; }
          .week-events-wrap { padding: 4px !important; }
        }
        @media (min-width: 701px) {
          .week-day-header-short { display: none !important; }
        }
      `}</style>
      <div className="week-day-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 8 }}>
        {days.map(day => {
          const dayEvts = eventsForDay(day);
          const isToday = sameDay(day, today);
          return (
            <div key={day.toISOString()} className="week-day-col" style={{
              background: isToday ? "var(--panel-elev)" : "var(--panel)",
              border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 10,
              minHeight: 120,
              overflow: "hidden",
            }}>
              {/* Day header */}
              <div className="week-day-header" style={{
                padding: "10px 12px 8px",
                borderBottom: "1px solid var(--border)",
                fontSize: 11,
                fontWeight: isToday ? 700 : 500,
                color: isToday ? "var(--accent)" : "var(--text-dim)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                <span className="week-day-header-full">{formatDayHeader(day)}</span>
                <span className="week-day-header-short">{formatDayHeaderShort(day)}</span>
              </div>

              {/* Events */}
              <div className="week-events-wrap" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {dayEvts.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text-faint)", padding: "4px 0" }}>—</div>
                ) : (
                  dayEvts.map(ev => (
                    <EventChip key={ev.id} event={ev} onClick={() => onSelect(ev)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

function MonthGrid({ days, anchor, events, today, onSelect }: {
  days: Date[];
  anchor: Date;
  events: CalEvent[];
  today: Date;
  onSelect: (e: CalEvent) => void;
}) {
  const HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
        {HEADERS.map(h => (
          <div key={h} style={{ padding: "6px 0", textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {h}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {days.map(day => {
          const isToday = sameDay(day, today);
          const inMonth = day.getMonth() === anchor.getMonth();
          const dayEvts = events.filter(e => sameDay(isoToDate(e.start), day));
          return (
            <div key={day.toISOString()} style={{
              background: isToday ? "var(--panel-elev)" : "var(--panel)",
              border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 6,
              minHeight: 90,
              padding: 6,
              opacity: inMonth ? 1 : 0.4,
            }}>
              <div style={{
                fontSize: 12, fontWeight: isToday ? 700 : 400,
                color: isToday ? "var(--accent)" : "var(--text-dim)",
                marginBottom: 4,
              }}>
                {day.getDate()}
              </div>
              {dayEvts.slice(0, 3).map(ev => (
                <EventChip key={ev.id} event={ev} onClick={() => onSelect(ev)} compact />
              ))}
              {dayEvts.length > 3 && (
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>+{dayEvts.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EventChip ─────────────────────────────────────────────────────────────────

function EventChip({ event, onClick, compact = false }: { event: CalEvent; onClick: () => void; compact?: boolean }) {
  const colors = TYPE_COLORS[event.type] ?? TYPE_COLORS.gcal;
  const timeStr = formatTime(event.start, event.all_day);

  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: colors.bg,
        border: `1px solid ${colors.border}30`,
        borderLeft: `3px solid ${colors.border}`,
        borderRadius: 5,
        padding: compact ? "2px 6px" : "5px 8px",
        cursor: "pointer",
        color: colors.text,
        fontSize: compact ? 10 : 11,
        fontWeight: 500,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={event.title}
    >
      {timeStr && <span style={{ opacity: 0.8, marginRight: 4, fontSize: 10 }}>{timeStr}</span>}
      {event.title}
    </button>
  );
}

// ── EventDrawer ───────────────────────────────────────────────────────────────

function EventDrawer({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const colors = TYPE_COLORS[event.type] ?? TYPE_COLORS.gcal;
  const timeStr = event.all_day ? "All day" : [
    formatTime(event.start, false),
    event.end ? `– ${formatTime(event.end, false)}` : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(7,8,11,0.7)",
        zIndex: 100,
        display: "flex", justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 400, height: "100%", overflowY: "auto",
          background: "var(--panel)", borderLeft: "1px solid var(--border-strong)",
          padding: "28px 24px",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Type badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "3px 10px", borderRadius: 20,
          background: colors.bg, border: `1px solid ${colors.border}40`,
          fontSize: 11, fontWeight: 700, color: colors.text,
          marginBottom: 14,
        }}>
          {colors.label}
        </div>

        {/* Title */}
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
          {event.title}
        </h2>

        {/* Time */}
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 12 }}>
          {isoToDate(event.start).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {timeStr ? ` · ${timeStr}` : ""}
        </div>

        {/* Location */}
        {event.location && (
          <div style={{ fontSize: 13, marginBottom: 10, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span style={{ color: "var(--text-dim)" }}>📍</span>
            <span>{event.location}</span>
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div style={{
            fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7,
            background: "var(--panel-elev)", borderRadius: 8, padding: "10px 12px",
            marginBottom: 16,
          }}>
            {event.description}
          </div>
        )}

        {/* Source */}
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 16 }}>
          Source: {event.source} · ID: {event.id}
        </div>

        {/* Open button */}
        {event.url && (
          <a
            href={event.url}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-block",
              background: "var(--accent)", color: "#fff",
              padding: "9px 18px", borderRadius: 7,
              fontSize: 13, fontWeight: 600, textDecoration: "none",
              marginBottom: 12,
            }}
          >
            Open →
          </a>
        )}

        <br />
        <button onClick={onClose} style={{
          background: "none", border: "1px solid var(--border)",
          borderRadius: 7, padding: "8px 16px",
          color: "var(--text-dim)", fontSize: 12, cursor: "pointer", marginTop: 8,
        }}>
          Close
        </button>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  color: "var(--text)",
  fontSize: 13,
};
