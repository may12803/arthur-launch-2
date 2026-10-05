// Flagged-row export for an audit: one line per flagged record, every figure on it traceable to the same row number in
// the customer's own file. Cells that start with a formula character are neutralized by toCsv.
import { toCsv } from '../connectors/upload/parse.ts';
import type { AuditReport } from './report.ts';

export const AUDIT_CSV_HEADER = ['finding', 'rule', 'row_in_your_file', 'item', 'customer', 'price', 'current_cost', 'gap_per_unit', 'units_sold_12m', 'dollars', 'dollars_are', 'recommended_action', 'details'];

const DETAIL_SKIP = new Set(['id', 'sku', 'customer_id', 'customer_name', 'price', 'current_cost', 'gap_per_unit', 'units_t12m', 'exposure']);

export function auditCsv(r: AuditReport): { csv: string; filename: string; rows: number } {
  const out: unknown[][] = [AUDIT_CSV_HEADER];
  let n = 0;
  for (const f of r.findings) {
    for (const row of f.rows) {
      const m = /^r(\d+)$/.exec(String(row.id));
      const dollars = f.money.kind === 'loss' && typeof row.exposure === 'number' ? row.exposure.toFixed(2) : '';
      const details = Object.fromEntries(Object.entries(row).filter(([k]) => !DETAIL_SKIP.has(k)));
      out.push([
        f.title, f.rule, m ? m[1] : '', row.sku ?? '', row.customer_name ?? row.customer_id ?? '', row.price ?? '', row.current_cost ?? '', row.gap_per_unit ?? '',
        f.money.kind === 'exposure' ? '' : row.units_t12m ?? '', dollars, f.money.kind === 'loss' ? 'loss' : f.money.kind === 'exposure' ? 'exposure, per unit only' : 'not quantified',
        f.action, Object.keys(details).length ? JSON.stringify(details) : '',
      ]);
      n++;
    }
  }
  return { csv: toCsv(out), filename: `loveleeday-audit-${r.as_of}.csv`, rows: n };
}
