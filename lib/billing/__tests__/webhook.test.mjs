import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { handleStripeWebhook } from '../webhook.ts';

const WHSEC = 'whsec_test_mock_only';
const SERVER_SECRET = 'x'.repeat(32);
const TENANT = '11111111-1111-1111-1111-111111111111';
const SUB = 'sub_mock_1';
const CUS = 'cus_mock_1';

// Mocked signature helper: signs a payload the way Stripe does, with no network and no real key.
const signer = new Stripe('sk_test_mock_only');
const sign = (payload, secret = WHSEC) => signer.webhooks.generateTestHeaderString({ payload, secret });

const sub = (over = {}) => ({
  id: SUB, object: 'subscription', customer: CUS, status: 'active', cancel_at_period_end: false, current_period_end: 1_900_000_000,
  metadata: { tenant_id: TENANT }, items: { data: [{ price: { lookup_key: 'll_starter_annual', unit_amount: 99000, currency: 'usd', recurring: { interval: 'year' } } }] }, ...over,
});
const evt = (id, type, object, created = 1_800_000_000) => ({ id, object: 'event', type, created, livemode: false, data: { object } });

// A fake of the billing_* RPCs that follows the SQL in supabase/loveleeday/20261005_23_billing.sql.
function fakeDb() {
  const events = new Set();
  const subs = new Map();
  const tenants = new Map([[TENANT, { plan: null }]]);
  const calls = [];
  return {
    events, subs, tenants, calls,
    async rpc(name, a) {
      calls.push(name);
      if (name === 'billing_tenant_for_customer') return { data: a.p_customer === CUS ? TENANT : null, error: null };
      if (name === 'billing_subscription_upsert') {
        if (!tenants.has(a.p_tenant)) return { error: { message: 'tenant not found' } };
        if (events.has(a.p_event_id)) return { data: false, error: null };
        events.add(a.p_event_id);
        const prev = subs.get(a.p_subscription);
        if (prev && Date.parse(prev.last_event_at) > Date.parse(a.p_event_created)) return { data: false, error: null };
        subs.set(a.p_subscription, { ...(prev ?? {}), tenant_id: a.p_tenant, plan_key: a.p_plan_key, billing_interval: a.p_interval, status: a.p_status, last_event_at: a.p_event_created, cancel_at_period_end: a.p_cancel_at_period_end });
        const live = ['active', 'trialing', 'past_due'].includes(a.p_status);
        if (live || tenants.get(a.p_tenant).plan === a.p_plan_key) tenants.get(a.p_tenant).plan = live ? a.p_plan_key : null;
        return { data: true, error: null };
      }
      if (name === 'billing_invoice_record') {
        const s = subs.get(a.p_subscription);
        if (!s) return { error: { message: 'subscription not yet known' } };
        if (events.has(a.p_event_id)) return { data: false, error: null };
        events.add(a.p_event_id);
        s.last_invoice_status = a.p_paid ? 'paid' : 'payment_failed';
        if (!a.p_paid) s.last_payment_failed_at = a.p_event_created;
        return { data: true, error: null };
      }
      return { error: { message: `unexpected rpc ${name}` } };
    },
  };
}

function harness({ stripeSub = sub(), serverSecret = SERVER_SECRET } = {}) {
  const db = fakeDb();
  const state = { sub: stripeSub, retrieved: 0 };
  const deps = {
    stripe: {
      webhooks: signer.webhooks,
      subscriptions: { retrieve: async () => { state.retrieved++; return state.sub; } },
    },
    whsec: WHSEC,
    serverSecret: () => serverSecret,
    db: () => db,
  };
  const post = async (event, headers) => {
    const payload = JSON.stringify(event);
    const res = await handleStripeWebhook(new Request('http://x/api/stripe/webhook', { method: 'POST', body: payload, headers: headers ?? { 'stripe-signature': sign(payload) } }), deps);
    return { status: res.status, body: await res.json() };
  };
  return { db, state, deps, post };
}

test('webhook: bad signature is 400 "bad signature" and nothing is written', async () => {
  const h = harness();
  const event = evt('evt_bad', 'customer.subscription.updated', sub());
  const r = await h.post(event, { 'stripe-signature': sign(JSON.stringify(event), 'whsec_some_other_secret') });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: 'bad signature' });
  assert.deepEqual(h.db.calls, []);
  assert.equal(h.state.retrieved, 0);
});

test('webhook: tampered body fails the signature; missing header is "no sig"', async () => {
  const h = harness();
  const event = evt('evt_t', 'customer.subscription.updated', sub());
  const header = sign(JSON.stringify(event));
  const tampered = await handleStripeWebhook(new Request('http://x', { method: 'POST', body: JSON.stringify({ ...event, id: 'evt_other' }), headers: { 'stripe-signature': header } }), h.deps);
  assert.equal(tampered.status, 400);
  assert.deepEqual(await tampered.json(), { error: 'bad signature' });
  const none = await h.post(event, {});
  assert.equal(none.status, 400);
  assert.deepEqual(none.body, { error: 'no sig' });
  assert.deepEqual(h.db.calls, []);
});

test('webhook: unconfigured server secret is 503 after a valid signature', async () => {
  const h = harness({ serverSecret: null });
  const r = await h.post(evt('evt_503', 'customer.subscription.updated', sub()));
  assert.equal(r.status, 503);
  assert.deepEqual(h.db.calls, []);
});

