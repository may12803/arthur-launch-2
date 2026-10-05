import type { Tables } from './schema.ts';

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. Returns rows of strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const flush = () => {
    row.push(field);
    field = '';
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      flush();
    } else field += c;
  }
  if (field !== '' || row.length) flush();
  return rows;
}

export function csvObjects(text: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const cols = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ''])));
}

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: object[], columns: string[]): string {
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc((r as Record<string, unknown>)[c])).join(','));
  return lines.join('\n') + '\n';
}

export const TABLE_COLUMNS: Record<keyof Tables, string[]> = {
  customers: ['customer_id', 'name', 'address', 'city', 'state', 'zip', 'status'],
  products: ['sku', 'description', 'category', 'uom'],
  costs: ['sku', 'effective_date', 'cost'],
  inventory: ['sku', 'on_hand', 'as_of'],
  prices: ['price_id', 'customer_id', 'sku', 'price', 'effective_date'],
  sales: ['sale_id', 'sale_date', 'customer_id', 'sku', 'qty', 'unit_price'],
};

const NUMERIC: Record<string, string[]> = {
  costs: ['cost'],
  inventory: ['on_hand'],
  prices: ['price'],
  sales: ['qty', 'unit_price'],
};

/** Turn CSV texts (any subset of the six tables) into typed tables. Missing tables become empty arrays. */
export function tablesFromCsv(texts: Partial<Record<keyof Tables, string>>): Tables {
  const out: Record<string, unknown[]> = {};
  for (const name of Object.keys(TABLE_COLUMNS) as (keyof Tables)[]) {
    const text = texts[name];
    const rows = text ? csvObjects(text) : [];
    const nums = NUMERIC[name] ?? [];
    out[name] = rows.map((r) => {
      const o: Record<string, string | number> = { ...r };
      for (const n of nums) {
        const v = Number(r[n]);
        if (!Number.isFinite(v)) throw new Error(`${name}.csv: non-numeric ${n} "${r[n]}"`);
        o[n] = v;
      }
      return o;
    });
  }
  return out as unknown as Tables;
}
