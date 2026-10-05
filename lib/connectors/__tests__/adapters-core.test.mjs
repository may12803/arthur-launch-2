import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { quickbooksOnline } from '../adapters/quickbooks-online.ts';
import { shopify } from '../adapters/shopify.ts';
import { hubspot } from '../adapters/hubspot.ts';
import { square } from '../adapters/square.ts';
import { snowflake } from '../adapters/snowflake.ts';
import { amazonS3 } from '../adapters/amazon-s3.ts';
import { microsoft365 } from '../adapters/microsoft-365.ts';
import { createUploadAdapter } from '../adapters/csv-excel-upload.ts';
import { createSftpAdapter } from '../adapters/sftp-drop.ts';
import { decodeCursor } from '../adapters/common.ts';
import { applyMapping } from '../upload/map.ts';
import { parseCsv } from '../upload/parse.ts';
import { HttpError } from '../types.ts';
import { fakeFetch, routedFetch, hdr, body, rsaPem } from './_helpers.mjs';

const dec = (u) => decodeURIComponent(u.replace(/\+/g, ' '));

// ---------------- QuickBooks Online
const qbo = { access_token: 'TOK', realm_id: '9130' };
const qboItems = (n, t0 = Date.UTC(2026, 9, 1)) => Array.from({ length: n }, (_, i) => ({ Id: String(i + 1), MetaData: { LastUpdatedTime: new Date(t0 + i * 60000).toISOString() } }));

test('quickbooks: first pull queries the realm with bearer auth, no WHERE, startposition 1', async () => {
  const f = fakeFetch([{ json: { QueryResponse: { Customer: [{ Id: '1', MetaData: { LastUpdatedTime: '2026-10-01T10:00:00-07:00' } }, { Id: '2', MetaData: { LastUpdatedTime: '2026-10-02T10:00:00-07:00' } }] } } }]);
  const r = await quickbooksOnline.pull('Customer', null, qbo, f);
  const c = f.calls[0];
  assert.ok(c.url.startsWith('https://quickbooks.api.intuit.com/v3/company/9130/query?query='));
  assert.equal(dec(c.url).split('query=')[1], 'select * from Customer order by MetaData.LastUpdatedTime startposition 1 maxresults 1000');
  assert.equal(hdr(c, 'authorization'), 'Bearer TOK');
  assert.deepEqual(r.records.map((x) => x.source_ref), ['1', '2']);
  assert.equal(r.hasMore, false);
  assert.deepEqual(decodeCursor(r.nextCursor), { hw: '2026-10-02T17:00:00.000Z' });
});

test('quickbooks: the stored high-water mark becomes a WHERE; a full page continues with startposition', async () => {
  const hw = '2026-10-02T17:00:00.000Z';
  const f = fakeFetch([{ json: { QueryResponse: { Invoice: qboItems(1000) } } }, { json: { QueryResponse: {} } }]);
  const r1 = await quickbooksOnline.pull('Invoice', JSON.stringify({ hw }), qbo, f);
  assert.match(dec(f.calls[0].url), /select \* from Invoice where MetaData\.LastUpdatedTime > '2026-10-02T17:00:00\.000Z' order by/);
  assert.equal(r1.hasMore, true);
  const s = decodeCursor(r1.nextCursor);
  assert.equal(s.hw, hw, 'high-water mark does not move until the pass ends');
  assert.equal(s.pg, '1000');
  assert.equal(s.mx, qboItems(1000)[999].MetaData.LastUpdatedTime);
  const r2 = await quickbooksOnline.pull('Invoice', r1.nextCursor, qbo, f);
  assert.match(dec(f.calls[1].url), /startposition 1001 maxresults 1000/);
  assert.equal(r2.hasMore, false);
  assert.equal(decodeCursor(r2.nextCursor).hw, s.mx, 'pass complete: hw := max seen');
});

