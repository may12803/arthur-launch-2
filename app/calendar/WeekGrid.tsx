'use client';

import { cn } from '@/lib/utils';
import { CalEvent, EventChip, eventStartISO } from './EventChip';

interface WeekGridProps {
  events: CalEvent[];
  weekStart: Date; // Sunday of the current week
  onEventClick: (event: CalEvent) => void;
  loading?: boolean;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function eventsForDay(events: CalEvent[], day: Date): CalEvent[] {
  return events.filter(ev => {
    const iso = eventStartISO(ev);
    if (!iso) return false;
    // All-day events: ISO is YYYY-MM-DD
    const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const d = isAllDay
      ? new Date(iso + 'T00:00:00') // parse as local
      : new Date(iso);
    return isSameDay(d, day);
  }).sort((a, b) => {
    const aISO = eventStartISO(a);
    const bISO = eventStartISO(b);
    return aISO < bISO ? -1 : aISO > bISO ? 1 : 0;
  });
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SkeletonChip() {
  return (
    <div
      className="w-full h-10 rounded-lg animate-pulse"
      style={{ background: 'var(--glass-bg-faint)', border: '1px solid var(--glass-border)' }}
    />
  );
}

export function WeekGrid({ events, weekStart, onEventClick, loading = false }: WeekGridProps) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <div className="grid grid-cols-7 gap-2 min-h-0">
      {days.map((day, idx) => {
        const isToday = isSameDay(day, today);
        const dayEvents = loading ? [] : eventsForDay(events, day);
        const dayName = DAY_NAMES[idx];
        const dateNum = day.getDate();

        return (
          <div
            key={idx}
            className={cn(
              'flex flex-col rounded-xl border transition-colors min-h-[180px]',
              'bg-[var(--glass-bg)] border-[var(--glass-border)]',
              isToday && 'border-l-2 border-l-[var(--accent-orange)]'
            )}
          >
            {/* Day header */}
            <div
              className={cn(
                'px-2.5 pt-2.5 pb-1.5 border-b border-[var(--glass-border)] flex items-baseline gap-1.5',
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-medium uppercase tracking-wider',
                  isToday ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'
                )}
              >
                {dayName}
              </span>
              <span
                className={cn(
                  'text-sm font-semibold',
                  isToday ? 'text-[var(--accent-orange)]' : 'text-[var(--text-active)]'
                )}
              >
                {dateNum}
              </span>
            </div>

            {/* Events */}
            <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
              {loading ? (
                <>
                  <SkeletonChip />
                  <SkeletonChip />
                  <SkeletonChip />
                </>
              ) : dayEvents.length === 0 ? (
                <p
                  className="text-center text-[var(--text-muted)] mt-4"
                  style={{ fontSize: '11px', opacity: 0.4 }}
                >
                  —
                </p>
              ) : (
                dayEvents.map(ev => (
                  <EventChip key={ev.id} event={ev} onClick={onEventClick} compact />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
