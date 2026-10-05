import { signOAuth1 } from '../auth/oauth1.ts';
import { requestJson } from '../http.ts';
import { assertPublicHttpsUrl, guardedFetch } from '../net/safe-url.ts';
import type { Adapter, Creds, FetchLike } from '../types.ts';
import { advance, bearer, decodeCursor, entraToken, isoOrUndefined, maxOf, need, toRecords } from './common.ts';
import { makeRestAdapter, nextOffset, offsetOf, qs } from './rest.ts';

const resource = (path: string, listKey: string, timestamp: string, filter: (hw: string) => string) => ({
  req: (c: any) => ({ url: `${c.base}/${path}?${qs({ limit: 100, offset: offsetOf(c), ...(c.hw ? { [filter(c.hw).split('=')[0]]: filter(c.hw).split('=').slice(1).join('=') } : {}) })}` }),
  list: (j: any) => j?.[listKey] ?? [],
  id: (r: any) => String(r.id ?? r.Id ?? r.ID),
  ts: (r: any) => isoOrUndefined(r[timestamp]),
  next: (j: any, c: any) => nextOffset(c, (j?.[listKey] ?? []).length, 100),
});
const instance = (creds: Creds, suffix: string) => { need(creds, 'base_url'); return `${creds.base_url.replace(/\/$/, '')}${suffix}`; };

// Acumatica's endpoint/version convention and filter availability are UNVERIFIED in the research JSON.
export const acumatica = makeRestAdapter({
  key: 'acumatica', guard: true,
  base: (c) => instance(c, `/entity/${encodeURIComponent(c.endpoint || 'Default')}/${encodeURIComponent(c.version || '24.200.001')}`),
  headers: (c) => c.access_token ? bearer(c.access_token) : { authorization: `Basic ${Buffer.from(`${c.username ?? ''}:${c.password ?? ''}`).toString('base64')}` },
  validate: { url: (b) => `${b}/Customer?$top=1` },
  objects: Object.fromEntries(['Customer', 'Vendor', 'Invoice', 'Bill', 'StockItem', 'SalesOrder', 'JournalTransaction', 'Account', 'Payment'].map((p) => [p, resource(p, 'value', 'LastModifiedDateTime', (v) => `$filter=LastModifiedDateTime gt datetimeoffset'${v}'`)])),
});

// Resource names and LastUpdateDate support vary by Oracle pod; GL via BI Publisher is UNVERIFIED here.
export const oracleFusionCloudErp = makeRestAdapter({
  key: 'oracle-fusion-cloud-erp', guard: true,
  base: (c) => instance(c, '/fscmRestApi/resources/11.13.18.05'),
  headers: (c) => bearer(c.access_token),
  validate: { url: (b) => `${b}/invoices?limit=1` },
  objects: Object.fromEntries(['invoices', 'receivablesInvoices', 'suppliers', 'purchaseOrders', 'payments'].map((p) => [p, resource(p, 'items', 'LastUpdateDate', (v) => `q=LastUpdateDate>'${v}'`)])),
});

// ModifiedDateTime is absent from some F&O entities; customers must select only entities that expose it.
export const dynamics365FinanceOperations = makeRestAdapter({
  key: 'dynamics-365-finance-operations', guard: true,
  base: (c) => instance(c, '/data'),
  headers: async (c, f) => { await assertPublicHttpsUrl(c.base_url); return bearer(await entraToken(c, `${c.base_url.replace(/\/$/, '')}/.default`, f)); },
  validate: { url: (b) => `${b}/LegalEntities?$top=1` },
  objects: Object.fromEntries(['CustomersV3', 'VendorsV2', 'SalesOrderHeadersV2', 'CustomerInvoiceHeaders', 'VendorInvoiceHeaders', 'ReleasedProductsV2', 'MainAccounts', 'LegalEntities'].map((p) => [p, {
    req: (c: any) => ({ url: `${c.base}/${p}?${qs({ '$top': 100, '$skip': offsetOf(c), 'cross-company': 'true', ...(c.hw ? { '$filter': `ModifiedDateTime gt ${c.hw}` } : {}) })}` }),
    list: (j: any) => j?.value ?? [], id: (r: any) => String(r.RecId ?? r.id), ts: (r: any) => isoOrUndefined(r.ModifiedDateTime),
    next: (j: any, c: any) => nextOffset(c, (j?.value ?? []).length, 100),
  }])),
});

// Epicor P21 endpoints, token exchange, and date filter are UNVERIFIED; require customer-confirmed paths.
export const epicorProphet21 = makeRestAdapter({
  key: 'epicor-prophet-21', guard: true, base: (c) => instance(c, ''),
  headers: (c) => c.access_token ? bearer(c.access_token) : { authorization: `Basic ${Buffer.from(`${c.username ?? ''}:${c.password ?? ''}`).toString('base64')}` },
  validate: { url: (b, c) => `${b}/${c.validate_path || 'api/customers'}` },
  objects: Object.fromEntries(['customers', 'invoices', 'items', 'orders'].map((p) => [p, resource(`api/${p}`, 'value', 'date_last_modified', (v) => `$filter=date_last_modified gt '${v}'`)])),
});

