'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalEvent } from './EventChip';
import { WeekGrid } from './WeekGrid';
import { DayView } from './DayView';
import { MonthMini } from './MonthMini';
import { EventDrawer } from './EventDrawer';

function getWeekStart(d: Date): Date {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoWeekKey(d: Date): string {
  const ws = getWeekStart(d);
  return `${ws.getFullYear()}-${ws.getMonth()}-${ws.getDate()}`;
}

function isoMonthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

type View = 'day' | 'week' | 'month';
type SourceFilter = 'google' | 'icloud';

const SOURCE_LABELS: Record<SourceFilter, string> = { google: 'Google', icloud: 'iCloud' };

function todayPill(): string {
  const d = new Date();
  return `Today, ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

export default function CalendarPage() {
  const today = new Date();

  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState<Date>(today);
  const [activeFilters, setActiveFilters] = useState<Set<SourceFilter>>(new Set(['google', 'icloud']));

  const [events, setEvents] = useState<CalEvent[]>([]);
  // Start loading=true so the grid renders immediately (not the empty state)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const cache = useRef<Map<string, CalEvent[]>>(new Map());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  const fetchEvents = useCallback(async (viewArg: View, cursorArg: Date, force = false) => {
    let start: Date;
    let end: Date;
    let cacheKey: string;

    if (viewArg === 'day') {
      const d = new Date(cursorArg);
      d.setHours(0, 0, 0, 0);
      start = d;
      end = addDays(d, 1);
      cacheKey = `day-${d.toISOString().slice(0, 10)}`;
    } else if (viewArg === 'week') {
      start = getWeekStart(cursorArg);
      end = addDays(start, 7);
      cacheKey = `week-${isoWeekKey(cursorArg)}`;
    } else {
      const first = new Date(cursorArg.getFullYear(), cursorArg.getMonth(), 1);
      start = addDays(first, -7);
      end = new Date(cursorArg.getFullYear(), cursorArg.getMonth() + 1, 7);
      cacheKey = `month-${isoMonthKey(cursorArg)}`;
    }

    if (!force && cache.current.has(cacheKey)) {
      setEvents(cache.current.get(cacheKey)!);
      setHasFetched(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      const res = await fetch(`/api/calendar/events?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Calendar API ${res.status}`);
      const json = await res.json() as CalEvent[] | { events?: CalEvent[] };
      const list: CalEvent[] = Array.isArray(json) ? json : (json.events ?? []);
      cache.current.set(cacheKey, list);
      setEvents(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    fetchEvents(view, cursor);
  }, [view, cursor, fetchEvents]);

  const filteredEvents = events.filter(ev => {
    if (!ev.source) return true;
    if (ev.source === 'google' && !activeFilters.has('google')) return false;
    if (ev.source === 'icloud' && !activeFilters.has('icloud')) return false;
    return true;
  });

  function navigate(dir: -1 | 1) {
    setCursor(prev => {
      if (view === 'day') return addDays(prev, dir);
      if (view === 'week') return addDays(prev, dir * 7);
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  }

  function goToday() { setCursor(today); }

  function toggleFilter(f: SourceFilter) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(f)) {
        if (next.size > 1) next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  }

  function periodLabel(): string {
    if (view === 'day') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'week') {
      const ws = getWeekStart(cursor);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth()) return ws.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const m1 = ws.toLocaleDateString('en-US', { month: 'short' });
      const m2 = we.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return `${m1} – ${m2}`;
    }
    return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // Only show "truly empty" state after a fetch has completed with 0 events
  const noData = hasFetched && !loading && filteredEvents.length === 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header strip */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="truncate" style={{ fontFamily: 'var(--font-lora, Lora, Georgia, serif)', fontSize: 18, fontWeight: 500, color: 'var(--text-active)', letterSpacing: '-0.02em', margin: 0 }}>
            {periodLabel()}
          </h1>
          <button onClick={goToday} className="hidden sm:flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex-shrink-0" style={{ background: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange)' }}>
            {todayPill()}
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(['google', 'icloud'] as SourceFilter[]).map(f => (
            <button key={f} onClick={() => toggleFilter(f)} className={cn('px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-150 border')} aria-label={`${activeFilters.has(f) ? 'Hide' : 'Show'} ${SOURCE_LABELS[f]} events`} aria-pressed={activeFilters.has(f)}
              style={activeFilters.has(f)
                ? { background: 'var(--glass-bg-tier2)', borderColor: 'var(--accent-orange)', color: 'var(--text-active)' }
                : { background: 'transparent', borderColor: 'var(--glass-border)', color: 'var(--text-muted)', opacity: 0.5 }
              }>
              {SOURCE_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => navigate(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--glass-bg-tier2)]" style={{ border: '1px solid var(--glass-border)' }} aria-label="Previous">
            <ChevronLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
          <button onClick={() => navigate(1)} className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--glass-bg-tier2)]" style={{ border: '1px solid var(--glass-border)' }} aria-label="Next">
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--glass-border)', background: 'var(--glass-bg)' }}>
          {(['Day', 'Week', 'Month'] as const).map(v => {
            const vLower = v.toLowerCase() as View;
            const isActive = view === vLower;
            return (
              <button key={v} onClick={() => setView(vLower)} aria-label={`${v} view`} aria-pressed={isActive}
                className={cn('px-3 py-1.5 text-[10px] font-medium transition-all duration-150', isActive ? 'text-[var(--accent-text-on)]' : 'text-[var(--text-muted)] hover:text-[var(--text-active)]')}
                style={isActive ? { background: 'var(--accent-orange)' } : {}}>
                {v}
              </button>
            );
          })}
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-150 flex-shrink-0" style={{ background: 'var(--glass-bg-tier2)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }} title="create event (coming soon)" aria-label="Create event (coming soon)">
          <Plus className="w-3 h-3" />
          <span className="hidden sm:inline">event</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-2.5" style={{ background: 'rgba(220,38,38,0.06)', borderBottom: '1px solid rgba(220,38,38,0.15)' }}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#DC2626' }} />
            <span className="text-xs" style={{ color: '#DC2626' }}>{error}</span>
          </div>
          <button onClick={() => fetchEvents(view, cursor, true)} className="flex items-center gap-1 text-[10px] hover:opacity-80 transition-opacity flex-shrink-0" style={{ color: '#DC2626' }}>
            <RefreshCw className="w-3 h-3" />
            retry
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-5 py-4">

        {/* Genuine empty state — only after fetch resolves empty and not month view */}
        {noData && !error && view !== 'month' && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <span className="text-2xl opacity-40">◻</span>
            </div>
            <p className="text-sm font-medium text-[var(--text-active)] opacity-70">
              {view === 'day' ? 'clear day, daniel.' : 'clear week, daniel.'}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-40 text-center max-w-xs">
              nothing scheduled — either genuinely empty or google auth needs reconnecting.
            </p>
          </div>
        )}

        {view === 'week' && (loading || !noData) && (
          <WeekGrid events={filteredEvents} weekStart={getWeekStart(cursor)} onEventClick={setSelectedEvent} loading={loading} />
        )}

        {view === 'day' && (loading || !noData) && (
          <DayView events={filteredEvents} date={cursor} onEventClick={setSelectedEvent} loading={loading} />
        )}

        {view === 'month' && (
          <div className="max-w-sm mx-auto">
            <MonthMini events={filteredEvents} year={cursor.getFullYear()} month={cursor.getMonth()} onDayClick={d => { setCursor(d); setView('day'); }} />
            {noData && !loading && !error && (
              <p className="text-center text-xs text-[var(--text-muted)] mt-6 opacity-40">clear month, daniel.</p>
            )}
          </div>
        )}
      </div>

      {/* Mobile date scrubber */}
      <div className="sm:hidden flex-shrink-0 overflow-x-auto flex gap-2 px-4 py-2 border-t" style={{ borderColor: 'var(--glass-border)' }}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(today, i - 3);
          const isSelected = view === 'day' && d.toDateString() === cursor.toDateString();
          const isToday = d.toDateString() === today.toDateString();
          return (
            <button key={i} onClick={() => { setCursor(d); setView('day'); }} aria-label={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed={isSelected}
              className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-full transition-all"
              style={isSelected
                ? { background: 'var(--accent-orange)', color: 'var(--accent-text-on)' }
                : isToday
                  ? { background: 'var(--accent-orange-soft)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange)' }
                  : { background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }
              }>
              <span className="text-[9px] uppercase tracking-wide">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className="text-xs font-semibold">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
