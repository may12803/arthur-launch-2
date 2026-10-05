import { bearer, entraToken, isoOrUndefined, need } from './common.ts';
import { makeRestAdapter, nextOffset, offsetOf, qs } from './rest.ts';
import type { RestCtx, RestObjectSpec } from './rest.ts';

// Self-serve systems from data/connectors/systems/*.json that follow the plain "list endpoint + cursor" shape.
// Where the vendor JSON marks a path, parameter or field name UNVERIFIED, the comment on that spec says so; those
// specs are written from the documented endpoint names and must be confirmed against a real sandbox before go-live.

const iso = isoOrUndefined;
const safeUrl = (u: string | undefined, prefix: string): string | undefined => {
  if (u === undefined) return undefined;
  if (!u.startsWith(prefix)) throw new Error('refusing to follow a pagination link outside the vendor host');
  return u;
};

// ---- Blackbaud Raiser's Edge NXT (SKY API). Paths and last_modified filter UNVERIFIED in the vendor JSON. Needs the
// customer's SKY API subscription key in Bb-Api-Subscription-Key on every call.
const BB_PAGE = 500;
const bb = (path: string): RestObjectSpec => ({
  req: (c) => ({ url: `${c.base}${path}?${qs({ limit: BB_PAGE, offset: offsetOf(c), last_modified: c.hw })}` }),
  list: (j) => j?.value ?? [],
  id: (r) => r.id,
  ts: (r) => iso(r.last_modified ?? r.date_modified),
  next: (j, c) => nextOffset(c, (j?.value ?? []).length, BB_PAGE),
});
export const blackbaudRaisersEdgeNxt = makeRestAdapter({
  key: 'blackbaud-raisers-edge-nxt',
  base: () => 'https://api.sky.blackbaud.com',
  headers: (creds) => ({ ...bearer(creds.access_token), 'bb-api-subscription-key': creds.subscription_key ?? '' }),
  validate: { url: (b) => `${b}/constituent/v1/constituents?limit=1` },
  objects: { constituents: bb('/constituent/v1/constituents'), gifts: bb('/gift/v1/gifts') },
});

// ---- Box. Vendor JSON: Events API with stream_position (details UNVERIFIED). Cursor = next_stream_position.
const BOX_LIMIT = 500;
export const box = makeRestAdapter({
  key: 'box',
  base: () => 'https://api.box.com/2.0',
  headers: (creds) => bearer(creds.access_token),
  validate: { url: (b) => `${b}/users/me`, account: (j) => j?.login },
  objects: {
    events: {
      req: (c) => ({ url: `${c.base}/events?${qs({ stream_type: 'changes', limit: BOX_LIMIT, stream_position: c.pg ?? c.hw ?? '0' })}` }),
      list: (j) => j?.entries ?? [],
      id: (r) => r.event_id,
      hwOf: (j) => (j?.next_stream_position !== undefined ? String(j.next_stream_position) : undefined),
      next: (j) => ((j?.entries ?? []).length >= BOX_LIMIT && j?.next_stream_position !== undefined ? String(j.next_stream_position) : undefined),
    },
    root_folder_items: {
      req: (c) => ({ url: `${c.base}/folders/0/items?${qs({ limit: 1000, offset: offsetOf(c), fields: 'id,type,name,modified_at,sha1,size' })}` }),
      list: (j) => j?.entries ?? [],
      id: (r) => `${r.type}:${r.id}`,
      ts: (r) => iso(r.modified_at),
      next: (j, c) => nextOffset(c, (j?.entries ?? []).length, 1000),
    },
  },
});

