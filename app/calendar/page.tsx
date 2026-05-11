'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface CalEvent {
  id: string;
  type: string;
  title: string;
  start: string;
  end: string | null;
  all_day: boolean;
  location?: string | null;
  description?: string | null;
  source: string;
  account_email?: string;
}

// Main Component
export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('arthur_calendar_events')
        .select('*')
        .order('start', { ascending: true })
        .limit(100);

      if (error) throw error;
      setEvents(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (loading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center text-red-500">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Calendar</h1>
      <div className="space-y-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

// Event Card Component
function EventCard({ event }: { event: CalEvent }) {
  const startTime = new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = event.end ? new Date(event.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="bg-glass-bg border border-glass-border rounded-lg p-4">
      <h2 className="font-semibold text-lg text-text-active">{event.title}</h2>
      <p className="text-sm text-text-muted">
        {startTime} {endTime && `- ${endTime}`}
      </p>
      {event.location && <p className="text-sm text-text-muted">{event.location}</p>}
      {event.description && <p className="text-sm mt-2">{event.description}</p>}
    </div>
  );
}
