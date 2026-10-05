import { NextRequest, NextResponse } from 'next/server';
import { getApiContext } from '@/lib/client-portal/api';
import { getAudit, validAuditId, type ReadClient } from '@/lib/audit/read';
import { auditCsv } from '@/lib/audit/csv';

export const runtime = 'nodejs';
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validAuditId(id)) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 });
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  const { row, error } = await getAudit(ctx.supabase as unknown as ReadClient, ctx.tenantId, id);
  if (error) return NextResponse.json({ error: 'Could not load audit.' }, { status: 500 });
  if (!row?.result) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 });
  const file = auditCsv(row.result);
  return new NextResponse(file.csv, { headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${file.filename}"`,
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } });
}
