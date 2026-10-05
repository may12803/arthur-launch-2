import test from 'node:test';
import assert from 'node:assert/strict';
import { heuristicMapping, suggestMapping, normalizeUserMapping, llmMapping } from '../mapper.ts';
import { parseMoney, parseDate } from '../values.ts';
import { runSnapshot } from '../run.ts';
import { buildBrief } from '../brief.ts';
import { computeCoverage } from '../coverage.ts';
import { marketExposure, buildMarket, resetMarketCache } from '../market.ts';
import { sampleCsv, SAMPLE_COLUMNS } from '../sample.ts';
import { parseCsv } from '../../connectors/upload/parse.ts';
import { startRun, viewRun, rowsPage, exportCsv, rerun, ApiError } from '../service.ts';
import { MemoryStore, newRunId, validRunId } from '../store.ts';
import { SlidingWindow, withRunSlot } from '../limits.ts';

const col = (m, f) => m[f]?.column;

test('values: money, dates, junk', () => {
  assert.equal(parseMoney('$1,234.50'), 1234.5);
  assert.equal(parseMoney('(12.5)'), -12.5);
  assert.equal(parseMoney('12abc'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseDate('2024-03-05'), '2024-03-05');
  assert.equal(parseDate('3/5/2024'), '2024-03-05');
  assert.equal(parseDate('25/12/2023'), '2023-12-25');
  assert.equal(parseDate('Jan 5, 2024'), '2024-01-05');
  assert.equal(parseDate('20240105'), '2024-01-05');
  assert.equal(parseDate('45000'), '2023-03-15');
  assert.equal(parseDate('13/45/2024'), null);
  assert.equal(parseDate('hello'), null);
});

test('mapper: messy ERP headers map by synonym and value shape', () => {
  const header = ['Part No.', 'Descr', 'Cust Name', 'Sell Price', 'Cost Price', 'Last Sold', 'QOH', 'Eff Date', 'Notes'];
  const rows = [
    ['A1', 'Widget', 'Acme Inc', '$10.00', '$6.00', '3/5/2024', '12', '1/1/2023', 'x'],
    ['A2', 'Gadget', 'Beta LLC', '$20.00', '$9.00', '4/9/2025', '0', '2/1/2024', 'y'],
    ['A3', 'Bolt', 'Gamma Co', '$2.00', '$1.10', '', '5', '5/1/2022', 'z'],
  ];
  const m = heuristicMapping(header, rows);
  assert.equal(col(m, 'item'), 'Part No.');
  assert.equal(col(m, 'price'), 'Sell Price');
  assert.equal(col(m, 'cost'), 'Cost Price', 'a header containing "cost" is cost, never price');
  assert.equal(col(m, 'customer'), 'Cust Name');
  assert.equal(col(m, 'last_sale_date'), 'Last Sold');
  assert.equal(col(m, 'on_hand'), 'QOH');
  assert.equal(col(m, 'price_date'), 'Eff Date');
  assert.equal(m.item.source, 'header');
  assert.ok(m.item.confidence > 0 && m.item.confidence <= 1);
});

test('mapper: a header the values contradict is not trusted', () => {
  const header = ['Item', 'Price'];
  const rows = [['A', 'call for quote'], ['B', 'TBD'], ['C', 'n/a']];
  assert.equal(heuristicMapping(header, rows).price, undefined);
});

test('mapper: shape alone finds postal codes and status columns', () => {
  const header = ['Item', 'Price', 'Z', 'Flag'];
  const rows = [['A', '1', '49001', 'Active'], ['B', '2', '49002', 'Inactive'], ['C', '3', '49003', 'Active'], ['D', '4', '49004', 'Active']];
  const m = heuristicMapping(header, rows);
  assert.equal(col(m, 'zip'), 'Z');
  assert.equal(col(m, 'customer_status'), 'Flag');
  assert.equal(m.zip.source, 'shape');
});

function fakeLlm(content, status = 200) {
  return async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

test('mapper: LLM fills unmapped columns, is validated against the data, and never overrides the heuristic', async () => {
  const header = ['Artikel', 'Preis', 'Customer'];
  const rows = [['A', '10.5', 'Acme'], ['B', '11', 'Beta'], ['C', '12', 'Gamma']];
  const reply = JSON.stringify({ mappings: [
    { column: 'Artikel', field: 'item', confidence: 0.9 },
    { column: 'Preis', field: 'price', confidence: 0.9 },
    { column: 'Customer', field: 'cost', confidence: 0.9 },
    { column: 'Invented', field: 'category', confidence: 0.9 },
  ] });
  const s = await suggestMapping(header, rows, { apiKey: 'k', fetch: fakeLlm(`Here you go: ${reply}`) });
  assert.equal(s.llm.used, true);
  assert.equal(col(s.mapping, 'item'), 'Artikel');
  assert.equal(s.mapping.item.source, 'llm');
  assert.ok(s.mapping.item.confidence <= 0.85);
  assert.equal(col(s.mapping, 'price'), 'Preis');
  assert.equal(col(s.mapping, 'customer'), 'Customer', 'heuristic result kept');
  assert.equal(s.mapping.cost, undefined, 'text values cannot be a cost');
  assert.deepEqual(s.missing_required, []);
});

test('mapper: empty LLM content is a failure, heuristic result stands', async () => {
  const header = ['Artikel', 'Preis'];
  const rows = [['A', '10'], ['B', '11']];
  const s = await suggestMapping(header, rows, { apiKey: 'k', fetch: fakeLlm('   ') });
  assert.equal(s.llm.used, false);
  assert.match(s.llm.error, /empty/);
  assert.deepEqual(s.missing_required.sort(), ['item', 'price']);
  await assert.rejects(() => llmMapping(header, rows, {}, { apiKey: 'k', fetch: fakeLlm('') }), /empty/);
});

test('mapper: LLM request asks for at least 400 tokens and sends only unmapped columns', async () => {
  let body;
  const f = async (_u, init) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: '{"mappings":[]}' } }] })); };
  await suggestMapping(['Item', 'Price', 'Weird'], [['A', '1', 'q'], ['B', '2', 'r']], { apiKey: 'k', fetch: f });
  assert.ok(body.max_tokens >= 400);
  assert.equal(body.model, 'gpt-oss-120b');
  assert.ok(!body.messages[0].content.includes('"column":"Item"'));
  assert.ok(body.messages[0].content.includes('Weird'));
});

