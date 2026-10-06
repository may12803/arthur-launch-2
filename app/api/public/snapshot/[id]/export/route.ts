import { NextRequest, NextResponse } from 'next/server';
import { exportCsv } from '@/lib/snapshot/service';
import { readLimiter } from '@/lib/snapshot/limits';
import { checkId, corsHeaders, deps, failure, limited, preflight } from '@/lib/snapshot/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET ?rule=below_cost (optional): CSV of the flagged rows. Cells that a spreadsheet would run as formulas are neutralized.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    checkId(id);
    const blocked = await limited(req, readLimiter);
    if (blocked) return blocked;
    const { csv, filename } = await exportCsv(deps(), id, req.nextUrl.searchParams.get('rule') ?? undefined);
    return new NextResponse(csv, { headers: { ...corsHeaders(req), 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
  } catch (e) {
    return failure(req, e);
  }
}

export const OPTIONS = preflight;
