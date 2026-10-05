// Market context for the cost categories found in a file. Consumes the portal's public market snapshot and labels
// every figure as INDEX movement, never as the reader's own cost. Degrades to "unavailable" when the feed is down.
export interface MarketSeries {
  id: string; title: string; units: string; frequency: string; category: string; source: string;
  latest: { date: string; value: number };
  prior_year: { date: string; value: number } | null;
  yoy_pct: number | null; mom_pct: number | null;
}
export interface MarketFeed { generated_at: string; series: MarketSeries[] }

export interface MarketLine {
  your_category: string;
  rows_in_category: number;
  index: { id: string; title: string; source: string; units: string; latest_date: string; latest_value: number; yoy_pct: number | null; mom_pct: number | null };
  label: 'index movement, not your cost';
}
export interface MarketExposure {
  status: 'ok' | 'unavailable' | 'not_applicable';
  reason?: string;
  generated_at?: string;
  lines: MarketLine[];
  context: MarketLine['index'][];
}

/** Words in a category or description -> words in a series id/title. First rule that matches both wins per series. */
const LINKS: { cat: RegExp; series: RegExp }[] = [
  { cat: /copper|wire|cable|magnet|conductor|bus ?bar/i, series: /copper/i },
  { cat: /alumin/i, series: /alumin/i },
  { cat: /steel|metal|fastener|bolt|screw|pipe|fitting|strut|hardware/i, series: /\bsteel\b|ppi.*(metal|steel|fabricated)|metals/i },
  { cat: /diesel|freight|shipping|truck|fuel|delivery|logistic/i, series: /diesel/i },
  { cat: /gas(oline)?\b|fleet/i, series: /gasoline/i },
  { cat: /natural gas|propane|heating|fuel oil/i, series: /henry|natural gas/i },
  { cat: /plastic|resin|poly|pvc|chemical|packag/i, series: /ppi.*(plastic|chemical|resin)|plastics|chemicals/i },
  { cat: /lumber|wood|timber|plywood|building material/i, series: /lumber|wood/i },
  { cat: /food|produce|dairy|meat|grocery|beverage/i, series: /food/i },
  { cat: /oil|lubric|petroleum/i, series: /wti|crude|oil/i },
];
const GENERAL = [/producer price|\bppi\b/i, /diesel/i, /copper/i, /consumer price|\bcpi\b/i];

const toIndex = (s: MarketSeries): MarketLine['index'] => ({
  id: s.id, title: s.title, source: s.source, units: s.units, latest_date: s.latest.date, latest_value: s.latest.value, yoy_pct: s.yoy_pct, mom_pct: s.mom_pct,
});

export function marketExposure(feed: MarketFeed, categories: { name: string; rows: number }[]): MarketExposure {
  const lines: MarketLine[] = [];
  for (const c of categories) {
    for (const link of LINKS) {
      if (!link.cat.test(c.name)) continue;
      const s = feed.series.find((x) => link.series.test(`${x.id} ${x.title}`));
      if (s) lines.push({ your_category: c.name, rows_in_category: c.rows, index: toIndex(s), label: 'index movement, not your cost' });
      break;
    }
  }
  const matchedIds = new Set(lines.map((l) => l.index.id));
  const context: MarketLine['index'][] = [];
  for (const re of GENERAL) {
    const s = feed.series.find((x) => re.test(`${x.id} ${x.title}`) && !matchedIds.has(x.id) && !context.some((c) => c.id === x.id));
    if (s) context.push(toIndex(s));
  }
  return { status: 'ok', generated_at: feed.generated_at, lines, context };
}

let cache: { at: number; feed: MarketFeed } | null = null;

export async function fetchMarketFeed(env: Record<string, string | undefined> = process.env, doFetch: typeof fetch = fetch): Promise<MarketFeed> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.feed;
  const url = env.MARKET_SNAPSHOT_URL || 'https://portal.loveleedaystudios.com/api/public/market-snapshot';
  const res = await doFetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`market feed HTTP ${res.status}`);
  const j = (await res.json()) as Partial<MarketFeed>;
  if (!j || !Array.isArray(j.series) || typeof j.generated_at !== 'string') throw new Error('market feed has an unexpected shape');
  const feed: MarketFeed = { generated_at: j.generated_at, series: j.series.filter((s) => s && s.latest && typeof s.latest.value === 'number') as MarketSeries[] };
  cache = { at: Date.now(), feed };
  return feed;
}

export function resetMarketCache() { cache = null; }

export async function buildMarket(
  hasCost: boolean, categories: { name: string; rows: number }[],
  env: Record<string, string | undefined> = process.env, doFetch: typeof fetch = fetch,
): Promise<MarketExposure> {
  if (!hasCost) return { status: 'not_applicable', reason: 'no cost column was found, so there is nothing to set the market against', lines: [], context: [] };
  try {
    const feed = await fetchMarketFeed(env, doFetch);
    return marketExposure(feed, categories);
  } catch (e) {
    return { status: 'unavailable', reason: e instanceof Error ? e.message : 'market feed unavailable', lines: [], context: [] };
  }
}
