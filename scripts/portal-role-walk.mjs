#!/usr/bin/env node
// Walks every client-portal route at 1440 and 390 as the QA login in its current tenant role, saving screenshots and
// recording overflow, console/HTTP errors, copy-rule hits ("Arthur", prices outside the signed-in /client/billing page, emojis) and broken links.
// Usage: arthur-cred run --use loveleeday-portal-qa -- node scripts/portal-role-walk.mjs <role-label> [outdir]
// First run enrolls a throwaway authenticator and keeps the session in $STATE (default scratch dir); later runs reuse it.
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { priceViolations } from "./portal-copy-rules.mjs";

const BASE = process.env.PORTAL_BASE || "http://localhost:3417";
const ROLE = process.argv[2] || "role";
const OUT = process.argv[3] || "docs/connector-platform/audit-shots";
const STATE = process.env.STATE || "/private/tmp/claude-501/qa-state.json";
fs.mkdirSync(OUT, { recursive: true });

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

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome", headless: true }));
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(fs.existsSync(STATE) ? { storageState: STATE } : {}) });
const page = await ctx.newPage();
const fail = async (e) => {
  const shot = path.join(OUT, "FAILED.png");
  await page.screenshot({ path: shot }).catch(() => {});
  console.error(`FAILED at ${page.url()}: ${e?.message?.split("\n")[0]} (screenshot ${shot})`);
  process.exit(1);
};
const findings = [];
let current = "";
const add = (kind, detail, width) => findings.push({ role: ROLE, route: current, width: width ?? page.viewportSize().width, kind, detail: String(detail).slice(0, 260) });
page.on("console", (m) => m.type() === "error" && add("console", m.text()));
page.on("pageerror", (e) => add("pageerror", e.message));
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("/_next/static") && !r.url().includes("favicon")) add("http", `${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`); });

