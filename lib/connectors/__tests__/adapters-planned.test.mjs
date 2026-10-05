import test from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTERS } from '../adapters/registry.ts';
import { qadAdaptiveErp } from '../adapters/qad-adaptive-erp.ts';
import { createAzureSynapseAdapter } from '../adapters/azure-synapse.ts';
import { setDefaultResolver } from '../net/safe-url.ts';

setDefaultResolver(async () => ['8.8.8.8']);
const response = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const cases = [
  ['netsuite', 'customer', { account_id: '12345', consumer_key: 'ck', consumer_secret: 'cs', token: 'tk', token_secret: 'ts' }, { items: [{ id: '1', lastModifiedDate: '2026-01-02T00:00:00Z' }] }, '/services/rest/query/v1/suiteql', 'OAuth '],
  ['acumatica', 'Customer', { base_url: 'https://erp.example.com', access_token: 'token' }, { value: [{ id: '1', LastModifiedDateTime: '2026-01-02T00:00:00Z' }] }, '/entity/Default/', 'Bearer token'],
  ['oracle-fusion-cloud-erp', 'invoices', { base_url: 'https://pod.example.com', access_token: 'token' }, { items: [{ id: '1', LastUpdateDate: '2026-01-02T00:00:00Z' }] }, '/fscmRestApi/resources/', 'Bearer token'],
  ['dynamics-365-finance-operations', 'CustomersV3', { base_url: 'https://fin.example.com', access_token: 'token' }, { value: [{ RecId: '1', ModifiedDateTime: '2026-01-02T00:00:00Z' }] }, '/data/CustomersV3', 'Bearer token'],
  ['epicor-prophet-21', 'customers', { base_url: 'https://epicor.example.com', username: 'u', password: 'p' }, { value: [{ id: '1', date_last_modified: '2026-01-02T00:00:00Z' }] }, '/api/customers', 'Basic '],
  ['cityworks', 'assets', { base_url: 'https://city.example.com', access_token: 'token' }, { value: [{ id: '1', ModifiedDate: '2026-01-02T00:00:00Z' }] }, '/Cityworks/Services/assets', 'Bearer token'],
  ['homebase', 'shifts', { api_key: 'token' }, { data: [{ id: '1', updated_at: '2026-01-02T00:00:00Z' }] }, '/api/public/shifts', 'Bearer token'],
];
for (const [key, object, creds, page, path, auth] of cases) test(`${key}: URL, auth, data cursor and private host`, async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return response(page); };
  fetch.testOnlyAllowUnpinnedFetch = true;
  const adapter = ADAPTERS[key];
  assert.equal((await adapter.validate(creds, fetch)).ok, true);
  calls.length = 0;
  const result = await adapter.pull(object, null, creds, fetch);
  assert.equal(result.records[0].source_ref, '1');
  assert.match(result.nextCursor, /2026-01-02/);
  assert.ok(calls[0].url.includes(path));
  assert.ok(new Headers(calls[0].init.headers).get('authorization').startsWith(auth));
  const next = await adapter.pull(object, result.nextCursor, creds, fetch);
  assert.ok(next.records.length);
  if (key !== 'homebase') assert.match(calls.at(-1).url + JSON.stringify(calls.at(-1).init.body ?? ''), /2026-01-02/);
  if (creds.base_url) await assert.rejects(adapter.pull(object, null, { ...creds, base_url: 'https://127.0.0.1' }, fetch), /public address/);
});

test('SAP session cookie and cursor', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return response(url.endsWith('/Login') ? { SessionId: 'session' } : { value: [{ DocEntry: 7, UpdateDate: '2026-01-02', UpdateTime: '01:00:00' }] }); };
  fetch.testOnlyAllowUnpinnedFetch = true;
  const adapter = ADAPTERS['sap-business-one'];
  const creds = { base_url: 'https://sap.example.com:50000', company_db: 'db', username: 'u', password: 'p' };
  assert.equal((await adapter.validate(creds, fetch)).ok, true);
  calls.length = 0;
  const r = await adapter.pull('Invoices', null, creds, fetch);
  assert.equal(r.records[0].source_ref, '7');
  assert.match(r.nextCursor, /2026-01-02/);
  assert.equal(new Headers(calls[1].init.headers).get('cookie'), 'B1SESSION=session');
  await assert.rejects(adapter.pull('Invoices', null, { ...creds, base_url: 'https://127.0.0.1:50000' }, fetch), /public address/);
});

test('QAD accepts only a public URL and keeps API pull unavailable', async () => {
  const r = await qadAdaptiveErp.validate({ base_url: 'https://qad.example.com' });
  assert.match(r.detail, /unverified/);
  await assert.rejects(qadAdaptiveErp.validate({ base_url: 'https://127.0.0.1' }), /public address/);
  await assert.rejects(qadAdaptiveErp.pull(), /CSV\/SFTP/);
});

test('Synapse uses bound watermark and advances from rows', async () => {
  const calls = [];
  const adapter = createAzureSynapseAdapter({ query: async (sql, params) => { calls.push({ sql, params }); return [{ ID: 1, __ll_hw: '2026-01-02T00:00:00' }]; } });
  const creds = { table: 'dbo.Orders', primary_key: 'ID', watermark_column: 'ModifiedAt' };
  await adapter.validate(creds);
  const first = await adapter.pull('dbo.Orders', null, creds);
  assert.equal(first.records[0].source_ref, '1');
  await adapter.pull('dbo.Orders', first.nextCursor, creds);
  assert.deepEqual(calls.at(-1).params, ['2026-01-02T00:00:00']);
  await assert.rejects(adapter.pull('dbo.Orders;DROP', null, creds), /invalid table name/);
});