// ---- Brevo. Vendor JSON: GET /contacts?modifiedSince=ISO with limit/offset. Header is api-key, not bearer.
const BREVO_LIMIT = 500;
const brevo = (path: string, key: string, since?: string): RestObjectSpec => ({
  req: (c) => ({ url: `${c.base}${path}?${qs({ limit: BREVO_LIMIT, offset: offsetOf(c), sort: 'asc', ...(since ? { [since]: c.hw } : {}) })}` }),
  list: (j) => j?.[key] ?? [],
  id: (r) => r.id,
  ts: (r) => iso(r.modifiedAt),
  next: (j, c) => nextOffset(c, (j?.[key] ?? []).length, BREVO_LIMIT),
});
export const brevoAdapter = makeRestAdapter({
  key: 'brevo',
  base: () => 'https://api.brevo.com/v3',
  headers: (creds) => ({ 'api-key': creds.api_key ?? '', accept: 'application/json' }),
  validate: { url: (b) => `${b}/account`, account: (j) => j?.email },
  objects: { contacts: brevo('/contacts', 'contacts', 'modifiedSince'), lists: brevo('/contacts/lists', 'lists'), campaigns: brevo('/emailCampaigns', 'campaigns') },
});

// ---- Buildium. Vendor JSON: LastUpdatedFrom filters on several resources, "not confirmed for every resource".
// The updated-at field name on records is UNVERIFIED; if absent the high-water mark does not advance and each pass is a full read.
const BU_LIMIT = 1000;
const buildium = (path: string, since?: string): RestObjectSpec => ({
  req: (c) => ({ url: `${c.base}${path}?${qs({ limit: BU_LIMIT, offset: offsetOf(c), ...(since ? { [since]: c.hw } : {}) })}` }),
  list: (j) => (Array.isArray(j) ? j : []),
  id: (r) => r.Id,
  ts: (r) => iso(r.LastUpdatedDateTime),
  next: (j, c) => nextOffset(c, Array.isArray(j) ? j.length : 0, BU_LIMIT),
});
export const buildiumAdapter = makeRestAdapter({
  key: 'buildium',
  base: () => 'https://api.buildium.com/v1',
  headers: (creds) => ({ 'x-buildium-client-id': creds.client_id ?? '', 'x-buildium-client-secret': creds.client_secret ?? '', accept: 'application/json' }),
  validate: { url: (b) => `${b}/rentals?limit=1` },
  objects: { rentals: buildium('/rentals'), leases: buildium('/leases', 'lastupdatedfrom'), tasks: buildium('/tasks', 'lastupdatedfrom') },
});

// ---- Clio Manage. Region host from creds.region_host (app.clio.com, ca., au., eu.). updated_since is UNVERIFIED.
const CLIO_HOSTS = new Set(['app.clio.com', 'ca.app.clio.com', 'au.app.clio.com', 'eu.app.clio.com']);
const clioBase = (creds: { region_host?: string }) => {
  const h = creds.region_host || 'app.clio.com';
  if (!CLIO_HOSTS.has(h)) throw new Error('unknown Clio region host');
  return `https://${h}/api/v4`;
};
const clio = (path: string, fields: string): RestObjectSpec => ({
  req: (c) => ({ url: c.pg ?? `${c.base}${path}?${qs({ fields, limit: 200, order: 'updated_at(asc)', updated_since: c.hw })}` }),
  list: (j) => j?.data ?? [],
  id: (r) => r.id,
  ts: (r) => iso(r.updated_at),
  next: (j, c) => safeUrl(j?.meta?.paging?.next, c.base),
});
export const clioManage = makeRestAdapter({
  key: 'clio-manage',
  base: clioBase,
  headers: (creds) => bearer(creds.access_token),
  validate: { url: (b) => `${b}/users/who_am_i.json?fields=id,name`, account: (j) => j?.data?.name },
  objects: {
    matters: clio('/matters.json', 'id,display_number,description,status,updated_at'),
    contacts: clio('/contacts.json', 'id,name,type,primary_email_address,updated_at'),
    activities: clio('/activities.json', 'id,type,date,quantity,price,total,updated_at'),
    bills: clio('/bills.json', 'id,number,issued_at,total,state,updated_at'),
  },
});