test('quickbooks: validate hits companyinfo; sandbox uses the sandbox host; missing realm is an error; 429 carries Retry-After', async () => {
  const f = fakeFetch([{ json: { CompanyInfo: { CompanyName: 'Acme Co' } } }]);
  const v = await quickbooksOnline.validate(qbo, f);
  assert.equal(f.calls[0].url, 'https://quickbooks.api.intuit.com/v3/company/9130/companyinfo/9130');
  assert.deepEqual(v, { ok: true, detail: 'credentials accepted', account: 'Acme Co' });
  const g = fakeFetch([{ json: {} }]);
  await quickbooksOnline.validate({ ...qbo, sandbox: 'true' }, g);
  assert.ok(g.calls[0].url.startsWith('https://sandbox-quickbooks.api.intuit.com/'));
  await assert.rejects(() => quickbooksOnline.pull('Customer', null, { access_token: 'x' }, fakeFetch()), /realm_id/);
  const h = fakeFetch([{ status: 429, json: {}, headers: { 'retry-after': '30' } }]);
  await assert.rejects(() => quickbooksOnline.pull('Customer', null, qbo, h), (e) => e instanceof HttpError && e.retryAfterMs === 30000);
  await assert.rejects(() => quickbooksOnline.pull('Nope', null, qbo, fakeFetch()), /unknown object/);
});

// ---------------- Shopify
const shp = { shop: 'acme', access_token: 'shpat_x' };
const orderPage = (ids, next) => ({ json: { data: { orders: { edges: ids.map((id, i) => ({ node: { id, updatedAt: `2026-10-0${i + 1}T00:00:00Z` } })), pageInfo: { hasNextPage: !!next, endCursor: next ?? null } } } } });

test('shopify: GraphQL POST with the access-token header, cursor pagination, then high-water filter', async () => {
  const f = fakeFetch([orderPage(['gid://1', 'gid://2'], 'CUR1'), orderPage(['gid://3'], null), orderPage([], null)]);
  const r1 = await shopify.pull('orders', null, shp, f);
  const c = f.calls[0];
  assert.equal(c.url, 'https://acme.myshopify.com/admin/api/2025-10/graphql.json');
  assert.equal(c.init.method, 'POST');
  assert.equal(hdr(c, 'x-shopify-access-token'), 'shpat_x');
  assert.deepEqual(body(c).variables, { after: null, q: null });
  assert.match(body(c).query, /orders\(first:250,after:\$after,query:\$q,sortKey:UPDATED_AT\)/);
  assert.equal(r1.hasMore, true);
  assert.equal(decodeCursor(r1.nextCursor).pg, 'CUR1');
  const r2 = await shopify.pull('orders', r1.nextCursor, shp, f);
  assert.equal(body(f.calls[1]).variables.after, 'CUR1');
  assert.equal(r2.hasMore, false);
  const s = decodeCursor(r2.nextCursor);
  assert.equal(s.hw, '2026-10-02T00:00:00.000Z', 'page 2 only had an Oct 1 order; the Oct 2 maximum from page 1 is carried to the end of the pass');
});

test('shopify: stored high-water mark becomes an updated_at filter', async () => {
  const f = fakeFetch([orderPage([], null)]);
  await shopify.pull('customers', JSON.stringify({ hw: '2026-10-02T00:00:00.000Z' }), shp, f);
  assert.equal(body(f.calls[0]).variables.q, "updated_at:>='2026-10-02T00:00:00.000Z'");
});

test('shopify: THROTTLED becomes a retryable 429, other GraphQL errors fail, shop host is allow-listed, validate asks for shop name', async () => {
  const t = fakeFetch([{ json: { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] } }]);
  await assert.rejects(() => shopify.pull('orders', null, shp, t), (e) => e instanceof HttpError && e.status === 429 && e.retryAfterMs > 0);
  await assert.rejects(() => shopify.pull('orders', null, shp, fakeFetch([{ json: { errors: [{ message: 'Access denied' }] } }])), /Access denied/);
  await assert.rejects(() => shopify.pull('orders', null, { ...shp, shop: 'evil.example.com' }, fakeFetch()), /myshopify/);
  const v = fakeFetch([{ json: { data: { shop: { name: 'Acme Goods' } } } }]);
  assert.equal((await shopify.validate({ ...shp, api_version: '2026-01' }, v)).account, 'Acme Goods');
  assert.equal(v.calls[0].url, 'https://acme.myshopify.com/admin/api/2026-01/graphql.json');
  assert.equal(body(v.calls[0]).query, '{ shop { name } }');
});