// Cityworks auth shape and search endpoint paths are UNVERIFIED in the research JSON. Customer /apidocs controls paths.
export const cityworks = makeRestAdapter({
  key: 'cityworks', guard: true, base: (c) => instance(c, '/Cityworks/Services'),
  headers: (c) => bearer(c.access_token),
  validate: { url: (b) => `${b}/General/Authentication/Authenticate` },
  objects: Object.fromEntries(['work orders', 'service requests', 'inspections', 'assets'].map((p) => [p, resource(p.replace(/ /g, ''), 'value', 'ModifiedDate', (v) => `modifiedSince=${v}`)])),
});

// Homebase paths are in its Swagger JSON; exact date-range parameter names are UNVERIFIED.
export const homebase = makeRestAdapter({
  key: 'homebase', base: () => 'https://app.joinhomebase.com/api/public',
  headers: (c) => bearer(c.api_key),
  validate: { url: (b) => `${b}/company` },
  objects: Object.fromEntries(['company', 'locations', 'shifts', 'timecards'].map((p) => [p, resource(p, 'data', 'updated_at', (v) => `updated_since=${v}`)])),
});

// NetSuite REST base path and SuiteQL field coverage are UNVERIFIED in the fetched primary source.
export const netsuite: Adapter = {
  key: 'netsuite', objects: ['customer', 'vendor', 'invoice', 'salesOrder', 'purchaseOrder'],
  async validate(c, raw) { need(c, 'account_id', 'consumer_key', 'consumer_secret', 'token', 'token_secret'); const url = nsUrl(c); await nsPost(c, raw, url, 'SELECT id FROM customer FETCH FIRST 1 ROWS ONLY'); return { ok: true, detail: 'credentials accepted' }; },
  async pull(object, cursor, c, raw) {
    if (!this.objects.includes(object)) throw new Error(`netsuite: unknown object ${object}`);
    const s = decodeCursor(cursor), offset = Number(s.pg ?? 0);
    const where = s.hw ? ` WHERE lastModifiedDate >= '${s.hw.replace(/'/g, "''")}'` : '';
    const rows = (await nsPost(c, raw, nsUrl(c), `SELECT id, lastModifiedDate FROM ${object}${where} ORDER BY lastModifiedDate ASC OFFSET ${offset} ROWS FETCH NEXT 100 ROWS ONLY`))?.items ?? [];
    const records = toRecords(rows, (r) => r.id, (r) => isoOrUndefined(r.lastModifiedDate));
    return advance(s, records, maxOf(rows.map((r: any) => isoOrUndefined(r.lastModifiedDate)), s.mx), rows.length === 100 ? String(offset + 100) : undefined);
  },
};
function nsUrl(c: Creds) { need(c, 'account_id'); if (!/^[a-z0-9_-]+$/i.test(c.account_id)) throw new Error('invalid NetSuite account ID'); return `https://${c.account_id.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`; }
async function nsPost(c: Creds, raw: FetchLike, url: string, query: string): Promise<any> {
  need(c, 'consumer_key', 'consumer_secret', 'token', 'token_secret');
  const authorization = signOAuth1({ method: 'POST', url, consumerKey: c.consumer_key, consumerSecret: c.consumer_secret, token: c.token, tokenSecret: c.token_secret, realm: c.account_id }).header;
  return requestJson(guardedFetch(raw), url, { method: 'POST', headers: { authorization, prefer: 'transient', 'content-type': 'application/json' }, body: JSON.stringify({ q: query }) });
}

// SAP Service Layer sessions expire; login on each call is safe until a session cache is added.
export const sapBusinessOne: Adapter = {
  key: 'sap-business-one', objects: ['BusinessPartners', 'Invoices', 'Orders', 'Items', 'JournalEntries', 'IncomingPayments', 'PurchaseInvoices'],
  async validate(c, raw) { await sapLogin(c, raw); return { ok: true, detail: 'credentials accepted' }; },
  async pull(object, cursor, c, raw) {
    if (!this.objects.includes(object)) throw new Error(`sap-business-one: unknown object ${object}`);
    const fetch = guardedFetch(raw), base = instance(c, '/b1s/v2'), cookie = await sapLogin(c, raw), s = decodeCursor(cursor);
    const url = `${base}/${object}?${qs({ '$top': 100, '$skip': Number(s.pg ?? 0), ...(s.hw ? { '$filter': `UpdateDate ge '${s.hw.slice(0, 10)}'` } : {}) })}`;
    const j = await requestJson<any>(fetch, url, { headers: { cookie } }); const rows = j?.value ?? [];
    const stamp = (r: any) => isoOrUndefined(`${r.UpdateDate?.slice(0, 10)}T${r.UpdateTime || '00:00:00'}Z`);
    return advance(s, toRecords(rows, (r) => r.DocEntry ?? r.ItemCode ?? r.CardCode, stamp), maxOf(rows.map(stamp), s.mx), rows.length === 100 ? String(Number(s.pg ?? 0) + 100) : undefined);
  },
};
async function sapLogin(c: Creds, raw: FetchLike): Promise<string> {
  need(c, 'company_db', 'username', 'password');
  const j = await requestJson<any>(guardedFetch(raw), instance(c, '/b1s/v2/Login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ CompanyDB: c.company_db, UserName: c.username, Password: c.password }) });
  if (!j?.SessionId) throw new Error('SAP login did not return a session');
  return `B1SESSION=${encodeURIComponent(j.SessionId)}`;
}
