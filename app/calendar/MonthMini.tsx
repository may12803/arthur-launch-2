'use client';

import { cn } from '@/lib/utils';
import { CalEvent, eventStartISO } from './EventChip';

interface MonthMiniProps {
  events: CalEvent[];
  year: number;
  month: number; // 0-indexed
  onDayClick?: (date: Date) => void;
}

function getEventDensity(events: CalEvent[], day: Date): number {
  const count = events.filter(ev => {
    const iso = eventStartISO(ev);
    if (!iso) return false;
    const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const d = isAllDay ? new Date(iso + 'T00:00:00') : new Date(iso);
    return (
      d.getFullYear() === day.getFullYear() &&
      d.getMonth() === day.getMonth() &&
      d.getDate() === day.getDate()
    );
  }).length;
  return count;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MonthMini({ events, year, month, onDayClick }: MonthMiniProps) {
  const today = new Date();

  // First day of month
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun

  // Days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build grid cells (leading empties + days)
  const cells: Array<Date | null> = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  // Pad trailing to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
        {monthName}
      </p>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] text-[var(--text-muted)] pb-1 opacity-50"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;

          const density = getEventDensity(events, day);
          const isToday = isSameDay(day, today);

          return (
            <button
              key={idx}
              onClick={() => onDayClick?.(day)}
              className={cn(
                'flex flex-col items-center justify-center py-1 rounded-lg transition-all duration-150',
                'hover:bg-[var(--glass-bg-tier2)]',
                isToday && 'bg-[var(--accent-orange-soft)]'
              )}
            >
              <span
                className={cn(
                  'text-xs font-medium',
                  isToday ? 'text-[var(--accent-orange)]' : 'text-[var(--text-active)]'
                )}
              >
                {day.getDate()}
              </span>
              {/* Density dots */}
              <div className="flex gap-0.5 mt-0.5 h-1.5">
                {density > 0 && Array.from({ length: Math.min(density, 3) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ background: isToday ? 'var(--accent-orange)' : 'var(--text-muted)', opacity: 0.6 }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