// ---------------- HubSpot
test('hubspot: CRM search sorted by last-modified ascending, `after` paging, GTE filter from the cursor', async () => {
  const f = fakeFetch([
    { json: { results: [{ id: '1', properties: { lastmodifieddate: '2026-10-01T00:00:00Z' } }], paging: { next: { after: '100' } } } },
    { json: { results: [{ id: '2', properties: { lastmodifieddate: '2026-10-03T00:00:00Z' } }] } },
    { json: { results: [] } },
  ]);
  const cred = { access_token: 'HT' };
  const r1 = await hubspot.pull('contacts', null, cred, f);
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.hubapi.com/crm/v3/objects/contacts/search');
  assert.equal(hdr(c, 'authorization'), 'Bearer HT');
  assert.deepEqual(body(c).sorts, [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }]);
  assert.equal(body(c).limit, 100);
  assert.equal(body(c).filterGroups, undefined);
  assert.equal(decodeCursor(r1.nextCursor).pg, '100');
  const r2 = await hubspot.pull('contacts', r1.nextCursor, cred, f);
  assert.equal(body(f.calls[1]).after, '100');
  assert.equal(r2.hasMore, false);
  assert.equal(decodeCursor(r2.nextCursor).hw, '2026-10-03T00:00:00.000Z');
  await hubspot.pull('companies', r2.nextCursor, cred, f);
  assert.deepEqual(body(f.calls[2]).filterGroups, [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: '2026-10-03T00:00:00.000Z' }] }]);
});

test('hubspot: near the 10,000 result cap the pass stops paging and the next pass re-anchors on the high-water mark', async () => {
  const f = fakeFetch([{ json: { results: [{ id: '1', properties: { hs_lastmodifieddate: '2026-10-05T00:00:00Z' } }], paging: { next: { after: '9900' } } } }]);
  const r = await hubspot.pull('deals', null, { access_token: 'x' }, f);
  assert.equal(r.hasMore, false);
  assert.equal(decodeCursor(r.nextCursor).hw, '2026-10-05T00:00:00.000Z');
  assert.equal(decodeCursor(r.nextCursor).pg, undefined);
  const v = fakeFetch([{ json: { portalId: 12345 } }]);
  assert.equal((await hubspot.validate({ access_token: 'x' }, v)).account, '12345');
  assert.equal(v.calls[0].url, 'https://api.hubapi.com/account-info/v3/details');
});

// ---------------- Square
test('square: payments use begin_time + cursor with the version header; sandbox switches host', async () => {
  const f = fakeFetch([{ json: { payments: [{ id: 'p1', updated_at: '2026-10-01T00:00:00Z' }], cursor: 'SQ1' } }, { json: { payments: [{ id: 'p2', updated_at: '2026-10-02T00:00:00Z' }] } }]);
  const cred = { access_token: 'SQT' };
  const r1 = await square.pull('payments', null, cred, f);
  assert.equal(f.calls[0].url, 'https://connect.squareup.com/v2/payments?sort_order=ASC&limit=100');
  assert.equal(hdr(f.calls[0], 'authorization'), 'Bearer SQT');
  assert.equal(hdr(f.calls[0], 'square-version'), '2025-01-23');
  assert.equal(decodeCursor(r1.nextCursor).pg, 'SQ1');
  const r2 = await square.pull('payments', r1.nextCursor, cred, f);
  assert.match(f.calls[1].url, /&cursor=SQ1$/);
  assert.equal(decodeCursor(r2.nextCursor).hw, '2026-10-02T00:00:00.000Z');
  const g = fakeFetch([{ json: { payments: [] } }]);
  await square.pull('payments', r2.nextCursor, { ...cred, sandbox: 'true' }, g);
  assert.ok(g.calls[0].url.startsWith('https://connect.squareupsandbox.com/v2/payments?begin_time=2026-10-02T00%3A00%3A00.000Z'));
});

