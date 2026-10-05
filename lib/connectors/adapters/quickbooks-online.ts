import { bearer, isoOrUndefined, need } from './common.ts';
import { makeRestAdapter, offsetOf } from './rest.ts';
import type { RestObjectSpec } from './rest.ts';

// Vendor JSON: query WHERE MetaData.LastUpdatedTime > cursor (CDC endpoint is the alternative; CDC page UNVERIFIED).
// The /v3/company path and companyinfo validation call are UNVERIFIED in the vendor JSON.
const PAGE = 1000;

const entity = (name: string): RestObjectSpec => ({
  req(c) {
    const where = c.hw ? ` where MetaData.LastUpdatedTime > '${c.hw}'` : '';
    const stmt = `select * from ${name}${where} order by MetaData.LastUpdatedTime startposition ${offsetOf(c) + 1} maxresults ${PAGE}`;
    return { url: `${c.base}/query?query=${encodeURIComponent(stmt)}` };
  },
  list: (j) => j?.QueryResponse?.[name] ?? [],
  id: (r) => r.Id,
  ts: (r) => isoOrUndefined(r?.MetaData?.LastUpdatedTime),
  next: (j, c) => ((j?.QueryResponse?.[name] ?? []).length >= PAGE ? String(offsetOf(c) + PAGE) : undefined),
});

export const quickbooksOnline = makeRestAdapter({
  key: 'quickbooks-online',
  base(creds) {
    need(creds, 'realm_id');
    const host = creds.sandbox === 'true' ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
    return `${host}/v3/company/${encodeURIComponent(creds.realm_id)}`;
  },
  headers: (creds) => ({ ...bearer(creds.access_token), accept: 'application/json' }),
  validate: { url: (base, creds) => `${base}/companyinfo/${encodeURIComponent(creds.realm_id)}`, account: (j) => j?.CompanyInfo?.CompanyName },
  objects: Object.fromEntries(['Customer', 'Vendor', 'Invoice', 'Bill', 'Payment', 'Item', 'Account', 'JournalEntry', 'Deposit'].map((n) => [n, entity(n)])),
});
