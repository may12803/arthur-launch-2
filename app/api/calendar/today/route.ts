// /api/calendar/today — today's events. Calls calendar libraries directly
// instead of HTTP-subrequesting /api/calendar/events (Fly networking blocks
// in-instance loopback fetch).
import { NextRequest, NextResponse } from 'next/server';
import { authGate } from '@/lib/_auth';
import { listAllCalendarEvents } from '@/lib/google/calendar';
import { listIcloudEvents } from '@/lib/icloud/calendar';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const events: any[] = [];
  const errors: Record<string, string> = {};

  // Pull Google + iCloud in parallel
  const [g, i] = await Promise.allSettled([
    listAllCalendarEvents(start.toISOString(), end.toISOString()),
    listIcloudEvents(start.toISOString(), end.toISOString()),
  ]);

  if (g.status === 'fulfilled' && Array.isArray(g.value)) events.push(...g.value);
  else if (g.status === 'rejected') errors.google = 'Failed to fetch';

  if (i.status === 'fulfilled' && Array.isArray(i.value)) events.push(...i.value);
  else if (i.status === 'rejected') errors.icloud = 'Failed to fetch';

  return NextResponse.json({
    events,
    count: events.length,
    date: start.toISOString().slice(0, 10),
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  });
}
