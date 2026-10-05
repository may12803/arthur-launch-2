import test from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTERS } from '../adapters/registry.ts';
import { decodeCursor } from '../adapters/common.ts';
import { fakeFetch, hdr, body } from './_helpers.mjs';

const dec = (u) => decodeURIComponent(u.replace(/\+/g, ' '));
const HW = '2026-01-01T00:00:00.000Z';
const hwCursor = (hw = HW) => JSON.stringify({ hw });

/**
 * One row per generic adapter: the URL and headers the first call must carry, and how the cursor moves.
 * `url` is matched exactly against the decoded URL unless `urlIncludes` is given.
 */
const CASES = [
  { key: 'blackbaud-raisers-edge-nxt', creds: { access_token: 'T', subscription_key: 'SK' }, object: 'constituents', cursor: hwCursor(), responses: [{ json: { value: [{ id: '1', last_modified: '2026-02-01T00:00:00Z' }] } }],
    url: `https://api.sky.blackbaud.com/constituent/v1/constituents?limit=500&offset=0&last_modified=${HW}`, headers: { authorization: 'Bearer T', 'bb-api-subscription-key': 'SK' }, refs: ['1'], next: { hw: '2026-02-01T00:00:00.000Z' }, validate: 'https://api.sky.blackbaud.com/constituent/v1/constituents?limit=1' },
  { key: 'box', creds: { access_token: 'T' }, object: 'events', cursor: null, responses: [{ json: { entries: [{ event_id: 'e1' }], next_stream_position: '1234' } }],
    url: 'https://api.box.com/2.0/events?stream_type=changes&limit=500&stream_position=0', headers: { authorization: 'Bearer T' }, refs: ['e1'], next: { hw: '1234' }, validate: 'https://api.box.com/2.0/users/me' },
  { key: 'box', creds: { access_token: 'T' }, object: 'events', cursor: JSON.stringify({ hw: '1234' }), responses: [{ json: { entries: [], next_stream_position: '1234' } }],
    url: 'https://api.box.com/2.0/events?stream_type=changes&limit=500&stream_position=1234', headers: {}, refs: [], next: { hw: '1234' } },
  { key: 'brevo', creds: { api_key: 'BK' }, object: 'contacts', cursor: hwCursor(), responses: [{ json: { contacts: [{ id: 7, modifiedAt: '2026-03-01T00:00:00Z' }] } }],
    url: `https://api.brevo.com/v3/contacts?limit=500&offset=0&sort=asc&modifiedSince=${HW}`, headers: { 'api-key': 'BK' }, refs: ['7'], next: { hw: '2026-03-01T00:00:00.000Z' }, validate: 'https://api.brevo.com/v3/account' },
  { key: 'buildium', creds: { client_id: 'CI', client_secret: 'CS' }, object: 'leases', cursor: hwCursor(), responses: [{ json: [{ Id: 9, LastUpdatedDateTime: '2026-04-01T00:00:00Z' }] }],
    url: `https://api.buildium.com/v1/leases?limit=1000&offset=0&lastupdatedfrom=${HW}`, headers: { 'x-buildium-client-id': 'CI', 'x-buildium-client-secret': 'CS' }, refs: ['9'], next: { hw: '2026-04-01T00:00:00.000Z' }, validate: 'https://api.buildium.com/v1/rentals?limit=1' },
  { key: 'clio-manage', creds: { access_token: 'T', region_host: 'eu.app.clio.com' }, object: 'matters', cursor: hwCursor(), responses: [{ json: { data: [{ id: 1, updated_at: '2026-05-01T00:00:00Z' }], meta: { paging: { next: 'https://eu.app.clio.com/api/v4/matters.json?page_token=abc' } } } }],
    urlIncludes: ['https://eu.app.clio.com/api/v4/matters.json?fields=id%2Cdisplay_number', `updated_since=${encodeURIComponent(HW)}`, 'order=updated_at%28asc%29'], headers: { authorization: 'Bearer T' }, refs: ['1'], next: { hw: HW, pg: 'https://eu.app.clio.com/api/v4/matters.json?page_token=abc', mx: '2026-05-01T00:00:00.000Z' }, validate: 'https://eu.app.clio.com/api/v4/users/who_am_i.json?fields=id,name' },
  { key: 'clover', creds: { access_token: 'T', merchant_id: 'M1' }, object: 'orders', cursor: JSON.stringify({ hw: '1700000000000' }), responses: [{ json: { elements: [{ id: 'o1', modifiedTime: 1700000005000 }] } }],
    url: 'https://api.clover.com/v3/merchants/M1/orders?limit=100&offset=0&orderBy=modifiedTime ASC&filter=modifiedTime>=1700000000000', headers: { authorization: 'Bearer T' }, refs: ['o1'], next: { hw: '1700000005000' }, validate: 'https://api.clover.com/v3/merchants/M1' },
  { key: 'dropbox-business', creds: { access_token: 'T' }, object: 'files', cursor: null, responses: [{ json: { entries: [{ id: 'id:1', server_modified: '2026-06-01T00:00:00Z' }], cursor: 'CUR', has_more: false } }],
    url: 'https://api.dropboxapi.com/2/files/list_folder', method: 'POST', body: { path: '', recursive: true, limit: 2000 }, headers: { authorization: 'Bearer T' }, refs: ['id:1'], next: { hw: 'CUR' }, validate: 'https://api.dropboxapi.com/2/users/get_current_account' },
  { key: 'dropbox-business', creds: { access_token: 'T' }, object: 'files', cursor: JSON.stringify({ hw: 'CUR' }), responses: [{ json: { entries: [], cursor: 'CUR2', has_more: false } }],
    url: 'https://api.dropboxapi.com/2/files/list_folder/continue', method: 'POST', body: { cursor: 'CUR' }, headers: {}, refs: [], next: { hw: 'CUR2' } },
  { key: 'esri-arcgis', creds: { access_token: 'T', service_url: 'https://services.arcgis.com/abc/arcgis/rest/services/Assets/FeatureServer/0' }, object: 'features', cursor: JSON.stringify({ hw: '1700000000000' }), responses: [{ json: { features: [{ attributes: { OBJECTID: 5, EditDate: 1700000100000 } }], exceededTransferLimit: true } }],
    url: "https://services.arcgis.com/abc/arcgis/rest/services/Assets/FeatureServer/0/query?where=EditDate > timestamp '2023-11-14 22:13:20'&outFields=*&f=json&orderByFields=EditDate ASC&resultOffset=0&resultRecordCount=1000", headers: { 'x-esri-authorization': 'Bearer T' }, refs: ['5'], next: { hw: '1700000000000', pg: '1', mx: '1700000100000' } },
  { key: 'google-workspace', creds: { access_token: 'T' }, object: 'calendar_events', cursor: null, responses: [{ json: { items: [{ id: 'e1', updated: 't1' }], nextSyncToken: 'S1' } }],
    urlIncludes: ['https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=2500'], headers: { authorization: 'Bearer T' }, refs: ['e1@t1'], next: { hw: 'S1' }, validate: 'https://www.googleapis.com/calendar/v3/calendars/primary' },
  { key: 'google-workspace', creds: { access_token: 'T' }, object: 'calendar_events', cursor: JSON.stringify({ hw: 'S1' }), responses: [{ json: { items: [], nextSyncToken: 'S2' } }],
    urlIncludes: ['syncToken=S1'], headers: {}, refs: [], next: { hw: 'S2' } },
  { key: 'laserfiche', creds: { access_token: 'T', repository_id: 'r-1' }, object: 'entries', cursor: null, responses: [{ json: { value: [{ id: 7, lastModifiedTime: '2026-08-01T00:00:00Z' }] } }],
    url: 'https://api.laserfiche.com/repository/v2/Repositories/r-1/Entries/1/Folder/children?$top=100', headers: { authorization: 'Bearer T' }, refs: ['7'], next: { hw: '2026-08-01T00:00:00.000Z' }, validate: 'https://api.laserfiche.com/repository/v2/Repositories' },
  { key: 'mailchimp', creds: { access_token: 'T', dc: 'us19', list_id: 'L1' }, object: 'members', cursor: hwCursor(), responses: [{ json: { members: [{ id: 'm1', last_changed: '2026-09-01T00:00:00+00:00' }] } }],
    url: `https://us19.api.mailchimp.com/3.0/lists/L1/members?count=1000&offset=0&sort_field=last_changed&sort_dir=ASC&since_last_changed=${HW}`, headers: { authorization: 'Bearer T' }, refs: ['m1'], next: { hw: '2026-09-01T00:00:00.000Z' }, validate: 'https://us19.api.mailchimp.com/3.0/ping' },
  { key: 'salesforce', creds: { access_token: 'T', instance_url: 'https://acme.my.salesforce.com' }, object: 'Account', cursor: hwCursor(), responses: [{ json: { done: false, nextRecordsUrl: '/services/data/v62.0/query/01gXX-2000', records: [{ Id: '001', SystemModstamp: '2026-01-05T00:00:00.000+0000' }] } }],
    url: `https://acme.my.salesforce.com/services/data/v62.0/query?q=SELECT FIELDS(STANDARD) FROM Account WHERE SystemModstamp > ${HW} ORDER BY SystemModstamp ASC`, headers: { authorization: 'Bearer T' }, refs: ['001'], next: { hw: HW, pg: '/services/data/v62.0/query/01gXX-2000', mx: '2026-01-05T00:00:00.000Z' }, validate: 'https://acme.my.salesforce.com/services/data/v62.0/limits' },
  { key: 'stripe', creds: { api_key: 'sk_test_x', stripe_account: 'acct_1' }, object: 'customers', cursor: JSON.stringify({ hw: '1700000000' }), responses: [{ json: { data: [{ id: 'cus_2', created: 1700000200 }, { id: 'cus_1', created: 1700000100 }], has_more: true } }],
    url: 'https://api.stripe.com/v1/customers?limit=100&created[gte]=1700000000', headers: { authorization: 'Bearer sk_test_x', 'stripe-account': 'acct_1' }, refs: ['cus_2', 'cus_1'], next: { hw: '1700000000', pg: 'cus_1', mx: '1700000200' }, validate: 'https://api.stripe.com/v1/balance' },
  { key: 'xero', creds: { access_token: 'T', tenant_id: 'TT' }, object: 'Invoices', cursor: hwCursor(), responses: [{ json: { Invoices: [{ InvoiceID: 'i1', UpdatedDateUTC: '/Date(1700000000000+0000)/' }] } }],
    url: 'https://api.xero.com/api.xro/2.0/Invoices?page=1', headers: { authorization: 'Bearer T', 'xero-tenant-id': 'TT', 'if-modified-since': '2026-01-01T00:00:00' }, refs: ['i1'], next: { hw: '2023-11-14T22:13:20.000Z' }, validate: 'https://api.xero.com/connections' },
  { key: 'databricks', creds: { host: 'adb-1.azuredatabricks.net', access_token: 'T', warehouse_id: 'W', primary_key: 'id' }, object: 'main.sales.orders', cursor: hwCursor('2026-01-01T00:00:00.000'), responses: [{ json: { status: { state: 'SUCCEEDED' }, manifest: { schema: { columns: [{ name: 'id' }, { name: '__ll_hw' }] } }, result: { data_array: [['1', '2026-02-01T00:00:00.000']] } } }],
    url: 'https://adb-1.azuredatabricks.net/api/2.0/sql/statements', method: 'POST', headers: { authorization: 'Bearer T' }, bodyIncludes: { warehouse_id: 'W', parameters: [{ name: 'hw', value: '2026-01-01T00:00:00.000', type: 'STRING' }] }, refs: ['1'], next: { hw: '2026-02-01T00:00:00.000' } },
  { key: 'google-bigquery', creds: { access_token: 'T', project: 'my-proj-123', primary_key: 'id' }, object: 'sales.orders', cursor: null, responses: [{ json: { jobComplete: true, schema: { fields: [{ name: 'id' }, { name: '__ll_hw' }] }, rows: [{ f: [{ v: '1' }, { v: '2026-02-01T00:00:00.000' }] }] } }],
    url: 'https://bigquery.googleapis.com/bigquery/v2/projects/my-proj-123/queries', method: 'POST', headers: { authorization: 'Bearer T' }, refs: ['1'], next: { hw: '2026-02-01T00:00:00.000' } },
];

