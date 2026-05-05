#!/usr/bin/env node
/**
 * Full-app smoke test for arthur-online.fly.dev.
 *
 * Walks every authed route as a logged-in user (HTTP Basic Auth),
 * screenshots each page, captures console errors, network failures,
 * and missing-element checks. Outputs a single report.
 *
 * Usage:
 *   ARTHUR_ONLINE_USER=daniel ARTHUR_ONLINE_PASSWORD=<secret> \
 *     node scripts/smoke-test.mjs
 *
 *   # Or against local dev:
 *   ARTHUR_BASE_URL=http://localhost:3000 ... node scripts/smoke-test.mjs
 *
 * Output:
 *   /tmp/arthur-smoke/{route-name}.png
 *   /tmp/arthur-smoke/REPORT.md
 *
 * Install once if needed:
 *   npx -y playwright@latest install chromium
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE_URL  = process.env.ARTHUR_BASE_URL  || "https://arthur-online.fly.dev";
const USER      = process.env.ARTHUR_ONLINE_USER     || "daniel";
const PASS      = process.env.ARTHUR_ONLINE_PASSWORD || "";
const OUT_DIR   = process.env.SMOKE_OUT_DIR   || "/tmp/arthur-smoke";

if (!PASS) {
  console.error("✗ ARTHUR_ONLINE_PASSWORD not set. Set it in env and rerun.");
  process.exit(2);
}

const ROUTES = [
  "/",
  "/dashboard",
  "/brain",
  "/skills",
  "/benchmarks",
  "/principles",
  "/superlearner",
  "/goals",
  "/inbox",
  "/messenger",
  "/communications",
  "/calendar",
  "/settings",
  "/settings/email",
  "/subscriptions",
  "/legal",
  "/iphone",
  "/graph",
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const basicAuth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

const report = {
  base: BASE_URL,
  startedAt: new Date().toISOString(),
  routes: [],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { Authorization: basicAuth },
});
const page = await ctx.newPage();

for (const route of ROUTES) {
  const url = BASE_URL + route;
  const slug = route === "/" ? "home" : route.replaceAll("/", "-").replace(/^-/, "");
  const result = {
    route,
    url,
    httpStatus: null,
    consoleErrors: [],
    networkFailures: [],
    domChecks: {},
    screenshot: null,
    elapsedMs: null,
  };

  const consoleErrors = [];
  const networkFailures = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  };
  const onResponse = (resp) => {
    if (resp.status() >= 400 && !resp.url().includes("/_next/static/")) {
      networkFailures.push(`${resp.status()} ${resp.url().slice(0, 200)}`);
    }
  };
  page.on("console", onConsole);
  page.on("response", onResponse);

  const t0 = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    result.httpStatus = resp?.status() ?? null;

    // DOM signals — count common things that should be present
    result.domChecks = await page.evaluate(() => ({
      title: document.title,
      h1Count: document.querySelectorAll("h1").length,
      buttonCount: document.querySelectorAll("button").length,
      linkCount: document.querySelectorAll("a").length,
      hasMain: !!document.querySelector("main, .wrap, [role='main']"),
      bodyTextLen: document.body.innerText.length,
      hasError: /error|not found|forbidden|unauthorized|cannot read/i.test(document.body.innerText.slice(0, 1500)),
    }));

    const screenshotPath = path.join(OUT_DIR, `${slug}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshot = screenshotPath;
  } catch (e) {
    result.error = String(e.message || e).slice(0, 300);
  } finally {
    result.elapsedMs = Date.now() - t0;
    result.consoleErrors = consoleErrors;
    result.networkFailures = networkFailures;
    page.off("console", onConsole);
    page.off("response", onResponse);
  }

  report.routes.push(result);
  const tag = result.error ? "ERR" :
    (result.httpStatus !== 200 ? `${result.httpStatus}` :
     (result.consoleErrors.length || result.networkFailures.length || result.domChecks.hasError) ? "WARN" : "OK ");
  process.stdout.write(`[${tag}] ${route.padEnd(20)} ${result.elapsedMs}ms  ` +
    `body=${result.domChecks.bodyTextLen ?? "?"}  ` +
    `consoleErr=${result.consoleErrors.length}  netFail=${result.networkFailures.length}\n`);
}

await browser.close();

// Write JSON + markdown report
fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));

const md = [];
md.push(`# arthur-online smoke test — ${report.startedAt}`);
md.push(`base: ${BASE_URL}`);
md.push("");
md.push("| Route | HTTP | Body chars | Console errors | Network 4xx/5xx | Notes |");
md.push("|---|---|---|---|---|---|");
for (const r of report.routes) {
  const notes = [];
  if (r.error) notes.push("FETCH ERR: " + r.error);
  if (r.domChecks?.hasError) notes.push("error text in body");
  if ((r.domChecks?.bodyTextLen ?? 0) < 100) notes.push("nearly empty body");
  if (r.domChecks?.h1Count === 0) notes.push("no h1");
  md.push(`| \`${r.route}\` | ${r.httpStatus ?? "—"} | ${r.domChecks?.bodyTextLen ?? "—"} | ${r.consoleErrors.length} | ${r.networkFailures.length} | ${notes.join("; ")} |`);
}
md.push("");
md.push("## Console errors");
for (const r of report.routes) {
  if (r.consoleErrors.length) {
    md.push(`### \`${r.route}\``);
    r.consoleErrors.forEach(e => md.push(`- \`${e}\``));
  }
}
md.push("");
md.push("## Network failures");
for (const r of report.routes) {
  if (r.networkFailures.length) {
    md.push(`### \`${r.route}\``);
    r.networkFailures.forEach(e => md.push(`- ${e}`));
  }
}
md.push("");
md.push("## Screenshots");
md.push(`All saved to \`${OUT_DIR}/\`. Open with: \`open ${OUT_DIR}\``);

fs.writeFileSync(path.join(OUT_DIR, "REPORT.md"), md.join("\n"));

console.log(`\n✓ Report: ${path.join(OUT_DIR, "REPORT.md")}`);
console.log(`✓ Screenshots: ${OUT_DIR}/`);
console.log(`✓ JSON: ${path.join(OUT_DIR, "report.json")}`);