await page.goto(BASE + "/client");
if (page.url().includes("/client/login")) {
  await page.waitForTimeout(2500); // let the client form hydrate before typing
  await page.fill('input[type="email"]', process.env.LOVELEEDAY_PORTAL_QA_EMAIL);
  await page.fill('input[type="password"]', process.env.LOVELEEDAY_PORTAL_QA_PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
}
if (page.url().includes("/mfa/enroll")) {
  await page.waitForSelector("#enroll-code", { timeout: 20000 });
  const secret = (await page.locator(".select-all").innerText()).trim();
  fs.writeFileSync(STATE + ".secret", secret);
  // Keep it in the vault too: a scratch-only copy got lost once and locked the QA login out of every later run.
  const vf = path.join(process.env.HOME, ".arthur/vault/loveleeday-portal-qa.env");
  if (fs.existsSync(vf)) fs.writeFileSync(vf, fs.readFileSync(vf, "utf8").replace(/^LOVELEEDAY_PORTAL_QA_TOTP_SECRET=.*\n?/m, "") + `LOVELEEDAY_PORTAL_QA_TOTP_SECRET=${secret}\n`, { mode: 0o600 });
  await page.fill("#enroll-code", totp(secret));
  await page.click('button[type="submit"]');
  const saved = page.getByText("I've saved these somewhere safe");
  if (await saved.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.waitForURL((u) => !/\/(login|mfa)/.test(u.pathname), { timeout: 20000 }).catch(fail);
} else if (page.url().includes("/mfa/challenge")) {
  // The form clears anything typed before hydration and keeps Verify disabled until the challenge id exists.
  await page.waitForTimeout(2500);
  const box = page.locator('input[inputmode="numeric"]');
  await box.pressSequentially(totp(process.env.LOVELEEDAY_PORTAL_QA_TOTP_SECRET || fs.readFileSync(STATE + ".secret", "utf8")), { delay: 40 });
  await page.locator('button[type="submit"]:not([disabled])').first().click({ timeout: 10000 });
  await page.waitForURL((u) => !/\/(login|mfa)/.test(u.pathname), { timeout: 20000 }).catch(fail);
}
await ctx.storageState({ path: STATE });

const routes = ["/client", "/client/workstreams", "/client/workstreams/progress", "/client/workstreams/coverage", "/client/connections", "/client/documents", "/client/team", "/client/contracts", "/client/billing", "/client/access", "/client/account", "/client/select-company", "/client/staff", "/client/no-access", "/client/privacy", "/client/terms", "/client/workstreams/does-not-exist", "/client/deliverables/does-not-exist", "/client/connections/does-not-exist", "/client/workstreams/task/00000000-0000-0000-0000-000000000000"];
const seen = new Set(), results = [];
const queue = [...routes];
const deepSeen = { ws: 0, task: 0, del: 0, conn: 0 };
while (queue.length) {
  const route = queue.shift();
  if (seen.has(route)) continue;
  seen.add(route);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    current = route;
    const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => { add("nav", e.message); return null; });
    if (!res) continue;
    const landed = page.url().replace(BASE, "");
    if (landed.split("?")[0] !== route) add("redirect", `landed on ${landed}`);
    if (res.status() >= 400) add("status", String(res.status()));
    const info = await page.evaluate(() => {
      const doc = document.documentElement, over = [];
      if (doc.scrollWidth > window.innerWidth + 1) for (const el of document.querySelectorAll("main *")) { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 1 && r.width > 0) { over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} r=${Math.round(r.right)}`); if (over.length > 3) break; } }
      const t = document.body.innerText;
      return { sw: doc.scrollWidth, iw: window.innerWidth, over, arthur: /\barthur\b/i.test(t), text: t, emoji: (t.match(/\p{Extended_Pictographic}/gu) || []).slice(0, 3), odd: (t.match(/.{0,30}\b(undefined|NaN|null|\[object Object\]|Invalid Date)\b.{0,30}/g) || []).slice(0, 3), h: (document.querySelector("h1")?.innerText || "").slice(0, 70), links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")), brokenImgs: [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).length };
    });
    if (info.over.length) add("overflow", `scrollWidth ${info.sw}>${info.iw}: ${info.over.join(" | ")}`);
    if (info.arthur) add("copy", "word Arthur visible");
    const prices = priceViolations(route, info.text);
    if (prices.length) add("copy", "price-like text: " + prices.join(", "));
    if (info.emoji.length) add("copy", "emoji: " + info.emoji.join(""));
    for (const o of info.odd) add("text", o);
    if (info.brokenImgs) add("image", `${info.brokenImgs} broken`);
    const shot = `${ROLE}_${route.replace(/[^a-z0-9]+/gi, "_") || "root"}_${width}.png`;
    await page.screenshot({ path: path.join(OUT, shot), fullPage: true });
    results.push({ route, width, landed, h: info.h, shot });
    if (width === 1440) for (const h of info.links) {
      if (!h?.startsWith("/client") || h.includes("#")) continue;
      const p = h.split("?")[0];
      if (seen.has(p) || queue.includes(p)) continue;
      const k = p.includes("/task/") ? "task" : p.startsWith("/client/deliverables/") ? "del" : p.startsWith("/client/connections/") ? "conn" : /^\/client\/workstreams\/[^/]+$/.test(p) ? "ws" : null;
      if (k) { if (deepSeen[k]++ >= 2) continue; }
      else if (!routes.includes(p)) add("link", `unlisted internal link ${p}`);
      queue.push(p);
    }
  }
}
fs.writeFileSync(path.join("/private/tmp/claude-501", `walk-${ROLE}.json`), JSON.stringify({ results, findings }, null, 1));
const g = {};
for (const f of findings) (g[`${f.kind}|${f.detail}`] ||= { ...f, at: [] }).at.push(`${f.route}@${f.width}`);
for (const f of Object.values(g)) console.log(`[${f.kind}] ${f.detail} :: ${[...new Set(f.at)].slice(0, 5).join(", ")}`);
console.log(`ROLE ${ROLE}: ${results.length} page views`);
await browser.close();
