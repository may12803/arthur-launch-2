// Coverage: which checks this file could run, which it could not, what is missing, and which connectors in the
// portal catalog (connectable today only) would supply the missing data. Pure; the catalog is passed in.
import { FIELDS, type FieldId } from './mapper.ts';

export interface CatalogLite { key: string; name: string; category: string; live: boolean }

interface Capability {
  id: string;
  title: string;
  needs: FieldId[];
  /** Needs that no column can satisfy from a flat file (history rather than a field). */
  needsHistory?: string;
  unlocks: string;
  /** Catalog categories that carry this data. */
  categories: string[];
}

export const CAPABILITIES: Capability[] = [
  { id: 'below_cost', title: 'Prices below current cost', needs: ['item', 'price', 'cost'], unlocks: 'finds prices set under what the item costs', categories: ['erp', 'accounting', 'warehouse'] },
  { id: 'loss_dollars', title: 'Dollar loss on below-cost prices', needs: ['item', 'price', 'cost', 'units_12m'], unlocks: 'turns per-unit exposure into dollars lost on real volume', categories: ['erp', 'commerce', 'pos', 'accounting'] },
  { id: 'stale_price', title: 'Stale prices', needs: ['item', 'price', 'price_date', 'last_sale_date'], unlocks: 'finds price records untouched and unsold for 36 months or more', categories: ['erp', 'accounting'] },
  { id: 'dead_sku', title: 'Dead SKUs', needs: ['item', 'on_hand', 'last_sale_date'], unlocks: 'finds items with no sales in 36 months and nothing on hand', categories: ['erp', 'warehouse', 'commerce'] },
  { id: 'duplicate_customer', title: 'Duplicate customers', needs: ['customer'], unlocks: 'finds customers entered more than once under name variants', categories: ['crm', 'erp'] },
  { id: 'inactive_customer_prices', title: 'Inactive customers holding prices', needs: ['customer', 'customer_status', 'price'], unlocks: 'finds price records still held by inactive customers', categories: ['crm', 'erp'] },
  { id: 'cost_lag', title: 'Prices not updated after a cost increase', needs: ['item', 'price', 'cost'], needsHistory: 'cost change history (the date and size of each cost change)', unlocks: 'finds margin lost when a cost rose and the price did not follow', categories: ['erp', 'accounting'] },
  { id: 'market_exposure', title: 'Market movement against your cost categories', needs: ['cost', 'category'], unlocks: 'sets public index movement beside the categories you buy', categories: [] },
];

export interface BlockedCapability {
  id: string;
  title: string;
  missing: string[];
  unlocks: string;
  how: string;
  connectors: { key: string; name: string }[];
}

export interface Coverage {
  score: number;
  unlocked: { id: string; title: string }[];
  blocked: BlockedCapability[];
  basis: string;
}

const label = (f: FieldId) => FIELDS.find((x) => x.id === f)!.label.toLowerCase();

export function computeCoverage(present: Set<FieldId>, catalog: CatalogLite[]): Coverage {
  const unlocked: Coverage['unlocked'] = [];
  const blocked: BlockedCapability[] = [];
  for (const c of CAPABILITIES) {
    const missingFields = c.needs.filter((n) => !present.has(n));
    if (missingFields.length === 0 && !c.needsHistory) { unlocked.push({ id: c.id, title: c.title }); continue; }
    const missing = [...missingFields.map(label), ...(c.needsHistory ? [c.needsHistory] : [])];
    const connectors = catalog.filter((e) => e.live && c.categories.includes(e.category)).slice(0, 3).map((e) => ({ key: e.key, name: e.name }));
    const how = connectors.length
      ? `Add ${missing.join(' and ')} to the file, or connect ${connectors.map((x) => x.name).join(', ')} so this stays current.`
      : `Add ${missing.join(' and ')} to the file.`;
    blocked.push({ id: c.id, title: c.title, missing, unlocks: c.unlocks, how, connectors });
  }
  const total = CAPABILITIES.length;
  return {
    score: Math.round((unlocked.length / total) * 100),
    unlocked, blocked,
    basis: `${unlocked.length} of ${total} checks could run on the columns found in this file`,
  };
}
