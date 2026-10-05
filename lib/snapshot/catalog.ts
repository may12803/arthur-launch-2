// The portal catalog as the snapshot sees it: only what can be connected today is marked live.
import { buildCatalog } from '../client-portal/connector-ui.ts';
import { connectorAvailable } from '../client-portal/connector-status.ts';
import type { CatalogLite } from './coverage.ts';

export function liveCatalog(env: Record<string, string | undefined> = process.env): CatalogLite[] {
  return buildCatalog([]).map((e) => ({ key: e.key, name: e.name, category: e.category, live: connectorAvailable(e, env) }));
}
