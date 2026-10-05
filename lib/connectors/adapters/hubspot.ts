import { bearer, isoOrUndefined } from './common.ts';
import { makeRestAdapter } from './rest.ts';
import type { RestObjectSpec } from './rest.ts';

// Vendor JSON: CRM Search API filtering hs_lastmodifieddate GTE cursor, paged by `after`.
// Contacts expose the property as `lastmodifieddate` in HubSpot's property model (not stated in the vendor JSON: UNVERIFIED).
// Search returns at most 10,000 results per query, so when `after` approaches that the window re-anchors on the high-water mark.
const LIMIT = 100;
const WINDOW_CAP = 9900;

const search = (object: string, prop: string, props: string[]): RestObjectSpec => ({
  req(c) {
    const body: Record<string, unknown> = {
      sorts: [{ propertyName: prop, direction: 'ASCENDING' }],
      properties: [...props, prop],
      limit: LIMIT,
    };
    if (c.hw) body.filterGroups = [{ filters: [{ propertyName: prop, operator: 'GTE', value: c.hw }] }];
    if (c.pg) body.after = c.pg;
    return { url: `${c.base}/crm/v3/objects/${object}/search`, init: { method: 'POST', body: JSON.stringify(body) } };
  },
  list: (j) => j?.results ?? [],
  id: (r) => r.id,
  ts: (r) => isoOrUndefined(r?.properties?.[prop]),
  next: (j) => {
    const a = j?.paging?.next?.after;
    return a !== undefined && Number(a) < WINDOW_CAP ? String(a) : undefined;
  },
});

export const hubspot = makeRestAdapter({
  key: 'hubspot',
  base: () => 'https://api.hubapi.com',
  headers: (creds) => ({ ...bearer(creds.access_token), 'content-type': 'application/json', accept: 'application/json' }),
  validate: { url: (b) => `${b}/account-info/v3/details`, account: (j) => (j?.portalId !== undefined ? String(j.portalId) : undefined) },
  objects: {
    contacts: search('contacts', 'lastmodifieddate', ['email', 'firstname', 'lastname']),
    companies: search('companies', 'hs_lastmodifieddate', ['name', 'domain']),
    deals: search('deals', 'hs_lastmodifieddate', ['dealname', 'amount', 'dealstage']),
    tickets: search('tickets', 'hs_lastmodifieddate', ['subject', 'hs_pipeline_stage']),
  },
});
