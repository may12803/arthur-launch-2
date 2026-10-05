import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, CLEAN_COUNTS, AS_OF } from '../../../scripts/gen-synthetic-pricing.mjs';
import { analyze, addMonths, normalizeName, normalizeAddress, scoreFindings, SCORE_WEIGHTS } from '../rules.ts';
import { renderReport } from '../report.ts';
import { tablesFromCsv, toCsv, parseCsv, TABLE_COLUMNS } from '../csv.ts';

const seeded = generate();
const seededResult = analyze(seeded.tables, { asOf: AS_OF });
const byRule = (r, id) => r.findings.find((f) => f.rule === id);
const ids = (f) => f.rows.map((r) => r.id).sort();

test('seeded dataset has the advertised shape', () => {
  const t = seeded.tables;
  assert.equal(t.customers.length, 400);
  assert.equal(t.products.length, 1500);
  assert.equal(t.prices.length, 25000);
  assert.ok(t.sales.length > 40000);
});

for (const [rule, count] of [
  ['dead_sku', 60], ['stale_price', 150], ['below_cost', 60], ['inactive_customer_prices', 800], ['duplicate_customer', 12],
]) {
  test(`${rule} finds exactly the ${count} seeded`, () => {
    const f = byRule(seededResult, rule);
    assert.equal(f.count, count);
    assert.deepEqual(rule === 'duplicate_customer' ? f.rows.map((r) => r.member_ids.slice().sort()).sort() : ids(f),
      rule === 'duplicate_customer' ? seeded.manifest.expected.duplicate_customer.sort() : seeded.manifest.expected[rule]);
  });
}

test('cost_lag finds exactly the seeded lag records (all records of the lagged SKUs)', () => {
  const f = byRule(seededResult, 'cost_lag');
  assert.deepEqual(ids(f), seeded.manifest.expected.cost_lag);
  assert.equal(f.count, seeded.manifest.expected.cost_lag.length);
  assert.ok(f.count >= 12 * 20 && f.count <= 12 * 30);
});

test('no rule reports anything beyond the seeded problems (zero false positives)', () => {
  assert.equal(seededResult.findings.length, 6);
  assert.equal(seededResult.skipped.length, 0);
});

test('every dollar figure reconciles to its rows and carries a formula', () => {
  for (const f of seededResult.findings) {
    assert.ok(f.exposure.formula.length > 0 && f.exposure.basis.length > 0);
    assert.ok(f.exposure.inputRowIds.length > 0);
    if (f.exposure.amount === null) { assert.equal(f.exposure.kind, 'none'); continue; }
    const sum = f.rows.reduce((a, r) => a + r.exposure, 0);
    assert.ok(Math.abs(sum - f.exposure.amount) < 0.011 * f.rows.length, `${f.rule}: row sum ${sum} vs ${f.exposure.amount}`);
  }
  const below = byRule(seededResult, 'below_cost');
  for (const r of below.rows) assert.equal(r.exposure, Math.round(r.gap_per_unit * r.units_t12m * 100) / 100);
  assert.ok(below.exposure.amount > 0);
  assert.equal(seededResult.quantifiedExposure, Math.round((below.exposure.amount + byRule(seededResult, 'cost_lag').exposure.amount) * 100) / 100);
});

test('a clean dataset yields zero findings and a perfect score', () => {
  const clean = generate({ counts: CLEAN_COUNTS });
  const r = analyze(clean.tables, { asOf: AS_OF });
  assert.equal(r.tableSizes.prices, 25000);
  for (const f of r.findings) assert.equal(f.count, 0, `${f.rule} should be 0 on clean data`);
  assert.equal(r.skipped.length, 0);
  assert.equal(r.score.score, 100);
  assert.equal(r.quantifiedExposure, 0);
});

test('clean data stays clean across several seeds', () => {
  for (const seed of [1, 2, 3]) {
    const r = analyze(generate({ seed, counts: { ...CLEAN_COUNTS, prices: 4000, customers: 100, skus: 400 } }).tables, { asOf: AS_OF });
    assert.deepEqual(r.findings.map((f) => f.count), [0, 0, 0, 0, 0, 0], `seed ${seed}`);
  }
});

test('the generator is deterministic for a seed', () => {
  assert.deepEqual(generate({ seed: 7, counts: { prices: 2000, customers: 60, skus: 200 } }).manifest, generate({ seed: 7, counts: { prices: 2000, customers: 60, skus: 200 } }).manifest);
});

