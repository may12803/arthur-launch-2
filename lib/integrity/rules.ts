// Pure data-integrity rules engine. No I/O, no clock: everything is a function of the tables and `asOf`.
// Every dollar figure carries its formula and the ids of the rows that feed it. Rules that have no dollar
// basis in the data report amount = null instead of an estimate.
import type {
  Action, CostRecord, Exposure, Finding, FlaggedRow, IntegrityResult, PriceRecord, RuleId, Sale,
  Score, ScoreLine, Severity, SkippedRule, Tables,
} from './schema.ts';

export const STALE_MONTHS = 36;
export const DEAD_SKU_MONTHS = 36;
export const TRAILING_MONTHS = 12;
/** A price is "not updated after a cost increase" once cost has risen at least this fraction since the price date. */
export const COST_LAG_THRESHOLD = 0.05;
export const SAMPLE_SIZE = 10;

/**
 * Integrity score = 100 minus the sum of per-rule penalties.
 * penalty = weight x min(1, share / saturationShare), where share = flagged items / population scanned.
 * Weights sum to 100 and are ordered by how directly the problem loses money. A rule that cannot run
 * (missing table) contributes no penalty and is listed under `skipped`.
 */
export const SCORE_WEIGHTS: Record<RuleId, { weight: number; saturationShare: number; basis: string }> = {
  below_cost: { weight: 30, saturationShare: 0.02, basis: 'sells at a loss today; 2% of price records below cost is already severe' },
  cost_lag: { weight: 20, saturationShare: 0.05, basis: 'margin eroded by cost increases never passed on; saturates at 5% of price records' },
  duplicate_customer: { weight: 12, saturationShare: 0.05, basis: 'surplus duplicate customer records over all customers; saturates at 5%' },
  stale_price: { weight: 15, saturationShare: 0.1, basis: 'price records untouched and unsold for 36+ months; saturates at 10%' },
  inactive_customer_prices: { weight: 13, saturationShare: 0.1, basis: 'price records held by inactive customers; saturates at 10%' },
  dead_sku: { weight: 10, saturationShare: 0.1, basis: 'SKUs with no sales in 36 months and nothing on hand; saturates at 10%' },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const dim = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}

type CostIndex = Map<string, CostRecord[]>;

function indexCosts(costs: CostRecord[]): CostIndex {
  const idx: CostIndex = new Map();
  for (const c of costs) {
    const list = idx.get(c.sku);
    if (list) list.push(c); else idx.set(c.sku, [c]);
  }
  for (const list of idx.values()) list.sort((a, b) => (a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0));
  return idx;
}

/** Cost in force on `date`: latest row on or before it; before the first row, the first row. Null when the sku has no cost. */
export function costAt(idx: CostIndex, sku: string, date: string): number | null {
  const list = idx.get(sku);
  if (!list || list.length === 0) return null;
  let cost = list[0].cost;
  for (const c of list) {
    if (c.effective_date <= date) cost = c.cost; else break;
  }
  return cost;
}

const LEGAL_SUFFIX = new Set(['inc', 'incorporated', 'llc', 'co', 'company', 'corp', 'corporation', 'ltd', 'limited', 'lp', 'the']);
const STREET_ABBR: Record<string, string> = {
  street: 'st', avenue: 'ave', road: 'rd', boulevard: 'blvd', drive: 'dr', lane: 'ln', court: 'ct', highway: 'hwy',
  parkway: 'pkwy', place: 'pl', circle: 'cir', north: 'n', south: 's', east: 'e', west: 'w',
};

export function normalizeName(name: string): string {
  const tokens = name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIX.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.filter((t) => t !== 'the').join(' ');
}