test('webhook: subscription update stores plan, interval and status from the lookup key', async () => {
  const h = harness();
  const r = await h.post(evt('evt_1', 'customer.subscription.created', sub()));
  assert.equal(r.status, 200);
  const row = h.db.subs.get(SUB);
  assert.equal(row.plan_key, 'll_starter');
  assert.equal(row.billing_interval, 'annual');
  assert.equal(row.status, 'active');
  assert.equal(h.db.tenants.get(TENANT).plan, 'll_starter');
});

test('webhook: invoice.payment_failed marks the subscription past_due and flags the failed payment', async () => {
  const h = harness();
  await h.post(evt('evt_a', 'customer.subscription.created', sub(), 1_800_000_000));
  // Stripe moves the subscription to past_due and sends the update, then the failed invoice.
  h.state.sub = sub({ status: 'past_due' });
  await h.post(evt('evt_b', 'customer.subscription.updated', sub({ status: 'past_due' }), 1_800_000_100));
  const failed = await h.post(evt('evt_c', 'invoice.payment_failed', { id: 'in_1', subscription: SUB }, 1_800_000_200));
  assert.equal(failed.status, 200);
  const row = h.db.subs.get(SUB);
  assert.equal(row.status, 'past_due');
  assert.equal(row.last_invoice_status, 'payment_failed', 'the billing page shows the failed-payment notice from this flag');
  assert.equal(row.last_payment_failed_at, new Date(1_800_000_200 * 1000).toISOString());
  assert.equal(h.db.tenants.get(TENANT).plan, 'll_starter', 'past_due keeps access while Stripe retries');
  const paid = await h.post(evt('evt_d', 'invoice.paid', { id: 'in_2', parent: { subscription_details: { subscription: SUB } } }, 1_800_000_300));
  assert.equal(paid.status, 200);
  assert.equal(h.db.subs.get(SUB).last_invoice_status, 'paid');
});

test('webhook: customer.subscription.deleted cancels the subscription and clears the tenant plan', async () => {
  const h = harness();
  await h.post(evt('evt_a', 'customer.subscription.created', sub(), 1_800_000_000));
  h.state.sub = sub({ status: 'canceled' });
  const r = await h.post(evt('evt_del', 'customer.subscription.deleted', sub({ status: 'canceled' }), 1_800_000_500));
  assert.equal(r.status, 200);
  assert.equal(h.db.subs.get(SUB).status, 'canceled');
  assert.equal(h.db.tenants.get(TENANT).plan, null);
});

test('webhook: a duplicate event id is accepted and changes nothing', async () => {
  const h = harness();
  const event = evt('evt_dup', 'customer.subscription.updated', sub());
  assert.equal((await h.post(event)).status, 200);
  const first = JSON.stringify(h.db.subs.get(SUB));
  h.state.sub = sub({ status: 'canceled' }); // a replay must not apply even if Stripe now reports something else
  const again = await h.post(event);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body, { received: true });
  assert.equal(JSON.stringify(h.db.subs.get(SUB)), first);
  assert.equal(h.db.events.size, 1);
});

test('webhook: an older subscription snapshot arriving late does not overwrite a newer one', async () => {
  const h = harness();
  h.state.sub = sub({ status: 'past_due' });
  await h.post(evt('evt_new', 'customer.subscription.updated', sub({ status: 'past_due' }), 1_800_001_000));
  h.state.sub = sub({ status: 'active' });
  const late = await h.post(evt('evt_old', 'customer.subscription.updated', sub({ status: 'active' }), 1_800_000_000));
  assert.equal(late.status, 200);
  assert.equal(h.db.subs.get(SUB).status, 'past_due');
});

test('webhook: an invoice event that outruns the subscription loads the subscription first, then records', async () => {
  const h = harness();
  const r = await h.post(evt('evt_inv_first', 'invoice.payment_failed', { id: 'in_9', subscription: SUB }, 1_800_000_050));
  assert.equal(r.status, 200);
  assert.deepEqual(h.db.calls.filter((c) => c !== 'billing_tenant_for_customer'), ['billing_invoice_record', 'billing_subscription_upsert', 'billing_invoice_record']);
  assert.equal(h.db.subs.get(SUB).last_invoice_status, 'payment_failed');
  assert.equal(h.state.retrieved, 1);
});

test('webhook: a database refusal is a 500 so Stripe retries, and the retry then succeeds', async () => {
  const h = harness();
  const event = evt('evt_retry', 'customer.subscription.updated', sub());
  const real = h.db.rpc.bind(h.db);
  let fail = true;
  h.db.rpc = async (n, a) => (fail && n === 'billing_subscription_upsert' ? { error: { message: 'boom' } } : real(n, a));
  const quiet = console.error; console.error = () => {};
  try { assert.equal((await h.post(event)).status, 500); } finally { console.error = quiet; }
  assert.equal(h.db.events.size, 0);
  fail = false;
  assert.equal((await h.post(event)).status, 200);
  assert.equal(h.db.subs.get(SUB).status, 'active');
});

test('webhook: unhandled event types are acknowledged without touching the database', async () => {
  const h = harness();
  const r = await h.post(evt('evt_x', 'charge.refunded', { id: 'ch_1' }));
  assert.equal(r.status, 200);
  assert.deepEqual(h.db.calls, []);
});
