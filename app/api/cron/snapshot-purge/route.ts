import { NextRequest, NextResponse } from 'next/server';
import { connectorsServerSecret, safeEqual } from '@/lib/client-portal/connector-api';
import { getStore } from '@/lib/snapshot/store';
import { purgeWithinBudget } from '@/lib/snapshot/purge';
import { opsAlert } from '@/lib/ops/alert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Deletes anonymous snapshot runs (rows and uploaded files) past their 7-day expiry. Same guard as the sync cron:
// constant-time x-connectors-secret, fail closed when unset. Returns only a count.
export async function POST(req: NextRequest) {
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  const given = req.headers.get('x-connectors-secret') || '';
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  try {
    const r = await purgeWithinBudget(getStore());
    // Expired rows still present after a run mean deletion is behind its 7-day promise (missed runs or a slow purge).
    if (r.remaining !== 0) await opsAlert('snapshot-purge-behind', 'Expired Snapshot uploads remain after the purge run.', r);
    return NextResponse.json(r);
  } catch (e) {
    await opsAlert('snapshot-purge-failed', 'The Snapshot purge run failed; expired uploads are not being deleted.', { error: e instanceof Error ? e.message : 'error' });
    return NextResponse.json({ error: 'Purge failed.', code: 'purge_failed' }, { status: 502 });
  }
}
