import * as XLSX from 'xlsx';

export class UploadError extends Error {
  code: 'too_large' | 'too_many_rows' | 'too_many_columns' | 'empty' | 'unterminated_quote' | 'unsupported_format' | 'bad_workbook';
  constructor(code: UploadError['code'], message: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

export interface ParseLimits {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
}

export const DEFAULT_LIMITS: ParseLimits = { maxBytes: 25 * 1024 * 1024, maxRows: 200_000, maxColumns: 200 };

export interface FormulaCell {
  /** spreadsheet row number: header is row 1, first data row is row 2 */
  row: number;
  col: number;
  header: string;
  value: string;
}

export interface ParsedTable {
  header: string[];
  rows: string[][];
  formulaCells: FormulaCell[];
  format: 'csv' | 'xlsx';
}

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** A cell a spreadsheet would execute as a formula. Plain numbers like -5 or +3.2 cannot be formulas and are exempt. */
export function isFormulaLike(v: string): boolean {
  return FORMULA_START.test(v) && !PLAIN_NUMBER.test(v);
}

/** Export side: prefix a single quote so Excel/Sheets treat the cell as text. */
export function neutralizeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return isFormulaLike(s) ? "'" + s : s;
}

export function toCsv(rows: unknown[][]): string {
  const q = (v: unknown) => {
    const s = neutralizeCell(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180: quoted fields, doubled quotes, embedded newlines, CRLF or LF, optional UTF-8 BOM. */
export function parseCsvText(input: string, delimiter = ','): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      inQ = true;
      i++;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      field = '';
      out.push(row);
      row = [];
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (inQ) throw new UploadError('unterminated_quote', 'CSV ends inside a quoted field');
  if (field !== '' || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

function finish(grid: string[][], limits: ParseLimits, format: 'csv' | 'xlsx'): ParsedTable {
  const nonEmpty = grid.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) throw new UploadError('empty', 'file has no rows');
  const header = nonEmpty[0].map((h) => h.trim());
  if (header.length > limits.maxColumns) throw new UploadError('too_many_columns', `more than ${limits.maxColumns} columns`);
  const rows = nonEmpty.slice(1);
  if (rows.length > limits.maxRows) throw new UploadError('too_many_rows', `more than ${limits.maxRows} data rows`);
  const formulaCells: FormulaCell[] = [];
  rows.forEach((r, ri) =>
    r.forEach((v, ci) => {
      if (isFormulaLike(v)) formulaCells.push({ row: ri + 2, col: ci, header: header[ci] ?? `col${ci + 1}`, value: v });
    }),
  );
  return { header, rows, formulaCells, format };
}

export function parseCsv(data: Buffer | string, limits: ParseLimits = DEFAULT_LIMITS): ParsedTable {
  const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
  if (size > limits.maxBytes) throw new UploadError('too_large', `file exceeds ${limits.maxBytes} bytes`);
  const text = typeof data === 'string' ? data : data.toString('utf8');
  return finish(parseCsvText(text), limits, 'csv');
}

export function parseXlsx(data: Buffer, limits: ParseLimits = DEFAULT_LIMITS, sheetName?: string): ParsedTable {
  if (data.length > limits.maxBytes) throw new UploadError('too_large', `file exceeds ${limits.maxBytes} bytes`);
  // xlsx.read() silently accepts arbitrary text as a CSV sheet, so insist on the zip container first.
  if (!(data.length > 3 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04)) throw new UploadError('bad_workbook', 'not an .xlsx workbook');
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'buffer', cellFormula: false, cellHTML: false, cellText: true, cellDates: false });
  } catch {
    throw new UploadError('bad_workbook', 'could not read workbook');
  }
  const name = sheetName ?? wb.SheetNames[0];
  const ws = name ? wb.Sheets[name] : undefined;
  if (!ws || !ws['!ref']) throw new UploadError('empty', 'workbook has no data');
  const range = XLSX.utils.decode_range(ws['!ref']);
  if (range.e.r - range.s.r > limits.maxRows) throw new UploadError('too_many_rows', `more than ${limits.maxRows} rows`);
  if (range.e.c - range.s.c + 1 > limits.maxColumns) throw new UploadError('too_many_columns', `more than ${limits.maxColumns} columns`);
  const grid = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false }) as unknown[][]).map((r) => r.map((c) => String(c ?? '')));
  return finish(grid, limits, 'xlsx');
}

/** Format is decided by file content, not by the name the user gave it. Macro-enabled and legacy binary files are refused. */
export function parseUpload(data: Buffer, filename: string, limits: ParseLimits = DEFAULT_LIMITS): ParsedTable {
  const isZip = data.length > 3 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  if (isZip) {
    if (/\.xlsm$/i.test(filename)) throw new UploadError('unsupported_format', 'macro-enabled workbooks are not accepted');
    return parseXlsx(data, limits);
  }
  if (data.length > 7 && data[0] === 0xd0 && data[1] === 0xcf) throw new UploadError('unsupported_format', 'legacy .xls files are not accepted; save as .xlsx or .csv');
  if (!/\.(csv|txt|tsv)$/i.test(filename)) throw new UploadError('unsupported_format', 'only .csv and .xlsx files are accepted');
  return parseCsv(data, limits);
}