export function normalizeAddress(address: string): string {
  const cut = address.toLowerCase().split(/,|\s#|\b(?:suite|ste|unit|apt|floor|fl|bldg)\b/)[0];
  return cut.replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((t) => STREET_ABBR[t] ?? t).join(' ');
}

function zip5(zip: string): string {
  return zip.replace(/\D/g, '').slice(0, 5);
}

function none(formula: string, basis: string, ids: string[] = []): Exposure {
  return { amount: null, kind: 'none', formula, basis, inputRowIds: ids };
}

function severityByShare(share: number): Severity {
  return share >= 0.05 ? 'medium' : 'low';
}

export interface AnalyzeOptions {
  /** The "today" of the dataset, ISO date. Required: the engine never reads the clock. */
  asOf: string;
}

export function analyze(tables: Tables, opts: AnalyzeOptions): IntegrityResult {
  const { asOf } = opts;
  const { customers, products, costs, inventory, prices, sales } = tables;
  const staleCutoff = addMonths(asOf, -STALE_MONTHS);
  const deadCutoff = addMonths(asOf, -DEAD_SKU_MONTHS);
  const trailingStart = addMonths(asOf, -TRAILING_MONTHS);

  const costIdx = indexCosts(costs);
  const salesByPair = new Map<string, Sale[]>();
  const lastSaleBySku = new Map<string, string>();
  for (const s of sales) {
    if (s.sale_date > asOf) continue;
    const k = `${s.customer_id}|${s.sku}`;
    const list = salesByPair.get(k);
    if (list) list.push(s); else salesByPair.set(k, [s]);
    const last = lastSaleBySku.get(s.sku);
    if (!last || s.sale_date > last) lastSaleBySku.set(s.sku, s.sale_date);
  }
  const pairSales = (p: PriceRecord) => salesByPair.get(`${p.customer_id}|${p.sku}`) ?? [];
  const customerById = new Map(customers.map((c) => [c.customer_id, c]));

  const findings: Finding[] = [];
  const skipped: SkippedRule[] = [];
  const hasCosts = costs.length > 0;
  const hasSales = sales.length > 0;
  const hasPrices = prices.length > 0;

  // ---- below_cost -------------------------------------------------------------------------------------------
  if (!hasPrices || !hasCosts) {
    skipped.push({ rule: 'below_cost', reason: !hasPrices ? 'no price records supplied' : 'no cost history supplied (cost-less files cannot show below-cost prices)' });
  } else {
    const rows: FlaggedRow[] = [];
    let total = 0;
    let withVolume = 0;
    let perUnitGap = 0;
    for (const p of prices) {
      const cost = costAt(costIdx, p.sku, asOf);
      if (cost === null || p.price >= cost) continue;
      const trailing = pairSales(p).filter((s) => s.sale_date > trailingStart);
      const units = trailing.reduce((a, s) => a + s.qty, 0);
      const gap = round2(cost - p.price);
      const exposure = round2(gap * units);
      total += exposure;
      perUnitGap += gap;
      if (units > 0) withVolume++;
      rows.push({
        id: p.price_id, customer_id: p.customer_id, sku: p.sku, price: p.price, current_cost: cost,
        gap_per_unit: gap, units_t12m: units, exposure, sale_ids: trailing.map((s) => s.sale_id),
      });
    }
    rows.sort((a, b) => (b.exposure as number) - (a.exposure as number) || (a.id < b.id ? -1 : 1));
    const volume = hasSales;
    const exposure: Exposure = volume
      ? {
          amount: round2(total), kind: 'loss',
          formula: `sum over flagged price records of (current_cost - price) x units sold to that customer on that SKU in the trailing ${TRAILING_MONTHS} months (${trailingStart}, ${asOf}]`,
          basis: `${withVolume} of ${rows.length} flagged records had sales in the window; records with no volume contribute 0`,
          inputRowIds: rows.map((r) => r.id),
        }
      : {
          amount: null, kind: 'exposure',
          formula: 'sum over flagged price records of (current_cost - price), per unit',
          basis: `no sales supplied, so volume is unknown. Per-unit gap summed across records: $${round2(perUnitGap)}. This is exposure, not loss.`,
          inputRowIds: rows.map((r) => r.id),
        };
    findings.push({
      rule: 'below_cost', title: 'Prices below current cost', severity: rows.length === 0 ? 'low' : total > 0 ? 'critical' : 'high',
      count: rows.length, unit: 'price records', population: prices.length, flaggedInPopulation: rows.length,
      sample: rows.slice(0, SAMPLE_SIZE), rows, exposure, action: 'reprice',
      meta: { records_with_volume: withVolume },
    });
  }

  // ---- cost_lag ---------------------------------------------------------------------------------------------
  if (!hasPrices || !hasCosts) {
    skipped.push({ rule: 'cost_lag', reason: !hasPrices ? 'no price records supplied' : 'no cost history supplied' });
  } else {
    const rows: FlaggedRow[] = [];
    let total = 0;
    for (const p of prices) {
      const now = costAt(costIdx, p.sku, asOf);
      const then = costAt(costIdx, p.sku, p.effective_date);
      if (now === null || then === null || then <= 0) continue;
      if (p.price < now) continue; // already counted under below_cost
      if (now / then - 1 < COST_LAG_THRESHOLD) continue;
      const trigger = (costIdx.get(p.sku) ?? []).find((c) => c.effective_date > p.effective_date && c.cost >= then * (1 + COST_LAG_THRESHOLD));
      if (!trigger) continue;
      const after = pairSales(p).filter((s) => s.sale_date >= trigger.effective_date);
      let leak = 0;
      for (const s of after) {
        const c = costAt(costIdx, p.sku, s.sale_date);
        if (c !== null && c > then) leak += (c - then) * s.qty;
      }
      leak = round2(leak);
      total += leak;
      rows.push({
        id: p.price_id, customer_id: p.customer_id, sku: p.sku, price: p.price, price_date: p.effective_date,
        cost_at_price_date: then, current_cost: now, cost_increase_pct: round2((now / then - 1) * 100),
        increase_date: trigger.effective_date, units_since_increase: after.reduce((a, s) => a + s.qty, 0),
        exposure: leak, sale_ids: after.map((s) => s.sale_id),
      });
    }
    rows.sort((a, b) => (b.exposure as number) - (a.exposure as number) || (a.id < b.id ? -1 : 1));
    findings.push({
      rule: 'cost_lag', title: 'Prices not updated after a cost increase', severity: rows.length === 0 ? 'low' : 'high',
      count: rows.length, unit: 'price records', population: prices.length, flaggedInPopulation: rows.length,
      sample: rows.slice(0, SAMPLE_SIZE), rows, action: 'reprice',
      exposure: hasSales
        ? {
            amount: round2(total), kind: 'loss',
            formula: 'sum over flagged price records, over each sale on or after the date cost first rose 5% or more above the cost at the price date, of (cost on the sale date - cost at the price date) x qty',
            basis: 'margin that passing the cost increase through dollar for dollar would have kept; sales after the increase at the unchanged price',
            inputRowIds: rows.map((r) => r.id),
          }
        : {
            amount: null, kind: 'exposure',
            formula: 'per unit: current_cost - cost at the price date',
            basis: 'no sales supplied, so volume is unknown; exposure, not loss',
            inputRowIds: rows.map((r) => r.id),
          },
      meta: { threshold_pct: COST_LAG_THRESHOLD * 100 },
    });
  }

  // ---- duplicate_customer -----------------------------------------------------------------------------------
  if (customers.length === 0) {
    skipped.push({ rule: 'duplicate_customer', reason: 'no customers supplied' });
  } else {
    const groups = new Map<string, typeof customers>();
    for (const c of customers) {
      const key = `${normalizeName(c.name)}|${normalizeAddress(c.address)}|${zip5(c.zip)}`;
      const g = groups.get(key);
      if (g) g.push(c); else groups.set(key, [c]);
    }
    const priceCount = new Map<string, number>();
    for (const p of prices) priceCount.set(p.customer_id, (priceCount.get(p.customer_id) ?? 0) + 1);
    const rows: FlaggedRow[] = [];
    let surplus = 0;
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const members = [...g].sort((a, b) => (priceCount.get(b.customer_id) ?? 0) - (priceCount.get(a.customer_id) ?? 0) || (a.customer_id < b.customer_id ? -1 : 1));
      surplus += members.length - 1;
      rows.push({
        id: members[0].customer_id, keep_customer_id: members[0].customer_id,
        member_ids: members.map((m) => m.customer_id), member_names: members.map((m) => m.name),
        member_addresses: members.map((m) => m.address), members: members.length,
        price_records: members.reduce((a, m) => a + (priceCount.get(m.customer_id) ?? 0), 0),
      });
    }
    rows.sort((a, b) => (a.id as string < (b.id as string) ? -1 : 1));
    findings.push({
      rule: 'duplicate_customer', title: 'Duplicate customers (name and address variants)',
      severity: rows.length === 0 ? 'low' : 'medium', count: rows.length, unit: 'duplicate groups',
      population: customers.length, flaggedInPopulation: surplus, sample: rows.slice(0, SAMPLE_SIZE), rows, action: 'merge',
      exposure: none(
        'not quantified',
        'duplicates split price and sales history across records; the data holds no dollar basis for what that costs',
        rows.flatMap((r) => r.member_ids as string[]),
      ),
      meta: { surplus_records: surplus },
    });
  }

  // ---- inactive_customer_prices -----------------------------------------------------------------------------
  const inactiveIds = new Set(customers.filter((c) => c.status === 'inactive').map((c) => c.customer_id));
  if (customers.length === 0 || !hasPrices) {
    skipped.push({ rule: 'inactive_customer_prices', reason: customers.length === 0 ? 'no customers supplied' : 'no price records supplied' });
  } else {
    const rows: FlaggedRow[] = prices
      .filter((p) => inactiveIds.has(p.customer_id))
      .map((p) => ({ id: p.price_id, customer_id: p.customer_id, customer_name: customerById.get(p.customer_id)?.name ?? null, sku: p.sku, price: p.price, price_date: p.effective_date }));
    const holders = new Set(rows.map((r) => r.customer_id as string));
    findings.push({
      rule: 'inactive_customer_prices', title: 'Inactive customers still holding price records',
      severity: severityByShare(rows.length / prices.length), count: rows.length, unit: 'price records',
      population: prices.length, flaggedInPopulation: rows.length, sample: rows.slice(0, SAMPLE_SIZE), rows, action: 'review',
      exposure: none('not quantified', 'an inactive customer buys nothing, so a stale record has no revenue at stake; the risk is a wrong price being quoted if the customer returns', rows.map((r) => r.id)),
      meta: { inactive_customers_holding_prices: holders.size },
    });
  }

  // ---- stale_price ------------------------------------------------------------------------------------------
  if (!hasPrices || !hasSales) {
    skipped.push({ rule: 'stale_price', reason: !hasPrices ? 'no price records supplied' : 'no sales supplied (cannot tell unsold from unrecorded)' });
  } else {
    const rows: FlaggedRow[] = [];
    for (const p of prices) {
      if (inactiveIds.has(p.customer_id)) continue; // reported once, under inactive_customer_prices
      if (p.effective_date >= staleCutoff) continue;
      const last = pairSales(p).reduce<string | null>((m, s) => (m === null || s.sale_date > m ? s.sale_date : m), null);
      if (last !== null && last >= staleCutoff) continue;
      rows.push({ id: p.price_id, customer_id: p.customer_id, sku: p.sku, price: p.price, price_date: p.effective_date, last_sale_date: last });
    }
    const active = prices.filter((p) => !inactiveIds.has(p.customer_id)).length;
    findings.push({
      rule: 'stale_price', title: `Price records untouched and unsold for ${STALE_MONTHS}+ months`,
      severity: severityByShare(rows.length / Math.max(1, active)), count: rows.length, unit: 'price records',
      population: active, flaggedInPopulation: rows.length, sample: rows.slice(0, SAMPLE_SIZE), rows, action: 'archive',
      exposure: none('not quantified', 'no sales in the window means no revenue at stake; the cost is clutter and the chance of quoting an outdated price', rows.map((r) => r.id)),
      meta: { cutoff: staleCutoff },
    });
  }

  // ---- dead_sku ---------------------------------------------------------------------------------------------
  if (products.length === 0 || !hasSales || inventory.length === 0) {
    skipped.push({ rule: 'dead_sku', reason: products.length === 0 ? 'no products supplied' : !hasSales ? 'no sales supplied' : 'no inventory supplied (cannot tell dead stock from dead SKUs)' });
  } else {
    const onHand = new Map<string, number>();
    for (const i of inventory) onHand.set(i.sku, (onHand.get(i.sku) ?? 0) + i.on_hand);
    const rows: FlaggedRow[] = [];
    for (const pr of products) {
      const last = lastSaleBySku.get(pr.sku) ?? null;
      if (last !== null && last >= deadCutoff) continue;
      if ((onHand.get(pr.sku) ?? 0) > 0) continue;
      rows.push({ id: pr.sku, description: pr.description, category: pr.category, last_sale_date: last, on_hand: 0 });
    }
    findings.push({
      rule: 'dead_sku', title: `SKUs with no sales in ${DEAD_SKU_MONTHS} months and nothing on hand`,
      severity: severityByShare(rows.length / products.length), count: rows.length, unit: 'SKUs',
      population: products.length, flaggedInPopulation: rows.length, sample: rows.slice(0, SAMPLE_SIZE), rows, action: 'obsolete',
      exposure: none('not quantified', 'no sales and no stock means no revenue and no inventory value at stake; the cost is catalog clutter', rows.map((r) => r.id)),
      meta: { cutoff: deadCutoff },
    });
  }

  const score = scoreFindings(findings);
  return {
    asOf, findings, skipped, score,
    quantifiedExposure: round2(findings.reduce((a, f) => a + (f.exposure.kind === 'loss' ? f.exposure.amount ?? 0 : 0), 0)),
    tableSizes: { customers: customers.length, products: products.length, costs: costs.length, inventory: inventory.length, prices: prices.length, sales: sales.length },
  };
}

export function scoreFindings(findings: Finding[]): Score {
  const lines: ScoreLine[] = findings.map((f) => {
    const w = SCORE_WEIGHTS[f.rule];
    const share = f.population > 0 ? f.flaggedInPopulation / f.population : 0;
    const penalty = w.weight * Math.min(1, share / w.saturationShare);
    return { rule: f.rule, weight: w.weight, saturationShare: w.saturationShare, share, penalty: Math.round(penalty * 100) / 100 };
  });
  const score = Math.max(0, Math.min(100, Math.round(100 - lines.reduce((a, l) => a + l.penalty, 0))));
  return { score, lines };
}

export const ACTION_LABEL: Record<Action, string> = {
  archive: 'archive', review: 'review', reprice: 'reprice', obsolete: 'mark obsolete', merge: 'merge',
};
