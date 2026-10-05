import type { Adapter, Creds } from '../types.ts';
import { decodeCursor, need } from './common.ts';
import { assertIdent, assertTable, HW_COL, windowPage } from './sql-common.ts';

export interface SqlExecutor { query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> }
// Production TDS driver is not bundled. Supply an authenticated, customer-scoped SQL executor at runtime.
export function createAzureSynapseAdapter(executor: SqlExecutor): Adapter {
  return {
    key: 'azure-synapse', objects: [],
    async validate(creds: Creds) {
      need(creds, 'table', 'primary_key', 'watermark_column');
      const table = assertTable(creds.table), pk = assertIdent(creds.primary_key), wm = assertIdent(creds.watermark_column);
      await executor.query(`SELECT TOP 1 ${pk} FROM ${table} ORDER BY ${wm} DESC`, []);
      return { ok: true, detail: 'SQL query accepted' };
    },
    async pull(object, cursor, creds) {
      const table = assertTable(object), pk = assertIdent(creds.primary_key), wm = assertIdent(creds.watermark_column);
      const hw = decodeCursor(cursor).hw;
      const rows = await executor.query(`SELECT TOP 1000 *, CONVERT(varchar(33), ${wm}, 126) AS ${HW_COL} FROM ${table}${hw ? ` WHERE ${wm} >= @watermark` : ''} ORDER BY ${wm} ASC`, hw ? [hw] : []);
      return windowPage(rows, cursor, pk);
    },
  };
}
