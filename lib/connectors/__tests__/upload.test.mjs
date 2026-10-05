import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseCsv, parseCsvText, parseXlsx, parseUpload, isFormulaLike, neutralizeCell, toCsv, UploadError } from '../upload/parse.ts';
import { applyMapping, coerce, suggestMapping, fileSha256 } from '../upload/map.ts';
import { payloadSha256 } from '../hash.ts';

const FIELDS = [
  { name: 'invoice_no', type: 'string', required: true },
  { name: 'issued', type: 'date', required: true },
  { name: 'amount', type: 'money', required: true },
  { name: 'qty', type: 'number' },
  { name: 'paid', type: 'boolean' },
  { name: 'memo', type: 'string' },
];

test('CSV: RFC 4180 quoted fields, doubled quotes, embedded commas and newlines, CRLF, BOM', () => {
  const text = '﻿invoice_no,memo\r\nA-1,"hello, ""world"""\r\nA-2,"line one\nline two"\r\nA-3,\r\n';
  const rows = parseCsvText(text);
  assert.deepEqual(rows, [['invoice_no', 'memo'], ['A-1', 'hello, "world"'], ['A-2', 'line one\nline two'], ['A-3', '']]);
  const t = parseCsv(Buffer.from(text, 'utf8'));
  assert.deepEqual(t.header, ['invoice_no', 'memo']);
  assert.equal(t.rows.length, 3);
});

