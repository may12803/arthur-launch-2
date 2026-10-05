#!/usr/bin/env node
// Screenshots every connector-platform screen from the development-only fixture route at 1440 and 390 wide, and reports
// any page whose body is wider than the viewport (horizontal overflow). Needs `npm run dev` (NODE_ENV=development).
// Usage: PORT=3417 node scripts/cp-ui-shots.mjs [page ...]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = `http://localhost:${process.env.PORT || 3417}`;
const OUT = path.resolve("docs/connector-platform/shots");
fs.mkdirSync(OUT, { recursive: true });
const ALL = ["catalog", "detail-failing", "detail-live", "detail-oauth", "detail-partner", "detail-key", "detail-keypair", "upload", "health", "approvals", "audit", "organization", "entities", "team", "security", "developer", "status", "billing", "trust"];
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});
for (const width of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  for (const p of pages) {
    errors.length = 0;
    const res = await page.goto(`${BASE}/client/dev-preview/${p === "trust" ? "trust" : p}`, { waitUntil: "networkidle" }).catch((e) => ({ status: () => `ERR ${e.message}` }));
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    await page.screenshot({ path: path.join(OUT, `${p}-${width}.png`), fullPage: true });
    console.log(`${p}@${width} status=${res.status?.()} overflow=${over.sw > over.iw ? `YES ${over.sw}>${over.iw}` : "no"} errors=${errors.length ? errors.join(" | ") : "none"}`);
  }
  await ctx.close();
}
await browser.close();
