import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, SupabaseStore } from '../store.ts';
import { loadConfig } from '../config.ts';
import { importRows } from '../import.ts';
import { approveMessages, recordBounce, recordReply, registerToken, unsubscribeByToken } from '../lifecycle.ts';
import { renderMessage } from '../render.ts';
import { ensureNextDraft, planBatch, runBatch } from '../scheduler.ts';
import { SmtpOrProviderTransportSTUB } from '../transport.ts';

const now = new Date('2026-10-05T16:00:00Z');
const env = { OUTREACH_POSTAL_ADDRESS: '123 Main St, Detroit, MI 48201', OUTREACH_TOKEN_SECRET: 'test-secret', OUTREACH_WARMUP_START: '2026-10-01', OUTREACH_SEND_INTERVAL_MS: '0' };
const cfg = (extra = {}) => loadConfig({ ...env, ...extra });
async function seeded(email = 'a@example.com', org = 'Example Tools') {
  const store = new MemoryStore();
  const contact = await store.insertContact({ org, name: 'Ada', email, source_url: null, batch: 'test', external_id: '1', status: 'new' });
  const message = await store.insertMessage({ contact_id: contact.id, to_email: email, batch: 'test', step: 1, subject: 'Hello', body: 'Hello Ada', personalization_source: null, status: 'draft', approved_by: null, approved_at: null, scheduled_at: null, sent_at: null, last_error: null });
  return { store, contact, message };
}

test('blocked segments and suppression prevent import; invalid row does not reserve email', async () => {
  const { store } = await seeded();
  await store.addSuppression({ email: null, domain: 'blocked.example', reason: 'manual', source: 'test' });
  const rows = [
    { id: '1', recipient: { org: 'Essex Cable', email: 'x@safe.example' }, subject: 'Hi', body: 'Text' },
    { id: '2', recipient: { org: 'Good Tools', email: 'a@blocked.example' }, subject: 'Hi', body: 'Text' },
    { id: '3', recipient: { org: 'Good Tools', email: 'b@safe.example' }, subject: '', body: 'Text' },
    { id: '4', recipient: { org: 'Good Tools', email: 'b@safe.example' }, subject: 'Hi', body: 'Text' },
  ];
  const result = await importRows(store, cfg(), rows, { apply: true });
  assert.deepEqual(result.results.map(x => x.outcome), ['skipped_blocked_segment', 'skipped_suppressed', 'skipped_invalid', 'imported']);
  assert.equal((await store.getContactByEmail('b@safe.example'))?.email, 'b@safe.example');
});

test('unsubscribe token and RFC 8058 render suppress immediately and idempotently', async () => {
  const { store, contact, message } = await seeded();
  const rendered = renderMessage(message, cfg());
  assert.equal(rendered.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(rendered.text, /123 Main St/);
  assert.match(rendered.text, /\/api\/public\/unsubscribe\//);
  const token = await registerToken(store, cfg(), contact);
  assert.equal((await unsubscribeByToken(store, token)).ok, true);
  assert.equal((await unsubscribeByToken(store, token)).ok, true);
  assert.equal((await store.getContact(contact.id)).status, 'unsubscribed');
  assert.equal((await store.suppressionFor(contact.email)).reason, 'unsubscribe');
  assert.equal((await unsubscribeByToken(store, 'bad')).ok, false);
  assert.throws(() => renderMessage(message, cfg({ OUTREACH_POSTAL_ADDRESS: '' })), /POSTAL_ADDRESS/);
});

test('approval, warm-up cap and per-domain throttle control eligibility', async () => {
  const { store, message } = await seeded();
  assert.equal((await planBatch(store, cfg(), now)).items.length, 0);
  await approveMessages(store, [message.id], 'Daniel May', now);
  assert.equal((await planBatch(store, cfg({ OUTREACH_WARMUP_START: '' }), now)).items[0].reason, 'daily_cap');
  assert.equal((await planBatch(store, cfg({ OUTREACH_PER_DOMAIN_PER_DAY: '0' }), now)).items[0].reason, 'domain_throttle');
  assert.equal((await planBatch(store, cfg(), now)).items[0].send, true);
});

test('reply stops approved sequence and disabled transport never sends', async () => {
  const { store, contact, message } = await seeded();
  await approveMessages(store, [message.id], 'Daniel May', now);
  const fake = { name: 'trap', send: async () => { throw new Error('send path executed'); } };
  const out = await runBatch(store, env, { mode: 'live', now, transport: fake });
  assert.equal(out.mode, 'dry-run');
  assert.deepEqual(out.sent, []);
  assert.equal((await store.getMessage(message.id)).status, 'approved');
  await assert.rejects(() => new SmtpOrProviderTransportSTUB(env).send(out.plan.items[0].rendered), /disabled/);
  await recordReply(store, contact.email);
  assert.equal((await store.getMessage(message.id)).status, 'cancelled');
  assert.equal((await planBatch(store, cfg(), now)).items.length, 0);
});

test('day-4 and day-10 follow-ups require separate approval and stop on bounce', async () => {
  const { store, contact, message } = await seeded();
  await store.updateMessage(message.id, { status: 'sent', approved_by: 'Daniel May', approved_at: now.toISOString(), sent_at: '2026-10-01T16:00:00Z' });
  const follow = await ensureNextDraft(store, message, contact, { OUTREACH_SIGNATURE: 'Daniel' });
  assert.equal(follow.status, 'draft');
  assert.equal((await planBatch(store, cfg(), now)).items.length, 0);
  await approveMessages(store, [follow.id], 'Daniel May', now);
  assert.equal((await planBatch(store, cfg(), new Date('2026-10-04T16:00:00Z'))).items[0].reason, 'step_not_due');
  assert.equal((await planBatch(store, cfg(), now)).items[0].send, true);
  await store.updateMessage(follow.id, { status: 'sent', sent_at: now.toISOString() });
  const close = await ensureNextDraft(store, follow, contact, { OUTREACH_SIGNATURE: 'Daniel' });
  await approveMessages(store, [close.id], 'Daniel May', now);
  assert.equal((await planBatch(store, cfg(), new Date('2026-10-10T16:00:00Z'))).items[0].reason, 'step_not_due');
  assert.equal((await planBatch(store, cfg(), new Date('2026-10-11T16:00:00Z'))).items[0].send, true);
  await recordBounce(store, contact.email);
  assert.equal((await store.getMessage(close.id)).status, 'cancelled');
  assert.equal((await store.suppressionFor(contact.email)).reason, 'bounce');
});

test('provider stub never transmits even when enabled', async () => {
  await assert.rejects(() => new SmtpOrProviderTransportSTUB({ OUTREACH_SENDING_ENABLED: '1' }).send({}), /No SMTP\/provider is wired/);
});

test('production store uses the named-secret RPC with the anon key', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('[]', { status: 200 });
  };
  const store = new SupabaseStore('https://example.supabase.co', 'anon-test', 'named-secret', fakeFetch);
  assert.equal(await store.getContact('missing'), null);
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/outreach_store');
  assert.equal(calls[0].init.headers.apikey, 'anon-test');
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_secret: 'named-secret', p_action: 'list', p_table: 'outreach_contacts', p_row: {}, p_filter: { id: 'missing' } });
});
