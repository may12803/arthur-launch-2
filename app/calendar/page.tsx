"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Nav, Footer } from "../_components/Layout";
import { GlassPanel } from "../_components/GlassPanel";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";
import { EmptyState } from "../_components/EmptyState";

// ── Types ────────────────────────────────────────────────────────────────────

type EventType = "gcal" | "tracking" | "ticket" | "reservation" | "approval" | "icloud";
type ViewMode  = "day" | "week" | "month";

interface CalEvent {
  id:            string;
  type:          EventType;
  title:         string;
  start:         string;
  end:           string | null;
  all_day:       boolean;
  location?:     string | null;
  url?:          string | null;
  description?:  string | null;
  source:        "google" | "yahoo" | "arthur" | "icloud";
  account_email?: string;
  organizer?:    { email: string; name?: string } | null;
  attendees?:    Array<{ email: string; name?: string; response_status?: string }>;
  html_link?:    string | null;
  gcal_id?:      string | null;
  gcal_cal_id?:  string | null;
}

// ── Type config ───────────────────────────────────────────────────────────────

interface TypeConfig {
  color: string;
  label: string;
  icon: string;
}

// CSS variable references — resolved at runtime so hexToRgb still works for rgba() blending
// We keep a parallel hex map for the hexToRgb helper (used for rgba(r,g,b,a) blending only)
const TYPE_HEX: Record<EventType, string> = {
  gcal:        "#3b82f6",
  icloud:      "#60a5fa",
  tracking:    "#f97316",
  ticket:      "#a855f7",
  reservation: "#22c55e",
  approval:    "#ef4444",
};

