import Stripe from "stripe";

// Lazy-init so build doesn't fail when STRIPE_SECRET_KEY is unset.
// Throws at first runtime use if the env is genuinely missing.
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as never });
  return _stripe;
}

// Proxy export — preserves `stripe.x.y()` call sites without code changes.
// Each property access lazy-resolves through getStripe().
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const s = getStripe();
    const value = (s as unknown as Record<string | symbol, unknown>)[prop as string | symbol];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(s) : value;
  },
});
