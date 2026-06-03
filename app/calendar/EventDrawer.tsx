'use client';

import { useEffect } from 'react';
import { X, MapPin, Clock, Users, ExternalLink } from 'lucide-react';
import { CalEvent, eventTitle, eventStartISO, formatTime, durationMins } from './EventChip';

interface EventDrawerProps {
  event: CalEvent | null;
  onClose: () => void;
}

function formatFullDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatFullTime(iso: string): string {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'all day';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function EventDrawer({ event, onClose }: EventDrawerProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (event) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [event, onClose]);

  const open = !!event;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(26,23,19,0.30)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: 'min(320px, 100vw)',
          background: 'var(--glass-bg)',
          borderLeft: '1px solid var(--glass-border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.32,0.72,0,1)',
          boxShadow: 'var(--glass-shadow-tier3)',
        }}
      >
        {event && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between p-5 pb-4 border-b border-[var(--glass-border)]">
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">
                  {event.source ?? 'calendar'}
                </p>
                <h2 className="text-sm font-semibold text-[var(--text-active)] leading-snug">
                  {eventTitle(event)}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
              >
                <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Date + Time */}
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-[var(--text-active)]">
                    {formatFullDate(eventStartISO(event))}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                    {formatFullTime(eventStartISO(event))}
                    {event.end && !event.all_day && (
                      <> → {formatFullTime(event.end)}</>
                    )}
                    {(() => {
                      const m = durationMins(eventStartISO(event), event.end);
                      if (!m) return null;
                      const h = Math.floor(m / 60);
                      const min = m % 60;
                      const label = h > 0 ? `${h}h${min > 0 ? ` ${min}m` : ''}` : `${min}m`;
                      return <span className="ml-2 opacity-50">({label})</span>;
                    })()}
                  </p>
                </div>
              </div>

              {/* Location */}
              {event.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--text-active)]">{event.location}</p>
                </div>
              )}

              {/* Attendees */}
              {event.attendees && event.attendees.length > 0 && (
                <div className="flex items-start gap-3">
                  <Users className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {event.attendees.slice(0, 8).map((a, i) => (
                      <p key={i} className="text-xs text-[var(--text-muted)]">
                        {a.name ?? a.email}
                        {a.response_status && a.response_status !== 'needsAction' && (
                          <span
                            className="ml-1.5 text-[9px] opacity-60"
                            style={{ fontFamily: 'var(--font-geist-mono)' }}
                          >
                            {a.response_status === 'accepted' ? '✓' : a.response_status === 'declined' ? '✗' : '?'}
                          </span>
                        )}
                      </p>
                    ))}
                    {event.attendees.length > 8 && (
                      <p className="text-[10px] text-[var(--text-muted)] opacity-60">
                        +{event.attendees.length - 8} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {event.description && (
                <div
                  className="rounded-lg p-3 text-xs text-[var(--text-muted)] leading-relaxed"
                  style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                >
                  {event.description}
                </div>
              )}

              {/* Account email */}
              {event.account_email && (
                <p className="text-[10px] text-[var(--text-muted)] opacity-50">
                  via {event.account_email}
                </p>
              )}
            </div>

            {/* Footer — open in Google Calendar */}
            {event.html_link && (
              <div className="p-4 border-t border-[var(--glass-border)]">
                <a
                  href={event.html_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  open in google calendar
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