for (const c of CASES) {
  test(`${c.key}/${c.object}: ${c.cursor ? 'cursor ' + c.cursor.slice(0, 40) : 'first pull'} builds the documented request and moves the cursor`, async () => {
    const f = fakeFetch(c.responses);
    const r = await ADAPTERS[c.key].pull(c.object, c.cursor, c.creds, f);
    const call = f.calls[0];
    if (c.url) assert.equal(dec(call.url), c.url);
    for (const part of c.urlIncludes ?? []) assert.ok(dec(call.url).includes(dec(part)) || call.url.includes(part), `${part} not in ${call.url}`);
    if (c.method) assert.equal(call.init.method, c.method);
    if (c.body) assert.deepEqual(body(call), c.body);
    for (const [k, v] of Object.entries(c.bodyIncludes ?? {})) assert.deepEqual(body(call)[k], v);
    for (const [k, v] of Object.entries(c.headers)) assert.equal(hdr(call, k), v, `header ${k}`);
    assert.deepEqual(r.records.map((x) => x.source_ref), c.refs);
    assert.deepEqual(decodeCursor(r.nextCursor), c.next);
    assert.equal(r.hasMore, c.next.pg !== undefined);
  });
}

test('every generic adapter validates against its documented endpoint with the same auth headers', async () => {
  const seen = new Set();
  for (const c of CASES.filter((x) => x.validate)) {
    const f = fakeFetch([{ json: {} }]);
    const v = await ADAPTERS[c.key].validate(c.creds, f);
    assert.equal(v.ok, true, c.key);
    assert.equal(dec(f.calls[0].url), c.validate, c.key);
    for (const [k, val] of Object.entries(c.headers)) if (k !== 'if-modified-since') assert.equal(hdr(f.calls[0], k) ?? '', k === 'xero-tenant-id' ? '' : val, `${c.key} validate header ${k}`);
    seen.add(c.key);
  }
  assert.equal(seen.size, 13);
  const esri = fakeFetch([{ json: { name: 'Assets' } }]);
  const ec = { access_token: 'T', service_url: 'https://services.arcgis.com/abc/arcgis/rest/services/Assets/FeatureServer/0' };
  assert.equal((await ADAPTERS['esri-arcgis'].validate(ec, esri)).account, 'Assets');
  assert.equal(esri.calls[0].url, `${ec.service_url}?f=json`);
  assert.equal(hdr(esri.calls[0], 'x-esri-authorization'), 'Bearer T');
  const dbx = fakeFetch([{ json: { status: { state: 'SUCCEEDED' }, manifest: { schema: { columns: [] } }, result: { data_array: [] } } }]);
  await ADAPTERS.databricks.validate({ host: 'adb-1.azuredatabricks.net', access_token: 'T', warehouse_id: 'W' }, dbx);
  assert.equal(body(dbx.calls[0]).statement, 'SELECT 1');
  const bq = fakeFetch([{ json: { jobComplete: true, schema: { fields: [] }, rows: [] } }]);
  assert.equal((await ADAPTERS['google-bigquery'].validate({ access_token: 'T', project: 'my-proj-123' }, bq)).account, 'my-proj-123');
  assert.equal(body(bq.calls[0]).useLegacySql, false);
});

