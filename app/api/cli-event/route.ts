// /api/cli-event — receives event records from Arthur CLI's recordCliEvent().
// CLI POSTs every turn here (prompt, response, tier, model, cost, latency,
// tool_calls). Dashboard can later show a live "CLI activity" feed.
//
// Auth: Bearer token must match ARTHUR_SECRET (or AUTOMATION_SECRET fallback).
// Storage: best-effort insert into Supabase arthur_cli_events; failures
// degrade to console log so we don't lose events when the table doesn't exist.

import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

function authOk(req: Request): boolean {
  const expected = process.env.ARTHUR_SECRET || process.env.AUTOMATION_SECRET || '';
  if (!expected) return true; // no secret configured = local dev
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice('Bearer '.length).trim() : '';
  return token === expected;
}

export async function POST(req: Request) {
  if (!authOk(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const row = {
    event_type: String(body.type || 'tui_turn'),
    ts: body.ts || new Date().toISOString(),
    prompt_preview: String(body.prompt || '').slice(0, 500),
    response_preview: String(body.response || '').slice(0, 1000),
    tier: body.tier || null,
    model: body.model || null,
    source: body.source || null,
    cost_usd: typeof body.cost_usd === 'number' ? body.cost_usd : null,
    latency_ms: typeof body.latency_ms === 'number' ? body.latency_ms : null,
    tool_calls: Array.isArray(body.tool_calls) ? body.tool_calls : null,
    session_id: body.session_id || null,
  };

  // Best-effort Supabase insert — degrade to console log on failure.
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
      const { error } = await sb.from('arthur_cli_events').insert(row);
      if (error) {
        console.warn('[cli-event] supabase insert failed:', error.message, '— logging to console as fallback');
        console.log('[cli-event-fallback]', JSON.stringify(row));
      }
    } catch (e: any) {
      console.warn('[cli-event] supabase exception:', e.message);
      console.log('[cli-event-fallback]', JSON.stringify(row));
    }
  } else {
    console.log('[cli-event]', JSON.stringify(row));
  }

  return new Response(JSON.stringify({ ok: true, ts: row.ts }), { status: 200, headers: { 'content-type': 'application/json' } });
}

// Quick health probe so smoke tests can verify the route is alive without
// posting a body.
export async function GET() {
  return new Response(JSON.stringify({ ok: true, route: '/api/cli-event', accepts: 'POST' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
