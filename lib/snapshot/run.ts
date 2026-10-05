// Turns one uploaded flat price file plus a confirmed column mapping into the engine's tables, runs the rules
// engine, and returns a result in which every figure is traceable to rows of the uploaded file.
import { analyze, scoreFindings } from '../integrity/rules.ts';
import type { Customer, Finding, FlaggedRow, IntegrityResult, RuleId, Tables } from '../integrity/schema.ts';
import { FIELDS, type FieldId, type Mapping } from './mapper.ts';
import { isBlank, parseDate, parseMoney } from './values.ts';
import { computeCoverage, type Coverage, type CatalogLite } from './coverage.ts';

export const MAX_STORED_ROWS_PER_FINDING = 5000;
export const RESULT_VERSION = 1;

export interface RowIssue { row: number; field: FieldId; value: string; problem: string }

export interface SnapshotFinding extends Omit<Finding, 'rows' | 'sample'> {
  rows: FlaggedRow[];
  rows_total: number;
  rows_truncated: boolean;
}

export interface SnapshotResult {
  version: number;
  as_of: string;
  source: 'upload' | 'sample';
  label: string | null;
  rows_total: number;
  rows_used: number;
  columns_found: Partial<Record<FieldId, { column: string; confidence: number; source: string }>>;
  columns_missing: { field: FieldId; label: string }[];
  row_issues: { total: number; first: RowIssue[] };
  notes: string[];
  score: IntegrityResult['score'];
  quantified_loss: number;
  findings: SnapshotFinding[];
  skipped: IntegrityResult['skipped'];
  coverage: Coverage;
}

const INACTIVE = new Set(['inactive', 'i', 'closed', 'disabled', 'terminated', 'suspended', 'on hold', 'hold', 'dormant']);
const NO = new Set(['n', 'no', 'false', '0', 'f']);

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface RunInput {
  header: string[];
  rows: string[][];
  mapping: Mapping;
  asOf: string;
  source: 'upload' | 'sample';
  label?: string | null;
  catalog?: CatalogLite[];
  /** Rows kept per finding. Defaults to the snapshot cap; the paid audit keeps every flagged row so each figure can be re-added by hand. */
  maxRowsPerFinding?: number;
}