test('pagination links from the vendor are only followed on the vendor host', async () => {
  const evil = fakeFetch([{ json: { data: [], meta: { paging: { next: 'https://evil.example.com/steal' } } } }]);
  await assert.rejects(() => ADAPTERS['clio-manage'].pull('matters', null, { access_token: 'T' }, evil), /outside the vendor host/);
  const sf = fakeFetch([{ json: { done: false, nextRecordsUrl: '/services/data/v62.0/query/X', records: [] } }, { json: { records: [], done: true } }]);
  const r = await ADAPTERS.salesforce.pull('Account', null, { access_token: 'T', instance_url: 'https://acme.my.salesforce.com' }, sf);
  await ADAPTERS.salesforce.pull('Account', r.nextCursor, { access_token: 'T', instance_url: 'https://acme.my.salesforce.com' }, sf);
  assert.equal(sf.calls[1].url, 'https://acme.my.salesforce.com/services/data/v62.0/query/X');
  await assert.rejects(() => ADAPTERS.salesforce.pull('Account', null, { access_token: 'T', instance_url: 'https://evil.example.com' }, fakeFetch()), /not a Salesforce host/);
  await assert.rejects(() => ADAPTERS.mailchimp.pull('lists', null, { access_token: 'T', dc: 'evil.com/x' }, fakeFetch()), /data center/);
  await assert.rejects(() => ADAPTERS['clio-manage'].pull('matters', null, { access_token: 'T', region_host: 'evil.com' }, fakeFetch()), /region host/);
  await assert.rejects(() => ADAPTERS['esri-arcgis'].pull('features', null, { access_token: 'T', service_url: 'http://insecure/FeatureServer/0' }, fakeFetch()), /FeatureServer/);
});

