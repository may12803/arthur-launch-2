import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fakeFetch } from './_helpers.mjs';
import { handleShopifyCompliance, verifyShopifyHmac } from '../privacy/shopify-compliance.ts';
import { runAtlassianReport, ATLASSIAN_REPORT_URL, ATLASSIAN_REPORT_EVERY_MS } from '../privacy/atlassian-report.ts';
import { parseZendeskSubdomain, zendeskEndpoints, zendeskUrls } from '../auth/zendesk.ts';
import { tokenRequest } from '../auth/oauth2.ts';
import { JOBS } from '../scheduler.ts';

const SECRET = 'shpss_test_client_secret';
const sign = (body, secret = SECRET) => createHmac('sha256', secret).update(body).digest('base64');

function recorder(result = { error: null }) {
  const calls = [];
  const rpc = async (fn, args) => { calls.push({ fn, args }); return typeof result === 'function' ? result(fn, args) : result; };
  rpc.calls = calls;
  return rpc;
}
const run = (topic, payload, over = {}) => {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const rpc = over.rpc ?? recorder();
  return handleShopifyCompliance({ topic, rawBody, hmacHeader: sign(rawBody), secret: SECRET, serverSecret: 'srv', rpc, log: () => {}, ...over.input }).then((r) => ({ r, rpc }));
};

// ---- Shopify -----------------------------------------------------------------------------------------------------
test('shopify hmac: valid passes; wrong secret, tampered body, missing header, unset secret all fail', () => {
  const body = '{"shop_domain":"a.myshopify.com"}';
  assert.equal(verifyShopifyHmac(body, sign(body), SECRET), true);
  assert.equal(verifyShopifyHmac(body, sign(body, 'other'), SECRET), false);
  assert.equal(verifyShopifyHmac(body + ' ', sign(body), SECRET), false);
  assert.equal(verifyShopifyHmac(body, null, SECRET), false);
  assert.equal(verifyShopifyHmac(body, 'not-base64!!', SECRET), false);
  assert.equal(verifyShopifyHmac(body, sign(body), undefined), false);
});

test('shopify: bad HMAC is 401 and touches no data', async () => {
  const rpc = recorder();
  const r = await handleShopifyCompliance({ topic: 'shop/redact', rawBody: '{"shop_domain":"a.myshopify.com"}', hmacHeader: 'AAAA', secret: SECRET, serverSecret: 'srv', rpc, log: () => {} });
  assert.equal(r.status, 401);
  assert.equal(rpc.calls.length, 0);
});

test('shopify shop/redact calls the shop redaction RPC for the shop', async () => {
  const { r, rpc } = await run('shop/redact', { shop_id: 1, shop_domain: 'Acme.myshopify.com' });
  assert.equal(r.status, 200);
  assert.deepEqual(rpc.calls.map((c) => c.fn), ['shopify_shop_redact']);
  assert.equal(rpc.calls[0].args.p_shop, 'acme.myshopify.com');
});

test('shopify customers/redact passes customer id, email and orders', async () => {
  const { r, rpc } = await run('customers/redact', { shop_domain: 'acme.myshopify.com', customer: { id: 191167, email: 'a@b.co' }, orders_to_redact: [299938, 280263] });
  assert.equal(r.status, 200);
  assert.equal(rpc.calls[0].fn, 'shopify_customer_redact');
  assert.deepEqual(rpc.calls[0].args, { p_secret: 'srv', p_shop: 'acme.myshopify.com', p_customer_id: '191167', p_email: 'a@b.co', p_order_ids: ['299938', '280263'] });
});

test('shopify customers/data_request logs a task and keeps contact details out of it', async () => {
  const { r, rpc } = await run('customers/data_request', { shop_id: 9, shop_domain: 'acme.myshopify.com', customer: { id: 5, email: 'x@y.z', phone: '555' }, orders_requested: [1], data_request: { id: 77 } });
  assert.equal(r.status, 200);
  assert.equal(rpc.calls[0].fn, 'compliance_request_log');
  assert.equal(rpc.calls[0].args.p_topic, 'customers/data_request');
  assert.equal(JSON.stringify(rpc.calls[0].args).includes('x@y.z'), false);
  assert.equal(rpc.calls[0].args.p_payload.data_request_id, 77);
});