// ---- Clover. Vendor JSON: filter by modifiedTime on list endpoints; per token 16 rps. Token lifetime/refresh UNVERIFIED.
const CL_LIMIT = 100;
const clover = (path: string): RestObjectSpec => ({
  req: (c) => ({ url: `${c.base}${path}?${qs({ limit: CL_LIMIT, offset: offsetOf(c), orderBy: 'modifiedTime ASC', ...(c.hw ? { filter: `modifiedTime>=${c.hw}` } : {}) })}` }),
  list: (j) => j?.elements ?? [],
  id: (r) => r.id,
  ts: (r) => (r.modifiedTime !== undefined ? String(r.modifiedTime) : undefined),
  numericTs: true,
  next: (j, c) => nextOffset(c, (j?.elements ?? []).length, CL_LIMIT),
});
export const cloverAdapter = makeRestAdapter({
  key: 'clover',
  base(creds) {
    need(creds, 'merchant_id');
    return `${creds.sandbox === 'true' ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com'}/v3/merchants/${encodeURIComponent(creds.merchant_id)}`;
  },
  headers: (creds) => ({ ...bearer(creds.access_token), accept: 'application/json' }),
  validate: { url: (b) => b, account: (j) => j?.name },
  objects: { orders: clover('/orders'), items: clover('/items'), customers: clover('/customers'), employees: clover('/employees') },
});

// ---- Dropbox Business. Vendor JSON: files/list_folder returns a cursor; files/list_folder/continue (details UNVERIFIED).
// The cursor itself is the high-water mark: after a full pass it is stored and the next pass continues from it.
const dbxFiles: RestObjectSpec = {
  req: (c) => {
    const cursor = c.pg ?? c.hw;
    return cursor
      ? { url: `${c.base}/files/list_folder/continue`, init: { method: 'POST', body: JSON.stringify({ cursor }) } }
      : { url: `${c.base}/files/list_folder`, init: { method: 'POST', body: JSON.stringify({ path: c.creds.path ?? '', recursive: true, limit: 2000 }) } };
  },
  list: (j) => j?.entries ?? [],
  id: (r) => r.id ?? r.path_lower,
  ts: (r) => iso(r.server_modified),
  hwOf: (j) => j?.cursor,
  next: (j) => (j?.has_more ? (j.cursor as string) : undefined),
};
export const dropboxBusiness = makeRestAdapter({
  key: 'dropbox-business',
  base: () => 'https://api.dropboxapi.com/2',
  headers: (creds) => ({ ...bearer(creds.access_token), 'content-type': 'application/json', ...(creds.member_id ? { 'dropbox-api-select-user': creds.member_id } : {}) }),
  validate: { url: (b) => `${b}/users/get_current_account`, init: { method: 'POST', headers: { 'content-type': '' } }, account: (j) => j?.email },
  objects: { files: dbxFiles },
});

// ---- Esri ArcGIS. Feature layer query; incremental via editor-tracking field (hosted layers only, per vendor JSON).
// creds.service_url = full FeatureServer layer URL; creds.edit_field defaults to EditDate; token goes in the X-Esri-Authorization header, never the URL.
const ESRI_PAGE = 1000;
const esriTs = (d: number) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
export const esriArcgis = makeRestAdapter({
  key: 'esri-arcgis',
  guard: true,
  base(creds) {
    need(creds, 'service_url');
    if (!/^https:\/\/[^/]+\/.+\/(Feature|Map)Server\/\d+\/?$/.test(creds.service_url)) throw new Error('service_url must be a FeatureServer layer URL');
    return creds.service_url.replace(/\/$/, '');
  },
  headers: (creds) => ({ accept: 'application/json', ...(creds.access_token ? { 'x-esri-authorization': `Bearer ${creds.access_token}` } : {}) }),
  validate: { url: (b) => `${b}?${qs({ f: 'json' })}`, account: (j) => j?.name },
  objects: {
    features: {
      req(c) {
        const field = c.creds.edit_field || 'EditDate';
        const where = c.hw ? `${field} > timestamp '${esriTs(Number(c.hw))}'` : '1=1';
        const params = { where, outFields: '*', f: 'json', orderByFields: `${field} ASC`, resultOffset: offsetOf(c), resultRecordCount: ESRI_PAGE };
        return { url: `${c.base}/query?${qs(params)}` };
      },
      list: (j) => j?.features ?? [],
      id: (r, creds) => String(r?.attributes?.[creds.id_field || 'OBJECTID']),
      ts: (r, creds) => (r?.attributes?.[creds.edit_field || 'EditDate'] !== undefined ? String(r.attributes[creds.edit_field || 'EditDate']) : undefined),
      numericTs: true,
      next: (j, c) => (j?.exceededTransferLimit ? String(offsetOf(c) + (j.features ?? []).length) : undefined),
    },
  },
});