test('business central: app-only token, company-scoped OData with $filter on lastModifiedDateTime, nextLink paging', async () => {
  const creds = { tenant_id: 'ten', environment: 'prod', company_id: 'C1', client_id: 'cid', client_secret: 'sec' };
  const f = fakeFetch([{ json: { access_token: 'BCT' } }, { json: { value: [{ id: 'g1', lastModifiedDateTime: '2026-01-02T00:00:00Z' }], '@odata.nextLink': 'https://api.businesscentral.dynamics.com/v2.0/ten/prod/api/v2.0/companies(C1)/customers?$skiptoken=1' } }]);
  const r = await ADAPTERS['dynamics-365-business-central'].pull('customers', hwCursor(), creds, f);
  assert.equal(f.calls[0].url, 'https://login.microsoftonline.com/ten/oauth2/v2.0/token');
  assert.equal(new URLSearchParams(f.calls[0].init.body).get('scope'), 'https://api.businesscentral.dynamics.com/.default');
  assert.equal(dec(f.calls[1].url), `https://api.businesscentral.dynamics.com/v2.0/ten/prod/api/v2.0/companies(C1)/customers?$orderby=lastModifiedDateTime&$top=1000&$filter=lastModifiedDateTime gt ${HW}`);
  assert.equal(hdr(f.calls[1], 'authorization'), 'Bearer BCT');
  assert.equal(r.hasMore, true);
  assert.ok(decodeCursor(r.nextCursor).pg.endsWith('$skiptoken=1'));
  const v = fakeFetch([{ json: { access_token: 'BCT' } }, { json: { value: [] } }]);
  await ADAPTERS['dynamics-365-business-central'].validate(creds, v);
  assert.equal(v.calls[1].url, 'https://api.businesscentral.dynamics.com/v2.0/ten/prod/api/v2.0/companies');
});

