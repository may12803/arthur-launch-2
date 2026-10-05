import { formBody, requestJson } from '../http.ts';
import type { Creds, FetchLike, PulledRecord, PullResult } from '../types.ts';

/**
 * Cursor state carried in the opaque cursor string:
 *   hw  high-water mark from the last COMPLETED pass (what the next pass filters on)
 *   pg  pagination position inside an in-progress pass
 *   mx  highest timestamp seen so far in the in-progress pass
 * Persisting {hw, pg, mx} after each ingested page is what makes a pass resumable; the high-water mark
 * only moves forward when the last page of a pass is ingested.
 */
export interface CursorState {
  hw?: string;
  pg?: string;
  mx?: string;
}

export function decodeCursor(c: string | null): CursorState {
  if (!c) return {};
  try {
    const v = JSON.parse(c);
    return v && typeof v === 'object' ? (v as CursorState) : {};
  } catch {
    return {};
  }
}

export function encodeCursor(s: CursorState): string {
  const o: CursorState = {};
  if (s.hw !== undefined) o.hw = s.hw;
  if (s.pg !== undefined) o.pg = s.pg;
  if (s.mx !== undefined) o.mx = s.mx;
  return JSON.stringify(o);
}

export function greater(a: string | undefined, b: string | undefined, numeric = false): boolean {
  if (a === undefined) return false;
  if (b === undefined) return true;
  return numeric ? Number(a) > Number(b) : a > b;
}

export function maxOf(values: (string | undefined)[], seed: string | undefined, numeric = false): string | undefined {
  let m = seed;
  for (const v of values) if (greater(v, m, numeric)) m = v;
  return m;
}

/** Produce the page result: either continue the pass (pg set) or finish it (hw := mx). */
export function advance(state: CursorState, records: PulledRecord[], mx: string | undefined, nextPage: string | undefined): PullResult {
  if (nextPage !== undefined) return { records, nextCursor: encodeCursor({ hw: state.hw, pg: nextPage, mx }), hasMore: true };
  const hw = mx ?? state.hw;
  return { records, nextCursor: hw === undefined ? null : encodeCursor({ hw }), hasMore: false };
}

export const bearer = (token: string | undefined): Record<string, string> => ({ authorization: `Bearer ${token ?? ''}` });

export function need(creds: Creds, ...names: string[]): void {
  const missing = names.filter((n) => !creds[n]);
  if (missing.length) throw new Error(`missing credential fields: ${missing.join(', ')}`);
}

/** OAuth 2.0 client-credentials token (Microsoft Entra style). Falls back to a supplied access_token. */
export async function entraToken(creds: Creds, scope: string, fetch: FetchLike): Promise<string> {
  if (creds.access_token) return creds.access_token;
  need(creds, 'tenant_id', 'client_id', 'client_secret');
  const j = await requestJson<{ access_token: string }>(fetch, `https://login.microsoftonline.com/${encodeURIComponent(creds.tenant_id)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({ grant_type: 'client_credentials', client_id: creds.client_id, client_secret: creds.client_secret, scope }),
  });
  return j.access_token;
}

export const isoOrUndefined = (v: unknown): string | undefined => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);

export function toRecords(items: any[], id: (r: any) => string, ts?: (r: any) => string | undefined): PulledRecord[] {
  return items.map((r) => {
    const t = ts?.(r);
    const iso = t && !/^\d+$/.test(t) ? isoOrUndefined(t) : undefined;
    return { source_ref: String(id(r)), payload: r, observed_at: iso };
  });
}
