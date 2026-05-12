'use client';

import { cn } from '@/lib/utils';

export interface CalEvent {
  id: string;
  type?: string;
  title?: string;
  start: string;
  end?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  source?: string;
  account_email?: string;
  organizer?: { email: string; name?: string } | null;
  attendees?: Array<{ email: string; name?: string; response_status?: string }>;
  html_link?: string | null;
}

export function eventTitle(e: CalEvent): string {
  return (e.title ?? '(untitled)').trim() || '(untitled)';
}

export function eventStartISO(e: CalEvent): string {
  return typeof e.start === 'string' ? e.start : '';
}

export function formatTime(iso: string): string {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'all day';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase().replace(' ', '');
}

export function durationMins(start: string, end: string | null | undefined): number | null {
  if (!end || /^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function SourceIcon({ source }: { source?: string }) {
  if (source === 'google') {
    return (
      <span
        title="Google Calendar"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0"
        style={{ background: 'rgba(66,133,244,0.25)', color: '#4285f4' }}
      >
        G
      </span>
    );
  }
  if (source === 'icloud') {
    return (
      <span
        title="iCloud Calendar"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.12)', color: '#f5f6f8' }}
      >
        ⬡
      </span>
    );
  }
  if (source === 'yahoo') {
    return (
      <span
        title="Email extraction"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0"
        style={{ background: 'rgba(212,255,61,0.18)', color: '#d4ff3d' }}
      >
        @
      </span>
    );
  }
  if (source === 'arthur') {
    return (
      <span
        title="Arthur"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0"
        style={{ background: 'rgba(212,255,61,0.18)', color: '#d4ff3d' }}
      >
        A
      </span>
    );
  }
  return null;
}

interface EventChipProps {
  event: CalEvent;
  onClick: (event: CalEvent) => void;
  compact?: boolean;
}

export function EventChip({ event, onClick, compact = false }: EventChipProps) {
  const startISO = eventStartISO(event);
  const timeStr = formatTime(startISO);
  const durMins = durationMins(startISO, event.end);
  const title = eventTitle(event);

  return (
    <button
      onClick={() => onClick(event)}
      className={cn(
        'w-full text-left rounded-lg border transition-all duration-150 group',
        'bg-[var(--glass-bg-tier2)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-tier3)] hover:border-[var(--glass-border-tier2)]',
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      )}
    >
      <div className="flex items-start gap-2">
        <SourceIcon source={event.source} />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'font-medium leading-snug truncate text-[var(--text-active)]',
              compact ? 'text-[11px]' : 'text-xs'
            )}
          >
            {title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] text-[var(--text-muted)] flex-shrink-0"
              style={{ fontFamily: 'var(--font-geist-mono)' }}
            >
              {timeStr}
            </span>
            {durMins && (
              <span
                className="text-[9px] px-1 py-0.5 rounded"
                style={{
                  fontFamily: 'var(--font-geist-mono)',
                  background: 'var(--glass-bg)',
                  color: 'var(--text-muted)',
                }}
              >
                {formatDuration(durMins)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