test('shopify: invalid shop is 400, bad JSON is 400, database failure inside the deadline is 500', async () => {
  assert.equal((await run('shop/redact', { shop_domain: 'evil.example.com' })).r.status, 400);
  assert.equal((await run('shop/redact', 'not json')).r.status, 400);
  const failing = recorder({ error: { message: 'boom' } });
  assert.equal((await run('shop/redact', { shop_domain: 'a.myshopify.com' }, { rpc: failing })).r.status, 500);
});

test('shopify: a slow database still gets a fast 200', async () => {
  const slow = async () => new Promise((res) => setTimeout(() => res({ error: null }), 200));
  const t0 = Date.now();
  const { r } = await run('shop/redact', { shop_domain: 'a.myshopify.com' }, { rpc: slow, input: { deadlineMs: 20 } });
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 < 150);
});

test('shopify: unconfigured server secret fails closed with 503', async () => {
  const { r } = await run('shop/redact', { shop_domain: 'a.myshopify.com' }, { input: { serverSecret: null } });
  assert.equal(r.status, 503);
});

// ---- Atlassian ---------------------------------------------------------------------------------------------------
const row = (conn, id, at = '2026-01-01T00:00:00.000Z') => ({ connection_id: conn, definition_key: 'jira', account_id: id, updated_at: at });
const deps = (rows, f, applied = []) => ({
  list: async () => rows,
  tokenFor: async () => 'tok',
  apply: async (id, status) => { applied.push([id, status]); },
  fetch: f,
});

test('atlassian report: POSTs accountIds to the report endpoint with a bearer token and acts on closed/updated', async () => {
  const f = fakeFetch([{ json: { accounts: [{ accountId: 'a1', status: 'closed' }, { accountId: 'a2', status: 'updated' }] } }]);
  const applied = [];
  const s = await runAtlassianReport(deps([row('c1', 'a1'), row('c1', 'a2'), row('c1', 'a3')], f, applied));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, ATLASSIAN_REPORT_URL);
  assert.equal(f.calls[0].url, 'https://api.atlassian.com/app/report-accounts/');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers.authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(f.calls[0].init.body).accounts.map((a) => a.accountId), ['a1', 'a2', 'a3']);
  assert.equal(JSON.parse(f.calls[0].init.body).accounts[0].updatedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(applied, [['a1', 'closed'], ['a2', 'updated']]);
  assert.deepEqual([s.accounts, s.reported, s.closed, s.updated, s.failed], [3, 3, 1, 1, 0]);
});

test('atlassian report: 204 means nothing to do; duplicates are sent once', async () => {
  const f = fakeFetch([{ status: 204, text: null }]);
  const applied = [];
  const s = await runAtlassianReport(deps([row('c1', 'a1'), row('c1', 'a1')], f, applied));
  assert.deepEqual(applied, []);
  assert.equal(JSON.parse(f.calls[0].init.body).accounts.length, 1);
  assert.equal(s.reported, 1);
});

test('atlassian report: batches of 90 per request, one token per connection', async () => {
  const rows = Array.from({ length: 95 }, (_, i) => row('c1', `acc${i}`));
  const f = fakeFetch([{ status: 204, text: null }, { status: 204, text: null }]);
  await runAtlassianReport(deps(rows, f));
  assert.deepEqual(f.calls.map((c) => JSON.parse(c.init.body).accounts.length), [90, 5]);
});

test('atlassian report: an API error or a missing token counts as failed and never applies anything', async () => {
  const f = fakeFetch([{ status: 429, text: 'slow down' }]);
  const applied = [];
  const s = await runAtlassianReport(deps([row('c1', 'a1')], f, applied));
  assert.equal(s.failed, 1);
  assert.deepEqual(applied, []);
  const f2 = fakeFetch([]);
  const s2 = await runAtlassianReport({ ...deps([row('c2', 'a9')], f2), tokenFor: async () => null });
  assert.equal(f2.calls.length, 0);
  assert.equal(s2.failed, 1);
});

