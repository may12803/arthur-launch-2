import { NextRequest, NextResponse } from 'next/server';
import { rowsPage } from '@/lib/snapshot/service';
import { readLimiter } from '@/lib/snapshot/limits';
import { checkId, corsHeaders, deps, failure, limited, preflight } from '@/lib/snapshot/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?rule=below_cost&offset=0&limit=100: the flagged rows behind one finding.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    checkId(id);
    const blocked = limited(req, readLimiter);
    if (blocked) return blocked;
    const q = req.nextUrl.searchParams;
    const out = await rowsPage(deps(), id, q.get('rule') ?? '', Number(q.get('offset') ?? 0), Number(q.get('limit') ?? 100));
    return NextResponse.json(out, { headers: corsHeaders(req) });
  } catch (e) {
    return failure(req, e);
  }
}

export const OPTIONS = preflight;