test('stripe: a multi-page newest-first pass only moves the high-water mark when the pass ends', async () => {
  const c = { api_key: 'sk', };
  const f = fakeFetch([
    { json: { data: [{ id: 'c3', created: 300 }, { id: 'c2', created: 200 }], has_more: true } },
    { json: { data: [{ id: 'c1', created: 100 }], has_more: false } },
  ]);
  const r1 = await ADAPTERS.stripe.pull('charges', JSON.stringify({ hw: '50' }), c, f);
  assert.deepEqual(decodeCursor(r1.nextCursor), { hw: '50', pg: 'c2', mx: '300' });
  const r2 = await ADAPTERS.stripe.pull('charges', r1.nextCursor, c, f);
  assert.match(f.calls[1].url, /starting_after=c2/);
  assert.deepEqual(decodeCursor(r2.nextCursor), { hw: '300' });
  assert.equal(r2.hasMore, false);
});

test('every implemented adapter has the contract shape and a distinct key', () => {
  const keys = Object.keys(ADAPTERS);
  assert.ok(keys.length >= 26);
  for (const [k, a] of Object.entries(ADAPTERS)) {
    assert.equal(a.key, k, `${k}: adapter.key must equal its registry key`);
    assert.ok(Array.isArray(a.objects), k);
    assert.equal(typeof a.validate, 'function', k);
    assert.equal(typeof a.pull, 'function', k);
  }
  assert.ok(!('azure-synapse' in ADAPTERS), 'TDS-only: deliberately not faked');
});

test('adapters reject unknown objects instead of guessing', async () => {
  for (const [k, a] of Object.entries(ADAPTERS)) {
    if (!a.objects.length) continue;
    await assert.rejects(() => a.pull('definitely_not_an_object', null, {}, fakeFetch()), /unknown object|missing credential|invalid|must be|outside|no response queued/, k);
  }
});
