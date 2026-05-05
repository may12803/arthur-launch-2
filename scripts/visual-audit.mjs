import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://arthur-online.fly.dev';
const AUTH_HEADER = 'Bearer 38c7f157636ead7a948d1a992292d7b8';
const DESKTOP_DIR = '/tmp/arthur-audit/desktop';
const MOBILE_DIR = '/tmp/arthur-audit/mobile';

const ROUTES = [
  { path: '/', slug: 'home' },
  { path: '/dashboard', slug: 'dashboard' },
  { path: '/brain', slug: 'brain' },
  { path: '/skills', slug: 'skills' },
  { path: '/benchmarks', slug: 'benchmarks' },
  { path: '/principles', slug: 'principles' },
  { path: '/superlearner', slug: 'superlearner' },
  { path: '/goals', slug: 'goals' },
  { path: '/inbox', slug: 'inbox' },
  { path: '/messenger', slug: 'messenger' },
  { path: '/communications', slug: 'communications' },
  { path: '/calendar', slug: 'calendar' },
  { path: '/settings', slug: 'settings' },
  { path: '/settings/email', slug: 'settings-email' },
  { path: '/subscriptions', slug: 'subscriptions' },
  { path: '/legal', slug: 'legal' },
  { path: '/iphone', slug: 'iphone' },
  { path: '/graph', slug: 'graph' },
  { path: '/lock', slug: 'lock' },
];

mkdirSync(DESKTOP_DIR, { recursive: true });
mkdirSync(MOBILE_DIR, { recursive: true });

async function auditRoute(page, route, viewport, outputDir) {
  await page.setViewportSize(viewport);

  const consoleErrors = [];
  const networkFailures = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('requestfailed', req => {
    networkFailures.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  let loadStatus = 'ok';
  try {
    const resp = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    loadStatus = resp ? resp.status() : 'unknown';
  } catch (e) {
    loadStatus = `error: ${e.message}`;
  }

  // Wait a bit for any animations/lazy loads
  await page.waitForTimeout(1500);

  // Capture screenshot
  const screenshotPath = join(outputDir, `${route.slug}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // DOM evidence
  const domData = await page.evaluate(() => {
    const h1s = document.querySelectorAll('h1');
    const buttons = document.querySelectorAll('button, [role="button"], a[href]');
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const bodyOverflow = window.getComputedStyle(document.body).overflow;
    const htmlOverflow = window.getComputedStyle(document.documentElement).overflow;
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    // Nav island check
    const navIsland = document.querySelector('nav, [class*="nav"], [class*="island"]');
    const navComputedStyle = navIsland ? window.getComputedStyle(navIsland) : null;

    // Check for glass panels
    const glassPanels = document.querySelectorAll('[class*="glass"], [class*="panel"], [class*="card"]');

    // Get all text nodes that might be placeholder/dev text
    const allText = document.body.innerText.substring(0, 2000);

    // Check h1 details
    const h1Details = Array.from(h1s).map(el => ({
      text: el.textContent.trim().substring(0, 60),
      fontSize: window.getComputedStyle(el).fontSize,
      marginTop: window.getComputedStyle(el).marginTop,
    }));

    // Viewport overflow
    const hasHorizontalOverflow = scrollWidth > clientWidth;
    const hasVerticalOverflow = scrollHeight > clientHeight;

    return {
      title: document.title,
      h1Count: h1s.length,
      h1Details,
      buttonCount: buttons.length,
      bodyBg,
      bodyOverflow,
      htmlOverflow,
      scrollWidth,
      clientWidth,
      scrollHeight,
      clientHeight,
      hasHorizontalOverflow,
      hasVerticalOverflow,
      glassPanelCount: glassPanels.length,
      navPosition: navComputedStyle ? navComputedStyle.position : null,
      navTop: navComputedStyle ? navComputedStyle.top : null,
      textSample: allText,
    };
  });

  return {
    route: route.path,
    slug: route.slug,
    loadStatus,
    consoleErrors,
    networkFailures: networkFailures.slice(0, 5),
    dom: domData,
    screenshotPath,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const route of ROUTES) {
    console.log(`Auditing ${route.path}...`);

    // Desktop
    const desktopContext = await browser.newContext({
      extraHTTPHeaders: { Authorization: AUTH_HEADER },
      viewport: { width: 1440, height: 900 },
    });
    const desktopPage = await desktopContext.newPage();
    const desktopResult = await auditRoute(desktopPage, route, { width: 1440, height: 900 }, DESKTOP_DIR);
    await desktopContext.close();

    // Mobile
    const mobileContext = await browser.newContext({
      extraHTTPHeaders: { Authorization: AUTH_HEADER },
      viewport: { width: 390, height: 844 },
    });
    const mobilePage = await mobileContext.newPage();
    const mobileResult = await auditRoute(mobilePage, route, { width: 390, height: 844 }, MOBILE_DIR);
    await mobileContext.close();

    results.push({ desktop: desktopResult, mobile: mobileResult });
    console.log(`  Desktop: ${desktopResult.loadStatus} | H1: ${desktopResult.dom.h1Count} | Buttons: ${desktopResult.dom.buttonCount} | Console errors: ${desktopResult.consoleErrors.length}`);
    console.log(`  Mobile overflow: H=${mobileResult.dom.hasHorizontalOverflow} V=${mobileResult.dom.hasVerticalOverflow}`);
  }

  await browser.close();

  writeFileSync('/tmp/arthur-audit/raw-data.json', JSON.stringify(results, null, 2));
  console.log('\nAudit complete. Raw data: /tmp/arthur-audit/raw-data.json');
  console.log('Screenshots: /tmp/arthur-audit/desktop/ and /tmp/arthur-audit/mobile/');
}

main().catch(console.error);
