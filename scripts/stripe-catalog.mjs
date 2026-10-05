#!/usr/bin/env node
// Idempotent LOVELEEDAY Stripe catalog (products, prices, customer-portal configuration), keyed by lookup_key.
// Test mode by default. Live needs --live AND STRIPE_LIVE_CONFIRM=1 AND a live secret key. The key and its mode
// must agree: a test key refuses --live, a live key refuses test mode.
//   arthur-cred run --use stripe -- node scripts/stripe-catalog.mjs [--live] [--dry]
// Prices are immutable in Stripe: if an amount changes, the old price loses its lookup_key (transfer_lookup_key) and a new one takes it.
// Ladder source: ~/arthur/briefs/growth-plan-review-2026-10-05/SYNTHESIS.md section 5. Annual = ten months (two free).
// Audit prices are the CRO memo's (cro.md, offer B), an assumption until Daniel confirms.

export const PLANS = [
  { key: "ll_starter", name: "LOVELEEDAY Starter", blurb: "Self-serve entry plan.", monthly: 9900 },
  { key: "ll_growth", name: "LOVELEEDAY Growth", blurb: "Low end of the Growth range ($399).", monthly: 39900 },
  { key: "ll_growth_plus", name: "LOVELEEDAY Growth Plus", blurb: "High end of the Growth range ($799).", monthly: 79900 },
  { key: "ll_business", name: "LOVELEEDAY Business", blurb: "Low end of the Business range ($800).", monthly: 80000 },
  { key: "ll_business_scale", name: "LOVELEEDAY Business Scale", blurb: "High end of the Business range ($2,500).", monthly: 250000 },
];
export const AUDITS = [
  { key: "ll_audit_standard", name: "Pricing Leakage Audit (under 5,000 records)", blurb: "Fixed-price, two weeks. Amount is an assumption from cro.md.", amount: 450000 },
  { key: "ll_audit_plus", name: "Pricing Leakage Audit (mid-size)", blurb: "Fixed-price, two weeks. Amount is an assumption from cro.md.", amount: 950000 },
];

const live = process.argv.includes("--live");
const dry = process.argv.includes("--dry");
const key = process.env.STRIPE_SECRET_KEY || "";
const keyMode = /^(sk|rk)_live_/.test(key) ? "live" : /^(sk|rk)_test_/.test(key) ? "test" : "unknown";
if (live && process.env.STRIPE_LIVE_CONFIRM !== "1") { console.error("Refusing --live without STRIPE_LIVE_CONFIRM=1."); process.exit(2); }
if (keyMode === "unknown") { console.error("STRIPE_SECRET_KEY missing or unrecognized."); process.exit(2); }
if ((live ? "live" : "test") !== keyMode) { console.error(`Mode mismatch: running ${live ? "live" : "test"} but the key is ${keyMode}.`); process.exit(2); }

function enc(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? enc(x, `${name}[${i}]`, out) : out.push([`${name}[${i}]`, String(x)])));
    else if (typeof v === "object") enc(v, name, out);
    else out.push([name, String(v)]);
  }
  return out;
}
async function api(method, path, params) {
  const qs = params ? new URLSearchParams(enc(params)).toString() : "";
  const url = "https://api.stripe.com/v1" + path + (method === "GET" && qs ? "?" + qs : "");
  const res = await fetch(url, { method, headers: { Authorization: "Bearer " + key, ...(method !== "GET" ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body: method === "GET" ? undefined : qs });
  const j = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${j.error?.message}`);
  return j;
}

async function ensureProduct(p) {
  const list = await api("GET", "/products", { active: true, limit: 100 });
  const found = list.data.find((x) => x.metadata?.ll_plan === p.key);
  if (found) return found;
  if (dry) return { id: "(dry)" };
  return api("POST", "/products", { name: p.name, description: p.blurb, metadata: { ll_plan: p.key } });
}
async function ensurePrice(product, lookup_key, unit_amount, recurring, plan) {
  const ex = (await api("GET", "/prices", { lookup_keys: [lookup_key], active: true })).data[0];
  if (ex && ex.unit_amount === unit_amount && ex.product === product.id && (ex.recurring?.interval ?? null) === (recurring?.interval ?? null)) return { ...ex, _state: "exists" };
  if (dry) return { id: "(dry)", lookup_key, unit_amount, _state: ex ? "would-replace" : "would-create" };
  const p = await api("POST", "/prices", { product: product.id, currency: "usd", unit_amount, lookup_key, transfer_lookup_key: ex ? true : undefined, recurring, metadata: { ll_plan: plan } });
  return { ...p, _state: ex ? "replaced" : "created" };
}

const rows = [];
for (const p of PLANS) {
  const prod = await ensureProduct(p);
  for (const [suffix, amount, interval] of [["monthly", p.monthly, "month"], ["annual", p.monthly * 10, "year"]]) {
    const pr = await ensurePrice(prod, `${p.key}_${suffix}`, amount, { interval }, p.key);
    rows.push([p.key, pr.lookup_key, `$${amount / 100}/${interval}`, prod.id, pr.id, pr._state]);
  }
}
for (const a of AUDITS) {
  const prod = await ensureProduct(a);
  const pr = await ensurePrice(prod, a.key, a.amount, undefined, a.key);
  rows.push([a.key, pr.lookup_key, `$${a.amount / 100} one-time`, prod.id, pr.id, pr._state]);
}

// Customer portal configuration: a default one must exist before billingPortal.sessions.create works in a mode.
const cfgs = await api("GET", "/billing_portal/configurations", { limit: 10 });
let cfg = cfgs.data.find((c) => c.is_default && c.metadata?.ll === "1") || cfgs.data.find((c) => c.metadata?.ll === "1");
if (!cfg && !dry) {
  cfg = await api("POST", "/billing_portal/configurations", {
    business_profile: { headline: "LOVELEEDAY billing" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "phone", "tax_id"] },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
    metadata: { ll: "1" },
  });
}
console.log(`mode=${keyMode}${dry ? " (dry run)" : ""}`);
for (const r of rows) console.log(r.join("  "));
console.log("portal_configuration", cfg?.id ?? "(dry)");
