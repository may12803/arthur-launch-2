'use client';

import { CalEvent, EventChip, eventStartISO } from './EventChip';

interface DayViewProps {
  events: CalEvent[];
  date: Date;
  onEventClick: (event: CalEvent) => void;
  loading?: boolean;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function SkeletonChip() {
  return (
    <div
      className="w-full h-14 rounded-xl animate-pulse"
      style={{ background: 'var(--glass-bg-faint)', border: '1px solid var(--glass-border)' }}
    />
  );
}

export function DayView({ events, date, onEventClick, loading = false }: DayViewProps) {
  const dayEvents = events
    .filter(ev => {
      const iso = eventStartISO(ev);
      if (!iso) return false;
      const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(iso);
      const d = isAllDay ? new Date(iso + 'T00:00:00') : new Date(iso);
      return isSameDay(d, date);
    })
    .sort((a, b) => {
      const aISO = eventStartISO(a);
      const bISO = eventStartISO(b);
      return aISO < bISO ? -1 : aISO > bISO ? 1 : 0;
    });

  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-xl mx-auto">
      <p
        className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4"
      >
        {dateLabel}
      </p>

      <div className="space-y-3">
        {loading ? (
          <>
            <SkeletonChip />
            <SkeletonChip />
            <SkeletonChip />
          </>
        ) : dayEvents.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-xl border"
            style={{ background: 'var(--glass-bg-faint)', borderColor: 'var(--glass-border)' }}
          >
            <span className="text-3xl mb-3 opacity-30">◯</span>
            <p className="text-sm font-medium text-[var(--text-active)] opacity-60">clear day, daniel.</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-40">nothing on the books</p>
          </div>
        ) : (
          dayEvents.map(ev => (
            <EventChip key={ev.id} event={ev} onClick={onEventClick} />
          ))
        )}
      </div>
    </div>
  );
}
