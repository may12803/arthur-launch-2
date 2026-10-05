import { exchangeJwtBearer, googleServiceAccountAssertion } from '../auth/jwt.ts';
import { requestJson } from '../http.ts';
import type { Adapter, Creds, FetchLike } from '../types.ts';
import { decodeCursor, need } from './common.ts';
import { assertIdent, HW_COL, SQL_PAGE, windowPage } from './sql-common.ts';

// BigQuery jobs.query (REST v2) with a service-account JWT bearer token. Vendor JSON: timestamp cursor on a
// partitioned column (CHANGES function UNVERIFIED). `object` is "dataset.table" in creds.project.
const SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly'; // UNVERIFIED in the vendor JSON

async function token(creds: Creds, fetch: FetchLike): Promise<string> {
  if (creds.access_token) return creds.access_token;
  need(creds, 'client_email', 'private_key');
  const t = await exchangeJwtBearer({ fetch, tokenUrl: 'https://oauth2.googleapis.com/token', assertion: googleServiceAccountAssertion({ clientEmail: creds.client_email, privateKey: creds.private_key, scope: SCOPE }) });
  return t.access_token;
}

async function query(creds: Creds, fetch: FetchLike, sql: string, params?: { name: string; value: string }[]) {
  need(creds, 'project');
  if (!/^[a-z][a-z0-9-]{4,60}$/.test(creds.project)) throw new Error('invalid project id');
  const j = await requestJson<any>(fetch, `https://bigquery.googleapis.com/bigquery/v2/projects/${creds.project}/queries`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token(creds, fetch)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql, useLegacySql: false, maxResults: SQL_PAGE, timeoutMs: 30000, ...(params ? { parameterMode: 'NAMED', queryParameters: params.map((p) => ({ name: p.name, parameterType: { type: 'STRING' }, parameterValue: { value: p.value } })) } : {}) }),
  });
  if (j?.jobComplete === false) throw new Error('query still running after timeout');
  const cols: string[] = (j?.schema?.fields ?? []).map((f: any) => f.name);
  const rows = (j?.rows ?? []).map((r: any) => Object.fromEntries(cols.map((c, i) => [c, r.f?.[i]?.v ?? null])));
  return rows as Record<string, unknown>[];
}

export const googleBigquery: Adapter = {
  key: 'google-bigquery',
  objects: [],
  async validate(creds, fetch) {
    await query(creds, fetch, 'SELECT 1 AS ok');
    return { ok: true, detail: 'query accepted', account: creds.project };
  },
  async pull(object, cursor, creds, fetch) {
    const [dataset, table] = object.split('.');
    if (!dataset || !table || object.split('.').length !== 2) throw new Error('object must be dataset.table');
    assertIdent(dataset, 'dataset');
    assertIdent(table, 'table');
    const col = assertIdent(creds.updated_at_column || 'updated_at', 'updated-at column');
    need(creds, 'primary_key');
    const pk = assertIdent(creds.primary_key, 'primary key');
    const hw = decodeCursor(cursor).hw;
    const where = hw ? ` WHERE ${col} >= TIMESTAMP(@hw)` : '';
    const sql = `SELECT *, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S', ${col}) AS ${HW_COL} FROM \`${creds.project}.${dataset}.${table}\`${where} ORDER BY ${col} ASC LIMIT ${SQL_PAGE}`;
    return windowPage(await query(creds, fetch, sql, hw ? [{ name: 'hw', value: hw }] : undefined), cursor, pk);
  },
};
