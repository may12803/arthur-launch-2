// Shared admission limits for the anonymous Snapshot endpoints, backed by the Supabase RPC snapshot_rate_take
// (migration 20261006_30). The in-process SlidingWindow is always applied first and stays the fallback: if the shared
// store is unconfigured, slow or errors, the local verdict stands, so an outage degrades to per-process limits and
// never to unlimited.
import type { SlidingWindow } from './limits.ts';

export type Verdict = { ok: boolean; retryAfterSec: number };
export type SharedTake = (bucket: string, max: number, windowSec: number) => Promise<Verdict>;

export function supabaseSharedTake(url: string, serviceKey: string, doFetch: typeof fetch = fetch, timeoutMs = 1500): SharedTake {
  return async (bucket, max, windowSec) => {
    const res = await doFetch(`${url}/rest/v1/rpc/snapshot_rate_take`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bucket: bucket, p_max: max, p_window_seconds: windowSec }),
    });
    if (!res.ok) throw new Error(`snapshot_rate_take -> ${res.status}`);
    const body = (await res.json()) as { allowed: boolean; retry_after_seconds: number }[] | { allowed: boolean; retry_after_seconds: number };
    const row = Array.isArray(body) ? body[0] : body;
    if (!row || typeof row.allowed !== 'boolean') throw new Error('snapshot_rate_take: bad response');
    return { ok: row.allowed, retryAfterSec: Math.max(1, Number(row.retry_after_seconds) || 1) };
  };
}

let defaultTake: SharedTake | null | undefined;
export function getSharedTake(): SharedTake | null {
  if (defaultTake !== undefined) return defaultTake;
  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const key = process.env.LOVELEEDAY_SUPABASE_SERVICE_ROLE_KEY;
  defaultTake = url && key ? supabaseSharedTake(url, key) : null;
  return defaultTake;
}
export function setSharedTakeForTests(t: SharedTake | null | undefined) { defaultTake = t; }

/** Local window first (cheap, and the fallback), then the shared counter. Shared errors fall back to the local verdict. */
export async function takeShared(local: SlidingWindow, key: string, shared: SharedTake | null = getSharedTake()): Promise<Verdict> {
  const l = local.take(key);
  if (!l.ok || !shared) return l;
  try {
    return await shared(`${local.name}:${key}`, local.max, Math.ceil(local.windowMs / 1000));
  } catch (e) {
    console.log(`[snapshot] shared limiter unavailable, using local: ${e instanceof Error ? e.message : 'error'}`);
    return l;
  }
}
