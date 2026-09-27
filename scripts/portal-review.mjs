#!/usr/bin/env node
// Live review crawl of the client portal: signs in as the dedicated QA account, enrolls a
// throwaway TOTP factor, then visits every reachable /client page at desktop and
// phone widths and records console errors, failed requests, overflow and odd text.
// Usage: arthur-cred run --use loveleeday-portal-qa -- node scripts/portal-review.mjs <outdir>
// Never crawl as Daniel's own login: the throwaway factors wiped his session on 2026-09-27.
// The throwaway factor id is printed as FACTOR= so the caller can delete it afterwards.
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PORTAL_BASE || "https://portal.loveleedaystudios.com";
const OUT = process.argv[2] || "portal-review-out";
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

const launchOpts = process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {};
const browser = await chromium.launch(launchOpts);
const findings = [];
const add = (page, width, kind, detail) => findings.push({ page, width, kind, detail: String(detail).slice(0, 300) });

// Unauthenticated: every gated route must bounce to login, public routes must render.
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  for (const r of ["/client", "/client/workstreams", "/client/documents", "/client/billing", "/client/access", "/client/connections", "/client/staff"]) {
    const res = await p.goto(BASE + r).catch((e) => ({ status: () => "ERR " + e.message }));
    if (!p.url().includes("/client/login")) add(r, "anon", "gate", `anonymous visit landed on ${p.url()} (status ${res?.status?.()})`);
  }
  for (const r of ["/client/login", "/client/invite/not-a-real-token", "/client/no-access"]) {
    const res = await p.goto(BASE + r);
    if (res && res.status() >= 500) add(r, "anon", "http", `status ${res.status()}`);
  }
  await ctx.close();
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let current = "";
page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to fetch RSC payload") && add(current, page.viewportSize().width, "console", m.text()));
page.on("pageerror", (e) => add(current, page.viewportSize().width, "pageerror", e.message));
page.on("response", (r) => {
  const u = r.url();
  if (r.status() >= 400 && !u.includes("/_next/static") && !u.includes("favicon")) add(current, page.viewportSize().width, "http", `${r.status()} ${r.request().method()} ${u.replace(BASE, "")}`);
});
page.on("requestfailed", (r) => {
  const err = r.failure()?.errorText || "";
  if (!err.includes("ERR_ABORTED")) add(current, page.viewportSize().width, "requestfailed", `${err} ${r.url().replace(BASE, "")}`);
});

