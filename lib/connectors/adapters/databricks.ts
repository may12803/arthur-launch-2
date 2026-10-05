import { basicAuth, formBody, requestJson } from '../http.ts';
import type { Adapter, Creds, FetchLike } from '../types.ts';
import { decodeCursor, need } from './common.ts';
import { assertIdent, assertTable, hostOk, HW_COL, rowsToObjects, SQL_PAGE, windowPage } from './sql-common.ts';

// Databricks SQL Statement Execution API (/api/2.0/sql/statements). Vendor JSON lists Delta Change Data Feed or a
// timestamp cursor (not fetched, UNVERIFIED); this uses the timestamp cursor. Timestamps are rendered in the session
// time zone; set the warehouse session to UTC for stable cursors.

async function token(creds: Creds, fetch: FetchLike): Promise<string> {
  if (creds.access_token) return creds.access_token;
  need(creds, 'host', 'client_id', 'client_secret');
  const j = await requestJson<{ access_token: string }>(fetch, `https://${creds.host}/oidc/v1/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuth(creds.client_id, creds.client_secret) },
    body: formBody({ grant_type: 'client_credentials', scope: 'all-apis' }),
  });
  return j.access_token;
}

async function run(creds: Creds, fetch: FetchLike, statement: string, params?: { name: string; value: string; type: string }[]) {
  need(creds, 'host', 'warehouse_id');
  if (!hostOk(creds.host)) throw new Error('invalid workspace host');
  const j = await requestJson<any>(fetch, `https://${creds.host}/api/2.0/sql/statements`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token(creds, fetch)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ warehouse_id: creds.warehouse_id, statement, wait_timeout: '30s', on_wait_timeout: 'CANCEL', disposition: 'INLINE', format: 'JSON_ARRAY', ...(params ? { parameters: params } : {}) }),
  });
  if (j?.status?.state !== 'SUCCEEDED') throw new Error(`statement ${String(j?.status?.state ?? 'unknown').toLowerCase()}`);
  return { cols: (j.manifest?.schema?.columns ?? []).map((c: any) => c.name as string), data: (j.result?.data_array ?? []) as unknown[][] };
}

export const databricks: Adapter = {
  key: 'databricks',
  objects: [],
  async validate(creds, fetch) {
    await run(creds, fetch, 'SELECT 1');
    return { ok: true, detail: 'warehouse reachable', account: creds.host };
  },
  async pull(object, cursor, creds, fetch) {
    const table = assertTable(object);
    const col = assertIdent(creds.updated_at_column || 'updated_at', 'updated-at column');
    need(creds, 'primary_key');
    const pk = assertIdent(creds.primary_key, 'primary key');
    const hw = decodeCursor(cursor).hw;
    const where = hw ? ` WHERE ${col} >= CAST(:hw AS TIMESTAMP)` : '';
    const stmt = `SELECT *, date_format(${col}, "yyyy-MM-dd'T'HH:mm:ss.SSS") AS ${HW_COL} FROM ${table}${where} ORDER BY ${col} ASC LIMIT ${SQL_PAGE}`;
    const r = await run(creds, fetch, stmt, hw ? [{ name: 'hw', value: hw, type: 'STRING' }] : undefined);
    return windowPage(rowsToObjects(r.cols, r.data), cursor, pk);
  },
};
