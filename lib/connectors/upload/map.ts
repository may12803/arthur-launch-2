import { payloadSha256, sha256Hex } from '../hash.ts';
import type { ParsedTable } from './parse.ts';

export type FieldType = 'string' | 'number' | 'money' | 'date' | 'boolean';

export interface TargetField {
  name: string;
  type: FieldType;
  required?: boolean;
}

/** header text in the uploaded file -> target field name */
export type ColumnMapping = Record<string, string>;

export interface RowError {
  /** spreadsheet row: header is row 1 */
  row: number;
  field?: string;
  message: string;
}

export interface IngestRow {
  source_system: string;
  object: string;
  source_ref: string;
  payload: Record<string, unknown>;
  payload_sha256: string;
  observed_at: string;
}

export interface MapResult {
  fileSha256: string;
  mappingErrors: string[];
  preview: Record<string, unknown>[];
  records: IngestRow[];
  errors: RowError[];
  warnings: RowError[];
  rowsTotal: number;
  rowsAccepted: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function suggestMapping(header: string[], fields: TargetField[]): ColumnMapping {
  const m: ColumnMapping = {};
  const used = new Set<string>();
  for (const h of header) {
    const f = fields.find((x) => !used.has(x.name) && norm(x.name) === norm(h));
    if (f) {
      m[h] = f.name;
      used.add(f.name);
    }
  }
  return m;
}

export type Coerced = { ok: true; value: unknown } | { ok: false; message: string };

function parseNumeric(raw: string, allowCurrency: boolean): number | null {
  let s = raw.trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (allowCurrency) s = s.replace(/^[-+]?\s*[$£€]\s*/, (m) => (m.startsWith('-') ? '-' : ''));
  if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/\s/g, '');
  if (!/^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^[+-]?\.\d+$/.test(s)) return null;
  const v = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function coerce(type: FieldType, raw: string): Coerced {
  const s = raw.trim();
  switch (type) {
    case 'string':
      return { ok: true, value: s };
    case 'number': {
      const v = parseNumeric(s, false);
      return v === null ? { ok: false, message: `"${s}" is not a number` } : { ok: true, value: v };
    }
    case 'money': {
      const v = parseNumeric(s, true);
      return v === null ? { ok: false, message: `"${s}" is not an amount` } : { ok: true, value: Math.round(v * 100) / 100 };
    }
    case 'boolean': {
      if (/^(true|yes|y|1)$/i.test(s)) return { ok: true, value: true };
      if (/^(false|no|n|0)$/i.test(s)) return { ok: true, value: false };
      return { ok: false, message: `"${s}" is not true/false` };
    }
    case 'date': {
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
      if (m) {
        const d = validDate(+m[1], +m[2], +m[3]);
        return d ? { ok: true, value: d } : { ok: false, message: `"${s}" is not a real date` };
      }
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US order, month first
      if (m) {
        const d = validDate(+m[3], +m[1], +m[2]);
        return d ? { ok: true, value: d } : { ok: false, message: `"${s}" is not a real date` };
      }
      return { ok: false, message: `"${s}" is not a recognised date (use YYYY-MM-DD or MM/DD/YYYY)` };
    }
  }
}

export interface MapInput {
  table: ParsedTable;
  mapping: ColumnMapping;
  fields: TargetField[];
  targetObject: string;
  fileSha256: string;
  sourceSystem?: string;
  observedAt?: string;
  /** treat formula-like cells in mapped columns as row errors instead of warnings */
  rejectFormulas?: boolean;
  previewRows?: number;
}

export function applyMapping(i: MapInput): MapResult {
  const byName = new Map(i.fields.map((f) => [f.name, f]));
  const mappingErrors: string[] = [];
  const colFor = new Map<string, number>();
  i.table.header.forEach((h, idx) => {
    const target = i.mapping[h];
    if (target === undefined) return;
    if (!byName.has(target)) mappingErrors.push(`column "${h}" maps to unknown field "${target}"`);
    else if ([...colFor.keys()].includes(target)) mappingErrors.push(`field "${target}" is mapped from more than one column`);
    else colFor.set(target, idx);
  });
  for (const h of Object.keys(i.mapping)) if (!i.table.header.includes(h)) mappingErrors.push(`mapped column "${h}" is not in the file`);
  for (const f of i.fields) if (f.required && !colFor.has(f.name)) mappingErrors.push(`required field "${f.name}" is not mapped`);

  const base: MapResult = { fileSha256: i.fileSha256, mappingErrors, preview: [], records: [], errors: [], warnings: [], rowsTotal: i.table.rows.length, rowsAccepted: 0 };
  if (mappingErrors.length) return base;

  const formula = new Set(i.table.formulaCells.map((c) => `${c.row}:${c.col}`));
  const observed = i.observedAt ?? new Date().toISOString();
  const system = i.sourceSystem ?? 'csv-excel-upload';

  i.table.rows.forEach((cells, ri) => {
    const rowNo = ri + 2;
    const payload: Record<string, unknown> = {};
    let bad = false;
    for (const [name, idx] of colFor) {
      const f = byName.get(name)!;
      const raw = cells[idx] ?? '';
      if (formula.has(`${rowNo}:${idx}`)) {
        const e = { row: rowNo, field: name, message: 'cell begins with a formula character (= + - @ tab CR)' };
        if (i.rejectFormulas) {
          base.errors.push(e);
          bad = true;
          continue;
        }
        base.warnings.push(e);
      }
      if (raw.trim() === '') {
        if (f.required) {
          base.errors.push({ row: rowNo, field: name, message: 'required value is empty' });
          bad = true;
        } else payload[name] = null;
        continue;
      }
      const c = coerce(f.type, raw);
      if (!c.ok) {
        base.errors.push({ row: rowNo, field: name, message: c.message });
        bad = true;
      } else payload[name] = c.value;
    }
    if (bad) return;
    base.records.push({
      source_system: system,
      object: i.targetObject,
      source_ref: `${i.fileSha256}:${rowNo}`,
      payload,
      payload_sha256: payloadSha256(payload),
      observed_at: observed,
    });
  });
  base.rowsAccepted = base.records.length;
  base.preview = base.records.slice(0, i.previewRows ?? 20).map((r) => r.payload);
  return base;
}

export const fileSha256 = (data: Buffer | Uint8Array | string) => sha256Hex(data);
