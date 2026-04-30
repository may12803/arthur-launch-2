"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Nav, Footer } from "../_components/Layout";

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

const TYPE_CONFIG: Record<EventType, TypeConfig> = {
  gcal:        { color: "#3b82f6", label: "Google",       icon: "📅" },
  icloud:      { color: "#60a5fa", label: "iCloud",       icon: "☁️" },
  tracking:    { color: "#f97316", label: "Tracking",     icon: "📦" },
  ticket:      { color: "#a855f7", label: "Ticket",       icon: "🎟️" },
  reservation: { color: "#22c55e", label: "Reservation",  icon: "🏨" },
  approval:    { color: "#ef4444", label: "Reply needed", icon: "📨" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
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

const ACCOUNT_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#f97316"
];
function accountColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return ACCOUNT_COLORS[Math.abs(hash) % ACCOUNT_COLORS.length];
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

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [view, setView]             = useState<ViewMode>(isMobile ? "day" : "week");
  const [anchor, setAnchor]         = useState<Date>(today);
  const [events, setEvents]         = useState<CalEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<CalEvent | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<EventType>>(new Set(Object.keys(TYPE_CONFIG) as EventType[]));
  const [filterAccounts, setFilterAccounts] = useState<Set<string>>(new Set(["all"]));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"event" | "filter" | null>(null);

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
    if (!timelineRef.current) return;
    const nowH = new Date().getHours();
    const pct  = ((nowH - HOUR_START) / (HOUR_END - HOUR_START)) * 100;
    const el   = timelineRef.current;
    const scrollTo = (el.scrollHeight * pct / 100) - el.clientHeight / 2;
    el.scrollTop = Math.max(0, scrollTo);
  }, [view, loading]);

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
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
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
      <div style={{ display: "flex", height: "calc(100vh - 57px)", overflow: "hidden", background: "var(--bg)" }}>

        {/* ── LEFT RAIL ── */}
        <aside style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "20px 16px",
          gap: 24,
        }} className="cal-left-rail">

          {/* Mini-month */}
          <div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}>
              <span style={{
                fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: "-0.01em",
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
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
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
                      borderRadius: 4,
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
                          ? "rgba(255,71,19,0.15)"
                          : "transparent",
                      color: isToday
                        ? "#fff"
                        : isAnchor
                          ? "var(--accent)"
                          : inMonth
                            ? "var(--text)"
                            : "var(--text-faint)",
                      fontSize: 10,
                      fontWeight: isToday ? 700 : 400,
                      opacity: inMonth ? 1 : 0.4,
                    }}
                  >
                    {day.getDate()}
                    {hasEvts && !isToday && (
                      <div style={{
                        width: 3, height: 3, borderRadius: "50%",
                        background: hasApproval ? "#ef4444" : "var(--accent)",
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)" }} />

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
                      <span style={{ fontSize: 11.5, color: checked ? "var(--text)" : "var(--text-faint)" }}>{cfg.label}</span>
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
                        <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>{short}</span>
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
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--bg)",
          }}>
            {/* Mobile filter pill */}
            <button
              className="cal-mobile-filter-btn"
              onClick={() => setMobileSheet("filter")}
              style={{
                display: "none",
                background: "var(--panel)",
                border: "1px solid var(--border-strong)",
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 11,
                color: "var(--text-dim)",
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

            {/* Title */}
            <h1 style={{
              flex: 1,
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {rangeLabel}
            </h1>

            {/* View switcher */}
            <div style={{
              display: "flex",
              border: "1px solid var(--border-strong)",
              borderRadius: 7,
              overflow: "hidden",
              flexShrink: 0,
            }}>
              {(["day", "week", "month"] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? "var(--accent)" : "transparent",
                    color:      view === v ? "#fff" : "var(--text-dim)",
                    border: "none",
                    borderLeft: v !== "day" ? "1px solid var(--border-strong)" : "none",
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: view === v ? 600 : 400,
                    transition: "background 0.15s, color 0.15s",
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
            <div style={{ height: 2, background: "var(--border)", flexShrink: 0, position: "relative" }}>
              <div style={{
                position: "absolute",
                left: 0, top: 0, bottom: 0,
                width: `${monthProgress}%`,
                background: "rgba(255,71,19,0.35)",
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
              <TimelineGrid
                days={days}
                today={today}
                timedEventsForDay={timedEventsForDay}
                allDayEventsForDay={allDayEventsForDay}
                onSelect={selectEvent}
                selectedId={selected?.id}
                ref={timelineRef}
              />
            )}
          </div>
        </main>

        {/* ── RIGHT RAIL ── */}
        <aside style={{
          width: 280,
          flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "20px 16px",
          gap: 0,
        }} className="cal-right-rail">

          {/* Upcoming */}
          <div style={{ marginBottom: 20 }}>
            <div style={sectionLabel}>upcoming</div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 1 }}>
              {upcomingEvents.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "8px 0" }}>nothing upcoming</div>
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
                  return (
                    <button
                      key={ev.id}
                      onClick={() => selectEvent(ev)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 7,
                        border: "1px solid transparent",
                        background: isActive ? `rgba(${hexToRgb(cfg.color)},0.08)` : "transparent",
                        borderColor: isActive ? `${cfg.color}30` : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "background 0.1s",
                      }}
                    >
                      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", marginTop: 2 }}>{dateLabel}{timeLabel}</div>
                        {relTime && <div style={{ fontSize: 9.5, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", marginTop: 1, opacity: 0.7 }}>{relTime}</div>}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />

          {/* Selected event detail */}
          <div style={{ flex: 1 }}>
            <div style={sectionLabel}>event detail</div>
            {selected ? (
              <EventDetail event={selected} onClose={() => setSelected(null)} />
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 10, lineHeight: 1.6 }}>
                select an event to see details
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── MOBILE BOTTOM SHEETS ── */}
      {mobileSheet && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(7,8,11,0.7)",
          }}
          onClick={() => setMobileSheet(null)}
        >
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "var(--panel)",
              borderTop: "1px solid var(--border-strong)",
              borderRadius: "16px 16px 0 0",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "20px 20px 40px",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", margin: "0 auto 20px" }} />

            {mobileSheet === "filter" && (
              <>
                <div style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)", fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Filters</div>
                <div style={{ marginBottom: 16 }}>
                  <div style={sectionLabel}>Event types</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {(Object.entries(TYPE_CONFIG) as [EventType, TypeConfig][]).map(([type, cfg]) => {
                      const checked = filterTypes.has(type);
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
                            borderRadius: 20,
                            border: `1px solid ${cfg.color}${checked ? "" : "40"}`,
                            background: checked ? `rgba(${hexToRgb(cfg.color)},0.15)` : "transparent",
                            color: checked ? cfg.color : "var(--text-faint)",
                            fontSize: 12,
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
                        const color   = accountColor(email);
                        const checked = filterAccounts.has("all") || filterAccounts.has(email);
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
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: `1px solid ${checked ? color : "var(--border-strong)"}`,
                              background: checked ? `rgba(${hexToRgb(color)},0.1)` : "transparent",
                              color: "var(--text-dim)",
                              fontSize: 12,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", fontSize: 11 }}>{email}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {mobileSheet === "event" && selected && (
              <EventDetail event={selected} onClose={() => { setSelected(null); setMobileSheet(null); }} />
            )}
            {mobileSheet === "event" && !selected && (
              <div style={{ color: "var(--text-faint)", fontSize: 13 }}>No event selected</div>
            )}
          </div>
        </div>
      )}

      {/* ── INLINE STYLES ── */}
      <style>{`
        /* Hide rails on mobile, show single-col layout */
        @media (max-width: 1023px) {
          .cal-left-rail  { display: none !important; }
          .cal-right-rail { display: none !important; }
          .cal-mobile-filter-btn { display: flex !important; }
        }
        @media (min-width: 1024px) {
          .cal-mobile-filter-btn { display: none !important; }
        }

        /* Hover states for event cards */
        .cal-event-chip:hover {
          filter: brightness(1.15);
        }

        /* Scrollbar styles for timeline */
        .cal-timeline::-webkit-scrollbar { width: 5px; }
        .cal-timeline::-webkit-scrollbar-track { background: transparent; }
        .cal-timeline::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }

        /* Skeleton shimmer */
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, var(--panel) 25%, var(--panel-elev) 50%, var(--panel) 75%);
          background-size: 800px 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }
      `}</style>
    </>
  );
}

// ── Skeleton Loader ────────────────────────────────────────────────────────────

function SkeletonLoader({ view }: { view: ViewMode }) {
  if (view === "month") {
    return (
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 90, borderRadius: 6, opacity: 0.4 + (i % 3) * 0.15 }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 40, width: `${60 + (i * 13) % 35}%`, opacity: 0.3 + (i % 3) * 0.1 }} />
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
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        background: "var(--bg)",
      }}>
        <div /> {/* Time gutter spacer */}
        {days.map(day => {
          const isToday = sameDay(day, today);
          const allDay  = allDayEventsForDay(day);
          return (
            <div
              key={day.toISOString()}
              style={{
                padding: "8px 6px 4px",
                borderLeft: "1px solid var(--border)",
                background: isToday ? "rgba(255,71,19,0.04)" : "transparent",
              }}
            >
              {/* Day label */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: allDay.length > 0 ? 4 : 0 }}>
                {isToday && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: isWeek ? 10 : 12,
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? "var(--accent)" : "var(--text-dim)",
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
                borderBottom: "1px solid var(--border)",
                height: 56,
              }}
            >
              <div style={{
                padding: "2px 8px 0 0",
                textAlign: "right",
                fontSize: 10,
                color: "var(--text-faint)",
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
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
                    borderLeft: "1px solid var(--border)",
                    background: sameDay(day, today) ? "rgba(255,71,19,0.02)" : "transparent",
                  }}
                />
              ))}
            </div>
          ))}

          {/* Current time indicator */}
          <CurrentTimeLine days={days} today={today} />

          {/* Timed events — positioned absolutely per day column */}
          {days.map((day, colIdx) => {
            const timed = timedEventsForDay(day);
            if (!timed.length) return null;
            return timed.map(ev => {
              const start    = isoToDate(ev.start);
              const end      = ev.end ? isoToDate(ev.end) : null;
              const topPct   = eventTopPercent(start);
              const heightPct= eventHeightPercent(start, end);
              const cfg      = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.gcal;
              const rgb      = hexToRgb(cfg.color);
              const isSelected = selectedId === ev.id;

              // Skip events outside the visible range
              if (topPct < 0 || topPct > 100) return null;

              return (
                <button
                  key={ev.id}
                  className="cal-event-chip"
                  onClick={() => onSelect(ev)}
                  style={{
                    position: "absolute",
                    // 48px gutter + colIdx * (col width)
                    left:   `calc(48px + ${colIdx} * (100% - 48px) / ${days.length} + 2px)`,
                    width:  `calc((100% - 48px) / ${days.length} - 4px)`,
                    top:    `calc(${topPct}% * ${HOURS.length})`,
                    height: `calc(${heightPct}% * ${HOURS.length})`,
                    minHeight: 18,
                    background: `rgba(${rgb},0.08)`,
                    borderLeft: `3px solid ${cfg.color}`,
                    borderTop: "none",
                    borderRight: "none",
                    borderBottom: "none",
                    borderRadius: "0 4px 4px 0",
                    padding: "2px 5px",
                    cursor: "pointer",
                    textAlign: "left",
                    overflow: "hidden",
                    boxShadow: isSelected ? `0 0 0 1px ${cfg.color}60, inset 0 0 0 1px ${cfg.color}20` : "none",
                    zIndex: isSelected ? 2 : 1,
                    transition: "box-shadow 0.1s",
                  }}
                >
                  <div style={{
                    fontSize: 10,
                    color: cfg.color,
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    lineHeight: 1.2,
                    marginBottom: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {formatTime(ev.start, false)}
                  </div>
                  <div style={{
                    fontSize: 10.5,
                    color: "var(--text)",
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
      top: `${pct * HOURS.length}%`,
      zIndex: 10,
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginLeft: -3 }} />
      <div style={{ flex: 1, height: 1, background: "var(--accent)", opacity: 0.7 }} />
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
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        {HEADERS.map(h => (
          <div key={h} style={{
            padding: "8px 0",
            textAlign: "center",
            fontSize: 9.5,
            fontWeight: 700,
            color: "var(--text-faint)",
            letterSpacing: "0.08em",
          }}>{h}</div>
        ))}
      </div>
      {/* Grid — scrollable */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--border)", padding: 1 }}>
          {days.map(day => {
            const isToday  = sameDay(day, today);
            const inMonth  = day.getMonth() === anchor.getMonth();
            const dayEvts  = eventsForDay(day);
            return (
              <div key={day.toISOString()} style={{
                background: "var(--bg)",
                minHeight: 100,
                padding: 6,
                opacity: inMonth ? 1 : 0.35,
                position: "relative",
              }}>
                {/* Date number */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
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
                    color: isToday ? "#fff" : "var(--text-dim)",
                    fontSize: 11,
                    fontWeight: isToday ? 700 : 400,
                  }}>
                    {day.getDate()}
                  </div>
                  {dayEvts.length > 3 && (
                    <div style={{ fontSize: 9, color: "var(--text-faint)" }}>+{dayEvts.length - 3}</div>
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
  const rgb = hexToRgb(cfg.color);
  const timeStr = formatTime(event.start, event.all_day);
  return (
    <button
      className="cal-event-chip"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: `rgba(${rgb},0.08)`,
        border: selected ? `1px solid ${cfg.color}50` : "none",
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: "0 3px 3px 0",
        padding: "2px 5px",
        cursor: "pointer",
        color: "var(--text)",
        fontSize: 10,
        fontWeight: 500,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        boxShadow: "none",
      }}
      title={event.title}
    >
      {timeStr && <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", color: cfg.color, opacity: 0.9, marginRight: 3, fontSize: 9 }}>{timeStr}</span>}
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
  accepted:    "#22c55e",
  declined:    "#ef4444",
  tentative:   "#f59e0b",
  needsAction: "#6b7280",
};

function EventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.gcal;
  const rgb = hexToRgb(cfg.color);

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
    <div style={{ marginTop: 12 }}>
      {/* Type badge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 20,
        background: `rgba(${rgb},0.12)`, border: `1px solid ${cfg.color}30`,
        fontSize: 10.5, fontWeight: 700, color: cfg.color,
        marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase",
      }}>
        {cfg.icon} {cfg.label}
      </div>

      {/* Title */}
      <div style={{
        fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em",
        color: "var(--text)", lineHeight: 1.3, marginBottom: 8,
        fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
      }}>
        {event.title}
      </div>

      {/* Date + time */}
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6, lineHeight: 1.5 }}>
        {dateStr}
        {timeRange ? (
          <><br /><span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", fontSize: 11 }}>{timeRange}</span></>
        ) : ""}
      </div>

      {/* Location */}
      {event.location && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6, display: "flex", gap: 5, alignItems: "flex-start" }}>
          <span>📍</span><span>{event.location}</span>
        </div>
      )}

      {/* Account */}
      {event.account_email && (
        <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginBottom: 8, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
          {event.account_email}
        </div>
      )}

      {/* Organizer (gcal only) */}
      {isGcal && event.organizer?.email && (
        <div style={{ marginBottom: 10 }}>
          <div style={detailLabel}>host</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              background: `rgba(${rgb},0.2)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: cfg.color, flexShrink: 0,
            }}>
              {(event.organizer.name ?? event.organizer.email)[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              {event.organizer.name && (
                <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {event.organizer.name}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {event.organizer.email}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendees (gcal only) */}
      {isGcal && (localAttendees.length > 0 || addingAttendee) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ ...detailLabel, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>attendees ({localAttendees.length})</span>
            {!addingAttendee && (
              <button
                onClick={() => setAddingAttendee(true)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--accent)", fontSize: 10, padding: 0, letterSpacing: "0.02em",
                }}
              >
                + add
              </button>
            )}
          </div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {localAttendees.map((a, i) => {
              const rs    = a.response_status ?? "needsAction";
              const icon  = RESPONSE_ICONS[rs] ?? "⏳";
              const color = RESPONSE_COLORS[rs] ?? "#6b7280";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "var(--panel-elev)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color: "var(--text-dim)", flexShrink: 0,
                  }}>
                    {(a.name ?? a.email)[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {a.name && (
                      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.email}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color, flexShrink: 0 }} title={rs}>{icon}</span>
                </div>
              );
            })}
          </div>

          {/* Add attendee form */}
          {addingAttendee && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                type="email"
                placeholder="email address"
                value={attendeeEmail}
                onChange={e => setAttendeeEmail(e.target.value)}
                autoFocus
                style={{
                  background: "var(--panel-elev)", border: "1px solid var(--border-strong)",
                  borderRadius: 6, padding: "6px 10px", color: "var(--text)",
                  fontSize: 11.5, fontFamily: "inherit", outline: "none",
                }}
              />
              <input
                type="text"
                placeholder="name (optional)"
                value={attendeeName}
                onChange={e => setAttendeeName(e.target.value)}
                style={{
                  background: "var(--panel-elev)", border: "1px solid var(--border-strong)",
                  borderRadius: 6, padding: "6px 10px", color: "var(--text)",
                  fontSize: 11.5, fontFamily: "inherit", outline: "none",
                }}
              />
              {attendeeError && (
                <div style={{ fontSize: 10.5, color: "#ef4444" }}>{attendeeError}</div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={sendInvite}
                  disabled={!attendeeEmail.trim() || attendeeSending}
                  style={{
                    background: "var(--accent)", color: "#fff", border: "none",
                    borderRadius: 5, padding: "6px 14px", fontSize: 11, fontWeight: 600,
                    cursor: "pointer", opacity: attendeeSending ? 0.6 : 1,
                  }}
                >
                  {attendeeSending ? "sending…" : "send invite"}
                </button>
                <button
                  onClick={() => { setAddingAttendee(false); setAttendeeError(null); }}
                  style={{
                    background: "transparent", border: "1px solid var(--border-strong)",
                    borderRadius: 5, padding: "6px 10px", fontSize: 11,
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
            background: "transparent", border: "1px dashed var(--border-strong)",
            borderRadius: 6, padding: "6px 12px", cursor: "pointer",
            color: "var(--text-faint)", fontSize: 11, marginBottom: 8,
            display: "flex", alignItems: "center", gap: 5,
          }}
        >
          + add attendee
        </button>
      )}

      {/* Description */}
      {event.description && (
        <div style={{
          fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.65,
          background: "var(--panel-elev)", borderRadius: 6, padding: "8px 10px",
          marginBottom: 10, borderLeft: `2px solid ${cfg.color}40`,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {event.description}
        </div>
      )}

      {/* Source pill (non-gcal) */}
      {!isGcal && (
        <div style={{
          display: "inline-flex", padding: "2px 8px",
          border: "1px solid var(--border-strong)", borderRadius: 4,
          fontSize: 9.5, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          color: "var(--text-faint)", letterSpacing: "0.08em",
          textTransform: "uppercase", marginBottom: 12,
        }}>
          {event.source}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: cfg.color, color: "#fff",
              padding: "7px 14px", borderRadius: 6,
              fontSize: 11.5, fontWeight: 600, textDecoration: "none",
              letterSpacing: "0.01em",
            }}
          >
            {getOpenLabel()} →
          </a>
        )}
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "1px solid var(--border-strong)",
            borderRadius: 6, padding: "7px 14px",
            color: "var(--text-faint)", fontSize: 11.5, cursor: "pointer",
          }}
        >
          dismiss
        </button>
      </div>
    </div>
  );
}

const detailLabel: React.CSSProperties = {
  fontSize:      9.5,
  fontWeight:    700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color:         "var(--text-faint)",
  fontFamily:    "var(--font-jetbrains, 'JetBrains Mono', monospace)",
};

// ── Shared style objects ───────────────────────────────────────────────────────

const miniNavBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 4,
  width: 20,
  height: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "var(--text-dim)",
  fontSize: 12,
  padding: 0,
  lineHeight: 1,
};

const toolbarBtn: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
  color: "var(--text-dim)",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.01em",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--text-faint)",
  fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
};