test('mapper: no key and LLM HTTP error both degrade to heuristics', async () => {
  const noKey = await suggestMapping(['Zzz', 'Item', 'Price'], [['q', 'A', '1']]);
  assert.equal(noKey.llm.used, false);
  assert.deepEqual(noKey.missing_required, []);
  const down = await suggestMapping(['Zzz', 'Item', 'Price'], [['q', 'A', '1']], { apiKey: 'k', fetch: fakeLlm('', 503) });
  assert.match(down.llm.error, /503/);
  assert.equal(col(down.mapping, 'price'), 'Price');
});

test('mapper: user mapping is validated', () => {
  const header = ['A', 'B'];
  assert.deepEqual(normalizeUserMapping({ item: 'A', price: 'B' }, header).errors, []);
  assert.match(normalizeUserMapping({ item: 'A' }, header).errors.join(), /Price must be mapped/);
  assert.match(normalizeUserMapping({ item: 'A', price: 'A' }, header).errors.join(), /two fields/);
  assert.match(normalizeUserMapping({ item: 'A', price: 'ZZ' }, header).errors.join(), /not in the file/);
  assert.match(normalizeUserMapping({ item: 'A', price: 'B', bogus: 'A' }, header).errors.join(), /unknown field/);
});

// ---- the pipeline on the synthetic sample ------------------------------------------------------------------------

const sample = await sampleCsv();
const parsedSample = parseCsv(sample.text);
const header = parsedSample.header;
const body = parsedSample.rows;
const sug = await suggestMapping(header, body);
const result = runSnapshot({ header, rows: body, mapping: sug.mapping, asOf: sample.asOf, source: 'sample', label: 'synthetic sample' });
const find = (id) => result.findings.find((f) => f.rule === id);

test('sample: every sample header maps without an LLM', () => {
  assert.deepEqual(header, SAMPLE_COLUMNS);
  assert.deepEqual(sug.unmapped_columns, []);
  assert.deepEqual(sug.missing_required, []);
});

test('sample: seeded problems are found exactly, and the figures have source rows', () => {
  assert.equal(find('below_cost').count, 25);
  assert.equal(find('stale_price').count, 40);
  assert.equal(find('duplicate_customer').count, 5);
  assert.equal(find('inactive_customer_prices').count, 72);
  const bc = find('below_cost');
  assert.equal(bc.exposure.kind, 'loss');
  assert.ok(bc.exposure.amount > 0);
  assert.equal(bc.exposure.inputRowIds.length, 25);
  assert.equal(bc.rows_total, bc.rows.length);
  const sum = bc.rows.reduce((a, r) => a + r.exposure, 0);
  assert.ok(Math.abs(sum - bc.exposure.amount) < 0.011, 'the total is the sum of the rows shown');
  for (const r of bc.rows) assert.match(r.id, /^r\d+$/);
  assert.equal(result.source, 'sample');
  assert.equal(result.label, 'synthetic sample');
});

