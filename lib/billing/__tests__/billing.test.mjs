import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, priceKey, currentLookupKey, resolveLookupKey } from '../plans.ts';
import { estimateCostMicros, recordLlmUsage, usageDay, RATES } from '../cost.ts';
import { priceAllowed, priceViolations } from '../../../scripts/portal-copy-rules.mjs';
import { llmMapping, suggestMapping } from '../../snapshot/mapper.ts';
import { startRun } from '../../snapshot/service.ts';
import { MemoryStore } from '../../snapshot/store.ts';

const TENANT = '22222222-2222-2222-2222-222222222222';

// ---- plan picker: "Current plan" follows plan AND interval --------------------------------------------------------

// The picker's rule: a card is current when the tenant's lookup key equals the card's key for the interval being shown.
const isCurrent = (current, planKey, shown) => current === priceKey(planKey, shown);

test('plans: annual Starter is current under annual only, never under monthly', () => {
  const current = currentLookupKey('ll_starter', 'annual');
  assert.equal(current, 'll_starter_annual');
  assert.equal(isCurrent(current, 'll_starter', 'annual'), true);
  assert.equal(isCurrent(current, 'll_starter', 'monthly'), false);
  assert.equal(isCurrent(current, 'll_growth', 'annual'), false);
  assert.equal(isCurrent(currentLookupKey('ll_starter', 'monthly'), 'll_starter', 'annual'), false);
});

test('plans: unknown plan or interval marks nothing current, and every current key is a real catalog key', () => {
  assert.equal(currentLookupKey(null, 'annual'), null);
  assert.equal(currentLookupKey('ll_starter', null), null);
  assert.equal(currentLookupKey('ll_starter', 'weekly'), null);
  for (const p of PLANS) for (const i of ['monthly', 'annual']) assert.ok(resolveLookupKey(currentLookupKey(p.key, i)), `${p.key} ${i}`);
});

// ---- role walk copy rule -----------------------------------------------------------------------------------------

test('copy rule: prices are allowed on /client/billing only', () => {
  assert.equal(priceAllowed('/client/billing'), true);
  assert.equal(priceAllowed('/client/billing?x=1'), true);
  assert.equal(priceAllowed('/client/billing/'), true);
  for (const r of ['/client', '/client/account', '/client/billing/extra', '/client/privacy', '/', '/pricing']) assert.equal(priceAllowed(r), false, r);
  assert.deepEqual(priceViolations('/client/billing', 'Starter $99 / month, Growth $399'), []);
  assert.deepEqual(priceViolations('/client/team', 'Starter $99 / month, Growth $399'), ['$99', '$399']);
  assert.deepEqual(priceViolations('/client/workstreams', 'Over £1,200 or € 50.5'), ['£1,200', '€ 50.5']);
  assert.deepEqual(priceViolations('/client/team', 'No amounts here, 100 members'), []);
});

// ---- cost tracker ------------------------------------------------------------------------------------------------

test('cost: estimate uses the rate table, unknown models cost zero, rounding is to the micro-dollar', () => {
  const r = RATES['cerebras/gpt-oss-120b'];
  assert.equal(estimateCostMicros('cerebras', 'gpt-oss-120b', 1_000_000, 0), Math.round(r.inPerM * 1_000_000));
  assert.equal(estimateCostMicros('cerebras', 'gpt-oss-120b', 1000, 500), Math.round(1000 * r.inPerM + 500 * r.outPerM));
  assert.equal(estimateCostMicros('x', 'unknown', 5000, 5000), 0);
  assert.equal(estimateCostMicros('p', 'm', 1000, 1000, { 'p/m': { inPerM: 1, outPerM: 2 } }), 3000);
});

test('cost: usageDay is the Eastern calendar day', () => {
  assert.equal(usageDay(new Date('2026-10-05T03:30:00Z')), '2026-10-04');
  assert.equal(usageDay(new Date('2026-10-05T15:00:00Z')), '2026-10-05');
});

