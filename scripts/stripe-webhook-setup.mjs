#!/usr/bin/env node
// Create (once) the Stripe webhook endpoint for the portal and vault its signing secret without printing it.
//   arthur-cred run --use stripe -- node scripts/stripe-webhook-setup.mjs [--live]
// Secret lands in ~/.arthur/vault/stripe-loveleeday-webhook-<test|live>.env (mode 600) as STRIPE_WEBHOOK_SECRET.
// Stripe shows a signing secret only at creation; if the endpoint exists and the vault file is gone, delete the endpoint and re-run.
import { writeFileSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";

const live = process.argv.includes("--live");
const key = process.env.STRIPE_SECRET_KEY || "";
const mode = /^(sk|rk)_live_/.test(key) ? "live" : /^(sk|rk)_test_/.test(key) ? "test" : "unknown";
if (mode !== (live ? "live" : "test")) { console.error(`Key mode ${mode} does not match requested ${live ? "live" : "test"}.`); process.exit(2); }
if (live && process.env.STRIPE_LIVE_CONFIRM !== "1") { console.error("Refusing --live without STRIPE_LIVE_CONFIRM=1."); process.exit(2); }

const URL_ = "https://portal.loveleedaystudios.com/api/stripe/webhook";
const EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"];
const call = async (method, path, params) => {
  const body = params ? new URLSearchParams(params) : undefined;
  const r = await fetch("https://api.stripe.com/v1" + path + (method === "GET" && body ? "?" + body : ""), { method, headers: { Authorization: "Bearer " + key }, body: method === "GET" ? undefined : body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message);
  return j;
};
const file = `${homedir()}/.arthur/vault/stripe-loveleeday-webhook-${mode}.env`;
const list = await call("GET", "/webhook_endpoints", { limit: "100" });
const found = list.data.find((e) => e.url === URL_);
if (found) {
  console.log(`endpoint exists ${found.id} status=${found.status} vault_file=${existsSync(file) ? "present" : "MISSING"}`);
  process.exit(0);
}
const params = [["url", URL_], ["description", "LOVELEEDAY portal billing"], ...EVENTS.map((e) => ["enabled_events[]", e])];
const e = await call("POST", "/webhook_endpoints", new URLSearchParams(params));
writeFileSync(file, `STRIPE_WEBHOOK_SECRET=${e.secret}\n`, { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`created ${e.id}; secret vaulted to ${file}`);
