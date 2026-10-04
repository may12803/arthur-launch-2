#!/usr/bin/env node
// End-to-end test of the portal's sign-in and two-factor flow, as the dedicated QA login (never Daniel's).
// Checks: one-time wording; a reload keeps the SAME setup code; verify shows 10 backup codes; a second sign-in
// asks for the 6-digit code with no QR; a backup code removes the authenticator and leads back to setup.
// Leaves the QA account with no authenticator, so the next run starts clean.
//   arthur-cred run --use loveleeday-portal-qa,supabase -- node scripts/portal-2fa-flow-test.mjs
import { chromium } from "playwright";
import crypto from "node:crypto";

const BASE = process.env.PORTAL_BASE || "https://portal.loveleedaystudios.com";
const EMAIL = process.env.LOVELEEDAY_PORTAL_QA_EMAIL, PASS = process.env.LOVELEEDAY_PORTAL_QA_PASSWORD;
if (!EMAIL?.startsWith("portal-qa@")) { console.error("refusing: run this only as the QA login (loveleeday-portal-qa)"); process.exit(2); }

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

// Start from a clean QA account (other crawls leave throwaway authenticators behind). Needs the Supabase
// management token too: arthur-cred run --use loveleeday-portal-qa,supabase -- node ...
async function resetQa() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) return;
  const q = `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'portal-qa@loveleedaystudios.com');
             delete from private.mfa_recovery_codes where user_id = (select id from auth.users where email = 'portal-qa@loveleedaystudios.com');
             delete from auth.sessions where user_id = (select id from auth.users where email = 'portal-qa@loveleedaystudios.com');`;
  const r = await fetch("https://api.supabase.com/v1/projects/eydcfgoklajcztpoprsl/database/query", { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  if (!r.ok) throw new Error(`QA reset failed ${r.status}`);
}
await resetQa();

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome", headless: true }));
const page = await (await browser.newContext()).newPage();

async function signIn() {
  await page.goto(`${BASE}/client/login`);
  if (!results.some((r) => r.name.startsWith("login page links"))) check("login page links to forgot password", (await page.locator("a[href='/client/forgot']").count()) > 0);
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-password", PASS);
  await page.click("button[type=submit]");
  await page.waitForURL(/mfa\/(enroll|challenge)|\/client(\/workstreams)?$/, { timeout: 30000 });
}

try {
  await signIn();
  check("first sign-in goes to setup", page.url().includes("/mfa/enroll"), page.url());
  await page.waitForSelector(".select-all", { timeout: 20000 });
  const body = await page.textContent("body");
  check("setup says it is one-time", /One-time setup/.test(body) && /Scan once/.test(body));
  const secret1 = (await page.locator(".select-all").innerText()).trim();
  await page.reload();
  await page.waitForSelector(".select-all", { timeout: 20000 });
  const secret2 = (await page.locator(".select-all").innerText()).trim();
  check("reload keeps the same setup code", secret1 === secret2);
  await page.fill("#enroll-code", totp(secret2));
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Save your backup codes", { timeout: 20000 });
  const codes = (await page.locator(".grid.grid-cols-2.font-mono span").allInnerTexts()).map((s) => s.trim());
  check("verify shows 10 backup codes", codes.length === 10, codes.length ? `e.g. ${codes[0].slice(0, 2)}…` : "");
  await page.check("input[type=checkbox]");
  await page.click("text=Continue");
  await page.waitForURL(/\/client/, { timeout: 20000 });
  check("continue lands in the portal", !/mfa|login/.test(page.url()), page.url());

  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await signIn();
  check("second sign-in asks for the code, not the QR", page.url().includes("/mfa/challenge"), page.url());
  await page.waitForSelector("text=Lost your phone? Use a backup code", { timeout: 20000 }).catch(() => {});
  const cbody = await page.textContent("body");
  check("no QR on the code screen", !/Scan/.test(cbody) && /Lost your phone\? Use a backup code/.test(cbody));
  await page.click("text=Lost your phone? Use a backup code");
  await page.fill("input[placeholder='XXXXX-XXXXX']", codes[0]);
  await page.click("text=Use backup code");
  await page.waitForURL(/mfa\/enroll/, { timeout: 20000 });
  check("backup code removes the lost authenticator and returns to setup", page.url().includes("/mfa/enroll"));
} catch (e) {
  check("flow completed without error", false, String(e.message).slice(0, 200));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
