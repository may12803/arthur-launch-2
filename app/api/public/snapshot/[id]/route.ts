import { NextRequest, NextResponse } from 'next/server';
import { ApiError, rerun, viewRun } from '@/lib/snapshot/service';
import { readLimiter, runLimiter, withRunSlot } from '@/lib/snapshot/limits';
import { checkId, corsHeaders, deps, failure, limited, preflight } from '@/lib/snapshot/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET: the snapshot (mapping to confirm while status is "mapping", the result when "done").
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    checkId(id);
    const blocked = await limited(req, readLimiter);
    if (blocked) return blocked;
    return NextResponse.json(await viewRun(deps(), id), { headers: corsHeaders(req) });
  } catch (e) {
    return failure(req, e);
  }
}

// POST {"mapping": {"item": "Item #", "price": "Unit Price", ...}}: run (or re-run) the checks with the confirmed mapping.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    checkId(id);
    const blocked = await limited(req, runLimiter);
    if (blocked) return blocked;
    const text = await req.text();
    if (text.length > 20_000) throw new ApiError(413, 'Mapping is too large.', 'too_large');
    let body: { mapping?: unknown };
    try { body = JSON.parse(text || '{}'); } catch { throw new ApiError(400, 'Body must be JSON.', 'bad_request'); }
    const out = await withRunSlot(() => rerun(deps(), id, body.mapping));
    if (out === 'busy') throw new ApiError(503, 'We are busy right now. Try again in a minute.', 'busy');
    return NextResponse.json(out, { headers: corsHeaders(req) });
  } catch (e) {
    return failure(req, e);
  }
}

export const OPTIONS = preflight;
