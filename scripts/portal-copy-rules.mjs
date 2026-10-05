// Copy rules for scripts/portal-role-walk.mjs, kept separate so they can be tested without a browser.
// Prices are allowed on the signed-in billing page only. Everywhere else a price-like string is a violation, and public
// prices stay forbidden until Daniel confirms them (PUBLIC_PRICING_ENABLED gates any public display, see lib/billing/plans.ts).
export const PRICE_ALLOWED_ROUTES = new Set(["/client/billing"]);

export const PRICE_PATTERN = /[$€£]\s?\d[\d,.]*/g;

export function priceAllowed(route) {
  return PRICE_ALLOWED_ROUTES.has(String(route).split("?")[0].split("#")[0].replace(/\/+$/, ""));
}

// Price-like strings found in `text` that count as a copy violation on `route`.
export function priceViolations(route, text) {
  if (priceAllowed(route)) return [];
  return (String(text).match(PRICE_PATTERN) || []).slice(0, 3);
}