const TYPE_CONFIG: Record<EventType, TypeConfig> = {
  gcal:        { color: "var(--cal-gcal)",        label: "Google",       icon: "📅" },
  icloud:      { color: "var(--cal-icloud)",      label: "iCloud",       icon: "☁️" },
  tracking:    { color: "var(--cal-tracking)",    label: "Tracking",     icon: "📦" },
  ticket:      { color: "var(--cal-ticket)",      label: "Ticket",       icon: "🎟️" },
  reservation: { color: "var(--cal-reservation)", label: "Reservation",  icon: "🏨" },
  approval:    { color: "var(--cal-approval)",    label: "Reply needed", icon: "📨" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
// Returns hex for a given event type (used to build rgba() blends — CSS vars can't be used inside rgba())
function typeRgb(type: EventType): string {
  return hexToRgb(TYPE_HEX[type] ?? TYPE_HEX.gcal);
}

function isoToDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

function startOf(d: Date, view: ViewMode): Date {
  const r = new Date(d);
  if (view === "day") { r.setHours(0, 0, 0, 0); return r; }
  if (view === "week") {
    const day = r.getDay();
    r.setDate(r.getDate() - day);
    r.setHours(0, 0, 0, 0);
    return r;
  }
  r.setDate(1);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOf(d: Date, view: ViewMode): Date {
  const r = new Date(startOf(d, view));
  if (view === "day")   { r.setDate(r.getDate() + 1); return r; }
  if (view === "week")  { r.setDate(r.getDate() + 7); return r; }
  r.setMonth(r.getMonth() + 1);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function formatTime(iso: string, allDay: boolean): string {
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Detroit"
  });
}

function formatRelativeTime(date: Date, isAllDay: boolean): string {
  const now   = new Date();
  const diff  = date.getTime() - now.getTime();
  const mins  = Math.round(diff / 60000);
  const hours = Math.round(diff / 3600000);
  const days  = Math.round(diff / 86400000);

  // All-day events on today: no relative label
  if (isAllDay && sameDay(date, now)) return "";
  if (mins < 0 && sameDay(date, now)) return "Earlier today";
  if (mins < 0)    return "";
  if (mins < 60)   return `in ${mins}m`;
  if (hours < 24)  return `in ${hours}h`;
  if (days === 1)  return `Tomorrow ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })}`;
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    (date.getHours() > 0 ? ` ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })}` : "");
}

// ── Color hash for account emails ─────────────────────────────────────────────

// Account-avatar colours — deliberately NOT calendar source colours; these are hashed per email
const ACCOUNT_COLORS = [
  "var(--tint-blue)", "var(--tint-violet)", "var(--tint-amber)",
  "var(--tint-emerald)", "var(--tint-red)", "var(--cal-icloud)", "var(--cal-tracking)",
];
// Hex equivalents used only for hexToRgb rgba blending on account avatars
const ACCOUNT_COLORS_HEX = [
  "#5b8def", "#a78bfa", "#fbbf24", "#34d399", "#ef4444", "#60a5fa", "#f97316",
];
function accountColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return ACCOUNT_COLORS[Math.abs(hash) % ACCOUNT_COLORS.length];
}
function accountColorHex(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return ACCOUNT_COLORS_HEX[Math.abs(hash) % ACCOUNT_COLORS_HEX.length];
}

// ── Hour grid constants ───────────────────────────────────────────────────────

const HOUR_START = 7;
const HOUR_END   = 23;
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

function eventTopPercent(start: Date): number {
  const h = start.getHours() + start.getMinutes() / 60;
  return ((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100;
}
function eventHeightPercent(start: Date, end: Date | null): number {
  if (!end) return (60 / ((HOUR_END - HOUR_START) * 60)) * 100;
  const dur = (end.getTime() - start.getTime()) / 3600000;
  const clamped = Math.max(0.25, Math.min(dur, HOUR_END - HOUR_START));
  return (clamped / (HOUR_END - HOUR_START)) * 100;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 900;
  const [view, setView]             = useState<ViewMode>(isMobile ? "day" : "week");
  const [anchor, setAnchor]         = useState<Date>(today);
  const [events, setEvents]         = useState<CalEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<CalEvent | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<EventType>>(new Set(Object.keys(TYPE_CONFIG) as EventType[]));
  const [filterAccounts, setFilterAccounts] = useState<Set<string>>(new Set(["all"]));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"event" | "filter" | "fab" | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  const rangeStart = useMemo(() => startOf(anchor, view), [anchor, view]);
  const rangeEnd   = useMemo(() => endOf(anchor, view),   [anchor, view]);

  // ── Load events ─────────────────────────────────────────────────────────────

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const url = `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as CalEvent[];
      setEvents(data);
      // Seed account filter with all accounts
      const accounts = new Set<string>(["all"]);
      for (const ev of data) if (ev.account_email) accounts.add(ev.account_email);
      setFilterAccounts(accounts);
    } catch (e) {
      console.error("[calendar]", (e as Error).message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents(rangeStart, rangeEnd);
  }, [loadEvents, rangeStart, rangeEnd]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "t") { setAnchor(today); }
      if (e.key === "d") { setView("day"); }
      if (e.key === "w") { setView("week"); }
      if (e.key === "m") { setView("month"); }
      if (e.key === "ArrowLeft")  navigate(-1);
      if (e.key === "ArrowRight") navigate(1);
      if (e.key === "Escape") { setSelected(null); setMobileSheet(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, view]);

  // ── Auto-scroll to current hour on day/week view ──────────────────────────

  useEffect(() => {
    if (view !== "day" && view !== "week") return;
    if (loading) return;
    // Retry until the TimelineGrid mounts and scrollHeight is real (Skeleton → TimelineGrid swap takes a few frames).
    let attempts = 0;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      attempts++;
      const el = timelineRef.current;
      if (!el || el.scrollHeight <= el.clientHeight + 20) {
        if (attempts < 20) requestAnimationFrame(tryScroll);
        return;
      }
      const nowH = new Date().getHours() + new Date().getMinutes() / 60;
      const targetH = Math.max(HOUR_START, Math.min(HOUR_END - 1, nowH));
      const pct = ((targetH - HOUR_START) / (HOUR_END - HOUR_START)) * 100;
      el.scrollTop = Math.max(0, (el.scrollHeight * pct / 100) - el.clientHeight / 2);
    };
    requestAnimationFrame(tryScroll);
    return () => { cancelled = true; };
  }, [view, loading, anchor]);

  // ── Filtered events ──────────────────────────────────────────────────────────

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      if (!filterTypes.has(ev.type)) return false;
      if (!filterAccounts.has("all") && ev.account_email && !filterAccounts.has(ev.account_email)) return false;
      return true;
    });
  }, [events, filterTypes, filterAccounts]);

  // ── Navigation ───────────────────────────────────────────────────────────────

  function navigate(dir: 1 | -1) {
    if (view === "day")   setAnchor(a => addDays(a, dir));
    if (view === "week")  setAnchor(a => addDays(a, dir * 7));
    if (view === "month") setAnchor(a => {
      const r = new Date(a);
      r.setMonth(r.getMonth() + dir);
      return r;
    });
  }

  // ── Range label ──────────────────────────────────────────────────────────────

  const rangeLabel = useMemo(() => {
    if (view === "month") {
      return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (view === "day") {
      const isToday = sameDay(anchor, today);
      if (isToday) return "Today";
      return anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    }
    const ws = rangeStart;
    const we = addDays(rangeEnd, -1);
    if (ws.getMonth() === we.getMonth()) {
      return `${ws.toLocaleDateString("en-US", { month: "long" })} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`;
    }
    return `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${we.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }, [view, anchor, today, rangeStart, rangeEnd]);

  // ── Days for grid ─────────────────────────────────────────────────────────────

  const days = useMemo(() => {
    if (view === "day") return [new Date(rangeStart)];
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));
    // month
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const firstDay   = new Date(monthStart);
    firstDay.setDate(firstDay.getDate() - firstDay.getDay());
    const lastDay    = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const lastSat    = new Date(lastDay);
    lastSat.setDate(lastSat.getDate() + (6 - lastSat.getDay()));
    const result: Date[] = [];
    let d = firstDay;
    while (d <= lastSat) { result.push(new Date(d)); d = addDays(d, 1); }
    return result;
  }, [view, rangeStart, anchor]);

  // ── Upcoming 7 events ────────────────────────────────────────────────────────

  const upcomingEvents = useMemo(() => {
    const now     = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    return filteredEvents
      .filter(ev => {
        const d       = isoToDate(ev.start);
        const allDay  = ev.all_day || /^\d{4}-\d{2}-\d{2}$/.test(ev.start);
        // All-day events on today: always show
        if (allDay && sameDay(d, now)) return true;
        // Timed events: only show if they start in the future
        return d >= now;
      })
      .slice(0, 7);
  }, [filteredEvents]);

  // ── Accounts for filter ───────────────────────────────────────────────────────

  const accounts = useMemo(() => {
    const acc = new Set<string>();
    for (const ev of events) if (ev.account_email) acc.add(ev.account_email);
    return [...acc];
  }, [events]);

  // ── Mini-month days ───────────────────────────────────────────────────────────

  const miniMonthDays = useMemo(() => {
    const ms  = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const fd  = new Date(ms);
    fd.setDate(fd.getDate() - fd.getDay());
    const ls  = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const lst = new Date(ls);
    lst.setDate(lst.getDate() + (6 - lst.getDay()));
    const result: Date[] = [];
    let d = fd;
    while (d <= lst) { result.push(new Date(d)); d = addDays(d, 1); }
    return result;
  }, [anchor]);

  // ── Event selection ───────────────────────────────────────────────────────────

  function selectEvent(ev: CalEvent) {
    setSelected(ev);
    if (typeof window !== "undefined" && window.innerWidth < 900) {
      setMobileSheet("event");
    }
  }

  // ── Month progress bar ────────────────────────────────────────────────────────

  const monthProgress = useMemo(() => {
    if (view !== "month") return 0;
    const now       = new Date();
    const daysTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return (now.getDate() / daysTotal) * 100;
  }, [view]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function eventsForDay(day: Date): CalEvent[] {
    return filteredEvents.filter(ev => sameDay(isoToDate(ev.start), day));
  }

  function timedEventsForDay(day: Date): CalEvent[] {
    return eventsForDay(day).filter(ev => !ev.all_day && !/^\d{4}-\d{2}-\d{2}$/.test(ev.start));
  }

  function allDayEventsForDay(day: Date): CalEvent[] {
    return eventsForDay(day).filter(ev => ev.all_day || /^\d{4}-\d{2}-\d{2}$/.test(ev.start));
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Nav />
      {/* Page-level title — hidden visually on narrow (toolbar h1 takes over) but present for a11y */}
      <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
        <h1>calendar.</h1>
      </div>
      <div className="cal-outer" style={{ display: "flex", height: "calc(100vh - 108px)", overflow: "hidden", background: "var(--bg-base)", marginTop: 108 }}>

        {/* ── LEFT RAIL ── */}
        <aside style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid var(--line-separator)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "var(--space-5) var(--space-4)",
          gap: "var(--space-6)",
        }} className="cal-left-rail">

          {/* Mini-month */}
          <div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-2)",
            }}>
              <span style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "var(--fs-small)",
                letterSpacing: "var(--ls-heading)",
                color: "var(--text-active)",
              }}>
                {anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <div style={{ display: "flex", gap: 2 }}>
                <button onClick={() => {
                  const r = new Date(anchor);
                  r.setMonth(r.getMonth() - 1);
                  setAnchor(r);
                }} style={miniNavBtn}>‹</button>
                <button onClick={() => {
                  const r = new Date(anchor);
                  r.setMonth(r.getMonth() + 1);
                  setAnchor(r);
                }} style={miniNavBtn}>›</button>
              </div>
            </div>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} style={{
                  textAlign: "center",
                  fontSize: "var(--fs-mono)",
                  fontWeight: 700,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--ls-eyebrow)",
                  padding: "2px 0",
                }}>{d}</div>
              ))}
            </div>
            {/* Calendar cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
              {miniMonthDays.map(day => {
                const isToday    = sameDay(day, today);
                const isAnchor   = sameDay(day, anchor);
                const inMonth    = day.getMonth() === anchor.getMonth();
                const hasEvts    = filteredEvents.some(ev => sameDay(isoToDate(ev.start), day));
                const hasApproval= filteredEvents.some(ev => ev.type === "approval" && sameDay(isoToDate(ev.start), day));
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => { setAnchor(new Date(day)); if (view !== "month") setView("day"); }}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 1,
                      background: isToday
                        ? "var(--accent)"
                        : isAnchor
                          ? "var(--accent-orange-soft)"
                          : "transparent",
                      color: isToday
                        ? "var(--accent-text-on)"
                        : isAnchor
                          ? "var(--accent)"
                          : inMonth
                            ? "var(--text-main)"
                            : "var(--text-faint)",
                      fontSize: "var(--fs-mono)",
                      fontWeight: isToday ? 700 : 400,
                      opacity: inMonth ? 1 : 0.4,
                    }}
                  >
                    {day.getDate()}
                    {hasEvts && !isToday && (
                      <div style={{
                        width: 3, height: 3, borderRadius: "50%",
                        background: hasApproval ? "var(--cal-approval)" : "var(--accent)",
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--line-separator)" }} />

          {/* Event type filters */}
          <div>
            <div style={sectionLabel}>Event types</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {(Object.entries(TYPE_CONFIG) as [EventType, TypeConfig][]).map(([type, cfg]) => {
                const checked = filterTypes.has(type);
                return (
                  <label key={type} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <div
                      onClick={() => {
                        setFilterTypes(prev => {
                          const next = new Set(prev);
                          if (next.has(type)) next.delete(type);
                          else next.add(type);
                          return next;
                        });
                      }}
                      style={{
                        width: 14, height: 14, borderRadius: 3,
                        border: `2px solid ${cfg.color}`,
                        background: checked ? cfg.color : "transparent",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.1s",
                      }}
                    >
                      {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                      <span style={{ fontSize: "var(--fs-xs)", color: checked ? "var(--text-active)" : "var(--text-faint)" }}>{cfg.label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Account filters */}
          {accounts.length > 0 && (
            <div>
              <div style={sectionLabel}>Accounts</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {accounts.map(email => {
                  const color   = accountColor(email);
                  const checked = filterAccounts.has("all") || filterAccounts.has(email);
                  const short   = email.length > 22 ? email.slice(0, 19) + "…" : email;
                  return (
                    <label key={email} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <div
                        onClick={() => {
                          setFilterAccounts(prev => {
                            const next = new Set(prev);
                            if (next.has("all")) {
                              // Switch from "all" to specific
                              next.delete("all");
                              next.add(email);
                            } else if (next.has(email)) {
                              next.delete(email);
                              if (next.size === 0) next.add("all");
                            } else {
                              next.add(email);
                            }
                            return next;
                          });
                        }}
                        style={{
                          width: 14, height: 14, borderRadius: 3,
                          border: `2px solid ${color}`,
                          background: checked ? color : "transparent",
                          cursor: "pointer",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "background 0.1s",
                        }}
                      >
                        {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>{short}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* ── MAIN AREA ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Toolbar */}
          <div className="cal-toolbar" style={{
            padding: "var(--space-3) var(--space-5)",
            borderBottom: "1px solid var(--line-separator)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            flexShrink: 0,
            background: "var(--bg-base)",
          }}>
            {/* Mobile filter pill */}
            <button
              className="cal-mobile-filter-btn"
              onClick={() => setMobileSheet("filter")}
              style={{
                display: "none",
                background: "var(--glass-t1-bg)",
                border: "1px solid var(--glass-t1-border)",
                borderRadius: "var(--radius-pill)",
                padding: "5px var(--space-3)",
                fontSize: "var(--fs-mono)",
                color: "var(--text-main)",
                cursor: "pointer",
              }}
            >
              ☰ filters
            </button>

            {/* Navigation */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setAnchor(today)} style={{ ...toolbarBtn, minHeight: 44, minWidth: 44 }}>today</button>
              <button onClick={() => navigate(-1)} style={{ ...toolbarBtn, padding: "6px 10px", minHeight: 44, minWidth: 44 }}>‹</button>
              <button onClick={() => navigate(1)}  style={{ ...toolbarBtn, padding: "6px 10px", minHeight: 44, minWidth: 44 }}>›</button>
            </div>

            {/* Title — range label, not semantic page h1 (see visually-hidden h1 above) */}
            <div aria-hidden style={{
              flex: 1,
              margin: 0,
              fontSize: "var(--fs-h3)",
              fontWeight: 700,
              letterSpacing: "var(--ls-heading)",
              fontFamily: "var(--font-display)",
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--text-active)",
            }}>
              {rangeLabel}
            </div>

            {/* View switcher */}
            <div style={{
              display: "flex",
              border: "1px solid var(--glass-t1-border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              flexShrink: 0,
            }}>
              {(["day", "week", "month"] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? "var(--accent)" : "transparent",
                    color:      view === v ? "var(--accent-text-on)" : "var(--text-muted)",
                    border: "none",
                    borderLeft: v !== "day" ? "1px solid var(--glass-t1-border)" : "none",
                    padding: "var(--space-1) var(--space-3)",
                    cursor: "pointer",
                    fontSize: "var(--fs-xs)",
                    fontWeight: view === v ? 600 : 400,
                    transition: "background var(--duration-quick) var(--ease-out-soft), color var(--duration-quick) var(--ease-out-soft)",
                    letterSpacing: "0.01em",
                    minHeight: 44,
                    minWidth: 44,
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Month progress bar */}
          {view === "month" && monthProgress > 0 && (
            <div style={{ height: 2, background: "var(--line-separator)", flexShrink: 0, position: "relative" }}>
              <div style={{
                position: "absolute",
                left: 0, top: 0, bottom: 0,
                width: `${monthProgress}%`,
                background: "var(--accent-orange-soft)",
                borderRadius: "0 1px 1px 0",
              }} />
            </div>
          )}

          {/* Calendar body */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
            {loading ? (
              <SkeletonLoader view={view} />
            ) : view === "month" ? (
              <MonthGrid
                days={days}
                anchor={anchor}
                today={today}
                eventsForDay={eventsForDay}
                onSelect={selectEvent}
                selectedId={selected?.id}
              />
            ) : (
              <>
                {/* Desktop timeline — hidden on mobile */}
                <div className="cal-desktop-timeline" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <TimelineGrid
                    days={days}
                    today={today}
                    timedEventsForDay={timedEventsForDay}
                    allDayEventsForDay={allDayEventsForDay}
                    onSelect={selectEvent}
                    selectedId={selected?.id}
                    ref={timelineRef}
                  />
                </div>
                {/* Mobile DayTicker + AgendaList — hidden on desktop */}
                <div className="cal-mobile-view" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <MobileDayTickerView
                    anchor={anchor}
                    today={today}
                    filteredEvents={filteredEvents}
                    onDaySelect={(d) => setAnchor(d)}
                    onSelect={selectEvent}
                    selectedId={selected?.id ?? null}
                  />
                </div>
              </>
            )}
          </div>
        </main>

        {/* ── RIGHT RAIL ── */}
        <aside style={{
          width: 280,
          flexShrink: 0,
          borderLeft: "1px solid var(--line-separator)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "var(--space-5) var(--space-4)",
          gap: 0,
        }} className="cal-right-rail">

          {/* Upcoming */}
          <div style={{ marginBottom: "var(--space-5)" }}>
            <div style={sectionLabel}>upcoming</div>
            <div style={{ marginTop: "var(--space-2)", display: "flex", flexDirection: "column", gap: 1 }}>
              {upcomingEvents.length === 0 ? (
                <EmptyState title="nothing upcoming." size="sm" align="left" />
              ) : (
                upcomingEvents.map(ev => {
                  const cfg      = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.gcal;
                  const evDate   = isoToDate(ev.start);
                  const evAllDay = ev.all_day || /^\d{4}-\d{2}-\d{2}$/.test(ev.start);
                  const relTime  = formatRelativeTime(evDate, evAllDay);
                  const dateLabel = evDate.toLocaleDateString("en-US", { timeZone: "America/Detroit", weekday: "short", month: "short", day: "numeric" });
                  const timeLabel = ev.all_day || /^\d{4}-\d{2}-\d{2}$/.test(ev.start)
                    ? ""
                    : ` · ${new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })} ET`;
                  const isActive = selected?.id === ev.id;
                  const evRgb    = typeRgb(ev.type);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => selectEvent(ev)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "var(--space-2)",
                        padding: "var(--space-2) var(--space-2)",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid transparent",
                        background: isActive ? `rgba(${evRgb},0.08)` : "transparent",
                        borderColor: isActive ? `rgba(${evRgb},0.19)` : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "background 0.1s",
                      }}
                    >
                      <span style={{ fontSize: "var(--fs-small)", flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "var(--fs-xs)", fontWeight: 500, color: "var(--text-active)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                        <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{dateLabel}{timeLabel}</div>
                        {relTime && <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", fontFamily: "var(--font-mono)", marginTop: 1, opacity: 0.7 }}>{relTime}</div>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ height: 1, background: "var(--line-separator)", marginBottom: "var(--space-5)" }} />

          {/* Selected event detail */}
          <div style={{ flex: 1 }}>
            <div style={sectionLabel}>event detail</div>
            {selected ? (
              <EventDetail event={selected} onClose={() => setSelected(null)} />
            ) : (
              <EmptyState title="select an event." size="sm" align="left" />
            )}
          </div>
        </aside>
      </div>

      {/* ── MOBILE FAB ── */}
      <MobileFAB onTap={() => setMobileSheet("fab")} />

      {/* ── MOBILE BOTTOM SHEETS ── */}
      {mobileSheet && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(12,14,18,0.70)",
            transition: "background 0.2s",
          }}
          onClick={() => { setMobileSheet(null); if (mobileSheet === "event") setSelected(null); }}
        >
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "var(--glass-t2-bg)",
              backdropFilter: "blur(var(--glass-t2-blur))",
              WebkitBackdropFilter: "blur(var(--glass-t2-blur))",
              borderTop: "1px solid var(--glass-t2-border)",
              borderRadius: "var(--radius-panel) var(--radius-panel) 0 0",
              maxHeight: mobileSheet === "event" ? "60vh" : "85vh",
              overflowY: "auto",
              padding: "var(--space-5) var(--space-5) var(--space-10)",
              transform: "translateY(0)",
              transition: "transform 250ms var(--ease-out-soft)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet handle */}
            <div style={{ width: 36, height: 4, borderRadius: "var(--radius-pill)", background: "var(--glass-t2-border)", margin: "0 auto var(--space-5)" }} />

            {mobileSheet === "filter" && (
              <>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--fs-h3)", marginBottom: "var(--space-5)", color: "var(--text-active)" }}>Filters</div>
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <div style={sectionLabel}>Event types</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {(Object.entries(TYPE_CONFIG) as [EventType, TypeConfig][]).map(([type, cfg]) => {
                      const checked  = filterTypes.has(type);
                      const tRgb     = typeRgb(type as EventType);
                      return (
                        <button
                          key={type}
                          onClick={() => setFilterTypes(prev => {
                            const next = new Set(prev);
                            if (next.has(type)) next.delete(type);
                            else next.add(type);
                            return next;
                          })}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 12px",
                            borderRadius: "var(--radius-pill)",
                            border: checked ? `1px solid rgba(${tRgb},0.5)` : `1px solid rgba(${tRgb},0.25)`,
                            background: checked ? `rgba(${tRgb},0.15)` : "transparent",
                            color: checked ? cfg.color : "var(--text-faint)",
                            fontSize: "var(--fs-xs)",
                            cursor: "pointer",
                          }}
                        >
                          <span>{cfg.icon}</span> {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {accounts.length > 0 && (
                  <div>
                    <div style={sectionLabel}>Accounts</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      {accounts.map(email => {
                        const color    = accountColor(email);
                        const colorHex = accountColorHex(email);
                        const checked  = filterAccounts.has("all") || filterAccounts.has(email);
                        return (
                          <button
                            key={email}
                            onClick={() => setFilterAccounts(prev => {
                              const next = new Set(prev);
                              if (next.has("all")) { next.delete("all"); next.add(email); }
                              else if (next.has(email)) { next.delete(email); if (next.size === 0) next.add("all"); }
                              else next.add(email);
                              return next;
                            })}
                            style={{
                              display: "flex", alignItems: "center", gap: "var(--space-2)",
                              padding: "var(--space-2) var(--space-3)",
                              borderRadius: "var(--radius-sm)",
                              border: checked ? `1px solid rgba(${hexToRgb(colorHex)},0.4)` : "1px solid var(--glass-t1-border)",
                              background: checked ? `rgba(${hexToRgb(colorHex)},0.1)` : "transparent",
                              color: "var(--text-main)",
                              fontSize: "var(--fs-xs)",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)" }}>{email}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {mobileSheet === "event" && selected && (
              <MobileEventDetail event={selected} onClose={() => { setSelected(null); setMobileSheet(null); }} />
            )}
            {mobileSheet === "event" && !selected && (
              <div style={{ color: "var(--text-faint)", fontSize: 13 }}>No event selected</div>
            )}
            {mobileSheet === "fab" && (
              <div style={{ textAlign: "center", padding: "var(--space-5) 0 var(--space-3)" }}>
                <div style={{
                  fontSize: "var(--fs-h1)", marginBottom: "var(--space-3)",
                }}>📅</div>
                <div style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700, fontSize: "var(--fs-h3)", color: "var(--text-active)", marginBottom: "var(--space-2)",
                }}>Event creation coming soon</div>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-faint)", lineHeight: 1.6, marginBottom: "var(--space-6)" }}>
                  Natural language event creation is on the roadmap.<br />
                  Use Google Calendar to create events for now.
                </div>
                <a
                  href="https://calendar.google.com/calendar/r/eventedit"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "var(--accent)", color: "var(--accent-text-on)",
                    padding: "10px 20px", borderRadius: "var(--radius-sm)",
                    fontSize: "var(--fs-small)", fontWeight: 600, textDecoration: "none",
                  }}
                  onClick={() => setMobileSheet(null)}
                >
                  Open Google Calendar →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── INLINE STYLES ── */}
      <style>{`
        /* Hide rails on mobile, show single-col layout */
        @media (max-width: 899px) {
          .cal-left-rail  { display: none !important; }
          .cal-right-rail { display: none !important; }
          .cal-mobile-filter-btn { display: flex !important; }
        }
        @media (min-width: 900px) {
          .cal-mobile-filter-btn { display: none !important; }
          .cal-mobile-view { display: none !important; }
          .cal-mobile-fab  { display: none !important; }
        }
        @media (max-width: 899px) {
          .cal-desktop-timeline { display: none !important; }
        }

        /* Hover states for event cards */
        .cal-event-chip:hover {
          filter: brightness(1.15);
        }

        /* Scrollbar styles for timeline */
        .cal-timeline::-webkit-scrollbar { width: 5px; }
        .cal-timeline::-webkit-scrollbar-track { background: transparent; }
        .cal-timeline::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 3px; }

        /* Ticker strip scrollbar hide */
        .cal-ticker-strip::-webkit-scrollbar { display: none; }
        .cal-ticker-strip { -ms-overflow-style: none; scrollbar-width: none; }

        /* Agenda list scrollbar */
        .cal-agenda-list::-webkit-scrollbar { width: 3px; }
        .cal-agenda-list::-webkit-scrollbar-track { background: transparent; }
        .cal-agenda-list::-webkit-scrollbar-thumb { background: var(--glass-border); border-radius: 3px; }


        /* Deep Midnight glass rails */
        .cal-left-rail {
          background: var(--glass-bg) !important;
          backdrop-filter: blur(var(--blur-amount)) !important;
          -webkit-backdrop-filter: blur(var(--blur-amount)) !important;
          border-right: 1px solid var(--line-separator) !important;
          box-shadow: var(--glass-shadow) !important;
        }
        .cal-right-rail {
          background: var(--glass-bg) !important;
          backdrop-filter: blur(var(--blur-amount)) !important;
          -webkit-backdrop-filter: blur(var(--blur-amount)) !important;
          border-left: 1px solid var(--line-separator) !important;
          box-shadow: var(--glass-shadow) !important;
        }
        /* Main area toolbar */
        .cal-toolbar {
          background: var(--glass-bg) !important;
          border-bottom: 1px solid var(--line-separator) !important;
        }
        /* Top-level outer container */
        .cal-outer {
          background: var(--bg-base) !important;
        }
        @media (max-width: 899px) {
          .cal-outer {
            height: calc(100vh - 108px) !important;
          }
        }
      `}</style>
    </>
  );
}

// ── MobileFAB ─────────────────────────────────────────────────────────────────

function MobileFAB({ onTap }: { onTap: () => void }) {
  return (
    <button
      className="cal-mobile-fab"
      onClick={onTap}
      aria-label="Create event"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        right: 20,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "var(--accent)",
        color: "var(--accent-text-on)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--fs-h2)",
        fontWeight: 300,
        boxShadow: "var(--shadow-accent), var(--shadow-sm)",
        zIndex: 150,
        transition: "transform 0.15s, box-shadow 0.15s",
        lineHeight: 1,
      }}
      onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.94)"; }}
      onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
      onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.94)"; }}
      onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
    >
      +
    </button>
  );
}

// ── MobileDayTickerView ───────────────────────────────────────────────────────

function MobileDayTickerView({
  anchor,
  today,
  filteredEvents,
  onDaySelect,
  onSelect,
  selectedId,
}: {
  anchor: Date;
  today: Date;
  filteredEvents: CalEvent[];
  onDaySelect: (d: Date) => void;
  onSelect: (ev: CalEvent) => void;
  selectedId: string | null;
}) {
  // Build ~14 days around anchor (7 before today, 7 after)
  const tickerDays = useMemo(() => {
    const base = new Date(today);
    return Array.from({ length: 21 }, (_, i) => addDays(base, i - 7));
  }, [today]);

  const tickerRef = useRef<HTMLDivElement>(null);
  const agendaRef = useRef<HTMLDivElement>(null);
  const [activeTicker, setActiveTicker] = useState<Date>(anchor);

  // Scroll ticker to center today on mount
  useEffect(() => {
    if (!tickerRef.current) return;
    const el = tickerRef.current;
    // Each day chip is ~56px wide (48px + gap). Today is at index 7
    const dayWidth = 56;
    const todayOffset = 7 * dayWidth;
    el.scrollLeft = Math.max(0, todayOffset - el.clientWidth / 2 + dayWidth / 2);
  }, []);

  // Group events by day for the agenda list
  // Show 30 days from the earliest visible ticker day
  const agendaDays = useMemo(() => {
    const start = addDays(today, -7);
    return Array.from({ length: 45 }, (_, i) => addDays(start, i));
  }, [today]);

  const eventsForAgendaDay = useCallback((day: Date) => {
    return filteredEvents
      .filter(ev => sameDay(isoToDate(ev.start), day))
      .sort((a, b) => {
        if (a.all_day && !b.all_day) return -1;
        if (!a.all_day && b.all_day) return 1;
        return isoToDate(a.start).getTime() - isoToDate(b.start).getTime();
      });
  }, [filteredEvents]);

  // IntersectionObserver: detect which day header is in view → update ticker active day
  useEffect(() => {
    if (!agendaRef.current) return;
    const container = agendaRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const dateStr = (entry.target as HTMLElement).dataset.date;
            if (dateStr) {
              const d = new Date(dateStr);
              setActiveTicker(d);
            }
          }
        }
      },
      { root: container, threshold: 0.5, rootMargin: "0px 0px -70% 0px" }
    );
    const headers = container.querySelectorAll("[data-date]");
    headers.forEach(h => observer.observe(h));
    return () => observer.disconnect();
  }, [filteredEvents, agendaDays]);

  // When ticker day is tapped → scroll agenda to that day
  function scrollAgendaToDay(day: Date) {
    setActiveTicker(day);
    onDaySelect(day);
    if (!agendaRef.current) return;
    const dateStr = day.toISOString().slice(0, 10);
    const header = agendaRef.current.querySelector(`[data-date="${dateStr}"]`);
    if (header) {
      header.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* DayTicker strip */}
      <div
        ref={tickerRef}
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          overflowX: "auto",
          flexShrink: 0,
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          borderBottom: "1px solid var(--line-separator)",
          scrollbarWidth: "none",
        }}
        className="cal-ticker-strip"
      >
        {tickerDays.map(day => {
          const isToday   = sameDay(day, today);
          const isActive  = sameDay(day, activeTicker);
          const hasEvents = filteredEvents.some(ev => sameDay(isoToDate(ev.start), day));
          const dateStr   = day.toLocaleDateString("en-US", { weekday: "narrow" });
          return (
            <button
              key={day.toISOString()}
              onClick={() => scrollAgendaToDay(day)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--space-1)",
                minWidth: 48,
                padding: "var(--space-2) var(--space-1)",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: isActive ? "var(--accent)" : "transparent",
                cursor: "pointer",
                scrollSnapAlign: "center",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <span style={{
                fontSize: "var(--fs-mono)",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: isActive ? "var(--text-active)" : "var(--text-faint)",
              }}>
                {dateStr}
              </span>
              <span style={{
                fontSize: "var(--fs-body)",
                fontWeight: isToday || isActive ? 700 : 400,
                color: isActive ? "var(--text-active)" : isToday ? "var(--accent)" : "var(--text-main)",
                lineHeight: 1,
              }}>
                {day.getDate()}
              </span>
              {/* Event dot */}
              <div style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: hasEvents
                  ? (isActive ? "var(--text-active)" : "var(--accent)")
                  : "transparent",
                transition: "background 0.15s",
              }} />
            </button>
          );
        })}
      </div>

      {/* Agenda list */}
      <div
        ref={agendaRef}
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
        }}
        className="cal-agenda-list"
      >
        {agendaDays.map(day => {
          const dayEvts = eventsForAgendaDay(day);
          const isToday = sameDay(day, today);
          const dateStr = day.toISOString().slice(0, 10);
          return (
            <div key={dateStr}>
              {/* Sticky day header */}
              <div
                data-date={dateStr}
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--bg-base)",
                  borderBottom: "1px solid var(--line-separator)",
                  padding: "var(--space-2) var(--space-4) var(--space-1)",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  zIndex: 10,
                }}
              >
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: isToday ? "var(--accent)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: "var(--fs-small)",
                    fontWeight: 700,
                    color: isToday ? "var(--accent-text-on)" : "var(--text-main)",
                  }}>
                    {day.getDate()}
                  </span>
                </div>
                <span style={{
                  fontSize: "var(--fs-xs)",
                  fontWeight: isToday ? 600 : 400,
                  color: isToday ? "var(--accent)" : "var(--text-main)",
                  fontFamily: "var(--font-display)",
                }}>
                  {day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </span>
              </div>

              {/* Events for this day */}
              {dayEvts.length === 0 ? (
                <EmptyState title="no events." size="sm" />
              ) : (
                <div style={{ padding: "6px 12px 8px" }}>
                  {dayEvts.map(ev => {
                    const cfg       = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.gcal;
                    const rgb       = typeRgb(ev.type);
                    const isAllDay  = ev.all_day || /^\d{4}-\d{2}-\d{2}$/.test(ev.start);
                    const timeLabel = isAllDay
                      ? "all day"
                      : new Date(ev.start).toLocaleTimeString("en-US", {
                          hour: "numeric", minute: "2-digit", timeZone: "America/Detroit",
                        }) + " ET";
                    const isSelected = selectedId === ev.id;
                    return (
                      <button
                        key={ev.id}
                        className="cal-event-chip"
                        onClick={() => onSelect(ev)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 0,
                          width: "100%",
                          background: isSelected ? `rgba(${rgb},0.15)` : `rgba(${rgb},0.08)`,
                          border: "none",
                          borderLeft: `3px solid ${cfg.color}`,
                          borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                          marginBottom: "var(--space-1)",
                          padding: "var(--space-2) var(--space-3)",
                          cursor: "pointer",
                          textAlign: "left",
                          boxShadow: `inset 0 0 0 1px rgba(${rgb},0.20)`,
                          transition: "background 0.1s",
                          minHeight: 44,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: "var(--fs-small)",
                            fontWeight: 600,
                            color: "var(--text-active)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginBottom: "var(--space-1)",
                          }}>
                            {ev.title}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                            <span style={{
                              fontSize: "var(--fs-mono)",
                              color: cfg.color,
                              fontFamily: "var(--font-mono)",
                              fontWeight: 500,
                            }}>
                              {timeLabel}
                            </span>
                            {ev.location && (
                              <>
                                <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)" }}>·</span>
                                <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  📍 {ev.location}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <span style={{ fontSize: "var(--fs-body)", flexShrink: 0, marginLeft: "var(--space-2)", alignSelf: "center", opacity: 0.5 }}>›</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MobileEventDetail (bottom-sheet variant) ──────────────────────────────────

function MobileEventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const cfg      = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.gcal;
  const rgb      = typeRgb(event.type);
  const isAllDay = event.all_day || /^\d{4}-\d{2}-\d{2}$/.test(event.start);

  const startDate = isoToDate(event.start);
  const dateStr = startDate.toLocaleDateString("en-US", {
    weekday: "short", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Detroit",
  });

  const timeRange = isAllDay
    ? "All day"
    : [
        new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" }),
        event.end ? `— ${new Date(event.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Detroit" })}` : "",
      ].filter(Boolean).join(" ") + " ET";

  function getOpenUrl(): string | null {
    if (event.html_link) return event.html_link;
    if (event.url) return event.url;
    if (event.source === "google") return "https://calendar.google.com/";
    return null;
  }
  function getOpenLabel(): string {
    if (event.source === "google") return "Open in Google Calendar";
    if (event.url) return "Open URL";
    return "Open";
  }

  const openUrl = getOpenUrl();

  return (
    <div>
      {/* Color bar + type badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
      }}>
        <div style={{ width: 4, height: 40, borderRadius: 2, background: cfg.color, flexShrink: 0 }} />
        <div>
          <div style={{
            fontSize: "var(--fs-mono)", fontWeight: 700, letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase",
            color: cfg.color, marginBottom: 2,
          }}>
            {cfg.icon} {cfg.label}
          </div>
          <div style={{
            fontSize: "var(--fs-h3)", fontWeight: 700, letterSpacing: "var(--ls-heading)",
            color: "var(--text-active)", lineHeight: "var(--lh-tight)",
            fontFamily: "var(--font-display)",
          }}>
            {event.title}
          </div>
        </div>
      </div>

      {/* Date + time */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)", background: "var(--glass-t1-bg)", borderRadius: "var(--radius-sm)",
      }}>
        <span style={{ fontSize: "var(--fs-h3)" }}>📅</span>
        <div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-active)", fontWeight: 500 }}>{dateStr}</div>
          <div style={{
            fontSize: "var(--fs-mono)", color: cfg.color,
            fontFamily: "var(--font-mono)",
          }}>{timeRange}</div>
        </div>
      </div>

      {/* Location */}
      {event.location && (
        <div style={{
          display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)", background: "var(--glass-t1-bg)", borderRadius: "var(--radius-sm)",
        }}>
          <span style={{ fontSize: "var(--fs-h3)" }}>📍</span>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-main)", lineHeight: "var(--lh-body)" }}>{event.location}</div>
        </div>
      )}

      {/* Organizer */}
      {event.organizer?.email && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...detailLabel, marginBottom: 4 }}>hosted by</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-main)" }}>
            {event.organizer.name ?? event.organizer.email}
          </div>
        </div>
      )}

      {/* Attendees */}
      {event.attendees && event.attendees.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...detailLabel, marginBottom: 6 }}>attendees ({event.attendees.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {event.attendees.slice(0, 5).map((a, i) => {
              const rs    = a.response_status ?? "needsAction";
              const icon  = RESPONSE_ICONS[rs] ?? "⏳";
              const color = RESPONSE_COLORS[rs] ?? "var(--text-muted)";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: `rgba(${rgb},0.2)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: cfg.color, flexShrink: 0,
                  }}>
                    {(a.name ?? a.email)[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-active)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.name ?? a.email}
                    </div>
                    {a.name && <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>{a.email}</div>}
                  </div>
                  <span style={{ fontSize: "var(--fs-xs)", color, flexShrink: 0 }}>{icon}</span>
                </div>
              );
            })}
            {event.attendees.length > 5 && (
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>+{event.attendees.length - 5} more</div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)",
              background: cfg.color, color: "var(--bg-base)",
              padding: "var(--space-2) var(--space-4)", borderRadius: "var(--radius-sm)",
              fontSize: "var(--fs-small)", fontWeight: 600, textDecoration: "none",
              minHeight: 44,
            }}
          >
            {getOpenLabel()} →
          </a>
        )}
        <button
          onClick={onClose}
          style={{
            background: "var(--glass-t1-bg)", border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-4)",
            color: "var(--text-faint)", fontSize: "var(--fs-small)", cursor: "pointer",
            minHeight: 44, minWidth: 80,
          }}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}

// ── Skeleton Loader ────────────────────────────────────────────────────────────

function SkeletonLoader({ view }: { view: ViewMode }) {
  if (view === "month") {
    return (
      <div style={{ padding: "var(--space-4)", display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="arthur-skeleton" style={{ height: 90, borderRadius: "var(--radius-sm)", opacity: 0.4 + (i % 3) * 0.15 }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="arthur-skeleton" style={{ height: 40, width: `${60 + (i * 13) % 35}%`, opacity: 0.3 + (i % 3) * 0.1 }} />
      ))}
    </div>
  );
}

// ── TimelineGrid (Day + Week) ─────────────────────────────────────────────────

import { forwardRef } from "react";

const TimelineGrid = forwardRef<HTMLDivElement, {
  days: Date[];
  today: Date;
  timedEventsForDay: (d: Date) => CalEvent[];
  allDayEventsForDay: (d: Date) => CalEvent[];
  onSelect: (e: CalEvent) => void;
  selectedId?: string | null;
}>(function TimelineGrid({ days, today, timedEventsForDay, allDayEventsForDay, onSelect, selectedId }, ref) {
  const isWeek  = days.length === 7;
  const colWidth = isWeek ? `${100 / 7}%` : "100%";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 }}>

      {/* Day headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `48px repeat(${days.length}, 1fr)`,
        borderBottom: "1px solid var(--line-separator)",
        flexShrink: 0,
        background: "var(--bg-base)",
      }}>
        <div /> {/* Time gutter spacer */}
        {days.map(day => {
          const isToday = sameDay(day, today);
          const allDay  = allDayEventsForDay(day);
          return (
            <div
              key={day.toISOString()}
              style={{
                padding: "var(--space-2) var(--space-1) var(--space-1)",
                borderLeft: "1px solid var(--line-separator)",
                background: isToday ? "var(--accent-orange-soft)" : "transparent",
              }}
            >
              {/* Day label */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: allDay.length > 0 ? 4 : 0 }}>
                {isToday && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: isWeek ? "var(--fs-mono)" : "var(--fs-xs)",
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? "var(--accent)" : "var(--text-main)",
                  letterSpacing: "0.01em",
                }}>
                  {isWeek
                    ? `${day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} ${day.getDate()}`
                    : day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </span>
              </div>
              {/* All-day events strip */}
              {allDay.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {allDay.slice(0, 2).map(ev => {
                    const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.gcal;
                    return (
                      <EventChipSmall key={ev.id} event={ev} cfg={cfg} onClick={() => onSelect(ev)} selected={selectedId === ev.id} />
                    );
                  })}
                  {allDay.length > 2 && (
                    <div style={{ fontSize: 9, color: "var(--text-faint)", paddingLeft: 4 }}>+{allDay.length - 2}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline */}
      <div ref={ref} className="cal-timeline" style={{ flex: 1, overflowY: "scroll", minHeight: 0 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `48px repeat(${days.length}, 1fr)`,
          position: "relative",
        }}>
          {/* Hour rows */}
          {HOURS.map(hour => (
            <div
              key={hour}
              style={{
                gridColumn: `1 / ${days.length + 2}`,
                display: "grid",
                gridTemplateColumns: `48px repeat(${days.length}, 1fr)`,
                borderBottom: "1px solid var(--glass-t1-border)",
                height: 56,
              }}
            >
              <div style={{
                padding: "2px 8px 0 0",
                textAlign: "right",
                fontSize: "var(--fs-mono)",
                color: "var(--text-faint)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.02em",
                lineHeight: 1,
                userSelect: "none",
                flexShrink: 0,
              }}>
                {hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`}
              </div>
              {days.map(day => (
                <div
                  key={day.toISOString()}
                  style={{
                    borderLeft: "1px solid var(--glass-t1-border)",
                    background: sameDay(day, today) ? "var(--glass-t1-bg)" : "transparent",
                  }}
                />
              ))}
            </div>
          ))}

          {/* Current time indicator */}
          <CurrentTimeLine days={days} today={today} />

          {/* Timed events — positioned absolutely per day column with overlap-aware columns */}
          {days.map((day, colIdx) => {
            const timed = timedEventsForDay(day);
            if (!timed.length) return null;

            // Canonical greedy column-packing:
            // 1. Sort by start time.
            // 2. Assign each event the leftmost column whose last event has already ended.
            // 3. Compute each event's overlap-cluster max (subTotal) for correct width.
            const sorted = [...timed].sort((a, b) => isoToDate(a.start).getTime() - isoToDate(b.start).getTime());
            type Slot = { ev: CalEvent; subCol: number; subTotal: number; startMs: number; endMs: number };
            const slotted: Slot[] = [];
            // columnEnds[col] = latest endMs placed in that column
            const columnEnds: number[] = [];
            for (const ev of sorted) {
              const startMs = isoToDate(ev.start).getTime();
              const endMs   = ev.end ? isoToDate(ev.end).getTime() : startMs + 3600000;
              // Find leftmost column whose last event has ended
              let subCol = columnEnds.findIndex(e => e <= startMs);
              if (subCol === -1) subCol = columnEnds.length;
              columnEnds[subCol] = endMs;
              slotted.push({ ev, subCol, subTotal: 0, startMs, endMs });
            }
            // Compute subTotal: for each event, find all events in its overlap cluster
            // using union-find style flood fill so chains (A overlaps B, B overlaps C) merge correctly
            const n = slotted.length;
            const cluster = Array.from({ length: n }, (_, i) => i); // cluster root index
            function findRoot(i: number): number { return cluster[i] === i ? i : (cluster[i] = findRoot(cluster[i])); }
            for (let i = 0; i < n; i++) {
              for (let j = i + 1; j < n; j++) {
                if (slotted[i].startMs < slotted[j].endMs && slotted[j].startMs < slotted[i].endMs) {
                  const ri = findRoot(i), rj = findRoot(j);
                  if (ri !== rj) cluster[ri] = rj;
                }
              }
            }
            // Max subCol+1 within each cluster
            const clusterMax = new Map<number, number>();
            for (let i = 0; i < n; i++) {
              const root = findRoot(i);
              clusterMax.set(root, Math.max(clusterMax.get(root) ?? 0, slotted[i].subCol + 1));
            }
            for (let i = 0; i < n; i++) slotted[i].subTotal = clusterMax.get(findRoot(i)) ?? 1;

            return slotted.map(({ ev, subCol, subTotal }) => {
              const start    = isoToDate(ev.start);
              const end      = ev.end ? isoToDate(ev.end) : null;
              const topPct   = eventTopPercent(start);
              const heightPct= eventHeightPercent(start, end);
              const cfg      = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.gcal;
              const rgb      = typeRgb(ev.type);
              const isSelected = selectedId === ev.id;

              // Skip events outside the visible range
              if (topPct < 0 || topPct > 100) return null;

              const total = Math.max(1, subTotal);
              const subWidthPct = 100 / total;

              return (
                <button
                  key={ev.id}
                  className="cal-event-chip"
                  onClick={() => onSelect(ev)}
                  style={{
                    position: "absolute",
                    // 48px gutter + colIdx * (col width) + subCol * (sub-col width within day)
                    left:   `calc(48px + ${colIdx} * (100% - 48px) / ${days.length} + (${subCol} * ((100% - 48px) / ${days.length}) * ${subWidthPct / 100}) + 2px)`,
                    width:  `calc((100% - 48px) / ${days.length} * ${subWidthPct / 100} - 4px)`,
                    top:    `${topPct}%`,
                    height: `${heightPct}%`,
                    minHeight: 18,
                    background: `rgba(${rgb},0.15)`,
                    borderLeft: `3px solid ${cfg.color}`,
                    borderTop: "none",
                    borderRight: "none",
                    borderBottom: "none",
                    borderRadius: "0 4px 4px 0",
                    padding: "2px 5px",
                    cursor: "pointer",
                    textAlign: "left",
                    overflow: "hidden",
                    boxShadow: isSelected
                      ? `0 0 0 1px ${cfg.color}60, inset 0 0 0 1px ${cfg.color}30`
                      : `inset 0 0 0 1px rgba(${rgb},0.25)`,
                    zIndex: isSelected ? 2 : 1,
                    transition: "box-shadow 0.1s",
                  }}
                >
                  <div style={{
                    fontSize: "var(--fs-mono)",
                    color: cfg.color,
                    fontFamily: "var(--font-mono)",
                    lineHeight: 1.2,
                    marginBottom: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {formatTime(ev.start, false)}
                  </div>
                  <div style={{
                    fontSize: "var(--fs-mono)",
                    color: "var(--text-active)",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.3,
                  }}>
                    {ev.title}
                  </div>
                </button>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
});

// ── CurrentTimeLine ───────────────────────────────────────────────────────────

function CurrentTimeLine({ days, today }: { days: Date[]; today: Date }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const todayIdx = days.findIndex(d => sameDay(d, today));
  if (todayIdx === -1) return null;

  const h   = now.getHours() + now.getMinutes() / 60;
  if (h < HOUR_START || h > HOUR_END) return null;
  const pct = ((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100;

  return (
    <div style={{
      position: "absolute",
      left: `calc(48px + ${todayIdx} * (100% - 48px) / ${days.length})`,
      width: `calc((100% - 48px) / ${days.length})`,
      top: `${pct}%`,
      zIndex: 10,
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
    }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--tint-red)", flexShrink: 0, marginLeft: -5 }} />
      <div style={{ flex: 1, height: 2, background: "var(--tint-red)" }} />
    </div>
  );
}

// ── MonthGrid ─────────────────────────────────────────────────────────────────

function MonthGrid({ days, anchor, today, eventsForDay, onSelect, selectedId }: {
  days: Date[];
  anchor: Date;
  today: Date;
  eventsForDay: (d: Date) => CalEvent[];
  onSelect: (e: CalEvent) => void;
  selectedId?: string | null;
}) {
  const HEADERS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", padding: "0 0 0 0" }}>
      {/* Headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        borderBottom: "1px solid var(--line-separator)",
        flexShrink: 0,
      }}>
        {HEADERS.map(h => (
          <div key={h} style={{
            padding: "var(--space-2) 0",
            textAlign: "center",
            fontSize: "var(--fs-mono)",
            fontWeight: 700,
            color: "var(--text-faint)",
            letterSpacing: "var(--ls-eyebrow)",
          }}>{h}</div>
        ))}
      </div>
      {/* Grid — scrollable */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--line-separator)", padding: 1 }}>
          {days.map(day => {
            const isToday  = sameDay(day, today);
            const inMonth  = day.getMonth() === anchor.getMonth();
            const dayEvts  = eventsForDay(day);
            return (
              <div key={day.toISOString()} style={{
                background: "var(--bg-base)",
                minHeight: 100,
                padding: "var(--space-1)",
                opacity: inMonth ? 1 : 0.35,
                position: "relative",
              }}>
                {/* Date number */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "var(--space-1)",
                }}>
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isToday ? "var(--accent)" : "transparent",
                    border: isToday ? "none" : "1px solid transparent",
                    color: isToday ? "var(--accent-text-on)" : "var(--text-main)",
                    fontSize: "var(--fs-mono)",
                    fontWeight: isToday ? 700 : 400,
                  }}>
                    {day.getDate()}
                  </div>
                  {dayEvts.length > 3 && (
                    <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)" }}>+{dayEvts.length - 3}</div>
                  )}
                </div>
                {/* Event chips */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {dayEvts.slice(0, 3).map(ev => {
                    const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.gcal;
                    return (
                      <EventChipSmall
                        key={ev.id}
                        event={ev}
                        cfg={cfg}
                        onClick={() => onSelect(ev)}
                        selected={selectedId === ev.id}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── EventChipSmall ────────────────────────────────────────────────────────────

function EventChipSmall({ event, cfg, onClick, selected }: {
  event: CalEvent;
  cfg: TypeConfig;
  onClick: () => void;
  selected?: boolean;
}) {
  const rgb = typeRgb(event.type);
  const timeStr = formatTime(event.start, event.all_day);
  return (
    <button
      className="cal-event-chip"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: `rgba(${rgb},0.15)`,
        border: selected ? `1px solid ${cfg.color}50` : "none",
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
        padding: "2px 5px",
        cursor: "pointer",
        color: "var(--text-active)",
        fontSize: "var(--fs-mono)",
        fontWeight: 500,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        boxShadow: `inset 0 0 0 1px rgba(${rgb},0.25)`,
      }}
      title={event.title}
    >
      {timeStr && <span style={{ fontFamily: "var(--font-mono)", color: cfg.color, opacity: 0.9, marginRight: 3, fontSize: "var(--fs-mono)" }}>{timeStr}</span>}
      {event.title}
    </button>
  );
}

// ── EventDetail ───────────────────────────────────────────────────────────────

const RESPONSE_ICONS: Record<string, string> = {
  accepted:    "✓",
  declined:    "✗",
  tentative:   "?",
  needsAction: "⏳",
};

const RESPONSE_COLORS: Record<string, string> = {
  accepted:    "var(--tint-emerald)",
  declined:    "var(--tint-red)",
  tentative:   "var(--tint-amber)",
  needsAction: "var(--text-muted)",
};

function EventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.gcal;
  const rgb = typeRgb(event.type);

  const [addingAttendee,  setAddingAttendee]  = useState(false);
  const [attendeeEmail,   setAttendeeEmail]   = useState("");
  const [attendeeName,    setAttendeeName]    = useState("");
  const [attendeeSending, setAttendeeSending] = useState(false);
  const [attendeeError,   setAttendeeError]   = useState<string | null>(null);
  const [localAttendees,  setLocalAttendees]  = useState(event.attendees ?? []);

  // Sync local attendees when event changes
  useEffect(() => {
    setLocalAttendees(event.attendees ?? []);
    setAddingAttendee(false);
    setAttendeeEmail("");
    setAttendeeName("");
    setAttendeeError(null);
  }, [event.id, event.attendees]);

  const startDate = isoToDate(event.start);
  const timeRange = event.all_day
    ? "All day"
    : [
        formatTime(event.start, false),
        event.end ? `— ${formatTime(event.end, false)}` : "",
      ].filter(Boolean).join(" ");

  const dateStr = startDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Detroit",
  });

  function getOpenUrl(): string | null {
    if (event.html_link) return event.html_link;
    if (event.url) return event.url;
    if (event.source === "google") return "https://calendar.google.com/";
    return null;
  }

  function getOpenLabel(): string {
    if (event.source === "google") return "Open in Google Calendar";
    if (event.source === "arthur") return "Open in Inbox";
    if (event.url) return "Open URL";
    return "Open";
  }

  async function sendInvite() {
    if (!attendeeEmail.trim()) return;
    setAttendeeSending(true);
    setAttendeeError(null);
    try {
      const gcalId = event.gcal_id ?? event.id.replace(/^gcal:/, "");
      const res = await fetch(`/api/calendar/events/${encodeURIComponent(gcalId)}/attendees`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email:         attendeeEmail.trim(),
          name:          attendeeName.trim() || undefined,
          account_email: event.account_email,
          calendar_id:   event.account_email ?? "primary",
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `${res.status}`);
      }
      setLocalAttendees(prev => [
        ...prev,
        { email: attendeeEmail.trim(), name: attendeeName.trim() || undefined, response_status: "needsAction" },
      ]);
      setAddingAttendee(false);
      setAttendeeEmail("");
      setAttendeeName("");
    } catch (e) {
      setAttendeeError((e as Error).message);
    } finally {
      setAttendeeSending(false);
    }
  }

  const openUrl = getOpenUrl();
  const isGcal  = event.source === "google";

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      {/* Type badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
        padding: "3px var(--space-2)", borderRadius: "var(--radius-pill)",
        background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.19)`,
        fontSize: "var(--fs-mono)", fontWeight: 700, color: cfg.color,
        marginBottom: "var(--space-2)", letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase",
      }}>
        {cfg.icon} {cfg.label}
      </div>

      {/* Title */}
      <div style={{
        fontSize: "var(--fs-body-lg)", fontWeight: 700, letterSpacing: "var(--ls-heading)",
        color: "var(--text-active)", lineHeight: "var(--lh-tight)", marginBottom: "var(--space-2)",
        fontFamily: "var(--font-display)",
      }}>
        {event.title}
      </div>

      {/* Date + time */}
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-main)", marginBottom: "var(--space-1)", lineHeight: "var(--lh-body)" }}>
        {dateStr}
        {timeRange ? (
          <><br /><span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)" }}>{timeRange}</span></>
        ) : ""}
      </div>

      {/* Location */}
      {event.location && (
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-main)", marginBottom: "var(--space-1)", display: "flex", gap: "var(--space-1)", alignItems: "flex-start" }}>
          <span>📍</span><span>{event.location}</span>
        </div>
      )}

      {/* Account */}
      {event.account_email && (
        <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", marginBottom: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
          {event.account_email}
        </div>
      )}

      {/* Organizer (gcal only) */}
      {isGcal && event.organizer?.email && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          <div style={detailLabel}>host</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: `rgba(${rgb},0.2)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "var(--fs-mono)", fontWeight: 700, color: cfg.color, flexShrink: 0,
            }}>
              {(event.organizer.name ?? event.organizer.email)[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              {event.organizer.name && (
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 500, color: "var(--text-active)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {event.organizer.name}
                </div>
              )}
              <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {event.organizer.email}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendees (gcal only) */}
      {isGcal && (localAttendees.length > 0 || addingAttendee) && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          <div style={{ ...detailLabel, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>attendees ({localAttendees.length})</span>
            {!addingAttendee && (
              <button
                onClick={() => setAddingAttendee(true)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--accent)", fontSize: "var(--fs-mono)", padding: 0, letterSpacing: "0.02em",
                }}
              >
                + add
              </button>
            )}
          </div>
          <div style={{ marginTop: "var(--space-1)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {localAttendees.map((a, i) => {
              const rs    = a.response_status ?? "needsAction";
              const icon  = RESPONSE_ICONS[rs] ?? "⏳";
              const color = RESPONSE_COLORS[rs] ?? "var(--text-muted)";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "var(--glass-t1-bg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "var(--fs-mono)", fontWeight: 700, color: "var(--text-main)", flexShrink: 0,
                  }}>
                    {(a.name ?? a.email)[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {a.name && (
                      <div style={{ fontSize: "var(--fs-mono)", fontWeight: 500, color: "var(--text-active)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name}
                      </div>
                    )}
                    <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.email}
                    </div>
                  </div>
                  <span style={{ fontSize: "var(--fs-mono)", color, flexShrink: 0 }} title={rs}>{icon}</span>
                </div>
              );
            })}
          </div>

          {/* Add attendee form */}
          {addingAttendee && (
            <div style={{ marginTop: "var(--space-2)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <input
                type="email"
                placeholder="email address"
                value={attendeeEmail}
                onChange={e => setAttendeeEmail(e.target.value)}
                autoFocus
                style={{
                  background: "var(--glass-t1-bg)", border: "1px solid var(--glass-t1-border)",
                  borderRadius: "var(--radius-sm)", padding: "var(--space-1) var(--space-2)", color: "var(--text-active)",
                  fontSize: "var(--fs-xs)", fontFamily: "inherit", outline: "none",
                }}
              />
              <input
                type="text"
                placeholder="name (optional)"
                value={attendeeName}
                onChange={e => setAttendeeName(e.target.value)}
                style={{
                  background: "var(--glass-t1-bg)", border: "1px solid var(--glass-t1-border)",
                  borderRadius: "var(--radius-sm)", padding: "var(--space-1) var(--space-2)", color: "var(--text-active)",
                  fontSize: "var(--fs-xs)", fontFamily: "inherit", outline: "none",
                }}
              />
              {attendeeError && (
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--tint-red)" }}>{attendeeError}</div>
              )}
              <div style={{ display: "flex", gap: "var(--space-1)" }}>
                <button
                  onClick={sendInvite}
                  disabled={!attendeeEmail.trim() || attendeeSending}
                  style={{
                    background: "var(--accent)", color: "var(--accent-text-on)", border: "none",
                    borderRadius: "var(--radius-sm)", padding: "var(--space-1) var(--space-3)", fontSize: "var(--fs-mono)", fontWeight: 600,
                    cursor: "pointer", opacity: attendeeSending ? 0.6 : 1,
                  }}
                >
                  {attendeeSending ? "sending…" : "send invite"}
                </button>
                <button
                  onClick={() => { setAddingAttendee(false); setAttendeeError(null); }}
                  style={{
                    background: "transparent", border: "1px solid var(--glass-t1-border)",
                    borderRadius: "var(--radius-sm)", padding: "var(--space-1) var(--space-2)", fontSize: "var(--fs-mono)",
                    color: "var(--text-faint)", cursor: "pointer",
                  }}
                >
                  cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* + add attendee button (gcal, no attendees yet) */}
      {isGcal && localAttendees.length === 0 && !addingAttendee && (
        <button
          onClick={() => setAddingAttendee(true)}
          style={{
            background: "transparent", border: "1px dashed var(--glass-t1-border)",
            borderRadius: "var(--radius-sm)", padding: "var(--space-1) var(--space-3)", cursor: "pointer",
            color: "var(--text-faint)", fontSize: "var(--fs-mono)", marginBottom: "var(--space-2)",
            display: "flex", alignItems: "center", gap: "var(--space-1)",
          }}
        >
          + add attendee
        </button>
      )}

      {/* Description */}
      {event.description && (
        <div style={{
          fontSize: "var(--fs-xs)", color: "var(--text-main)", lineHeight: "var(--lh-body)",
          background: "var(--glass-t1-bg)", borderRadius: "var(--radius-sm)", padding: "var(--space-2) var(--space-2)",
          marginBottom: "var(--space-2)", borderLeft: `2px solid rgba(${rgb},0.25)`,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {event.description}
        </div>
      )}

      {/* Source pill (non-gcal) */}
      {!isGcal && (
        <TokenChip
          label={event.source}
          size="xs"
          color="muted"
          style={{ marginBottom: "var(--space-3)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}
        />
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
              background: cfg.color, color: "var(--bg-base)",
              padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-sm)",
              fontSize: "var(--fs-xs)", fontWeight: 600, textDecoration: "none",
              letterSpacing: "0.01em",
            }}
          >
            {getOpenLabel()} →
          </a>
        )}
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-sm)", padding: "var(--space-1) var(--space-3)",
            color: "var(--text-faint)", fontSize: "var(--fs-xs)", cursor: "pointer",
          }}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}

// ── Shared style objects ───────────────────────────────────────────────────────

const miniNavBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--glass-t1-border)",
  borderRadius: "var(--radius-sm)",
  width: 20,
  height: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "var(--text-muted)",
  fontSize: "var(--fs-xs)",
  padding: 0,
  lineHeight: 1,
};

const toolbarBtn: React.CSSProperties = {
  background: "var(--glass-t1-bg)",
  border: "1px solid var(--glass-t1-border)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-1) var(--space-3)",
  cursor: "pointer",
  color: "var(--text-main)",
  fontSize: "var(--fs-xs)",
  fontWeight: 500,
  letterSpacing: "0.01em",
};

const sectionLabel: React.CSSProperties = {
  fontSize: "var(--fs-mono)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "var(--ls-eyebrow)",
  color: "var(--text-faint)",
  fontFamily: "var(--font-mono)",
};

const detailLabel: React.CSSProperties = {
  fontSize:      "var(--fs-mono)",
  fontWeight:    700,
  textTransform: "uppercase",
  letterSpacing: "var(--ls-eyebrow)",
  color:         "var(--text-faint)",
  fontFamily:    "var(--font-mono)",
};