test('square: orders require location ids and search by updated_at; validate lists locations', async () => {
  await assert.rejects(() => square.pull('orders', null, { access_token: 'x' }, fakeFetch()), /location_ids/);
  const f = fakeFetch([{ json: { orders: [] } }]);
  await square.pull('orders', JSON.stringify({ hw: '2026-10-02T00:00:00.000Z' }), { access_token: 'x', location_ids: 'L1, L2' }, f);
  assert.equal(f.calls[0].url, 'https://connect.squareup.com/v2/orders/search');
  assert.deepEqual(body(f.calls[0]).location_ids, ['L1', 'L2']);
  assert.deepEqual(body(f.calls[0]).query.filter, { date_time_filter: { updated_at: { start_at: '2026-10-02T00:00:00.000Z' } } });
  assert.equal(body(f.calls[0]).query.sort.sort_field, 'UPDATED_AT');
  const v = fakeFetch([{ json: { locations: [{ merchant_id: 'MERCH' }] } }]);
  assert.equal((await square.validate({ access_token: 'x' }, v)).account, 'MERCH');
  assert.equal(v.calls[0].url, 'https://connect.squareup.com/v2/locations');
});

// ---------------- Snowflake
const pem = rsaPem();
const sf = { account: 'xy12345.us-east-1', user: 'svc', private_key: pem, primary_key: 'ID', warehouse: 'WH', database: 'DB' };
const sfResp = (rows, parts = 1) => ({ json: { statementHandle: 'H1', resultSetMetaData: { rowType: [{ name: 'ID' }, { name: 'NAME' }, { name: '__LL_HW' }], partitionInfo: Array.from({ length: parts }, () => ({})) }, data: rows } });