test('sample: cost_lag is skipped with its reason, not guessed', () => {
  assert.ok(result.skipped.some((s) => s.rule === 'cost_lag' && /cost change history/.test(s.reason)));
  assert.equal(find('cost_lag'), undefined);
});

test('no units column: below-cost is exposure per unit, never a loss figure', () => {
  const idx = header.indexOf('Units Sold 12M');
  const h2 = header.filter((_, i) => i !== idx);
  const b2 = body.map((r) => r.filter((_, i) => i !== idx));
  const m2 = Object.fromEntries(Object.entries(sug.mapping).filter(([k]) => k !== 'units_12m'));
  const r2 = runSnapshot({ header: h2, rows: b2, mapping: m2, asOf: sample.asOf, source: 'upload' });
  const bc = r2.findings.find((f) => f.rule === 'below_cost');
  assert.equal(bc.exposure.kind, 'exposure');
  assert.equal(bc.exposure.amount, null);
  assert.equal(r2.quantified_loss, 0);
  assert.ok(r2.notes.some((n) => /per-unit exposure, not loss/.test(n)));
});

test('minimal file: only item, customer, price, cost runs what it can and names what it cannot', () => {
  const h = ['SKU', 'Customer', 'Price', 'Cost'];
  const rows = [['A', 'Acme Inc', '5', '8'], ['A', 'ACME, Inc.', '9', '8'], ['B', 'Beta', '3', ''], ['', 'x', '1', '1'], ['C', 'Beta', 'oops', '1']];
  const m = heuristicMapping(h, rows);
  const r = runSnapshot({ header: h, rows, mapping: m, asOf: '2026-09-30', source: 'upload' });
  assert.equal(r.rows_total, 5);
  assert.equal(r.rows_used, 3);
  assert.equal(r.row_issues.total, 2);
  assert.deepEqual(r.row_issues.first.map((i) => i.row), [5, 6]);
  assert.equal(r.findings.find((f) => f.rule === 'below_cost').count, 1);
  assert.equal(r.findings.find((f) => f.rule === 'duplicate_customer').count, 1);
  const skipped = r.skipped.map((s) => s.rule).sort();
  assert.deepEqual(skipped, ['cost_lag', 'dead_sku', 'inactive_customer_prices', 'stale_price']);
  assert.ok(r.coverage.blocked.some((b) => b.id === 'stale_price'));
  assert.ok(r.columns_missing.some((c) => c.field === 'on_hand'));
});

test('dead sku only judges items whose on-hand was actually read', () => {
  const h = ['SKU', 'Price', 'On Hand', 'Last Sale'];
  const rows = [['A', '5', '', '2020-01-01'], ['B', '5', '0', '2020-01-01'], ['C', '5', '3', '2020-01-01'], ['D', '5', '0', '2026-09-01']];
  const r = runSnapshot({ header: h, rows, mapping: heuristicMapping(h, rows), asOf: '2026-09-30', source: 'upload' });
  const d = r.findings.find((f) => f.rule === 'dead_sku');
  assert.deepEqual(d.rows.map((x) => x.id), ['B']);
  assert.equal(d.population, 3);
});

