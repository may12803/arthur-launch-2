import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { parseXlsx, parseUpload, UploadError } from '../upload/parse.ts';
import { assertSafeZip, DEFAULT_ZIP_LIMITS, ZipBombError } from '../upload/zip-guard.ts';
import { applyMapping } from '../upload/map.ts';

/** Minimal ZIP writer. `declared` lets a fixture lie about sizes, `forceZip64` writes the 0xFFFF/0xFFFFFFFF markers. */
function zip(entries, { forceZip64 = false, zip64Entry = false } = {}) {
  const locals = [];
  const cds = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const raw = e.data;
    const comp = e.stored ? raw : deflateRawSync(raw, { level: 9 });
    const usize = e.declaredUsize ?? raw.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(e.stored ? 0 : 8, 8);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(usize, 22);
    lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name, comp]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(e.stored ? 0 : 8, 10);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(forceZip64 || zip64Entry ? 0xffffffff : usize, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    cds.push(Buffer.concat([ch, name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(cds);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(forceZip64 ? 0xffff : entries.length, 8);
  end.writeUInt16LE(forceZip64 ? 0xffff : entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const zeros = (mb) => Buffer.alloc(mb * 1024 * 1024);
const NO_RATIO = { ...DEFAULT_ZIP_LIMITS, maxRatio: 1e12 };
const code = (re) => (e) => e instanceof UploadError && e.code === 'bad_workbook' && re.test(e.message);

function xlsxBuffer(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('zip bomb: a deflated 60 MB entry is rejected before XLSX.read is ever called', () => {
  const bomb = zip([{ name: 'xl/worksheets/sheet1.xml', data: zeros(60) }]);
  assert.ok(bomb.length < 200 * 1024, `fixture is small on the wire (${bomb.length} bytes)`);
  let reads = 0;
  const spy = (...a) => {
    reads++;
    return XLSX.read(...a);
  };
  assert.throws(() => parseXlsx(bomb, undefined, undefined, { read: spy }), code(/larger than the allowed size/));
  assert.equal(reads, 0);
  assert.throws(() => parseUpload(bomb, 'bomb.xlsx'), code(/larger than the allowed size/));
});

test('zip bomb: total unpacked size over 100 MB, entry count over 2000, ratio over 200:1, zip64 markers', () => {
  assert.throws(() => assertSafeZip(zip([1, 2, 3].map((i) => ({ name: `a${i}`, data: zeros(40) }))), NO_RATIO), /unpacked/);
  const many = zip(Array.from({ length: 2001 }, (_, i) => ({ name: `f${i}`, data: Buffer.from('x'), stored: true })));
  assert.throws(() => assertSafeZip(many), /more than 2000 entries/);
  assertSafeZip(zip(Array.from({ length: 2000 }, (_, i) => ({ name: `f${i}`, data: Buffer.from('x'), stored: true }))));
  assert.throws(() => assertSafeZip(zip([{ name: 'big', data: zeros(10) }])), /compression ratio/);
  assert.throws(() => assertSafeZip(zip([{ name: 'a', data: Buffer.from('hello'), stored: true }], { forceZip64: true })), /zip64/);
  const huge = { ...NO_RATIO, maxEntryBytes: 2 ** 40, maxTotalBytes: 2 ** 41 };
  assert.throws(() => assertSafeZip(zip([{ name: 'a', data: Buffer.from('hello'), stored: true }], { zip64Entry: true }), huge), /zip64 entry sizes/);
});

test('zip bomb: a central directory that understates the real size is caught by the capped inflate', () => {
  const liar = zip([{ name: 'xl/sheet.xml', data: zeros(5), declaredUsize: 1000 }]);
  assert.throws(() => assertSafeZip(liar, NO_RATIO), ZipBombError);
});

test('zip: normal workbooks pass the guard and still parse; sheetRows bounds what XLSX reads', () => {
  const buf = xlsxBuffer([['invoice_no', 'amount'], ['A-1', 12.5], ['A-2', 7]]);
  assertSafeZip(buf);
  let opts;
  const t = parseXlsx(buf, undefined, undefined, { read: (d, o) => ((opts = o), XLSX.read(d, o)) });
  assert.deepEqual(t.header, ['invoice_no', 'amount']);
  assert.equal(t.rows.length, 2);
  assert.equal(opts.sheetRows, 200000 + 2);
  const small = { maxBytes: 1e6, maxRows: 2, maxColumns: 10 };
  const big = xlsxBuffer([['a'], [1], [2], [3], [4], [5]]);
  let seen;
  assert.throws(() => parseXlsx(big, small, undefined, { read: (d, o) => ((seen = o), XLSX.read(d, o)) }), (e) => e.code === 'too_many_rows');
  assert.equal(seen.sheetRows, 4);
});

test('F-03: formula-like mapped cells are row errors that name the column when rejectFormulas is on', () => {
  const csv = Buffer.from('invoice_no,memo\nA-1,fine\nA-2,"=HYPERLINK(""http://evil"",""x"")"\nA-3,@cmd\n');
  const table = parseUpload(csv, 'x.csv');
  const fields = [{ name: 'invoice_no', type: 'string', required: true }, { name: 'memo', type: 'string' }];
  const r = applyMapping({ table, mapping: { invoice_no: 'invoice_no', memo: 'memo' }, fields, targetObject: 'invoices', fileSha256: 'f', rejectFormulas: true });
  assert.deepEqual(r.errors.map((e) => [e.row, e.field]), [[3, 'memo'], [4, 'memo']]);
  assert.match(r.errors[0].message, /formula/);
  assert.equal(r.records.length, 1);
  assert.equal(JSON.stringify(r.records).includes('HYPERLINK'), false);
});