// ---- Google Workspace. Vendor JSON: Drive changes.list with startPageToken (standard behaviour, UNVERIFIED this run).
// drive_files backfills by modifiedTime; drive_changes then follows the change feed from a start token.
const GAPI = 'https://www.googleapis.com';
const DRIVE_FIELDS = 'id,name,mimeType,modifiedTime,md5Checksum,size,trashed,parents';
export const googleWorkspace = makeRestAdapter({
  key: 'google-workspace',
  base: () => GAPI,
  headers: (creds) => bearer(creds.access_token),
  validate: { url: (b) => `${b}/drive/v3/about?fields=user`, account: (j) => j?.user?.emailAddress },
  objects: {
    drive_files: {
      req: (c) => ({ url: `${c.base}/drive/v3/files?${qs({ pageSize: 1000, orderBy: 'modifiedTime', fields: `nextPageToken,files(${DRIVE_FIELDS})`, pageToken: c.pg, ...(c.hw ? { q: `modifiedTime > '${c.hw}'` } : {}) })}` }),
      list: (j) => j?.files ?? [],
      id: (r) => r.id,
      ts: (r) => iso(r.modifiedTime),
      next: (j) => j?.nextPageToken,
    },
    drive_changes: {
      req: (c) => {
        const token = c.pg ?? c.hw;
        return token
          ? { url: `${c.base}/drive/v3/changes?${qs({ pageToken: token, pageSize: 1000, fields: `nextPageToken,newStartPageToken,changes(fileId,removed,time,file(${DRIVE_FIELDS}))` })}` }
          : { url: `${c.base}/drive/v3/changes/startPageToken` };
      },
      list: (j) => j?.changes ?? [],
      id: (r) => `${r.fileId}@${r.time}`,
      hwOf: (j) => j?.newStartPageToken ?? j?.startPageToken,
      next: (j) => j?.nextPageToken,
    },
  },
});

// ---- Laserfiche. Developer docs are JS-rendered; scopes, limits and an incremental filter are UNVERIFIED in the vendor
// JSON, so incremental is a client-side filter on lastModifiedTime over a folder listing. Token acquisition for a
// service principal is handled by the connect step; this adapter takes creds.access_token and creds.repository_id.
const LF_BASE = 'https://api.laserfiche.com/repository/v2';
export const laserfiche = makeRestAdapter({
  key: 'laserfiche',
  base: (creds) => {
    need(creds, 'repository_id');
    return `${LF_BASE}/Repositories/${encodeURIComponent(creds.repository_id)}`;
  },
  headers: (creds) => bearer(creds.access_token),
  validate: { url: () => `${LF_BASE}/Repositories` },
  objects: {
    entries: {
      req: (c) => ({ url: c.pg ?? `${c.base}/Entries/${encodeURIComponent(c.creds.root_entry_id || '1')}/Folder/children?$top=100` }),
      list: (j) => j?.value ?? [],
      id: (r) => String(r.id),
      ts: (r) => iso(r.lastModifiedTime),
      next: (j, c) => safeUrl(j?.['@odata.nextLink'], LF_BASE),
    },
  },
});

