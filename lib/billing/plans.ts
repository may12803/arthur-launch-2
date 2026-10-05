// Offer ladder: ~/arthur/briefs/growth-plan-review-2026-10-05/SYNTHESIS.md section 5. Prices live in Stripe; keep this table
// in step with scripts/stripe-catalog.mjs (same lookup keys). Annual prepay is ten months (two free).
// Prices are shown only on the signed-in billing page. PUBLIC_PRICING_ENABLED (default off) is the one switch any
// public surface must check before showing a price; Daniel has not confirmed public prices.

export type Interval = "monthly" | "annual";
export interface Plan { key: string; name: string; blurb: string; monthlyCents: number; kind: "subscription" }
export interface AuditOffer { key: string; name: string; blurb: string; amountCents: number; kind: "payment" }

export const PLANS: Plan[] = [
  { key: "ll_starter", name: "Starter", blurb: "Your data in one place, with the weekly integrity check.", monthlyCents: 9900, kind: "subscription" },
  { key: "ll_growth", name: "Growth", blurb: "Connected systems and the full set of integrity rules.", monthlyCents: 39900, kind: "subscription" },
  { key: "ll_growth_plus", name: "Growth Plus", blurb: "Growth with higher volume and more connected systems.", monthlyCents: 79900, kind: "subscription" },
  { key: "ll_business", name: "Business", blurb: "Several teams, approvals and a named contact.", monthlyCents: 80000, kind: "subscription" },
  { key: "ll_business_scale", name: "Business Scale", blurb: "Business at the highest volume and support tier.", monthlyCents: 250000, kind: "subscription" },
];
export const AUDITS: AuditOffer[] = [
  { key: "ll_audit_standard", name: "Pricing Leakage Audit", blurb: "Fixed price, two weeks, up to 5,000 records.", amountCents: 450000, kind: "payment" },
  { key: "ll_audit_plus", name: "Pricing Leakage Audit, mid-size", blurb: "Fixed price, two weeks, larger catalogs.", amountCents: 950000, kind: "payment" },
];

export const priceKey = (planKey: string, interval: Interval) => `${planKey}_${interval}`;
// The tenant's current price as a catalog lookup key, or null when the plan or interval is unknown. Matching on the
// full key (plan and interval) keeps annual Starter from reading as "Current plan" under the monthly Starter card.
export function currentLookupKey(planKey: string | null | undefined, interval: string | null | undefined): string | null {
  if (!planKey || (interval !== "monthly" && interval !== "annual")) return null;
  return priceKey(planKey, interval);
}
export const annualCents = (p: Plan) => p.monthlyCents * 10;

// Accepts a catalog lookup key and returns what it is, or null. The only prices a checkout may be created for.
export function resolveLookupKey(lookup: string): { planKey: string; interval: Interval | "once"; mode: "subscription" | "payment" } | null {
  for (const p of PLANS) {
    if (lookup === priceKey(p.key, "monthly")) return { planKey: p.key, interval: "monthly", mode: "subscription" };
    if (lookup === priceKey(p.key, "annual")) return { planKey: p.key, interval: "annual", mode: "subscription" };
  }
  for (const a of AUDITS) if (lookup === a.key) return { planKey: a.key, interval: "once", mode: "payment" };
  return null;
}

export function publicPricingEnabled(): boolean {
  return process.env.PUBLIC_PRICING_ENABLED === "1" || process.env.PUBLIC_PRICING_ENABLED === "true";
}
export function stripeMode(): "test" | "live" {
  return process.env.STRIPE_MODE === "live" ? "live" : "test";
}
export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
