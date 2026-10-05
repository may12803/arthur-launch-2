// The "try the synthetic sample" file: a fictional industrial-supplies distributor flattened into one messy price
// export, with the headers a real ERP report would carry. Invented customers, SKUs and prices only. No real data.
import { addMonths } from '../integrity/rules.ts';
import { toCsv } from '../integrity/csv.ts';

export const SAMPLE_FILENAME = 'synthetic-sample-price-export.csv';
export const SAMPLE_LABEL = 'synthetic sample';
export const SAMPLE_COLUMNS = ['Item #', 'Item Description', 'Product Line', 'Customer', 'Cust Address', 'Cust Zip', 'Cust Status', 'Unit Price', 'Std Cost', 'Price Eff Date', 'Last Invoice Date', 'Qty On Hand', 'Units Sold 12M'];

const COUNTS = { customers: 120, skus: 400, prices: 1800, deadSkus: 20, lagSkus: 4, stale: 40, belowCost: 25, inactiveCustomers: 6, inactivePricesEach: 12, dupPairs: 4, dupTriples: 1 };

let cached: { text: string; asOf: string } | null = null;

export async function sampleCsv(): Promise<{ text: string; asOf: string; filename: string }> {
  if (!cached) {
    // @ts-ignore the generator is a plain .mjs module shared with the CLI and the tests
    const { generate, AS_OF } = await import('../../scripts/gen-synthetic-pricing.mjs');
    const { tables } = generate({ counts: COUNTS });
    const asOf: string = AS_OF;
    const trailingStart = addMonths(asOf, -12);
    const custById = new Map(tables.customers.map((c: { customer_id: string }) => [c.customer_id, c]));
    const prodBySku = new Map(tables.products.map((p: { sku: string }) => [p.sku, p]));
    const latestCost = new Map<string, { d: string; cost: number }>();
    for (const c of tables.costs as { sku: string; effective_date: string; cost: number }[]) {
      const cur = latestCost.get(c.sku);
      if (!cur || c.effective_date > cur.d) latestCost.set(c.sku, { d: c.effective_date, cost: c.cost });
    }
    const onHand = new Map<string, number>();
    for (const i of tables.inventory as { sku: string; on_hand: number }[]) onHand.set(i.sku, (onHand.get(i.sku) ?? 0) + i.on_hand);
    const pair = new Map<string, { last: string; units: number }>();
    for (const s of tables.sales as { customer_id: string; sku: string; sale_date: string; qty: number }[]) {
      const k = `${s.customer_id}|${s.sku}`;
      const cur = pair.get(k) ?? { last: '', units: 0 };
      if (s.sale_date > cur.last) cur.last = s.sale_date;
      if (s.sale_date > trailingStart && s.sale_date <= asOf) cur.units += s.qty;
      pair.set(k, cur);
    }
    const rows = (tables.prices as { customer_id: string; sku: string; price: number; effective_date: string }[]).map((p) => {
      const c = custById.get(p.customer_id) as { name: string; address: string; zip: string; status: string } | undefined;
      const pr = prodBySku.get(p.sku) as { description: string; category: string } | undefined;
      const ps = pair.get(`${p.customer_id}|${p.sku}`);
      return {
        'Item #': p.sku, 'Item Description': pr?.description ?? '', 'Product Line': pr?.category ?? '',
        Customer: c?.name ?? '', 'Cust Address': c?.address ?? '', 'Cust Zip': c?.zip ?? '', 'Cust Status': c?.status === 'inactive' ? 'Inactive' : 'Active',
        'Unit Price': p.price.toFixed(2), 'Std Cost': (latestCost.get(p.sku)?.cost ?? '') === '' ? '' : (latestCost.get(p.sku)!.cost).toFixed(2),
        'Price Eff Date': p.effective_date, 'Last Invoice Date': ps?.last ?? '', 'Qty On Hand': String(onHand.get(p.sku) ?? 0), 'Units Sold 12M': String(ps?.units ?? 0),
      };
    });
    cached = { text: toCsv(rows, SAMPLE_COLUMNS), asOf };
  }
  return { ...cached, filename: SAMPLE_FILENAME };
}
