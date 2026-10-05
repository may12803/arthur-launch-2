// Canonical price / product / customer / sales schema for the Data Integrity review.
// Dates are ISO yyyy-mm-dd strings. Money is plain USD numbers. Every table maps 1:1 to a CSV with the same column names.

export type CustomerStatus = 'active' | 'inactive';

export interface Customer {
  customer_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: CustomerStatus;
}

export interface Product {
  sku: string;
  description: string;
  category: string;
  uom: string;
}

/** One row per cost change. The cost in force on a date is the latest row on or before it. */
export interface CostRecord {
  sku: string;
  effective_date: string;
  cost: number;
}

/** Stock position. A product with no inventory row is treated as zero on hand. */
export interface InventoryRecord {
  sku: string;
  on_hand: number;
  as_of: string;
}

/** A customer-specific price, one row per customer + sku. */
export interface PriceRecord {
  price_id: string;
  customer_id: string;
  sku: string;
  price: number;
  effective_date: string;
}

export interface Sale {
  sale_id: string;
  sale_date: string;
  customer_id: string;
  sku: string;
  qty: number;
  unit_price: number;
}

export interface Tables {
  customers: Customer[];
  products: Product[];
  costs: CostRecord[];
  inventory: InventoryRecord[];
  prices: PriceRecord[];
  sales: Sale[];
}

export type RuleId =
  | 'below_cost'
  | 'cost_lag'
  | 'duplicate_customer'
  | 'stale_price'
  | 'inactive_customer_prices'
  | 'dead_sku';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Action = 'archive' | 'review' | 'reprice' | 'obsolete' | 'merge';

export interface Exposure {
  /** USD, or null when the data contains no dollar basis for this rule. Never an estimate. */
  amount: number | null;
  /** 'loss' = computed on real sales volume; 'exposure' = per-unit gap only; 'none' = not quantifiable. */
  kind: 'loss' | 'exposure' | 'none';
  /** The exact formula, in words, that produced the amount. */
  formula: string;
  /** Why the number is (or is not) quantified. */
  basis: string;
  /** Ids of every row that feeds the amount (price ids for price rules). */
  inputRowIds: string[];
}

export type RowValue = string | number | string[] | null;

export interface FlaggedRow {
  /** Primary id of the flagged object (price_id, sku, customer_id, or the first member of a duplicate group). */
  id: string;
  /** Dollar exposure for this row alone, when the rule quantifies one. */
  exposure?: number;
  /** Every field needed to recompute the row's figures by hand. */
  [field: string]: RowValue | undefined;
}

export interface Finding {
  rule: RuleId;
  title: string;
  severity: Severity;
  count: number;
  /** What `count` counts (price records, SKUs, duplicate groups). */
  unit: string;
  /** Size of the population the rule scanned, for share-of-total scoring. */
  population: number;
  /** Size of the flagged population in the same units as `population` (differs from count for duplicate groups). */
  flaggedInPopulation: number;
  sample: FlaggedRow[];
  rows: FlaggedRow[];
  exposure: Exposure;
  action: Action;
  meta?: Record<string, number | string>;
}

export interface SkippedRule {
  rule: RuleId;
  reason: string;
}

export interface ScoreLine {
  rule: RuleId;
  weight: number;
  saturationShare: number;
  share: number;
  penalty: number;
}

export interface Score {
  score: number;
  lines: ScoreLine[];
}

export interface IntegrityResult {
  asOf: string;
  findings: Finding[];
  skipped: SkippedRule[];
  score: Score;
  quantifiedExposure: number;
  tableSizes: Record<keyof Tables, number>;
}