// ---- Mailchimp. Vendor JSON: since_last_changed on list members, since_send_time on campaigns, count/offset (names UNVERIFIED).
const MC_PAGE = 1000;
export const mailchimp = makeRestAdapter({
  key: 'mailchimp',
  guard: true,
  base(creds) {
    need(creds, 'dc');
    if (!/^[a-z]{2,4}\d{1,3}$/.test(creds.dc)) throw new Error('invalid Mailchimp data center');
    return `https://${creds.dc}.api.mailchimp.com/3.0`;
  },
  headers: (creds) => bearer(creds.access_token),
  validate: { url: (b) => `${b}/ping` },
  objects: {
    lists: {
      req: (c) => ({ url: `${c.base}/lists?${qs({ count: MC_PAGE, offset: offsetOf(c) })}` }),
      list: (j) => j?.lists ?? [],
      id: (r) => r.id,
      ts: (r) => iso(r.date_created),
      next: (j, c) => nextOffset(c, (j?.lists ?? []).length, MC_PAGE),
    },
    members: {
      req(c) {
        need(c.creds, 'list_id');
        return { url: `${c.base}/lists/${encodeURIComponent(c.creds.list_id)}/members?${qs({ count: MC_PAGE, offset: offsetOf(c), sort_field: 'last_changed', sort_dir: 'ASC', since_last_changed: c.hw })}` };
      },
      list: (j) => j?.members ?? [],
      id: (r) => r.id,
      ts: (r) => iso(r.last_changed),
      next: (j, c) => nextOffset(c, (j?.members ?? []).length, MC_PAGE),
    },
    campaigns: {
      req: (c) => ({ url: `${c.base}/campaigns?${qs({ count: MC_PAGE, offset: offsetOf(c), since_send_time: c.hw })}` }),
      list: (j) => j?.campaigns ?? [],
      id: (r) => r.id,
      ts: (r) => iso(r.send_time ?? r.create_time),
      next: (j, c) => nextOffset(c, (j?.campaigns ?? []).length, MC_PAGE),
    },
  },
});

// ---- Dynamics 365 Business Central. Vendor JSON: OData $filter=lastModifiedDateTime gt cursor on API v2.0 entities.
// Rate limits and the app permission name are UNVERIFIED. App-only token via Entra client credentials.
const BC_SCOPE = 'https://api.businesscentral.dynamics.com/.default';
const bcEntity = (name: string): RestObjectSpec => ({
  req(c) {
    need(c.creds, 'company_id');
    const root = `${c.base}/companies(${encodeURIComponent(c.creds.company_id)})/${name}`;
    return { url: c.pg ?? `${root}?${qs({ $orderby: 'lastModifiedDateTime', $top: 1000, ...(c.hw ? { $filter: `lastModifiedDateTime gt ${c.hw}` } : {}) })}` };
  },
  list: (j) => j?.value ?? [],
  id: (r) => r.id,
  ts: (r) => iso(r.lastModifiedDateTime),
  next: (j, c) => safeUrl(j?.['@odata.nextLink'], 'https://api.businesscentral.dynamics.com/'),
});
export const dynamics365BusinessCentral = makeRestAdapter({
  key: 'dynamics-365-business-central',
  base(creds) {
    need(creds, 'tenant_id', 'environment');
    return `https://api.businesscentral.dynamics.com/v2.0/${encodeURIComponent(creds.tenant_id)}/${encodeURIComponent(creds.environment)}/api/v2.0`;
  },
  headers: async (creds, fetch) => ({ authorization: `Bearer ${await entraToken(creds, BC_SCOPE, fetch)}`, accept: 'application/json' }),
  validate: { url: (b) => `${b}/companies` },
  objects: Object.fromEntries(['customers', 'vendors', 'salesInvoices', 'purchaseInvoices', 'items', 'generalLedgerEntries', 'accounts', 'customerPayments'].map((n) => [n, bcEntity(n)])),
});

