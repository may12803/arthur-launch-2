import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../../../scripts/gen-synthetic-pricing.mjs';
import { heuristicMapping } from '../../snapshot/mapper.ts';
import { generateAudit, verifyReport, recomputeLoss, renderTemplate, RefusedFigureError } from '../report.ts';
import { handleAuditCheckoutEvent } from '../purchase.ts';
import { getAudit, listAudits } from '../read.ts';

const HEADER = ['Item', 'Customer', 'Price', 'Cost', 'Units Sold 12m', 'Price Date', 'Last Sale Date', 'On Hand', 'Status'];
function rowsFromSynthetic() {
  const { tables } = generate({ counts: { customers: 25, skus: 45, prices: 220, deadSkus: 3, lagSkus: 2, stale: 5, belowCost: 8, inactiveCustomers: 1, inactivePricesEach: 3, dupPairs: 1, dupTriples: 0 } });
  const customers = new Map(tables.customers.map((x) => [x.customer_id, x]));
  const costs = new Map(tables.costs.map((x) => [x.sku, x.cost]));
  const inventory = new Map(tables.inventory.map((x) => [x.sku, x.on_hand]));
  const sales = new Map();
  for (const s of tables.sales) {
    const key = `${s.customer_id}|${s.sku}`;
    sales.set(key, (sales.get(key) ?? 0) + s.qty);
  }
  return tables.prices.map((p) => [p.sku, customers.get(p.customer_id)?.name ?? p.customer_id, String(p.price), String(costs.get(p.sku) ?? ''), String(sales.get(`${p.customer_id}|${p.sku}`) ?? 0), p.effective_date, '2026-09-01', String(inventory.get(p.sku) ?? 0), customers.get(p.customer_id)?.status ?? 'active']);
}

test('synthetic audit keeps flagged rows and verifies every brief figure', () => {
  const rows = rowsFromSynthetic();
  const report = generateAudit({ header: HEADER, rows, mapping: heuristicMapping(HEADER, rows), asOf: '2026-09-30', filename: 'synthetic.csv' });
  assert.deepEqual(verifyReport(report), []);
  assert.ok(report.findings.some((f) => f.count > 0));
  for (const f of report.findings) {
    assert.equal(f.rows.length, f.rows_total);
    if (f.money.kind === 'loss') assert.equal(recomputeLoss(f.rows), f.money.amount);
  }
  assert.equal(report.brief.generated_by, 'template');
  assert.throws(() => renderTemplate('Claim {{unsourced}}', new Map()), RefusedFigureError);
});

test('no volume means per-unit exposure, never summed into loss', () => {
  const header = ['Item', 'Price', 'Cost'];
  const rows = [['A', '5', '8'], ['B', '4', '7']];
  const report = generateAudit({ header, rows, mapping: heuristicMapping(header, rows), asOf: '2026-09-30', filename: 'no-volume.csv' });
  assert.deepEqual(verifyReport(report), []);
  assert.equal(report.loss_total, 0);
  assert.equal(report.findings.find((f) => f.rule === 'below_cost')?.money.kind, 'exposure');
});

test('checkout retry records one session and only one job can claim it', async () => {
  const seen = new Map(); let generated = 0;
  const store = { async recordPurchase(p) { const created = !seen.has(p.sessionId); if (created) seen.set(p.sessionId, 'audit-1'); return { audit_id: seen.get(p.sessionId), created }; } };
  const deps = { store, lineItemLookup: async () => 'll_audit_standard', tenantForCustomer: async () => null, generate: async () => { generated++; } };
  const event = { id: 'evt_1', type: 'checkout.session.completed', created: 1, livemode: false, data: { object: { id: 'cs_1', mode: 'payment', payment_status: 'paid', client_reference_id: '11111111-1111-4111-8111-111111111111' } } };
  const first = await handleAuditCheckoutEvent(event, deps); await first.generation;
  const second = await handleAuditCheckoutEvent(event, deps); await second.generation;
  assert.equal(first.created, true); assert.equal(second.created, false); assert.equal(seen.size, 1);
  assert.equal(generated, 2, 'claim RPC decides whether the duplicate call does work');
});

test('tenant-scoped reads always filter by tenant and malformed ids never query', async () => {
  const calls = [];
  const query = { eq(k,v) { calls.push([k,v]); return this; }, order() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null, error: null }), then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
  const db = { from: () => ({ select: () => query }) };
  await listAudits(db, 'tenant-a');
  await getAudit(db, 'tenant-b', '11111111-1111-4111-8111-111111111111');
  const before = calls.length;
  await getAudit(db, 'tenant-b', 'bad');
  assert.deepEqual(calls.filter(([k]) => k === 'tenant_id'), [['tenant_id','tenant-a'], ['tenant_id','tenant-b']]);
  assert.equal(calls.length, before);
});
