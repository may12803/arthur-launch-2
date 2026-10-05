import { HttpError } from '../types.ts';
import { isoOrUndefined, need } from './common.ts';
import { makeRestAdapter } from './rest.ts';
import type { RestObjectSpec } from './rest.ts';

// Vendor JSON: GraphQL filter updated_at:>=ISO with cursor pagination. Rate limits UNVERIFIED (calculated query cost).
export const DEFAULT_SHOPIFY_API_VERSION = '2025-10';
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function shopHost(shop: string): string {
  const h = shop.includes('.') ? shop : `${shop}.myshopify.com`;
  if (!SHOP_RE.test(h)) throw new Error('shop must be <name>.myshopify.com');
  return h;
}

function check(j: any): void {
  const errs: any[] = j?.errors ?? [];
  if (!errs.length) return;
  if (errs.some((e) => e?.extensions?.code === 'THROTTLED')) throw new HttpError(429, 'Shopify GraphQL throttled', 2000);
  throw new Error('Shopify GraphQL error: ' + String(errs[0]?.message ?? 'unknown').slice(0, 200));
}

const connection = (root: string, fields: string, sortKey = true): RestObjectSpec => ({
  req(c) {
    const query = `query($after:String,$q:String){${root}(first:250,after:$after,query:$q${sortKey ? ',sortKey:UPDATED_AT' : ''}){edges{node{${fields}}}pageInfo{hasNextPage endCursor}}}`;
    const variables = { after: c.pg ?? null, q: c.hw ? `updated_at:>='${c.hw}'` : null };
    return { url: c.base, init: { method: 'POST', body: JSON.stringify({ query, variables }) } };
  },
  list: (j) => {
    check(j);
    return (j?.data?.[root]?.edges ?? []).map((e: any) => e.node);
  },
  id: (r) => r.id,
  ts: (r) => isoOrUndefined(r.updatedAt),
  next: (j) => (j?.data?.[root]?.pageInfo?.hasNextPage ? (j.data[root].pageInfo.endCursor as string) : undefined),
});

export const shopify = makeRestAdapter({
  key: 'shopify',
  base(creds) {
    need(creds, 'shop');
    return `https://${shopHost(creds.shop)}/admin/api/${creds.api_version || DEFAULT_SHOPIFY_API_VERSION}/graphql.json`;
  },
  headers: (creds) => ({ 'x-shopify-access-token': creds.access_token ?? '', 'content-type': 'application/json', accept: 'application/json' }),
  validate: {
    url: (base) => base,
    init: { method: 'POST', body: JSON.stringify({ query: '{ shop { name } }' }) },
    account: (j) => {
      check(j);
      return j?.data?.shop?.name;
    },
  },
  objects: {
    orders: connection('orders', 'id name updatedAt createdAt displayFinancialStatus displayFulfillmentStatus email totalPriceSet{shopMoney{amount currencyCode}}'),
    customers: connection('customers', 'id updatedAt email firstName lastName numberOfOrders'),
    products: connection('products', 'id title updatedAt status vendor productType'),
    inventoryItems: connection('inventoryItems', 'id updatedAt sku tracked', false),
  },
});
