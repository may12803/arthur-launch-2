import { bearer, isoOrUndefined } from './common.ts';
import { makeRestAdapter, qs } from './rest.ts';

// Vendor JSON: SearchOrders / ListPayments with updated_at or begin_time/end_time filters and cursor. Rate limits UNVERIFIED.
// Orders require location ids; they are supplied in creds.location_ids (comma separated) by the connect step (GET /v2/locations).
export const SQUARE_VERSION = '2025-01-23';

export const square = makeRestAdapter({
  key: 'square',
  base: (creds) => (creds.sandbox === 'true' ? 'https://connect.squareupsandbox.com/v2' : 'https://connect.squareup.com/v2'),
  headers: (creds) => ({ ...bearer(creds.access_token), 'square-version': SQUARE_VERSION, 'content-type': 'application/json', accept: 'application/json' }),
  validate: { url: (b) => `${b}/locations`, account: (j) => j?.locations?.[0]?.merchant_id },
  objects: {
    payments: {
      req: (c) => ({ url: `${c.base}/payments?${qs({ begin_time: c.hw, sort_order: 'ASC', limit: 100, cursor: c.pg })}` }),
      list: (j) => j?.payments ?? [],
      id: (r) => r.id,
      ts: (r) => isoOrUndefined(r.updated_at),
      next: (j) => j?.cursor || undefined,
    },
    orders: {
      req(c) {
        if (!c.creds.location_ids) throw new Error('missing credential fields: location_ids');
        const body: Record<string, unknown> = {
          location_ids: c.creds.location_ids.split(',').map((s) => s.trim()),
          limit: 100,
          query: { sort: { sort_field: 'UPDATED_AT', sort_order: 'ASC' }, ...(c.hw ? { filter: { date_time_filter: { updated_at: { start_at: c.hw } } } } : {}) },
        };
        if (c.pg) body.cursor = c.pg;
        return { url: `${c.base}/orders/search`, init: { method: 'POST', body: JSON.stringify(body) } };
      },
      list: (j) => j?.orders ?? [],
      id: (r) => r.id,
      ts: (r) => isoOrUndefined(r.updated_at),
      next: (j) => j?.cursor || undefined,
    },
    customers: {
      req(c) {
        const body: Record<string, unknown> = { limit: 100, query: { sort: { field: 'CREATED_AT', order: 'ASC' }, ...(c.hw ? { filter: { updated_at: { start_at: c.hw } } } : {}) } };
        if (c.pg) body.cursor = c.pg;
        return { url: `${c.base}/customers/search`, init: { method: 'POST', body: JSON.stringify(body) } };
      },
      list: (j) => j?.customers ?? [],
      id: (r) => r.id,
      ts: (r) => isoOrUndefined(r.updated_at),
      next: (j) => j?.cursor || undefined,
    },
    catalog: {
      req(c) {
        const body: Record<string, unknown> = { object_types: ['ITEM', 'CATEGORY'], ...(c.hw ? { begin_time: c.hw } : {}) };
        if (c.pg) body.cursor = c.pg;
        return { url: `${c.base}/catalog/search`, init: { method: 'POST', body: JSON.stringify(body) } };
      },
      list: (j) => j?.objects ?? [],
      id: (r) => r.id,
      ts: (r) => isoOrUndefined(r.updated_at),
      next: (j) => j?.cursor || undefined,
    },
    locations: {
      req: (c) => ({ url: `${c.base}/locations` }),
      list: (j) => j?.locations ?? [],
      id: (r) => r.id,
      ts: (r) => isoOrUndefined(r.updated_at ?? r.created_at),
      next: () => undefined,
    },
  },
});
