// POST /api/cli-event — receives fire-and-forget events from arthur-tui (brain-bridge.ts).
// Sprint 2: MVP logs to console + Supabase arthur_cli_events (creates table on first insert).

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function authOk(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const secret = process.env.ARTHUR_SECRET || process.env.AUTOMATION_SECRET || '';
  return !!secret && token === secret;
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  // Always log — useful even before Supabase table exists
  console.log('[cli-event]', JSON.stringify(body));

  // Best-effort Supabase insert — never fail the caller
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (url && key) {
      const sb = createClient(url, key);
      await sb.from('arthur_cli_events').insert({
        event_type:  body.type ?? 'tui_turn',
        ts:          body.ts ?? new Date().toISOString(),
        prompt:      (body.prompt as string)?.slice(0, 200) ?? '',
        response:    (body.response as string)?.slice(0, 500) ?? '',
        tier:        body.tier ?? '',
        model:       body.model ?? '',
        source:      body.source ?? '',
        cost_usd:    body.cost_usd ?? 0,
        latency_ms:  body.latency_ms ?? 0,
        tool_calls:  body.tool_calls ?? [],
        session_id:  body.session_id ?? '',
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[cli-event] supabase insert failed (table may not exist yet):', msg);
  }

  return NextResponse.json({ ok: true });
}