test('brief: every number in the brief comes from the result', () => {
  const b = buildBrief(result);
  assert.equal(b.generated_by, 'template');
  const text = (b.paragraphs.join(' ') + b.headline).replace(/\d{4}-\d{2}-\d{2}/g, '');
  assert.ok(text.includes(`${result.score.score} out of 100`));
  assert.ok(text.includes('synthetic sample'));
  const loss = find('below_cost').exposure.amount;
  assert.ok(text.includes('$' + Math.round(loss).toLocaleString('en-US')));
  for (const f of b.figures) assert.ok(f.rows >= 0);
  const numbers = [...text.matchAll(/\$?\d[\d,]*/g)].map((m) => m[0].replace(/[$,]/g, ''));
  const allowed = new Set();
  const collect = (v) => { if (typeof v === 'number') { allowed.add(String(v)); allowed.add(String(Math.round(v))); } else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
  collect({ ...result, findings: result.findings.map((f) => ({ ...f, rows: [] })) });
  allowed.add(String(result.coverage.unlocked.length)); allowed.add(String(result.coverage.unlocked.length + result.coverage.blocked.length));
  allowed.add('100'); allowed.add('36'); // "out of 100" and the engine's 36-month window in rule titles
  allowed.add(String(result.findings.length + result.skipped.length));
  allowed.add(String(result.findings.reduce((a, f) => a + f.count, 0)));
  allowed.add(String(result.findings.filter((f) => f.count > 0).length));
  for (const n of numbers) assert.ok(allowed.has(n) || allowed.has(String(Number(n))), `unsourced number in brief: ${n}`);
});

test('coverage: names only connectors that can be connected today', () => {
  const catalog = [
    { key: 'erp-live', name: 'Live ERP', category: 'erp', live: true },
    { key: 'erp-gated', name: 'Gated ERP', category: 'erp', live: false },
    { key: 'crm-live', name: 'Live CRM', category: 'crm', live: true },
  ];
  const c = computeCoverage(new Set(['item', 'price']), catalog);
  const below = c.blocked.find((b) => b.id === 'below_cost');
  assert.deepEqual(below.connectors.map((x) => x.key), ['erp-live']);
  assert.match(below.how, /Live ERP/);
  assert.ok(!JSON.stringify(c).includes('Gated ERP'));
  assert.ok(c.score < 100);
  assert.equal(computeCoverage(new Set(['item', 'price', 'cost']), []).blocked.find((b) => b.id === 'below_cost'), undefined);
});

const feed = {
  generated_at: '2026-10-05T00:00:00Z',
  series: [
    { id: 'copper', title: 'Copper price', units: 'USD/lb', frequency: 'monthly', category: 'metals', source: 'FRED', latest: { date: '2026-09-01', value: 4.5 }, prior_year: { date: '2025-09-01', value: 4 }, yoy_pct: 12.5, mom_pct: 1 },
    { id: 'diesel', title: 'On-highway diesel', units: 'USD/gal', frequency: 'weekly', category: 'energy', source: 'EIA', latest: { date: '2026-09-28', value: 3.9 }, prior_year: null, yoy_pct: null, mom_pct: -2 },
    { id: 'ppi', title: 'Producer Price Index', units: 'index', frequency: 'monthly', category: 'prices', source: 'BLS', latest: { date: '2026-08-01', value: 250 }, prior_year: null, yoy_pct: 2, mom_pct: 0.1 },
  ],
};

test('market: categories map to index movement and are labelled as such', () => {
  const m = marketExposure(feed, [{ name: 'Copper Wire', rows: 40 }, { name: 'Freight', rows: 5 }, { name: 'Gifts', rows: 2 }]);
  assert.deepEqual(m.lines.map((l) => l.index.id), ['copper', 'diesel']);
  assert.ok(m.lines.every((l) => l.label === 'index movement, not your cost'));
  assert.equal(m.lines[0].index.yoy_pct, 12.5);
  assert.ok(m.context.some((c) => c.id === 'ppi'));
});

test('market: feed down or no cost column degrades without throwing', async () => {
  resetMarketCache();
  const down = await buildMarket(true, [{ name: 'Copper', rows: 1 }], {}, async () => new Response('x', { status: 404 }));
  assert.equal(down.status, 'unavailable');
  assert.match(down.reason, /404/);
  assert.equal((await buildMarket(false, [], {}, async () => { throw new Error('should not be called'); })).status, 'not_applicable');
  resetMarketCache();
  const bad = await buildMarket(true, [], {}, async () => new Response(JSON.stringify({ nope: 1 })));
  assert.equal(bad.status, 'unavailable');
  resetMarketCache();
  const ok = await buildMarket(true, [{ name: 'Copper', rows: 1 }], {}, async () => new Response(JSON.stringify(feed)));
  assert.equal(ok.status, 'ok');
  resetMarketCache();
});

// ---- API service -------------------------------------------------------------------------------------------------

const mkDeps = (extra = {}) => ({ store: new MemoryStore(), catalog: () => [], fetch: async () => new Response('x', { status: 503 }), env: {}, ...extra });

test('api: upload returns a mapping to confirm, then runs only on confirmation', async () => {
  resetMarketCache();
  const deps = mkDeps();
  const pre = await startRun(deps, { data: Buffer.from(sample.text), filename: sample.filename, source: 'sample', asOf: undefined });
  assert.equal(pre.status, 'mapping');
  assert.ok(validRunId(pre.id));
  assert.equal(pre.preview_rows.length, 5);
  assert.equal(pre.mapping.price.column, 'Unit Price');
  assert.equal((await viewRun(deps, pre.id)).status, 'mapping');
  const confirm = Object.fromEntries(Object.entries(pre.mapping).map(([f, m]) => [f, m.column]));
  const done = await rerun(deps, pre.id, confirm);
  assert.equal(done.status, 'done');
  const v = await viewRun(deps, pre.id);
  assert.equal(v.status, 'done');
  assert.equal(v.result.findings.find((f) => f.rule === 'below_cost').count, 25);
  assert.ok(v.result.findings.every((f) => f.rows.length <= 100));
  assert.equal(v.market.status, 'unavailable');
  assert.equal(v.brief.generated_by, 'template');
  assert.match(v.retention, /7 days/);
  const stored = deps.store.rows.get(pre.id);
  assert.equal(new Date(stored.expires_at) - new Date(stored.created_at), 7 * 86400000);
  assert.equal(stored.result.as_of, '2026-09-30');
});

test('api: upload with a mapping runs immediately and result rows page and export', async () => {
  const deps = mkDeps();
  const mapping = Object.fromEntries(Object.entries(sug.mapping).map(([f, m]) => [f, m.column]));
  const out = await startRun(deps, { data: Buffer.from(sample.text), filename: 'x.csv', source: 'upload', asOf: '2026-09-30', mapping });
  assert.equal(out.status, 'done');
  const page = await rowsPage(deps, out.id, 'below_cost', 10, 5);
  assert.equal(page.rows.length, 5);
  assert.equal(page.rows_total, 25);
  const { csv } = await exportCsv(deps, out.id, 'below_cost');
  assert.equal(csv.trim().split('\n').length, 26);
  assert.match(csv.split('\n')[0], /row_in_your_file/);
  await assert.rejects(() => rowsPage(deps, out.id, 'nope', 0, 5), ApiError);
});

test('api: csv export neutralizes spreadsheet formulas from user data', async () => {
  const deps = mkDeps();
  const csv = 'Item,Price,Cost,Description\n"=HYPERLINK(""http://x"")",1,5,"=cmd"\nB,9,5,ok\n';
  const out = await startRun(deps, { data: Buffer.from(csv), filename: 'f.csv', source: 'upload', asOf: '2026-09-30', mapping: { item: 'Item', price: 'Price', cost: 'Cost', description: 'Description' } });
  const { csv: exported } = await exportCsv(deps, out.id);
  assert.ok(!/(^|,)"?=/m.test(exported), 'no cell starts with =');
  assert.ok(exported.includes("'=HYPERLINK"));
});

test('api: refusals are clear and typed', async () => {
  const deps = mkDeps();
  await assert.rejects(() => startRun(deps, { data: Buffer.from('MZ\x90\x00binary'), filename: 'a.exe', source: 'upload' }), (e) => e.status === 422);
  await assert.rejects(() => startRun(deps, { data: Buffer.alloc(11 * 1024 * 1024, 'a'), filename: 'a.csv', source: 'upload' }), (e) => e.status === 413);
  await assert.rejects(() => startRun(deps, { data: Buffer.from('Item,Price\nA,1\n'), filename: 'a.csv', source: 'upload', asOf: 'yesterday' }), (e) => e.status === 400);
  await assert.rejects(() => startRun(deps, { data: Buffer.from('Item,Price\nA,1\n'), filename: 'a.csv', source: 'upload', mapping: { item: 'Item' } }), (e) => e.status === 422 && /Price must be mapped/.test(e.message));
  await assert.rejects(() => viewRun(deps, newRunId()), (e) => e.status === 404);
});

test('api: expired runs read as not found and are purged with their files', async () => {
  let now = new Date('2026-10-05T12:00:00Z');
  const deps = mkDeps({ now: () => now });
  const out = await startRun(deps, { data: Buffer.from('Item,Price\nA,1\n'), filename: 'a.csv', source: 'upload', mapping: { item: 'Item', price: 'Price' } });
  assert.equal((await viewRun(deps, out.id)).status, 'done');
  now = new Date('2026-10-12T12:00:01Z');
  await assert.rejects(() => viewRun(deps, out.id), (e) => e.status === 404);
  assert.equal(deps.store.files.size, 1);
  assert.equal(await deps.store.purgeExpired(now), 1);
  assert.equal(deps.store.rows.size, 0);
  assert.equal(deps.store.files.size, 0);
});

test('limits: sliding window and run slots', async () => {
  let t = 0;
  const w = new SlidingWindow(2, 1000, () => t);
  assert.ok(w.take('a').ok && w.take('a').ok);
  const blocked = w.take('a');
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.ok(w.take('b').ok, 'another IP is unaffected');
  t = 1500;
  assert.ok(w.take('a').ok);
  let release;
  const gate = new Promise((r) => { release = r; });
  const first = withRunSlot(() => gate, 1);
  assert.equal(await withRunSlot(async () => 1, 1), 'busy');
  release();
  await first;
  assert.equal(await withRunSlot(async () => 1, 1), 1);
});