test('snowflake: SQL API v2 POST with key-pair JWT headers and an updated-at window', async () => {
  const f = fakeFetch([sfResp([['1', 'a', '2026-10-01T00:00:00.000'], ['2', 'b', '2026-10-02T00:00:00.000']])]);
  const r = await snowflake.pull('ANALYTICS.ORDERS', null, sf, f);
  const c = f.calls[0];
  assert.equal(c.url, 'https://xy12345.us-east-1.snowflakecomputing.com/api/v2/statements');
  assert.match(hdr(c, 'authorization'), /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(hdr(c, 'x-snowflake-authorization-token-type'), 'KEYPAIR_JWT');
  const b = body(c);
  assert.match(b.statement, /FROM ANALYTICS\.ORDERS ORDER BY UPDATED_AT ASC LIMIT 1000$/);
  assert.equal(b.warehouse, 'WH');
  assert.equal(b.bindings, undefined);
  assert.deepEqual(r.records.map((x) => x.source_ref), ['1', '2']);
  assert.deepEqual(r.records[0].payload, { ID: '1', NAME: 'a' }, 'the helper hw column is not part of the payload');
  assert.deepEqual(decodeCursor(r.nextCursor), { hw: '2026-10-02T00:00:00.000' });
});

test('snowflake: a stored cursor is bound as a parameter, never spliced into SQL', async () => {
  const f = fakeFetch([sfResp([])]);
  await snowflake.pull('ORDERS', JSON.stringify({ hw: "2026-10-02T00:00:00.000' OR '1'='1" }), sf, f);
  const b = body(f.calls[0]);
  assert.match(b.statement, /WHERE UPDATED_AT >= TO_TIMESTAMP_NTZ\(\?\)/);
  assert.ok(!b.statement.includes("'1'='1"), 'cursor text must not appear in the statement');
  assert.deepEqual(b.bindings, { '1': { type: 'TEXT', value: "2026-10-02T00:00:00.000' OR '1'='1" } });
});

test('snowflake: identifiers are validated; extra partitions are fetched; a stuck window is an error', async () => {
  await assert.rejects(() => snowflake.pull('orders; DROP TABLE x', null, sf, fakeFetch()), /invalid table name/);
  await assert.rejects(() => snowflake.pull('ORDERS', null, { ...sf, updated_at_column: 'ts; --' }, fakeFetch()), /invalid updated-at column/);
  await assert.rejects(() => snowflake.pull('ORDERS', null, { ...sf, primary_key: undefined }, fakeFetch()), /primary_key/);
  await assert.rejects(() => snowflake.pull('ORDERS', null, { ...sf, account: 'evil.com/x' }, fakeFetch()), /invalid account/);
  const f = fakeFetch([sfResp([['1', 'a', '2026-10-01T00:00:00.000']], 2), { json: { data: [['2', 'b', '2026-10-02T00:00:00.000']] } }]);
  const r = await snowflake.pull('ORDERS', null, sf, f);
  assert.equal(f.calls[1].url, 'https://xy12345.us-east-1.snowflakecomputing.com/api/v2/statements/H1?partition=1');
  assert.equal(r.records.length, 2);
  const same = Array.from({ length: 1000 }, (_, i) => [String(i), 'x', '2026-10-01T00:00:00.000']);
  await assert.rejects(() => snowflake.pull('ORDERS', JSON.stringify({ hw: '2026-10-01T00:00:00.000' }), sf, fakeFetch([sfResp(same)])), /cannot advance/);
  const full = await snowflake.pull('ORDERS', null, sf, fakeFetch([sfResp(same.map((r, i) => [r[0], 'x', `2026-10-01T00:00:${String(i % 60).padStart(2, '0')}.000`]))]));
  assert.equal(full.hasMore, true, 'a full window means there may be more');
  const v = fakeFetch([{ json: { statementHandle: 'h', resultSetMetaData: { rowType: [{ name: 'A' }] }, data: [['XY12345']] } }]);
  assert.equal((await snowflake.validate(sf, v)).account, 'XY12345');
  assert.equal(body(v.calls[0]).statement, 'SELECT CURRENT_ACCOUNT() AS A');
});

// ---------------- Amazon S3 via assumed role
const stsXml = '<AssumeRoleResponse><AssumeRoleResult><Credentials><AccessKeyId>ASIATEMPKEY</AccessKeyId><SecretAccessKey>tmpsecret</SecretAccessKey><SessionToken>SESSIONTOK</SessionToken><Expiration>2026-10-05T13:00:00Z</Expiration></Credentials></AssumeRoleResult></AssumeRoleResponse>';
const listXml = (keys, truncated) => `<ListBucketResult><IsTruncated>${truncated}</IsTruncated>${keys.map((k, i) => `<Contents><Key>${k}</Key><LastModified>2026-10-0${i + 1}T01:00:00.000Z</LastModified><ETag>&quot;etag${i}&quot;</ETag><Size>${10 + i}</Size></Contents>`).join('')}</ListBucketResult>`;
const s3c = { aws_access_key_id: 'AKIAPLATFORM', aws_secret_access_key: 'platsecret', role_arn: 'arn:aws:iam::111122223333:role/LOVELEEDAYReadRole', external_id: 'ext-1', bucket: 'acme-data', region: 'us-east-2', prefix: 'in/' };
const s3Router = (xml) => routedFetch((url) => (url.includes('sts.') ? { text: stsXml } : { text: xml }));

test('s3: assumes the customer role with ExternalId, then lists with a SigV4-signed ListObjectsV2', async () => {
  const f = s3Router(listXml(['in/2026-10-01.csv', 'in/2026-10-02.csv'], true));
  const r = await amazonS3.pull('objects', null, s3c, f);
  const [sts, list] = f.calls;
  assert.equal(sts.url, 'https://sts.us-east-2.amazonaws.com/');
  const p = new URLSearchParams(sts.init.body);
  assert.equal(p.get('ExternalId'), 'ext-1');
  assert.equal(p.get('RoleArn'), s3c.role_arn);
  assert.equal(list.url, 'https://acme-data.s3.us-east-2.amazonaws.com/?list-type=2&max-keys=1000&prefix=in%2F');
  assert.match(hdr(list, 'authorization'), /^AWS4-HMAC-SHA256 Credential=ASIATEMPKEY\/\d{8}\/us-east-2\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/);
  assert.equal(hdr(list, 'x-amz-security-token'), 'SESSIONTOK');
  assert.equal(hdr(list, 'x-amz-content-sha256'), createHash('sha256').update('').digest('hex'));
  assert.ok(!JSON.stringify(list.init.headers).includes('tmpsecret'));
  assert.deepEqual(r.records.map((x) => x.source_ref), ['acme-data/in/2026-10-01.csv', 'acme-data/in/2026-10-02.csv']);
  assert.deepEqual(r.records[0].payload, { bucket: 'acme-data', key: 'in/2026-10-01.csv', size: 10, etag: 'etag0', last_modified: '2026-10-01T01:00:00.000Z' });
  assert.equal(r.hasMore, true);
  assert.equal(decodeCursor(r.nextCursor).pg, 'in/2026-10-02.csv');
});

test('s3: StartAfter continues from the last key; the final page stores it as the high-water mark', async () => {
  const f = s3Router(listXml(['in/2026-10-03.csv'], false));
  const r = await amazonS3.pull('objects', JSON.stringify({ hw: 'in/2026-10-02.csv', pg: 'in/2026-10-02.csv' }), s3c, f);
  assert.equal(f.calls[1].url, 'https://acme-data.s3.us-east-2.amazonaws.com/?list-type=2&max-keys=1000&prefix=in%2F&start-after=in%2F2026-10-02.csv');
  assert.equal(r.hasMore, false);
  assert.deepEqual(decodeCursor(r.nextCursor), { hw: 'in/2026-10-03.csv' });
  const e = s3Router(listXml([], false));
  const none = await amazonS3.pull('objects', JSON.stringify({ hw: 'in/z.csv' }), s3c, e);
  assert.deepEqual(decodeCursor(none.nextCursor), { hw: 'in/z.csv' }, 'empty listing keeps the mark');
});

test('s3: bucket and region are validated, AccessDenied surfaces without secrets, validate does a max-keys=1 list', async () => {
  await assert.rejects(() => amazonS3.pull('objects', null, { ...s3c, bucket: 'Bad_Bucket' }, fakeFetch()), /invalid bucket/);
  await assert.rejects(() => amazonS3.pull('objects', null, { ...s3c, external_id: undefined }, fakeFetch()), /external_id/);
  const denied = routedFetch((url) => (url.includes('sts.') ? { text: stsXml } : { status: 403, text: '<Error><Code>AccessDenied</Code></Error>' }));
  await assert.rejects(() => amazonS3.pull('objects', null, s3c, denied), (e) => e instanceof HttpError && e.status === 403 && /AccessDenied/.test(e.message) && !/tmpsecret/.test(e.message + e.body));
  const v = s3Router(listXml([], false));
  assert.equal((await amazonS3.validate(s3c, v)).account, 'acme-data');
  assert.match(v.calls[1].url, /max-keys=1&prefix=in%2F$/);
});

// ---------------- Microsoft 365
const m365 = { tenant_id: 'ten', client_id: 'cid', client_secret: 'sec', user_id: 'u@x.com' };
const GRAPH = 'https://graph.microsoft.com/v1.0';
const graphRouter = (pages) => { let i = 0; return routedFetch((url) => (url.includes('login.microsoftonline.com') ? { json: { access_token: 'GT', expires_in: 3600 } } : pages[i++] ?? { json: { value: [] } })); };

test('microsoft-365: client-credentials token, then delta with nextLink paging and a deltaLink cursor', async () => {
  const f = graphRouter([
    { json: { value: [{ id: 'm1' }, { id: 'm2' }], '@odata.nextLink': `${GRAPH}/users/u%40x.com/mailFolders/inbox/messages/delta?$skiptoken=S1` } },
    { json: { value: [{ id: 'm3' }, { id: 'm4', '@removed': { reason: 'deleted' } }], '@odata.deltaLink': `${GRAPH}/users/u%40x.com/mailFolders/inbox/messages/delta?$deltatoken=D1` } },
    { json: { value: [], '@odata.deltaLink': `${GRAPH}/users/u%40x.com/mailFolders/inbox/messages/delta?$deltatoken=D2` } },
  ]);
  const r1 = await microsoft365.pull('messages', null, m365, f);
  assert.equal(f.calls[0].url, 'https://login.microsoftonline.com/ten/oauth2/v2.0/token');
  const tp = new URLSearchParams(f.calls[0].init.body);
  assert.equal(tp.get('grant_type'), 'client_credentials');
  assert.equal(tp.get('scope'), 'https://graph.microsoft.com/.default');
  assert.equal(f.calls[1].url, `${GRAPH}/users/u%40x.com/mailFolders/inbox/messages/delta`);
  assert.equal(hdr(f.calls[1], 'authorization'), 'Bearer GT');
  assert.equal(hdr(f.calls[1], 'prefer'), 'odata.maxpagesize=200');
  assert.equal(r1.hasMore, true);
  const r2 = await microsoft365.pull('messages', r1.nextCursor, m365, f);
  assert.ok(f.calls[3].url.endsWith('$skiptoken=S1'), 'follows the nextLink exactly');
  assert.equal(r2.hasMore, false);
  assert.equal(r2.records[1].payload['@removed'].reason, 'deleted', 'deletions are preserved as records');
  const s = decodeCursor(r2.nextCursor);
  assert.ok(s.hw.endsWith('$deltatoken=D1') && s.pg === undefined);
  await microsoft365.pull('messages', r2.nextCursor, m365, f);
  assert.ok(f.calls[5].url.endsWith('$deltatoken=D1'), 'next pass resumes from the deltaLink');
});

test('microsoft-365: 410 Gone restarts with a full pass; links outside Graph are refused; drive items need a drive id', async () => {
  const gone = routedFetch((url) => (url.includes('login.') ? { json: { access_token: 'GT' } } : { status: 410, json: {} }));
  const r = await microsoft365.pull('messages', JSON.stringify({ hw: `${GRAPH}/users/u/messages/delta?$deltatoken=OLD` }), m365, gone);
  assert.deepEqual(r, { records: [], nextCursor: '{}', hasMore: true });
  await assert.rejects(() => microsoft365.pull('messages', JSON.stringify({ pg: 'https://evil.example.com/steal' }), m365, graphRouter([])), /outside Microsoft Graph/);
  await assert.rejects(() => microsoft365.pull('driveItems', null, m365, graphRouter([])), /drive_id/);
  const d = graphRouter([{ json: { value: [{ id: 'd1' }], '@odata.deltaLink': `${GRAPH}/drives/DRV/root/delta?token=T` } }]);
  await microsoft365.pull('driveItems', null, { ...m365, drive_id: 'DRV' }, d);
  assert.equal(d.calls[1].url, `${GRAPH}/drives/DRV/root/delta`);
  const v = graphRouter([{ json: { id: 'u' } }]);
  assert.equal((await microsoft365.validate(m365, v)).ok, true);
  assert.equal(v.calls[1].url, `${GRAPH}/users/u%40x.com?$select=id`);
  const pre = graphRouter([{ json: { value: [] } }]);
  await microsoft365.pull('messages', null, { access_token: 'PRE', user_id: 'u' }, pre);
  assert.ok(!pre.calls.some((c) => c.url.includes('login.microsoftonline.com')), 'a supplied access token skips the token call');
});

// ---------------- CSV/Excel upload + SFTP drop
test('csv-excel-upload: replays accepted batches one at a time with the batch id as cursor', async () => {
  const csv = 'id,when,amt\nR1,2026-01-01,5\nR2,2026-01-02,6\n';
  const mapped = applyMapping({ table: parseCsv(csv), mapping: { id: 'invoice_no', when: 'issued', amt: 'amount' }, fields: [{ name: 'invoice_no', type: 'string', required: true }, { name: 'issued', type: 'date' }, { name: 'amount', type: 'money' }], targetObject: 'invoices', fileSha256: 'ab'.repeat(32), observedAt: '2026-10-05T00:00:00.000Z' });
  const asked = [];
  const source = { listBatches: async (object, after) => { asked.push([object, after]); return after === 'b1' ? [{ id: 'b2', rows: mapped.records.slice(0, 1) }] : [{ id: 'b1', rows: mapped.records }, { id: 'b2', rows: [] }]; } };
  const a = createUploadAdapter(source);
  const r1 = await a.pull('invoices', null, {}, fakeFetch());
  assert.deepEqual(r1.records.map((x) => x.source_ref), [`${'ab'.repeat(32)}:2`, `${'ab'.repeat(32)}:3`]);
  assert.equal(r1.nextCursor, 'b1');
  assert.equal(r1.hasMore, true);
  const r2 = await a.pull('invoices', 'b1', {}, fakeFetch());
  assert.equal(r2.hasMore, false);
  assert.deepEqual(asked, [['invoices', null], ['invoices', 'b1']]);
  const none = await createUploadAdapter({ listBatches: async () => [] }).pull('x', null, {}, fakeFetch());
  assert.deepEqual(none, { records: [], nextCursor: null, hasMore: false });
  assert.equal((await a.validate({}, fakeFetch())).ok, true);
});

const T = 'tenant-1111-2222';
function sftpWith(files) {
  const reads = [];
  return { reads, list: async (dir) => { if (!dir.startsWith(`/tenants/${T}/inbox`)) throw new Error('outside chroot'); return files.filter((f) => !f.dir || f.dir === dir); }, read: async (p) => { reads.push(p); return Buffer.from(files.find((f) => `/tenants/${T}/inbox/orders/${f.name}` === p).content); } };
}

test('sftp-drop: only marked-complete files, oldest first, one file per pull, rows keyed by file sha256 + row', async () => {
  const files = [
    { name: 'a.csv', size: 1, mtimeMs: 1000, content: 'id,qty\n1,5\n2,6\n' },
    { name: 'a.csv.done', size: 0, mtimeMs: 1001 },
    { name: 'b.csv', size: 1, mtimeMs: 2000, content: 'id,qty\n3,7\n' },
    { name: 'c.csv', size: 1, mtimeMs: 3000, content: 'id,qty\n4,8\n' },
    { name: 'c.csv.done', size: 0, mtimeMs: 3001 },
  ];
  const lister = sftpWith(files);
  const a = createSftpAdapter(lister);
  const creds = { tenant_id: T };
  const r1 = await a.pull('orders', null, creds, fakeFetch());
  const sha = createHash('sha256').update(files[0].content).digest('hex');
  assert.deepEqual(r1.records.map((x) => x.source_ref), [`${sha}:2`, `${sha}:3`]);
  assert.deepEqual(r1.records[0].payload, { id: '1', qty: '5' });
  assert.equal(r1.hasMore, true, 'c.csv is also ready');
  const r2 = await a.pull('orders', r1.nextCursor, creds, fakeFetch());
  assert.deepEqual(r2.records.map((x) => x.payload.id), ['4']);
  assert.equal(r2.hasMore, false);
  assert.deepEqual(lister.reads, [`/tenants/${T}/inbox/orders/a.csv`, `/tenants/${T}/inbox/orders/c.csv`], 'b.csv has no .done marker and is never read');
  files.push({ name: 'b.csv.done', size: 0, mtimeMs: 4000 });
  const r3 = await a.pull('orders', r2.nextCursor, creds, fakeFetch());
  assert.deepEqual(r3.records.map((x) => x.payload.id), ['3'], 'a late marker is still picked up');
  const idle = await a.pull('orders', r3.nextCursor, creds, fakeFetch());
  assert.deepEqual(idle, { records: [], nextCursor: null, hasMore: false });
});

test('sftp-drop: the same bytes under a new name produce identical refs; folder names cannot escape the chroot', async () => {
  const content = 'id\n1\n';
  const mk = (name) => createSftpAdapter({ list: async () => [{ name, size: 1, mtimeMs: 5 }, { name: name + '.done', size: 0, mtimeMs: 6 }], read: async () => Buffer.from(content) });
  const a = await mk('one.csv').pull('orders', null, { tenant_id: T }, fakeFetch());
  const b = await mk('two.csv').pull('orders', null, { tenant_id: T }, fakeFetch());
  assert.deepEqual(a.records.map((x) => x.source_ref), b.records.map((x) => x.source_ref));
  await assert.rejects(() => mk('x.csv').pull('../../other', null, { tenant_id: T }, fakeFetch()), /invalid folder/);
  const ok = await createSftpAdapter({ list: async () => [], read: async () => Buffer.alloc(0) }).validate({ tenant_id: T }, fakeFetch());
  assert.equal(ok.account, T);
});