export function runSnapshot(input: RunInput): SnapshotResult {
  const { header, rows, mapping, asOf } = input;
  const col = (f: FieldId) => {
    const m = mapping[f];
    return m ? header.indexOf(m.column) : -1;
  };
  const ix = Object.fromEntries(FIELDS.map((f) => [f.id, col(f.id)])) as Record<FieldId, number>;
  const get = (r: string[], f: FieldId) => (ix[f] >= 0 ? (r[ix[f]] ?? '').trim() : '');
  const has = (f: FieldId) => ix[f] >= 0;
  const notes: string[] = [];
  const issues: RowIssue[] = [];
  let issueTotal = 0;
  const issue = (row: number, field: FieldId, value: string, problem: string) => {
    issueTotal++;
    if (issues.length < 50) issues.push({ row, field, value: value.slice(0, 60), problem });
  };

  const activeFlagHeader = has('customer_status') && /^(active|isactive)$/.test(mapping.customer_status!.column.toLowerCase().replace(/[^a-z]/g, ''));

  const customers = new Map<string, Customer>();
  const products = new Map<string, { sku: string; description: string; category: string; uom: string }>();
  const costBySku = new Map<string, number[]>();
  const onHandBySku = new Map<string, number>();
  const prices: Tables['prices'] = [];
  const sales: Tables['sales'] = [];
  let used = 0;
  let datePriceKnown = 0, dateSaleKnown = 0, unitsKnown = 0, costKnown = 0, onHandKnown = 0;

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const sku = get(r, 'item');
    if (!sku) { issue(rowNum, 'item', '', 'item is blank'); return; }
    const priceRaw = get(r, 'price');
    const price = parseMoney(priceRaw);
    if (price === null) { issue(rowNum, 'price', priceRaw, isBlank(priceRaw) ? 'price is blank' : 'price is not a number'); return; }
    if (price < 0) { issue(rowNum, 'price', priceRaw, 'price is negative'); return; }
    used++;

    const custName = has('customer') ? get(r, 'customer') : 'All customers';
    const custId = custName || '(blank customer)';
    if (!customers.has(custId)) {
      let status: Customer['status'] = 'active';
      if (has('customer_status')) {
        const v = get(r, 'customer_status').toLowerCase();
        if (activeFlagHeader ? NO.has(v) : INACTIVE.has(v)) status = 'inactive';
      }
      customers.set(custId, { customer_id: custId, name: custName || '(blank customer)', address: get(r, 'address'), city: '', state: '', zip: get(r, 'zip'), status });
    } else {
      const c = customers.get(custId)!;
      if (!c.address) c.address = get(r, 'address');
      if (!c.zip) c.zip = get(r, 'zip');
    }

    if (!products.has(sku)) products.set(sku, { sku, description: get(r, 'description'), category: get(r, 'category'), uom: '' });

    if (has('cost')) {
      const raw = get(r, 'cost');
      if (!isBlank(raw)) {
        const c = parseMoney(raw);
        if (c === null || c < 0) issue(rowNum, 'cost', raw, 'cost is not a usable number; row kept without a cost');
        else { costKnown++; const l = costBySku.get(sku); if (l) l.push(c); else costBySku.set(sku, [c]); }
      }
    }
    if (has('on_hand')) {
      const raw = get(r, 'on_hand');
      if (!isBlank(raw)) {
        const q = parseMoney(raw);
        if (q === null) issue(rowNum, 'on_hand', raw, 'on hand is not a number; ignored');
        else { onHandKnown++; onHandBySku.set(sku, Math.max(onHandBySku.get(sku) ?? -Infinity, q)); }
      }
    }

    let effective = asOf;
    if (has('price_date')) {
      const raw = get(r, 'price_date');
      const d = isBlank(raw) ? null : parseDate(raw);
      if (d) { effective = d; datePriceKnown++; }
      else if (!isBlank(raw)) issue(rowNum, 'price_date', raw, 'not a date; price treated as current');
    }
    prices.push({ price_id: `r${rowNum}`, customer_id: custId, sku, price, effective_date: effective });

    let saleDate: string | null = null;
    if (has('last_sale_date')) {
      const raw = get(r, 'last_sale_date');
      if (!isBlank(raw)) {
        saleDate = parseDate(raw);
        if (saleDate) dateSaleKnown++; else issue(rowNum, 'last_sale_date', raw, 'not a date; ignored');
      }
    }
    let units: number | null = null;
    if (has('units_12m')) {
      const raw = get(r, 'units_12m');
      if (!isBlank(raw)) {
        const q = parseMoney(raw);
        if (q === null || q < 0) issue(rowNum, 'units_12m', raw, 'units is not a usable number; ignored');
        else { units = q; unitsKnown++; }
      }
    }
    if (saleDate || (units !== null && units > 0)) {
      sales.push({ sale_id: `r${rowNum}`, sale_date: saleDate ?? asOf, customer_id: custId, sku, qty: units ?? 0, unit_price: price });
    }
  });

  // The engine treats a SKU with no inventory row as zero on hand. Only SKUs whose on-hand we actually read may be judged dead.
  const inventory: Tables['inventory'] = [...onHandBySku].map(([sku, on_hand]) => ({ sku, on_hand, as_of: asOf }));
  const assessable = [...products.values()].filter((p) => onHandBySku.has(p.sku));
  const costs: Tables['costs'] = [];
  let costVaries = 0;
  for (const [sku, list] of costBySku) {
    if (new Set(list).size > 1) costVaries++;
    costs.push({ sku, effective_date: asOf, cost: Math.min(...list) });
  }
  if (costVaries > 0) notes.push(`${costVaries} items carry more than one cost across rows; the lowest is used, so a price is only called below cost when it is below every cost you gave for that item.`);

  const tables: Tables = { customers: has('customer') ? [...customers.values()] : [], products: assessable, costs, inventory, prices, sales };

  const frac = (n: number) => (used ? n / used : 0);
  const skip: Partial<Record<RuleId, string>> = {
    cost_lag: 'needs cost change history (the date each cost changed); a single cost per item was supplied',
  };
  if (!has('customer_status')) skip.inactive_customer_prices = 'no customer status column was found';
  if (!has('price_date') || frac(datePriceKnown) < 0.2) skip.stale_price = 'needs a price effective date column that is mostly filled in';
  else if (!has('last_sale_date') || frac(dateSaleKnown) < 0.2) skip.stale_price = 'needs a last sale date column that is mostly filled in';
  if (has('last_sale_date') && frac(dateSaleKnown) < 0.2) skip.dead_sku = 'the last sale date column is mostly blank, so "never sold" cannot be told from "not exported"';
  else if (!has('last_sale_date')) skip.dead_sku = 'no last sale date column was found';
  else if (!has('on_hand')) skip.dead_sku = 'no quantity on hand column was found';

  if (has('last_sale_date') && has('on_hand')) notes.push('A blank last sale date is read as "no sale on record".');
  if (has('price_date') && datePriceKnown < used) notes.push(`${used - datePriceKnown} rows had no usable price date and were treated as current, so they cannot be called stale.`);
  if (!has('customer')) notes.push('No customer column was found, so customer checks were skipped and every row counts as one price list.');
  else if (!has('address') && !has('zip')) notes.push('Duplicate customers are matched on name alone because no address column was found; two real branches with the same name would be listed too. Review before merging.');

  const cap = input.maxRowsPerFinding ?? MAX_STORED_ROWS_PER_FINDING;
  const volumeKnown = unitsKnown > 0;
  const raw = analyze(tables, { asOf, volumeKnown, skip });

  const findings: SnapshotFinding[] = raw.findings.map((f) => {
    const { rows: all, sample: _s, ...rest } = f;
    void _s;
    const exposure = refuseUnsourced(f);
    return {
      ...rest, exposure,
      rows: all.slice(0, cap),
      rows_total: all.length,
      rows_truncated: all.length > cap,
    };
  });
  if (!volumeKnown && has('cost')) notes.push('No units sold column was found, so below-cost figures are per-unit exposure, not loss.');

  const present = new Set(Object.keys(mapping) as FieldId[]);
  const coverage = computeCoverage(present, input.catalog ?? []);
  const rescored = scoreFindings(findings as unknown as Finding[]);
  const missing = FIELDS.filter((f) => !present.has(f.id)).map((f) => ({ field: f.id, label: f.label }));

  return {
    version: RESULT_VERSION,
    as_of: asOf,
    source: input.source,
    label: input.label ?? null,
    rows_total: rows.length,
    rows_used: used,
    columns_found: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, { column: v!.column, confidence: v!.confidence, source: v!.source }])),
    columns_missing: missing,
    row_issues: { total: issueTotal, first: issues },
    notes,
    score: rescored,
    quantified_loss: raw.quantifiedExposure,
    findings,
    skipped: raw.skipped,
    coverage,
  };
}

/** A dollar figure with no rows behind it is replaced by "not quantified" instead of being shown. */
function refuseUnsourced(f: Finding): Finding['exposure'] {
  const e = f.exposure;
  if (e.amount !== null && e.amount !== 0 && e.inputRowIds.length === 0) {
    return { ...e, amount: null, kind: 'none', basis: 'refused: the figure had no source rows' };
  }
  return e;
}
