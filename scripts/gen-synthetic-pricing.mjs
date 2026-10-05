#!/usr/bin/env node
// Synthetic pricing dataset for the Data Integrity review. Everything here is fictional: a made-up
// industrial-supplies distributor with invented customers, SKUs and prices. No real company data.
//
//   node scripts/gen-synthetic-pricing.mjs <outDir> [--seed=N] [--clean]
//
// Writes customers/products/costs/inventory/prices/sales CSVs plus manifest.json, the ground truth of every
// seeded problem (ids, not just counts) that the tests compare the rules engine against.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLE_COLUMNS, toCsv } from '../lib/integrity/csv.ts';

export const AS_OF = '2026-09-30';

export const DEFAULT_COUNTS = {
  customers: 400, skus: 1500, prices: 25000,
  deadSkus: 60, lagSkus: 12, stale: 150, belowCost: 60,
  inactiveCustomers: 20, inactivePricesEach: 40, dupPairs: 10, dupTriples: 2,
};
export const CLEAN_COUNTS = { ...DEFAULT_COUNTS, deadSkus: 0, lagSkus: 0, stale: 0, belowCost: 0, inactiveCustomers: 0, dupPairs: 0, dupTriples: 0 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const days = (iso) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
const money = (n) => Math.round(n * 100) / 100;

const ADJ = ['Harbor', 'Cinder', 'Meridian', 'Alder', 'Larkspur', 'Summit', 'Tamarack', 'Ironbark', 'Willow', 'Granite', 'Juniper', 'Redwood', 'Saffron', 'Northgate', 'Brightwater', 'Falcon', 'Marlow', 'Pinecrest', 'Quarry', 'Stonebridge'];
const NOUN = ['Ridge', 'Lane', 'Hollow', 'Point', 'Crossing', 'Mill', 'Landing', 'Flats', 'Terrace', 'Bluff', 'Station', 'Grove', 'Works', 'Yard', 'Forge', 'Row', 'Fields', 'Run', 'Gate', 'Basin'];
const KIND = ['Supply', 'Hardware', 'Industrial', 'Services', 'Trading', 'Outfitters', 'Builders', 'Maintenance', 'Facilities', 'Provisions'];
const LEGAL = ['Co.', 'LLC', 'Inc.'];
const STREET = ['Cedar', 'Maple', 'Orchard', 'Depot', 'Lakeview', 'Prospect', 'Elm', 'Foundry', 'Canal', 'Sycamore', 'Harvest', 'Linden', 'Kestrel', 'Millrace', 'Tanner', 'Oakmont', 'Quincy', 'Ridgeway', 'Spruce', 'Thistle', 'Union', 'Vale', 'Weaver', 'Yarrow', 'Aspen'];
const STREET_TYPE = ['Street', 'Avenue', 'Road'];
const CITY = ['Fairhaven', 'Brookport', 'Glenmoor', 'Ashford Mills', 'Pellham', 'Stonehaven', 'Darrow', 'Wexcombe'];
const STATE = ['MI', 'OH', 'IN', 'WI', 'IL', 'PA'];

const CATEGORIES = {
  FA: ['Fasteners', ['Hex Bolt', 'Lock Washer', 'Machine Screw', 'Anchor Sleeve', 'Wing Nut', 'Carriage Bolt']],
  AB: ['Abrasives', ['Sanding Disc', 'Flap Wheel', 'Grinding Wheel', 'Sanding Belt', 'Scouring Pad']],
  PK: ['Packaging', ['Stretch Wrap', 'Poly Mailer', 'Carton Tape', 'Corrugated Box', 'Bubble Roll']],
  SF: ['Safety', ['Nitrile Glove', 'Safety Glasses', 'Ear Plug Pair', 'Hi-Vis Vest', 'Dust Mask']],
  JN: ['Janitorial', ['Floor Cleaner', 'Trash Liner', 'Mop Head', 'Hand Soap Refill', 'Paper Towel Case']],
  HT: ['Hand Tools', ['Adjustable Wrench', 'Utility Knife', 'Claw Hammer', 'Tape Measure', 'Pliers']],
  AD: ['Adhesives', ['Threadlocker', 'Contact Cement', 'Epoxy Kit', 'Foam Sealant', 'Masking Tape']],
  LT: ['Lighting', ['LED Tube', 'Work Lamp', 'Exit Sign Bulb', 'Flood Fixture', 'Pendant Lamp']],
};
const SPEC = ['Small', 'Medium', 'Large', 'Heavy Duty', 'Bulk Pack', 'Value Pack', 'Industrial', 'Compact'];

export function generate({ seed = 20261005, counts = DEFAULT_COUNTS } = {}) {
  const c = { ...DEFAULT_COUNTS, ...counts };
  const rnd = mulberry32(seed);
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => iso(rint(days(a), days(b)));
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // ---- customers ----
  const dupExtras = c.dupPairs * 1 + c.dupTriples * 2;
  const baseCount = c.customers - dupExtras;
  const customers = [];
  for (let i = 0; i < baseCount; i++) {
    const n = i + 1;
    customers.push({
      customer_id: `C${String(n).padStart(4, '0')}`,
      name: `${ADJ[i % 20]} ${NOUN[Math.floor(i / 20) % 20]} ${KIND[i % 10]} ${LEGAL[i % 3]}`,
      address: `${100 + ((i * 37) % 900)} ${STREET[i % 25]} ${STREET_TYPE[i % 3]}`,
      city: CITY[i % CITY.length], state: STATE[i % STATE.length], zip: String(40000 + ((i * 53) % 9000)).padStart(5, '0'),
      status: 'active',
    });
  }
  const order = shuffle(customers.map((_, i) => i));
  const dupGroups = [];
  let nextId = baseCount + 1;
  const makeVariant = (b, v) => {
    const stem = b.name.replace(/\s+(Co\.|LLC|Inc\.)$/, '');
    const name = v === 0 ? `${stem.toUpperCase()}, INC` : v === 1 ? `${stem} Company` : `The ${stem}`;
    const address = v === 0 ? b.address.replace('Street', 'St.').replace('Avenue', 'Ave.').replace('Road', 'Rd.') + ', Suite 2'
      : v === 1 ? b.address.toUpperCase() : b.address.replace('Street', 'St').replace('Avenue', 'Ave').replace('Road', 'Rd') + ' Ste 100';
    return { customer_id: `C${String(nextId++).padStart(4, '0')}`, name, address, city: b.city, state: b.state, zip: v === 1 ? `${b.zip}-${rint(1000, 9999)}` : b.zip, status: 'active' };
  };
  const dupBaseIdx = order.slice(0, c.dupPairs + c.dupTriples);
  dupBaseIdx.forEach((bi, k) => {
    const b = customers[bi];
    const members = [b.customer_id];
    for (let v = 0; v < (k < c.dupPairs ? 1 : 2); v++) { const x = makeVariant(b, v); customers.push(x); members.push(x.customer_id); }
    dupGroups.push(members);
  });
  const dupBaseSet = new Set(dupBaseIdx);
  const inactiveIdx = order.filter((i) => !dupBaseSet.has(i)).slice(0, c.inactiveCustomers);
  const inactiveCustomerIds = inactiveIdx.map((i) => { customers[i].status = 'inactive'; return customers[i].customer_id; });
  const inactiveSet = new Set(inactiveCustomerIds);
  const activeIds = customers.filter((x) => x.status === 'active').map((x) => x.customer_id);

  // ---- products, costs, inventory ----
  const catKeys = Object.keys(CATEGORIES);
  const products = [];
  const costs = [];
  const inventory = [];
  const baseCost = new Map();
  for (let i = 0; i < c.skus; i++) {
    const key = catKeys[i % catKeys.length];
    const [cat, items] = CATEGORIES[key];
    const sku = `${key}-${10000 + i}`;
    products.push({ sku, description: `${items[Math.floor(i / catKeys.length) % items.length]} ${SPEC[(i * 3) % SPEC.length]}`, category: cat, uom: pick(['EA', 'BX', 'CS']) });
    const base = money(rint(200, 15000) / 100);
    baseCost.set(sku, base);
    costs.push({ sku, effective_date: '2020-01-01', cost: base });
  }
  const skuIds = shuffle(products.map((p) => p.sku));
  const deadSkus = skuIds.slice(0, c.deadSkus);
  const lagSkus = skuIds.slice(c.deadSkus, c.deadSkus + c.lagSkus);
  const normalSkus = skuIds.slice(c.deadSkus + c.lagSkus);
  const lagStep = new Map();
  for (const sku of lagSkus) {
    const step = between('2025-12-01', '2026-03-31');
    lagStep.set(sku, step);
    costs.push({ sku, effective_date: step, cost: money(baseCost.get(sku) * 1.12) });
  }
  for (const sku of normalSkus) {
    // Ordinary cost creep: at most two rises of 2% or less, never reaching the 5% lag threshold.
    let cur = baseCost.get(sku);
    for (let k = 0, n = rnd() < 0.5 ? rint(1, 2) : 0; k < n; k++) {
      cur = money(cur * (1 + rint(5, 20) / 1000));
      costs.push({ sku, effective_date: between('2024-02-01', '2025-11-30'), cost: cur });
    }
  }
  const deadSet = new Set(deadSkus);
  for (const p of products) inventory.push({ sku: p.sku, on_hand: deadSet.has(p.sku) ? 0 : rint(0, 600), as_of: AS_OF });
  const currentCost = new Map();
  for (const k of [...costs].sort((x, y) => (x.effective_date < y.effective_date ? -1 : 1))) currentCost.set(k.sku, k.cost);

  // ---- prices and sales ----
  const prices = [];
  const sales = [];
  const pairs = new Set();
  const addPrice = (customer_id, sku, price, effective_date) => {
    const p = { price_id: `P${String(prices.length + 1).padStart(6, '0')}`, customer_id, sku, price: money(price), effective_date };
    prices.push(p); pairs.add(`${customer_id}|${sku}`);
    return p;
  };
  const addSale = (p, date) => sales.push({ sale_id: '', sale_date: date, customer_id: p.customer_id, sku: p.sku, qty: rint(1, 40), unit_price: p.price });
  const freePair = (customers_, skus_) => { for (let t = 0; t < 200; t++) { const cu = pick(customers_), sk = pick(skus_); if (!pairs.has(`${cu}|${sk}`)) return [cu, sk]; } throw new Error('no free pair'); };
  const recentFrom = (eff) => (eff > '2025-10-01' ? eff : '2025-10-01');
  const addNormalSales = (p) => {
    addSale(p, between(recentFrom(p.effective_date), AS_OF));
    for (let k = rint(0, 2); k > 0; k--) addSale(p, between(p.effective_date, AS_OF));
  };

  const inactiveRecordIds = [];
  for (const cu of inactiveCustomerIds) {
    for (const sku of shuffle([...normalSkus]).slice(0, c.inactivePricesEach)) {
      inactiveRecordIds.push(addPrice(cu, sku, currentCost.get(sku) * (1.25 + rnd() * 0.5), between('2021-06-01', '2023-06-30')).price_id);
    }
  }
  const lagIds = [];
  for (const sku of lagSkus) {
    const step = lagStep.get(sku);
    const stepBefore = iso(days(step) - 30);
    for (const cu of shuffle([...activeIds]).slice(0, rint(20, 30))) {
      const p = addPrice(cu, sku, baseCost.get(sku) * 1.35, between('2025-01-01', stepBefore));
      lagIds.push(p.price_id);
      for (let k = rint(2, 4); k > 0; k--) addSale(p, between(step, AS_OF));
      addSale(p, between(p.effective_date, stepBefore));
    }
  }
  for (const sku of normalSkus) { // every live SKU sells at least once, so none is dead by accident
    const cu = pick(activeIds);
    if (pairs.has(`${cu}|${sku}`)) continue;
    addNormalSales(addPrice(cu, sku, currentCost.get(sku) * (1.25 + rnd() * 0.55), between('2023-10-01', '2026-06-30')));
  }
  const staleIds = [];
  for (let i = 0; i < c.stale; i++) {
    const [cu, sk] = freePair(activeIds, normalSkus);
    staleIds.push(addPrice(cu, sk, currentCost.get(sk) * (1.25 + rnd() * 0.5), between('2021-01-01', '2023-08-31')).price_id);
  }
  const belowCostIds = [];
  for (let i = 0; i < c.belowCost; i++) {
    const [cu, sk] = freePair(activeIds, normalSkus);
    const p = addPrice(cu, sk, currentCost.get(sk) * (0.85 + rnd() * 0.12), between('2026-01-15', '2026-08-31'));
    belowCostIds.push(p.price_id);
    for (let k = rint(2, 5); k > 0; k--) addSale(p, between(p.effective_date, AS_OF));
  }
  while (prices.length < c.prices) {
    const [cu, sk] = freePair(activeIds, normalSkus);
    addNormalSales(addPrice(cu, sk, currentCost.get(sk) * (1.25 + rnd() * 0.55), between('2023-10-01', '2026-06-30')));
  }

  sales.sort((a, b) => (a.sale_date < b.sale_date ? -1 : a.sale_date > b.sale_date ? 1 : 0));
  sales.forEach((s, i) => { s.sale_id = `S${String(i + 1).padStart(7, '0')}`; });

  const manifest = {
    asOf: AS_OF, seed, counts: c,
    expected: {
      dead_sku: deadSkus.slice().sort(),
      stale_price: staleIds.slice().sort(),
      below_cost: belowCostIds.slice().sort(),
      cost_lag: lagIds.slice().sort(),
      inactive_customer_prices: inactiveRecordIds.slice().sort(),
      duplicate_customer: dupGroups.map((g) => g.slice().sort()),
      inactive_customers: inactiveCustomerIds.slice().sort(),
    },
  };
  return { tables: { customers, products, costs, inventory, prices, sales }, manifest };
}

export function writeDataset(dir, { tables, manifest }) {
  mkdirSync(dir, { recursive: true });
  for (const [name, cols] of Object.entries(TABLE_COLUMNS)) writeFileSync(join(dir, `${name}.csv`), toCsv(tables[name], cols));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('usage: node scripts/gen-synthetic-pricing.mjs <outDir> [--seed=N] [--clean]'); process.exit(1); }
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const ds = generate({ seed: seedArg ? Number(seedArg.slice(7)) : undefined, counts: args.includes('--clean') ? CLEAN_COUNTS : DEFAULT_COUNTS });
  writeDataset(dir, ds);
  const t = ds.tables;
  console.log(`wrote ${dir}: ${t.customers.length} customers, ${t.products.length} SKUs, ${t.prices.length} price records, ${t.sales.length} sales, ${t.costs.length} cost rows`);
}