// ---- hand-built edge cases ----
const base = () => ({
  customers: [{ customer_id: 'C1', name: 'Acme Supply Co.', address: '1 Main Street', city: 'X', state: 'MI', zip: '49001', status: 'active' }],
  products: [{ sku: 'A', description: 'a', category: 'c', uom: 'EA' }],
  costs: [{ sku: 'A', effective_date: '2020-01-01', cost: 10 }],
  inventory: [{ sku: 'A', on_hand: 5, as_of: '2026-09-30' }],
  prices: [{ price_id: 'P1', customer_id: 'C1', sku: 'A', price: 15, effective_date: '2026-01-01' }],
  sales: [{ sale_id: 'S1', sale_date: '2026-08-01', customer_id: 'C1', sku: 'A', qty: 2, unit_price: 15 }],
});
const run = (t) => analyze(t, { asOf: '2026-09-30' });

test('below_cost: exposure is (cost - price) x trailing-12-month units, hand computed', () => {
  const t = base();
  t.prices[0].price = 8;
  t.sales = [
    { sale_id: 'S1', sale_date: '2026-08-01', customer_id: 'C1', sku: 'A', qty: 3, unit_price: 8 },
    { sale_id: 'S2', sale_date: '2025-01-01', customer_id: 'C1', sku: 'A', qty: 100, unit_price: 8 }, // outside the window
  ];
  const f = byRule(run(t), 'below_cost');
  assert.equal(f.count, 1);
  assert.equal(f.exposure.amount, 6); // (10 - 8) x 3
  assert.deepEqual(f.rows[0].sale_ids, ['S1']);
  assert.equal(byRule(run(base()), 'below_cost').count, 0);
});

test('below_cost: price equal to cost is not flagged', () => {
  const t = base(); t.prices[0].price = 10;
  assert.equal(byRule(run(t), 'below_cost').count, 0);
});

test('cost_lag: 5% threshold is inclusive, and exposure follows sales after the increase', () => {
  const t = base();
  t.costs.push({ sku: 'A', effective_date: '2026-03-01', cost: 10.5 });
  t.sales = [
    { sale_id: 'S0', sale_date: '2026-02-01', customer_id: 'C1', sku: 'A', qty: 50, unit_price: 15 },
    { sale_id: 'S1', sale_date: '2026-05-01', customer_id: 'C1', sku: 'A', qty: 4, unit_price: 15 },
  ];
  const f = byRule(run(t), 'cost_lag');
  assert.equal(f.count, 1);
  assert.equal(f.exposure.amount, 2); // (10.5 - 10) x 4, the pre-increase sale does not count
  t.costs[1].cost = 10.49;
  assert.equal(byRule(run(t), 'cost_lag').count, 0);
});

test('cost_lag: a price set after the increase is not lagging', () => {
  const t = base();
  t.costs.push({ sku: 'A', effective_date: '2025-06-01', cost: 12 });
  assert.equal(byRule(run(t), 'cost_lag').count, 0);
});

test('stale_price: needs both an old price date and no sale in 36 months', () => {
  const t = base();
  t.prices[0].effective_date = '2022-01-01';
  t.sales = [];
  t.sales.push({ sale_id: 'S9', sale_date: '2022-06-01', customer_id: 'C2', sku: 'A', qty: 1, unit_price: 15 });
  assert.equal(byRule(run(t), 'stale_price').count, 1);
  t.sales.push({ sale_id: 'S8', sale_date: '2025-01-01', customer_id: 'C1', sku: 'A', qty: 1, unit_price: 15 });
  assert.equal(byRule(run(t), 'stale_price').count, 0);
});

test('dead_sku: stock on hand keeps a SKU out (dead stock is a different problem)', () => {
  const t = base(); t.sales = []; t.prices = [];
  t.sales.push({ sale_id: 'S9', sale_date: '2021-01-01', customer_id: 'C1', sku: 'A', qty: 1, unit_price: 15 });
  assert.equal(byRule(run(t), 'dead_sku').count, 0);
  t.inventory[0].on_hand = 0;
  assert.equal(byRule(run(t), 'dead_sku').count, 1);
});