test('cost: recordLlmUsage sends one RPC with tenant, day, provider, model, tokens and estimate', async () => {
  const calls = [];
  const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: null }; } };
  const r = await recordLlmUsage(db, 's'.repeat(32), TENANT, { provider: 'cerebras', model: 'gpt-oss-120b', tokensIn: 1200, tokensOut: 300 }, { now: new Date('2026-10-05T15:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'billing_record_llm_usage');
  assert.deepEqual({ ...calls[0].args, p_secret: undefined }, {
    p_secret: undefined, p_tenant: TENANT, p_day: '2026-10-05', p_provider: 'cerebras', p_model: 'gpt-oss-120b', p_tokens_in: 1200, p_tokens_out: 300,
    p_cost_micros: estimateCostMicros('cerebras', 'gpt-oss-120b', 1200, 300),
  });
  assert.ok(r.costMicros > 0);
});

test('cost: zero tokens and a missing tenant write nothing; failures are reported, never thrown', async () => {
  let n = 0;
  const db = { rpc: async () => { n++; return { error: { message: 'tenant not found' } }; } };
  assert.equal((await recordLlmUsage(db, 's', TENANT, { provider: 'p', model: 'm', tokensIn: 0, tokensOut: 0 })).ok, true);
  assert.equal((await recordLlmUsage(db, 's', '', { provider: 'p', model: 'm', tokensIn: 5, tokensOut: 5 })).ok, false);
  assert.equal(n, 0);
  assert.deepEqual(await recordLlmUsage(db, 's', TENANT, { provider: 'p', model: 'm', tokensIn: 5, tokensOut: 5 }), { ok: false, error: 'tenant not found', costMicros: 0 });
  const boom = { rpc: async () => { throw new Error('network down'); } };
  assert.equal((await recordLlmUsage(boom, 's', TENANT, { provider: 'p', model: 'm', tokensIn: 5, tokensOut: 5 })).error, 'network down');
  const clamp = [];
  await recordLlmUsage({ rpc: async (_n, a) => { clamp.push(a); return {}; } }, 's', TENANT, { provider: 'p', model: 'm', tokensIn: -4, tokensOut: 7.9 });
  assert.equal(clamp[0].p_tokens_in, 0);
  assert.equal(clamp[0].p_tokens_out, 7);
});

// ---- first producer: the snapshot column mapper's Cerebras call ---------------------------------------------------

const cerebras = (usage, content = '{"mappings":[]}') => async () => new Response(JSON.stringify({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) }));

test('producer: the mapper reports the tokens the provider returned, even when the reply is unusable', async () => {
  const seen = [];
  const onUsage = (u) => { seen.push(u); };
  await llmMapping(['Weird'], [['q']], {}, { apiKey: 'k', fetch: cerebras({ prompt_tokens: 410, completion_tokens: 95 }), onUsage });
  assert.deepEqual(seen, [{ provider: 'cerebras', model: 'gpt-oss-120b', tokensIn: 410, tokensOut: 95 }]);
  await assert.rejects(() => llmMapping(['Weird'], [['q']], {}, { apiKey: 'k', fetch: cerebras({ prompt_tokens: 7, completion_tokens: 400 }, ''), onUsage }), /empty/);
  assert.equal(seen.length, 2, 'empty content still spent tokens');
  assert.equal(seen[1].tokensOut, 400);
});

test('producer: a throwing meter or a reply without usage never breaks the mapping', async () => {
  const header = ['Artikel', 'Preis'];
  const rows = [['A', '10'], ['B', '11']];
  const reply = JSON.stringify({ mappings: [{ column: 'Artikel', field: 'item', confidence: 0.9 }, { column: 'Preis', field: 'price', confidence: 0.9 }] });
  const s = await suggestMapping(header, rows, { apiKey: 'k', fetch: cerebras(undefined, reply), onUsage: () => { throw new Error('meter down'); } });
  assert.equal(s.llm.used, true);
  assert.equal(s.mapping.price.column, 'Preis');
  const seen = [];
  await llmMapping(['Weird'], [['q']], {}, { apiKey: 'k', fetch: cerebras(undefined), onUsage: (u) => seen.push(u) });
  assert.equal(seen[0].tokensIn, 0);
});

test('producer: startRun records mapper usage against the tenant in Deps; with no tenant nothing is recorded', async () => {
  const csv = 'Artikel,Preis\nA,10\nB,11\nC,12\n';
  const recorded = [];
  const base = { store: new MemoryStore(), llm: { apiKey: 'k', fetch: cerebras({ prompt_tokens: 300, completion_tokens: 80 }) } };
  const withTenant = await startRun({ ...base, usage: { tenantId: TENANT, record: async (t, u) => { recorded.push([t, u]); } } }, { data: Buffer.from(csv), filename: 'x.csv', source: 'upload' });
  assert.equal(withTenant.status, 'mapping');
  assert.deepEqual(recorded, [[TENANT, { provider: 'cerebras', model: 'gpt-oss-120b', tokensIn: 300, tokensOut: 80 }]]);
  await startRun({ ...base, store: new MemoryStore() }, { data: Buffer.from(csv), filename: 'x.csv', source: 'upload' });
  assert.equal(recorded.length, 1, 'the anonymous public API has no tenant and records nothing');
});
