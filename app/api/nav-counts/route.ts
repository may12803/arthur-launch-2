// /api/nav-counts — live sidebar badge counts. Each count mirrors the same
// source the corresponding page uses, so the badges never disagree with the
// page they link to. Queries Supabase / calendar libs directly (Fly networking
// blocks in-instance HTTP loopback to sibling routes).
import { NextRequest, NextResponse } from 'next/server';
import { authGate } from '@/lib/_auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { listAllCalendarEvents } from '@/lib/google/calendar';
import { listIcloudEvents } from '@/lib/icloud/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server runs UTC on Fly; the calendar day must be Detroit-local or "today"
// drifts. Build the [00:00, 23:59:59.999] America/Detroit window in UTC.
function detroitDayWindow(): { start: string; end: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  // Derive the Detroit UTC offset at this instant from the formatted tz name.
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Detroit', timeZoneName: 'shortOffset',
  }).formatToParts(now).find(p => p.type === 'timeZoneName')!.value; // e.g. "GMT-4"
  const match = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  const offH = match ? parseInt(match[1], 10) : -5;
  const offM = match && match[2] ? parseInt(match[2], 10) : 0;
  const sign = offH < 0 ? -1 : 1;
  const offsetMs = (Math.abs(offH) * 60 + offM) * 60_000 * sign;
  const startUtcMs = Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0) - offsetMs;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000 - 1;
  return { start: new Date(startUtcMs).toISOString(), end: new Date(endUtcMs).toISOString() };
}

async function inboxUnread(db: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  // Same source as /api/inbox/summary: inbound, not archived, not deleted, unread.
  const { count, error } = await db
    .from('arthur_inbox_emails')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'inbound')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .eq('is_read', false);
  if (error) throw error;
  return count || 0;
}

async function tasksOpen(db: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  // Open goal-steps = not done, not skipped (matches /tasks + /api/goal-steps).
  const { count, error } = await db
    .from('arthur_goal_steps')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '(done,skipped)');
  if (error) throw error;
  return count || 0;
}

async function goalsActive(db: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  // Active = not archived (matches /goals page active count).
  const { count, error } = await db
    .from('arthur_goals')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'archived');
  if (error) throw error;
  return count || 0;
}

async function calendarToday(): Promise<number> {
  const { start, end } = detroitDayWindow();
  const [g, i] = await Promise.allSettled([
    listAllCalendarEvents(start, end),
    listIcloudEvents(start, end),
  ]);
  let n = 0;
  if (g.status === 'fulfilled' && Array.isArray(g.value)) n += g.value.length;
  if (i.status === 'fulfilled' && Array.isArray(i.value)) n += i.value.length;
  return n;
}

async function employeesRegistered(): Promise<number> {
  // Registered agent count = roster size (same baked roster /employees uses).
  try {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.join(process.cwd(), 'public', 'employees.json');
    const roster = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown[]>;
    return Object.values(roster).reduce(
      (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
      0
    );
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();

  const [inbox, tasks, calendar, goals, employees] = await Promise.all([
    inboxUnread(db).catch(() => 0),
    tasksOpen(db).catch(() => 0),
    calendarToday().catch(() => 0),
    goalsActive(db).catch(() => 0),
    employeesRegistered().catch(() => 0),
  ]);

  return NextResponse.json({ inbox, tasks, calendar, goals, employees });
}