current = "/client/login";
await page.goto(BASE + "/client/login");
await page.fill('input[type="email"]', process.env.LOVELEEDAY_PORTAL_STAFF_EMAIL);
await page.fill('input[type="password"]', process.env.LOVELEEDAY_PORTAL_STAFF_PASSWORD);
await page.keyboard.press("Enter");
await page.waitForURL(/mfa\/(enroll|challenge)|\/client$/, { timeout: 20000 });
if (page.url().includes("/mfa/enroll")) {
  current = "/client/mfa/enroll";
  await page.waitForSelector("#enroll-code", { timeout: 20000 });
  const secret = (await page.locator(".select-all").innerText()).trim();
  await page.fill("#enroll-code", totp(secret));
  await page.click('button[type="submit"]');
  // Setup now ends on a backup-codes screen that needs an explicit "saved" before it continues.
  const saved = page.getByText("I've saved these somewhere safe");
  if (await saved.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.waitForURL(/\/client($|\?)/, { timeout: 20000 });
  console.log("ENROLLED");
} else if (page.url().includes("/mfa/challenge")) {
  throw new Error("staff account already has a verified factor; delete it first");
}

const seen = new Set();
const queue = ["/client", "/client/workstreams", "/client/workstreams/progress", "/client/workstreams/coverage", "/client/documents", "/client/contracts", "/client/billing", "/client/team", "/client/account", "/client/access", "/client/connections", "/client/staff"];
const results = [];
const MAX = 200;

while (queue.length && seen.size < MAX) {
  const route = queue.shift();
  const norm = route.split("#")[0];
  if (seen.has(norm)) continue;
  seen.add(norm);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    current = norm;
    const t0 = Date.now();
    const res = await page.goto(BASE + norm, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => { add(norm, width, "nav", e.message); return null; });
    const ms = Date.now() - t0;
    if (!res) continue;
    const landed = page.url().replace(BASE, "");
    if (res.status() >= 400) add(norm, width, "http", `page status ${res.status()}`);
    if (landed.split("?")[0] !== norm.split("?")[0]) add(norm, width, "redirect", `landed on ${landed}`);
    if (ms > 6000) add(norm, width, "slow", `${ms}ms to network idle`);
    const info = await page.evaluate(() => {
      const doc = document.documentElement;
      const over = [];
      if (doc.scrollWidth > window.innerWidth + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.right > window.innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
            over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
            if (over.length > 4) break;
          }
        }
      }
      const text = document.body.innerText;
      const odd = (text.match(/.{0,40}\b(undefined|NaN|null|\[object Object\]|Invalid Date|TODO|lorem)\b.{0,40}/gi) || []).slice(0, 5);
      const errs = (text.match(/.{0,60}(something went wrong|failed to|error:|not found|application error).{0,60}/gi) || []).slice(0, 5);
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
      const emptyButtons = [...document.querySelectorAll("button, a")].filter((b) => !b.innerText.trim() && !b.getAttribute("aria-label") && !b.querySelector("img[alt],svg title")).length;
      const imgsNoAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
      const brokenImgs = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 80));
      return { scrollW: doc.scrollWidth, innerW: window.innerWidth, over, odd, errs, links, emptyButtons, imgsNoAlt, brokenImgs, title: document.title, h1: document.querySelector("h1,h2")?.innerText?.slice(0, 80) || "" };
    });
    if (info.over.length) add(norm, width, "overflow", `scrollWidth ${info.scrollW} > ${info.innerW}: ${info.over.join(" | ")}`);
    for (const o of info.odd) add(norm, width, "text", o.replace(/\s+/g, " "));
    for (const o of info.errs) add(norm, width, "error-text", o.replace(/\s+/g, " "));
    if (info.emptyButtons) add(norm, width, "a11y", `${info.emptyButtons} button/link(s) with no text or label`);
    if (info.imgsNoAlt) add(norm, width, "a11y", `${info.imgsNoAlt} img without alt`);
    for (const b of info.brokenImgs) add(norm, width, "image", `broken ${b}`);
    const shot = path.join(OUT, `${norm.replace(/[^a-z0-9]+/gi, "_")}_${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    results.push({ route: norm, width, ms, landed, title: info.title, heading: info.h1, shot });
    if (width === 1440) {
      for (const h of info.links) {
        if (!h || h.startsWith("http") || h.startsWith("mailto") || h.startsWith("tel") || h.startsWith("#")) continue;
        if (h.startsWith("/client") && !h.includes("logout") && !h.includes("signout") && !seen.has(h.split("#")[0])) queue.push(h);
        if (!h.startsWith("/client") && !h.startsWith("/api")) add(norm, width, "link", `link leaves portal: ${h}`);
      }
    }
  }
}

// Collapse duplicates (same kind+detail on many pages) for readability.
const grouped = {};
for (const f of findings) {
  const k = `${f.kind}::${f.detail}`;
  (grouped[k] ||= { kind: f.kind, detail: f.detail, pages: new Set() }).pages.add(`${f.page}@${f.width}`);
}
const out = Object.values(grouped).map((g) => ({ ...g, pages: [...g.pages] }));
fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify({ visited: results, findings: out }, null, 2));
console.log(`visited ${results.length} page-views across ${seen.size} routes; ${out.length} distinct findings`);
for (const g of out) console.log(`- [${g.kind}] ${g.detail}  (${g.pages.length}x: ${g.pages.slice(0, 4).join(", ")})`);
await browser.close();
