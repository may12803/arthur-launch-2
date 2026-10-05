// Browser half of scripts/billing-e2e.sh. Logs in as the QA admin (TOTP from the vault), calls POST /api/billing/checkout
// for the throwaway tenant, pays with Stripe's 4242 test card, waits for the webhook, and reads tenant_subscriptions back.
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.PORTAL_BASE;
const STATE = "/private/tmp/claude-501/qa-state.json";
const LOOKUP = process.env.E2E_LOOKUP || "ll_growth_monthly";
const TENANT = process.env.E2E_TENANT; // throwaway tenant id

function totp(secret) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alpha.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(ctr).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}
const sql = (q) => {
  fs.writeFileSync("/private/tmp/claude-501/e2e.sql", q);
  return execFileSync("node", [`${process.env.HOME}/arthur/scripts/sb-sql.mjs`, "eydcfgoklajcztpoprsl", "/private/tmp/claude-501/e2e.sql"], { encoding: "utf8" });
};

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome", headless: true }));
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(fs.existsSync(STATE) ? { storageState: STATE } : {}) });
const page = await ctx.newPage();
await page.goto(BASE + "/client");
if (page.url().includes("/client/login")) {
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"]', process.env.LOVELEEDAY_PORTAL_QA_EMAIL);
  await page.fill('input[type="password"]', process.env.LOVELEEDAY_PORTAL_QA_PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
}
if (page.url().includes("/mfa/challenge")) {
  await page.waitForTimeout(2500);
  await page.locator('input[inputmode="numeric"]').pressSequentially(totp(process.env.LOVELEEDAY_PORTAL_QA_TOTP_SECRET), { delay: 40 });
  await page.locator('button[type="submit"]:not([disabled])').first().click({ timeout: 10000 });
  await page.waitForURL((u) => !/\/(login|mfa)/.test(u.pathname), { timeout: 20000 });
}
await ctx.storageState({ path: STATE });
await ctx.addCookies([{ name: "lv_active_tenant", value: TENANT, url: BASE }]);

// 1. Cross-checks: a member is refused a bogus plan; the real call returns a Stripe URL.
const bad = await ctx.request.post(BASE + "/api/billing/checkout", { headers: { "x-tenant-id": TENANT }, data: { lookup_key: "ll_nope" } });
console.log("bogus lookup_key ->", bad.status());
const res = await ctx.request.post(BASE + "/api/billing/checkout", { headers: { "x-tenant-id": TENANT }, data: { lookup_key: LOOKUP } });
const out = await res.json();
console.log("checkout ->", res.status(), out.url ? new URL(out.url).host : JSON.stringify(out));
if (!out.url) process.exit(1);

// 2. Pay on Stripe's hosted page with the test card.
const pay = await ctx.newPage();
await pay.goto(out.url, { waitUntil: "domcontentloaded" });
await pay.waitForTimeout(8000);
await pay.screenshot({ path: "/private/tmp/claude-501/billing-checkout-pre.png" });
await pay.fill("#email", "billing-e2e@loveleedaystudios.com").catch(() => {});
console.log("DOM", JSON.stringify(await pay.evaluate(() => ({ inputs: [...document.querySelectorAll("input,button[data-testid]")].map((e) => `${e.tagName}#${e.id}[${e.type || ""}|${e.name || ""}|${e.getAttribute("data-testid") || ""}|${e.value || ""}]`).slice(0, 30), frames: document.querySelectorAll("iframe").length }))));
await pay.evaluate(() => document.querySelector('[data-testid="card-accordion-item-button"]').click());
await pay.waitForTimeout(1500);
await pay.screenshot({ path: "/private/tmp/claude-501/billing-checkout-card.png" });
const save = pay.getByText("Save my information for faster checkout");
if (await save.count()) await save.click().catch(() => {});
await pay.waitForSelector("#cardNumber", { timeout: 45000 });
await pay.fill("#cardNumber", "4242424242424242");
await pay.fill("#cardExpiry", "12 / 34");
await pay.fill("#cardCvc", "123");
await pay.fill("#billingName", "Billing E2E");
const zip = pay.locator("#billingPostalCode");
if (await zip.count()) await zip.fill("49001");
await pay.screenshot({ path: "/private/tmp/claude-501/billing-checkout.png" });
await pay.locator(".SubmitButton").click();
await pay.waitForURL(/\/client\/billing/, { timeout: 90000 });
console.log("returned to", new URL(pay.url()).pathname + new URL(pay.url()).search);

// 3. Webhook result.
let row = "";
for (let i = 0; i < 30 && !row.includes("|"); i++) {
  await new Promise((r) => setTimeout(r, 2000));
  row = sql(`select plan_key, price_lookup_key, status, amount_cents, billing_interval, last_invoice_status, livemode from public.tenant_subscriptions where tenant_id = '${TENANT}'`);
}
console.log("tenant_subscriptions:", row.trim());
console.log("tenants.plan/customer:", sql(`select plan, stripe_customer_id is not null as has_customer from public.tenants where id = '${TENANT}'`).trim());
console.log("stripe_events:", sql(`select event_type from public.stripe_events where tenant_id = '${TENANT}' order by received_at`).trim());

// 4. The billing page shows it.
await page.goto(BASE + "/client/billing", { extraHTTPHeaders: undefined });
await ctx.addCookies([{ name: "lv_active_tenant", value: TENANT, url: BASE }]);
await page.goto(BASE + "/client/billing", { waitUntil: "networkidle" });
const txt = await page.locator('[data-testid="current-subscription"]').innerText().catch(() => "(no current-subscription element)");
console.log("billing page:", txt);
await page.screenshot({ path: "/private/tmp/claude-501/billing-page.png", fullPage: true });
await browser.close();