test('CSV: no trailing newline, LF only, empty lines dropped, unterminated quote rejected', () => {
  assert.deepEqual(parseCsvText('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.equal(parseCsv('a,b\n\n\n1,2\n').rows.length, 1);
  assert.throws(() => parseCsvText('a,b\n"1,2\n'), (e) => e instanceof UploadError && e.code === 'unterminated_quote');
  assert.throws(() => parseCsv(''), (e) => e.code === 'empty');
});

test('caps: size, rows and columns', () => {
  const limits = { maxBytes: 50, maxRows: 3, maxColumns: 4 };
  assert.throws(() => parseCsv('a\n' + '1\n'.repeat(60), limits), (e) => e.code === 'too_large');
  assert.throws(() => parseCsv('a\n1\n2\n3\n4\n', { ...limits, maxBytes: 1000 }), (e) => e.code === 'too_many_rows');
  assert.throws(() => parseCsv('a,b,c,d,e\n1,2,3,4,5\n', { ...limits, maxBytes: 1000 }), (e) => e.code === 'too_many_columns');
  assert.equal(parseCsv('a\n1\n2\n3\n', { ...limits, maxBytes: 1000 }).rows.length, 3, 'exactly at the cap is allowed');
});

test('formula injection: = + - @ tab CR are flagged on import, plain numbers are not', () => {
  for (const v of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tfoo', '\rfoo', '=HYPERLINK("http://x","y")']) assert.equal(isFormulaLike(v), true, JSON.stringify(v));
  for (const v of ['-5', '+3.2', '-0.5e3', 'hello', 'a=b', '', ' =x']) assert.equal(isFormulaLike(v), false, JSON.stringify(v));
  const t = parseCsv('invoice_no,memo\nA-1,=cmd|\' /C calc\'!A0\nA-2,fine\nA-3,"-1+1"\nA-4,-12.50\n');
  assert.deepEqual(t.formulaCells.map((c) => [c.row, c.header]), [[2, 'memo'], [4, 'memo']]);
});

test('formula injection: neutralized on export, and a CSV round trip stays safe', () => {
  assert.equal(neutralizeCell('=1+1'), "'=1+1");
  assert.equal(neutralizeCell('@x'), "'@x");
  assert.equal(neutralizeCell('-5'), '-5');
  assert.equal(neutralizeCell(null), '');
  const csv = toCsv([['a', 'b'], ['=1+1', 'say "hi", ok']]);
  assert.equal(csv, "a,b\r\n'=1+1,\"say \"\"hi\"\", ok\"\r\n");
  assert.equal(parseCsv(csv).formulaCells.length, 0);
});

function xlsxBuffer(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('XLSX: first sheet parsed, header + rows as strings, formula-like text flagged', () => {
  const buf = xlsxBuffer([['invoice_no', 'amount', 'memo'], ['A-1', 12.5, '=evil()'], ['A-2', 7, 'ok']]);
  const t = parseXlsx(buf);
  assert.equal(t.format, 'xlsx');
  assert.deepEqual(t.header, ['invoice_no', 'amount', 'memo']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[0][1], '12.5');
  assert.deepEqual(t.formulaCells.map((c) => [c.row, c.col]), [[2, 2]]);
  assert.throws(() => parseXlsx(buf, { maxBytes: 100, maxRows: 10, maxColumns: 10 }), (e) => e.code === 'too_large');
  assert.throws(() => parseXlsx(xlsxBuffer([['a'], [1], [2], [3]]), { maxBytes: 1e6, maxRows: 2, maxColumns: 10 }), (e) => e.code === 'too_many_rows');
  assert.throws(() => parseXlsx(Buffer.from('not a workbook at all')), (e) => e instanceof UploadError);
});

test('format is chosen by content: xlsx by zip magic, macro and legacy files refused, other extensions refused', () => {
  const buf = xlsxBuffer([['a'], [1]]);
  assert.equal(parseUpload(buf, 'whatever.csv').format, 'xlsx');
  assert.throws(() => parseUpload(buf, 'book.xlsm'), (e) => e.code === 'unsupported_format');
  assert.throws(() => parseUpload(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), 'old.xls'), (e) => e.code === 'unsupported_format');
  assert.throws(() => parseUpload(Buffer.from('a\n1\n'), 'run.exe'), (e) => e.code === 'unsupported_format');
  assert.equal(parseUpload(Buffer.from('a\n1\n'), 'ok.CSV').format, 'csv');
});

test('coercion: number, money, date (US month-first), boolean', () => {
  const v = (type, raw) => { const r = coerce(type, raw); return r.ok ? r.value : `ERR:${r.message}`; };
  assert.equal(v('number', '1,234.5'), 1234.5);
  assert.equal(v('number', '(7)'), -7);
  assert.match(v('number', '12abc'), /^ERR/);
  assert.equal(v('money', '$1,234.567'), 1234.57);
  assert.equal(v('money', '-$5.00'), -5);
  assert.equal(v('money', '(12.50)'), -12.5);
  assert.match(v('money', 'free'), /^ERR/);
  assert.equal(v('date', '2026-03-09'), '2026-03-09');
  assert.equal(v('date', '3/9/2026'), '2026-03-09');
  assert.equal(v('date', '2026-03-09T10:00:00Z'), '2026-03-09');
  assert.match(v('date', '2026-02-30'), /real date/);
  assert.match(v('date', '13/1/2026'), /real date/);
  assert.match(v('date', 'yesterday'), /recognised/);
  assert.equal(v('boolean', 'Yes'), true);
  assert.equal(v('boolean', '0'), false);
  assert.match(v('boolean', 'maybe'), /^ERR/);
});

const CSV = [
  'Invoice #,Date,Total,Qty,Paid,Notes',
  'A-1,3/9/2026,"$1,200.00",2,yes,first',
  'A-2,not-a-date,$50,1,no,bad date',
  ',2026-03-10,$10,1,no,missing required',
  'A-4,2026-03-11,abc,1,no,bad money',
  'A-5,2026-03-12,$75.5,x,no,bad qty',
  'A-6,2026-03-13,$9,3,true,=1+1',
].join('\n');
const MAPPING = { 'Invoice #': 'invoice_no', Date: 'issued', Total: 'amount', Qty: 'qty', Paid: 'paid', Notes: 'memo' };

test('mapping: good rows land, bad rows get per-row errors, nothing is silently dropped', () => {
  const table = parseCsv(CSV);
  const sha = fileSha256(Buffer.from(CSV));
  const r = applyMapping({ table, mapping: MAPPING, fields: FIELDS, targetObject: 'invoices', fileSha256: sha, observedAt: '2026-10-05T00:00:00.000Z' });
  assert.deepEqual(r.mappingErrors, []);
  assert.equal(r.rowsTotal, 6);
  assert.equal(r.rowsAccepted, 2);
  assert.deepEqual(r.errors.map((e) => [e.row, e.field]), [[3, 'issued'], [4, 'invoice_no'], [5, 'amount'], [6, 'qty']]);
  assert.equal(r.records.length + r.errors.length, r.rowsTotal, 'accepted + errored rows account for every row');
  assert.deepEqual(r.records[0].payload, { invoice_no: 'A-1', issued: '2026-03-09', amount: 1200, qty: 2, paid: true, memo: 'first' });
  assert.equal(r.records[0].source_ref, `${sha}:2`);
  assert.equal(r.records[1].source_ref, `${sha}:7`);
  assert.equal(r.records[0].payload_sha256, payloadSha256(r.records[0].payload));
  assert.equal(r.records[0].source_system, 'csv-excel-upload');
  assert.equal(r.records[0].object, 'invoices');
});

test('mapping: formula-like cell is warned by default and rejected when asked', () => {
  const table = parseCsv(CSV);
  const common = { table, mapping: MAPPING, fields: FIELDS, targetObject: 'invoices', fileSha256: 'f'.repeat(64) };
  const warn = applyMapping(common);
  assert.deepEqual(warn.warnings.map((w) => [w.row, w.field]), [[7, 'memo']]);
  assert.ok(warn.records.some((r) => r.source_ref.endsWith(':7')));
  const strict = applyMapping({ ...common, rejectFormulas: true });
  assert.ok(!strict.records.some((r) => r.source_ref.endsWith(':7')));
  assert.ok(strict.errors.some((e) => e.row === 7 && /formula/.test(e.message)));
});

test('mapping: required field unmapped, unknown field, duplicate target and missing header are mapping errors', () => {
  const table = parseCsv(CSV);
  const base = { table, fields: FIELDS, targetObject: 'invoices', fileSha256: 'a' };
  assert.ok(applyMapping({ ...base, mapping: { Date: 'issued', Total: 'amount' } }).mappingErrors.some((e) => /required field "invoice_no"/.test(e)));
  assert.ok(applyMapping({ ...base, mapping: { ...MAPPING, Notes: 'nope' } }).mappingErrors.some((e) => /unknown field/.test(e)));
  assert.ok(applyMapping({ ...base, mapping: { ...MAPPING, Notes: 'qty' } }).mappingErrors.some((e) => /more than one column/.test(e)));
  assert.ok(applyMapping({ ...base, mapping: { ...MAPPING, Ghost: 'memo' } }).mappingErrors.some((e) => /not in the file/.test(e)));
  assert.equal(applyMapping({ ...base, mapping: { Date: 'issued' } }).records.length, 0);
});

test('mapping: preview is the first 20 mapped rows and the same file maps to the same refs every time', () => {
  const lines = ['id,when,amt'];
  for (let i = 1; i <= 50; i++) lines.push(`R${i},2026-01-01,${i}`);
  const csv = lines.join('\n');
  const input = { table: parseCsv(csv), mapping: { id: 'invoice_no', when: 'issued', amt: 'amount' }, fields: FIELDS, targetObject: 'invoices', fileSha256: fileSha256(csv), observedAt: 'x' };
  const a = applyMapping(input);
  const b = applyMapping(input);
  assert.equal(a.preview.length, 20);
  assert.equal(a.records.length, 50);
  assert.deepEqual(a.records.map((r) => [r.source_ref, r.payload_sha256]), b.records.map((r) => [r.source_ref, r.payload_sha256]));
  assert.equal(new Set(a.records.map((r) => r.source_ref)).size, 50);
});

test('suggestMapping matches headers to fields ignoring case and punctuation', () => {
  assert.deepEqual(suggestMapping(['Invoice No', 'ISSUED', 'Amount ($)', 'Other'], FIELDS), { 'Invoice No': 'invoice_no', ISSUED: 'issued', 'Amount ($)': 'amount' });
});
