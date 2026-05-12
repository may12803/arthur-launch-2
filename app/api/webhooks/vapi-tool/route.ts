// Vapi function-call webhook. Vapi POSTs tool-calls here during a voice
// conversation; we execute the tool and return a stringified result that
// the LLM uses to continue speaking.
//
// Auth: Vapi sets `x-vapi-secret` header (configured via serverUrlSecret on
// the assistant). We compare to ARTHUR_SECRET.
//
// Tool catalog kept small and voice-friendly — every result is ≤300 chars
// of natural language since the LLM will speak it.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { listAllCalendarEvents } from '@/lib/google/calendar';
import { listIcloudEvents } from '@/lib/icloud/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ToolCall = {
  id: string;
  type?: 'function';
  function?: { name: string; arguments?: string };
};

type VapiMessage = {
  type?: string;
  toolCalls?: ToolCall[];
  toolCallList?: ToolCall[];
  functionCall?: { name: string; parameters?: any };
};

function pickToolCalls(body: any): ToolCall[] {
  const msg: VapiMessage = body?.message ?? body ?? {};
  if (Array.isArray(msg.toolCalls)) return msg.toolCalls;
  if (Array.isArray(msg.toolCallList)) return msg.toolCallList;
  if (msg.functionCall) {
    return [{
      id: 'legacy',
      type: 'function',
      function: { name: msg.functionCall.name, arguments: JSON.stringify(msg.functionCall.parameters ?? {}) }
    }];
  }
  return [];
}

function parseArgs(c: ToolCall): Record<string, any> {
  try { return JSON.parse(c.function?.arguments ?? '{}'); } catch { return {}; }
}

// ── tool implementations ──────────────────────────────────────────────────

async function getCurrentDatetime(): Promise<string> {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Detroit',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
  return `It's ${fmt.format(now)} in Kalamazoo.`;
}

async function queryInboxSummary(args: { folder?: string }): Promise<string> {
  const db = getSupabaseAdmin();
  const folder = args.folder || 'inbox';

  const [{ count: unread }, { count: needsAttention }, { data: recent }] = await Promise.all([
    db.from('arthur_inbox_emails').select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound').eq('is_archived', false).eq('is_deleted', false).eq('is_read', false),
    db.from('arthur_inbox_emails').select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound').eq('is_archived', false).eq('is_deleted', false).eq('requires_review', true),
    db.from('arthur_inbox_emails').select('subject, from_email, from_name, received_at')
      .eq('direction', 'inbound').eq('is_archived', false).eq('is_deleted', false)
      .order('received_at', { ascending: false }).limit(3)
  ]);

  const topLine = `${unread ?? 0} unread, ${needsAttention ?? 0} need review.`;
  const recents = (recent || [])
    .map(r => `${r.from_name || r.from_email}: ${(r.subject || '(no subject)').slice(0, 60)}`)
    .join('; ');
  return recents ? `${topLine} Latest: ${recents}` : topLine;
}

async function queryCalendarToday(): Promise<string> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const [g, i] = await Promise.allSettled([
    listAllCalendarEvents(start, end),
    listIcloudEvents(start, end),
  ]);
  const events: any[] = [];
  if (g.status === 'fulfilled' && Array.isArray(g.value)) events.push(...g.value);
  if (i.status === 'fulfilled' && Array.isArray(i.value)) events.push(...i.value);

  if (events.length === 0) return 'Nothing on the calendar today.';

  const summary = events.slice(0, 5).map((e: any) => {
    const startISO = e.start?.dateTime || e.start?.date || e.start || '';
    const time = startISO ? new Date(startISO).toLocaleTimeString('en-US', { timeZone: 'America/Detroit', hour: 'numeric', minute: '2-digit' }) : 'all day';
    return `${time}: ${e.summary || e.title || '(untitled)'}`;
  }).join('; ');
  return `${events.length} on today. ${summary}`;
}

async function queryRecentActions(args: { hours?: number }): Promise<string> {
  const db = getSupabaseAdmin();
  const hours = Math.min(args.hours || 24, 168);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const { data } = await db.from('action_log')
    .select('action_type, summary, created_at, status')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return `No logged actions in the last ${hours} hours.`;
  const summary = data.map(a => `${a.action_type}: ${(a.summary || '').slice(0, 80)}`).join('; ');
  return `Last ${data.length} actions: ${summary}`;
}

async function queryFlowMetrics(): Promise<string> {
  const db = getSupabaseAdmin();
  // Recent build pipeline runs as a stand-in for "is Arthur healthy"
  const { data } = await db.from('arthur_build_runs')
    .select('status, project_slug, created_at')
    .order('created_at', { ascending: false })
    .limit(3);
  if (!data || data.length === 0) return 'No recent build pipeline activity.';
  const summary = data.map(r => `${r.project_slug} ${r.status}`).join('; ');
  return `Recent builds: ${summary}`;
}

async function dispatchToTui(args: { command?: string; context?: string }): Promise<string> {
  const command = (args.command || '').trim();
  if (!command) return 'No command provided.';
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('arthur_voice_commands')
    .insert({ command, context: args.context || null, source: 'vapi' })
    .select('id')
    .single();
  if (error) return `Could not queue command: ${error.message}`;
  return `Queued for the TUI. Daniel will see it in his local Arthur terminal in a few seconds. ID ${data.id.slice(0,8)}.`;
}

const TOOLS: Record<string, (args: any) => Promise<string>> = {
  get_current_datetime: getCurrentDatetime,
  query_inbox_summary: queryInboxSummary,
  query_calendar_today: queryCalendarToday,
  query_recent_actions: queryRecentActions,
  query_flow_metrics: queryFlowMetrics,
  dispatch_to_tui: dispatchToTui,
};

// ── webhook ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-vapi-secret') || '';
  if (secret !== process.env.ARTHUR_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const calls = pickToolCalls(body);
  if (calls.length === 0) return NextResponse.json({ error: 'no tool calls in body' }, { status: 400 });

  const results = await Promise.all(calls.map(async (c) => {
    const name = c.function?.name || '';
    const args = parseArgs(c);
    const impl = TOOLS[name];
    let result: string;
    if (!impl) {
      result = `Unknown tool "${name}". Available: ${Object.keys(TOOLS).join(', ')}.`;
    } else {
      try { result = await impl(args); }
      catch (e: any) { result = `Tool "${name}" errored: ${e?.message || String(e)}`; }
    }
    return { toolCallId: c.id, result };
  }));

  return NextResponse.json({ results });
}

export async function GET() {
  return NextResponse.json({ ok: true, tools: Object.keys(TOOLS) });
}