// ---- Salesforce. Vendor JSON: SOQL WHERE SystemModstamp > last sync. Instance from creds.instance_url.
const SF_VERSION = 'v62.0';
const sfObject = (name: string): RestObjectSpec => ({
  req(c) {
    if (c.pg) return { url: `${c.base}${c.pg}` };
    const where = c.hw ? ` WHERE SystemModstamp > ${c.hw}` : '';
    return { url: `${c.base}/services/data/${c.creds.api_version || SF_VERSION}/query?q=${encodeURIComponent(`SELECT FIELDS(STANDARD) FROM ${name}${where} ORDER BY SystemModstamp ASC`)}` };
  },
  list: (j) => j?.records ?? [],
  id: (r) => r.Id,
  ts: (r) => iso(r.SystemModstamp),
  next: (j) => (j?.done === false ? (j.nextRecordsUrl as string) : undefined),
});
export const salesforce = makeRestAdapter({
  key: 'salesforce',
  guard: true,
  base(creds) {
    need(creds, 'instance_url');
    if (!/^https:\/\/[A-Za-z0-9.-]+\.(my\.salesforce\.com|salesforce\.com|force\.com)$/.test(creds.instance_url)) throw new Error('instance_url is not a Salesforce host');
    return creds.instance_url.replace(/\/$/, '');
  },
  headers: (creds) => bearer(creds.access_token),
  validate: { url: (b, creds) => `${b}/services/data/${creds.api_version || SF_VERSION}/limits` },
  objects: Object.fromEntries(['Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'User', 'Product2', 'Campaign'].map((n) => [n, sfObject(n)])),
});

// ---- Stripe. Vendor JSON: created[gte] filter and starting_after cursor. Platform secret key + Stripe-Account header.
// Lists return newest first, so the high-water mark (max created) only moves when the pass completes.
const stripe = (path: string): RestObjectSpec => ({
  req: (c) => ({ url: `${c.base}${path}?${qs({ limit: 100, starting_after: c.pg, ...(c.hw ? { 'created[gte]': c.hw } : {}) })}` }),
  list: (j) => j?.data ?? [],
  id: (r) => r.id,
  ts: (r) => (r.created !== undefined ? String(r.created) : undefined),
  numericTs: true,
  next: (j) => (j?.has_more && j.data?.length ? (j.data[j.data.length - 1].id as string) : undefined),
});
export const stripeAdapter = makeRestAdapter({
  key: 'stripe',
  base: () => 'https://api.stripe.com/v1',
  headers: (creds) => ({ ...bearer(creds.api_key), ...(creds.stripe_account ? { 'stripe-account': creds.stripe_account } : {}) }),
  validate: { url: (b) => `${b}/balance` },
  objects: Object.fromEntries([['customers', '/customers'], ['charges', '/charges'], ['payment_intents', '/payment_intents'], ['invoices', '/invoices'], ['subscriptions', '/subscriptions'], ['balance_transactions', '/balance_transactions'], ['payouts', '/payouts'], ['refunds', '/refunds'], ['disputes', '/disputes']].map(([n, p]) => [n, stripe(p)])),
});

// ---- Xero. Vendor JSON: If-Modified-Since on list endpoints. Dates arrive as "/Date(ms+0000)/". Tier/connection caps
// and scope names are UNVERIFIED; creds.tenant_id is the Xero tenant (connection) id.
const xeroDate = (v: unknown): string | undefined => {
  const m = typeof v === 'string' ? v.match(/\/Date\((\d+)/) : null;
  return m ? new Date(Number(m[1])).toISOString() : iso(v);
};
const xero = (name: string, idField: string): RestObjectSpec => ({
  req: (c: RestCtx) => ({ url: `${c.base}/${name}?page=${offsetOf(c) + 1}`, init: c.hw ? { headers: { 'if-modified-since': c.hw.slice(0, 19) } } : undefined }),
  list: (j) => j?.[name] ?? [],
  id: (r) => r[idField],
  ts: (r) => xeroDate(r.UpdatedDateUTC),
  next: (j, c) => ((j?.[name] ?? []).length >= 100 ? String(offsetOf(c) + 1) : undefined),
});
export const xeroAdapter = makeRestAdapter({
  key: 'xero',
  base: () => 'https://api.xero.com/api.xro/2.0',
  headers: (creds) => ({ ...bearer(creds.access_token), 'xero-tenant-id': creds.tenant_id ?? '', accept: 'application/json' }),
  validate: { url: () => 'https://api.xero.com/connections', init: { headers: { 'xero-tenant-id': '' } }, account: (j) => (Array.isArray(j) ? j[0]?.tenantName : undefined) },
  objects: {
    Contacts: xero('Contacts', 'ContactID'),
    Invoices: xero('Invoices', 'InvoiceID'),
    Payments: xero('Payments', 'PaymentID'),
    BankTransactions: xero('BankTransactions', 'BankTransactionID'),
    Accounts: xero('Accounts', 'AccountID'),
    Items: xero('Items', 'ItemID'),
  },
});
