import { snowflakeJwt } from '../auth/jwt.ts';
import { requestJson } from '../http.ts';
import { guardedFetch } from '../net/safe-url.ts';
import type { Adapter, Creds, FetchLike } from '../types.ts';
import { decodeCursor, need } from './common.ts';
import { assertIdent, assertTable, hostOk, HW_COL, rowsToObjects, SQL_PAGE, windowPage } from './sql-common.ts';

// Snowflake SQL API v2 with key-pair JWT. Objects are customer-chosen tables, so `objects` is empty and the
// caller passes the table list to the runner. Incremental = high-water mark on an updated-at column (Streams are the
// vendor-documented alternative; their detail is UNVERIFIED in the vendor JSON). JWT lifetime is UNVERIFIED there too.

function host(creds: Creds): string {
  need(creds, 'account', 'user', 'private_key');
  if (!hostOk(creds.account)) throw new Error('invalid account identifier');
  return `https://${creds.account}.snowflakecomputing.com`;
}

function headers(creds: Creds): Record<string, string> {
  return {
    authorization: `Bearer ${snowflakeJwt({ account: creds.account, user: creds.user, privateKey: creds.private_key })}`,
    'x-snowflake-authorization-token-type': 'KEYPAIR_JWT',
    'content-type': 'application/json',
    accept: 'application/json',
    'user-agent': 'loveleeday-connector/1.0',
  };
}

async function run(creds: Creds, rawFetch: FetchLike, statement: string, bindings?: Record<string, { type: string; value: string }>) {
  const fetch = guardedFetch(rawFetch);
  const base = host(creds);
  const h = headers(creds);
  const body: Record<string, unknown> = { statement, timeout: 60 };
  for (const k of ['warehouse', 'database', 'schema', 'role']) if (creds[k]) body[k] = creds[k];
  if (bindings) body.bindings = bindings;
  const first = await requestJson<any>(fetch, `${base}/api/v2/statements`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const cols: string[] = (first?.resultSetMetaData?.rowType ?? []).map((c: any) => c.name);
  const data: unknown[][] = [...(first?.data ?? [])];
  const parts = first?.resultSetMetaData?.partitionInfo?.length ?? 1;
  for (let p = 1; p < parts; p++) {
    const more = await requestJson<any>(fetch, `${base}/api/v2/statements/${encodeURIComponent(first.statementHandle)}?partition=${p}`, { headers: h });
    data.push(...(more?.data ?? []));
  }
  return { cols, data };
}

export const snowflake: Adapter = {
  key: 'snowflake',
  objects: [],
  async validate(creds, fetch) {
    const r = await run(creds, fetch, 'SELECT CURRENT_ACCOUNT() AS A');
    return { ok: true, detail: 'key-pair JWT accepted', account: String(r.data?.[0]?.[0] ?? '') || undefined };
  },
  async pull(object, cursor, creds, fetch) {
    const table = assertTable(object);
    const col = assertIdent(creds.updated_at_column || 'UPDATED_AT', 'updated-at column');
    need(creds, 'primary_key');
    const pk = assertIdent(creds.primary_key, 'primary key');
    const hw = decodeCursor(cursor).hw;
    const where = hw ? ` WHERE ${col} >= TO_TIMESTAMP_NTZ(?)` : '';
    const stmt = `SELECT *, TO_VARCHAR(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS ${HW_COL} FROM ${table}${where} ORDER BY ${col} ASC LIMIT ${SQL_PAGE}`;
    const r = await run(creds, fetch, stmt, hw ? { '1': { type: 'TEXT', value: hw } } : undefined);
    // Snowflake upper-cases unquoted column names in metadata; normalise the hw alias and the key for lookup.
    const rows = rowsToObjects(r.cols, r.data).map((o) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) out[k.toUpperCase() === HW_COL.toUpperCase() ? HW_COL : k] = v;
      return out;
    });
    return windowPage(rows, cursor, pk.toUpperCase() in (rows[0] ?? {}) ? pk.toUpperCase() : pk);
  },
};
