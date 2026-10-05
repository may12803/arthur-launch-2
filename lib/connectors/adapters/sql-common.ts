import { advance, decodeCursor, encodeCursor, greater } from './common.ts';
import type { PulledRecord, PullResult } from '../types.ts';

export const SQL_PAGE = 1000;
export const HW_COL = '__ll_hw';

const IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Identifiers cannot be bound as parameters, so they are validated against a strict allow-list pattern instead. */
export function assertIdent(name: string, what = 'identifier'): string {
  if (!IDENT.test(name)) throw new Error(`invalid ${what}: ${name.slice(0, 40)}`);
  return name;
}

export function assertTable(name: string, maxParts = 3): string {
  const parts = name.split('.');
  if (parts.length > maxParts) throw new Error('table name has too many parts');
  parts.forEach((p) => assertIdent(p, 'table name'));
  return parts.join('.');
}

export const hostOk = (h: string) => /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(h);

/**
 * Turn one window of rows (ordered by the timestamp column, selected with __ll_hw as an ISO string) into a page.
 * A full window re-anchors on the highest timestamp (rows at the boundary are re-read and deduplicated by the store).
 * If a full window made no progress, more than SQL_PAGE rows share one timestamp and the window can never advance.
 */
export function windowPage(rows: Record<string, unknown>[], cursor: string | null, pk: string): PullResult {
  const state = decodeCursor(cursor);
  let mx = state.hw;
  const records: PulledRecord[] = rows.map((r) => {
    const { [HW_COL]: hw, ...payload } = r;
    if (typeof hw === 'string' && greater(hw, mx)) mx = hw;
    if (payload[pk] === undefined || payload[pk] === null) throw new Error(`primary key column ${pk} is empty in a row`);
    return { source_ref: String(payload[pk]), payload, observed_at: typeof hw === 'string' && !Number.isNaN(Date.parse(hw)) ? new Date(hw).toISOString() : undefined };
  });
  if (rows.length >= SQL_PAGE) {
    if (!greater(mx, state.hw)) throw new Error(`more than ${SQL_PAGE} rows share the same updated timestamp; the window cannot advance`);
    return { records, nextCursor: encodeCursor({ hw: mx }), hasMore: true };
  }
  return advance(state, records, mx, undefined);
}

export function rowsToObjects(columns: string[], data: unknown[][]): Record<string, unknown>[] {
  return data.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i] ?? null])));
}