test('atlassian report is scheduled well inside the 15-day limit and also runs after boot', () => {
  const j = JOBS.find((x) => x.path === '/api/cron/atlassian-privacy');
  assert.ok(j);
  assert.equal(j.everyMs, ATLASSIAN_REPORT_EVERY_MS);
  assert.ok(j.everyMs <= 15 * 24 * 60 * 60 * 1000);
  assert.ok(j.firstRunMs > 0);
});

// ---- Zendesk -----------------------------------------------------------------------------------------------------
test('zendesk subdomain: accepts [a-z0-9-]+ (and tidies a pasted host), rejects everything else', () => {
  assert.equal(parseZendeskSubdomain('acme'), 'acme');
  assert.equal(parseZendeskSubdomain('  Acme-Support '), 'acme-support');
  assert.equal(parseZendeskSubdomain('https://acme.zendesk.com/'), 'acme');
  for (const bad of ['', 'a.b', 'acme.evil.com/x', 'ac me', 'acme_corp', 'a@b', '../x', 'acme.zendesk.com.evil.io', 'x'.repeat(64), null, 5]) assert.equal(parseZendeskSubdomain(bad), null, String(bad));
});

test('zendesk urls follow the tenant subdomain', () => {
  const u = zendeskUrls('acme');
  assert.equal(u.authorizeUrl, 'https://acme.zendesk.com/oauth/authorizations/new');
  assert.equal(u.tokenUrl, 'https://acme.zendesk.com/oauth/tokens');
  assert.equal(u.apiBase, 'https://acme.zendesk.com/api/v2');
});

test('zendesk endpoints need client credentials and a valid subdomain', () => {
  const env = { CONNECTOR_OAUTH_ZENDESK_CLIENT_ID: 'id', CONNECTOR_OAUTH_ZENDESK_CLIENT_SECRET: 's' };
  const ep = zendeskEndpoints('acme', env);
  assert.equal(ep.tokenUrl, 'https://acme.zendesk.com/oauth/tokens');
  assert.deepEqual(ep.scopes, ['read']);
  assert.equal(zendeskEndpoints('bad.host', env), null);
  assert.equal(zendeskEndpoints('acme', {}), null);
});

test('zendesk token exchange goes to the tenant subdomain', async () => {
  const f = fakeFetch([{ json: { access_token: 'at', token_type: 'bearer', scope: 'read' } }]);
  const ep = zendeskEndpoints('acme', { CONNECTOR_OAUTH_ZENDESK_CLIENT_ID: 'id', CONNECTOR_OAUTH_ZENDESK_CLIENT_SECRET: 's' });
  const t = await tokenRequest({ fetch: f, tokenUrl: ep.tokenUrl, clientId: ep.clientId, clientSecret: ep.clientSecret, params: { grant_type: 'authorization_code', code: 'c' } });
  assert.equal(f.calls[0].url, 'https://acme.zendesk.com/oauth/tokens');
  assert.equal(t.access_token, 'at');
});

// ---- wiring ------------------------------------------------------------------------------------------------------
test('migration defines every RPC the code calls, all gated by the connectors server secret', () => {
  const sql = readFileSync(new URL('../../../supabase/loveleeday/20261005_24_connector_compliance.sql', import.meta.url), 'utf8');
  for (const fn of ['shopify_shop_redact', 'shopify_customer_redact', 'compliance_request_log', 'atlassian_accounts_list', 'atlassian_account_apply', 'connection_config_set', 'connection_config_get']) {
    const m = sql.match(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?end \\$\\$;`));
    assert.ok(m, fn);
    assert.match(m[0], /server_ok_named\(p_secret, 'connectors-server'\)/, fn);
  }
});
