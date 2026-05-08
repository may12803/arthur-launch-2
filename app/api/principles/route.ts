// /api/principles — returns Daniel's curated principles list. Used by
// brain-bridge.ts so the CLI's systemForTurn can include "what Daniel believes."
//
// Source order: Supabase `arthur_principles` table (if exists) → fallback
// to /api/state's principles field (already wired) → empty list.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { authGate } from '@/lib/_auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  // Try Supabase first
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('arthur_principles')
      .select('id, title, body, weight, updated_at')
      .order('weight', { ascending: false })
      .limit(limit);
    if (!error && Array.isArray(data) && data.length > 0) {
      return NextResponse.json({
        principles: data,
        count: data.length,
        source: 'supabase',
      });
    }
  } catch { /* table may not exist yet */ }

  // Fallback: pull from /api/state if it includes principles
  try {
    const baseUrl = req.nextUrl.origin;
    const r = await fetch(`${baseUrl}/api/state`, {
      headers: { authorization: req.headers.get('authorization') || '' },
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const state = await r.json();
      const principles = Array.isArray(state.principles)
        ? state.principles.slice(0, limit)
        : (state.principles ? Object.values(state.principles).slice(0, limit) : []);
      return NextResponse.json({
        principles,
        count: principles.length,
        source: 'state-fallback',
      });
    }
  } catch { /* fall through */ }

  return NextResponse.json({
    principles: [],
    count: 0,
    source: 'empty',
    note: 'Create arthur_principles table in Supabase or add principles to /api/state to populate.',
  });
}
