import { NextRequest, NextResponse } from 'next/server';
import { connectorsServerSecret, safeEqual } from '@/lib/client-portal/connector-api';
import { loveleedayAnon } from '@/lib/client-portal/anon';
import { isLoopback } from '@/lib/engine/loopback';
import { SupabaseAuditStore } from '@/lib/audit/store';
import { runPendingAudits } from '@/lib/audit/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  if (!isLoopback(req.headers)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  const given = req.headers.get('x-connectors-secret') || '';
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  try {
    const counts = await runPendingAudits({ store: new SupabaseAuditStore(loveleedayAnon(), secret), log: console.error });
    return NextResponse.json(counts);
  } catch (e) {
    console.error('[audit] pending run failed', e);
    return NextResponse.json({ error: 'Audit retry failed.' }, { status: 502 });
  }
}