test('duplicate_customer: normalizes legal suffix, case, street type, suite, zip+4; keeps distinct addresses apart', () => {
  assert.equal(normalizeName('HARBOR RIDGE SUPPLY, INC'), normalizeName('Harbor Ridge Supply Company'));
  assert.equal(normalizeName('The Harbor Ridge Supply'), 'harbor ridge supply');
  assert.equal(normalizeAddress('418 Cedar Street, Suite 2'), normalizeAddress('418 CEDAR ST.'));
  assert.equal(normalizeAddress('418 Cedar St Ste 100'), '418 cedar st');
  const t = base();
  t.customers.push(
    { customer_id: 'C2', name: 'ACME SUPPLY COMPANY', address: '1 MAIN ST., Suite 4', city: 'X', state: 'MI', zip: '49001-2222', status: 'active' },
    { customer_id: 'C3', name: 'Acme Supply Co.', address: '2 Main Street', city: 'X', state: 'MI', zip: '49001', status: 'active' },
  );
  const f = byRule(run(t), 'duplicate_customer');
  assert.equal(f.count, 1);
  assert.deepEqual(f.rows[0].member_ids.slice().sort(), ['C1', 'C2']);
});

test('inactive_customer_prices: inactive holders are reported once, not also as stale', () => {
  const t = base();
  t.customers[0].status = 'inactive';
  t.prices[0].effective_date = '2020-06-01'; t.sales = [{ sale_id: 'S9', sale_date: '2020-07-01', customer_id: 'C1', sku: 'A', qty: 1, unit_price: 15 }];
  const r = run(t);
  assert.equal(byRule(r, 'inactive_customer_prices').count, 1);
  assert.equal(byRule(r, 'stale_price').count, 0);
});

test('missing tables skip rules honestly instead of guessing', () => {
  const t = base(); t.costs = [];
  const r = run(t);
  assert.deepEqual(r.skipped.map((s) => s.rule).sort(), ['below_cost', 'cost_lag']);
  assert.match(r.skipped[0].reason, /cost/);
  const t2 = base(); t2.sales = [];
  const r2 = run(t2);
  assert.ok(r2.skipped.some((s) => s.rule === 'stale_price'));
  assert.ok(r2.skipped.some((s) => s.rule === 'dead_sku'));
});

test('below_cost without sales reports exposure, not loss, with no invented amount', () => {
  const t = base(); t.sales = []; t.prices[0].price = 8;
  const f = byRule(run(t), 'below_cost');
  assert.equal(f.count, 1);
  assert.equal(f.exposure.amount, null);
  assert.equal(f.exposure.kind, 'exposure');
  assert.match(f.exposure.basis, /\$2/);
});

test('score weights sum to 100 and the score is bounded and monotonic', () => {
  assert.equal(Object.values(SCORE_WEIGHTS).reduce((a, w) => a + w.weight, 0), 100);
  const mk = (n) => ({ rule: 'below_cost', count: n, population: 100, flaggedInPopulation: n });
  assert.equal(scoreFindings([mk(0)]).score, 100);
  assert.equal(scoreFindings([mk(1)]).score, 85); // 30 x (1% / 2%) = 15
  assert.equal(scoreFindings([mk(2)]).score, 70);
  assert.equal(scoreFindings([mk(50)]).score, 70); // saturates
  assert.ok(seededResult.score.score > 0 && seededResult.score.score < 100);
});

test('addMonths clamps month ends', () => {
  assert.equal(addMonths('2026-09-30', -36), '2023-09-30');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonths('2024-03-31', -1), '2024-02-29');
  assert.equal(addMonths('2026-01-15', -2), '2025-11-15');
});

test('csv round trip preserves tables', () => {
  const texts = {};
  for (const [n, cols] of Object.entries(TABLE_COLUMNS)) texts[n] = toCsv(seeded.tables[n].slice(0, 50), cols);
  const back = tablesFromCsv(texts);
  assert.deepEqual(back.prices, seeded.tables.prices.slice(0, 50));
  assert.deepEqual(back.sales, seeded.tables.sales.slice(0, 50));
  assert.deepEqual(parseCsv('a,"b,""c"""\r\n1,2\n'), [['a', 'b,"c"'], ['1', '2']]);
  assert.throws(() => tablesFromCsv({ prices: 'price_id,price\nP1,abc\n' }), /non-numeric/);
});

test('report states the headline, formulas and score weighting from engine numbers', () => {
  const md = renderReport(seededResult, { note: 'synthetic' });
  assert.match(md, /Integrity score \d+ out of 100/);
  assert.ok(md.includes(`$${byRule(seededResult, 'below_cost').exposure.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
  assert.match(md, /Formula: sum over flagged price records of \(current_cost - price\)/);
  assert.match(md, /How the score is computed/);
});
