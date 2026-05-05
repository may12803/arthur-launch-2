const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE_URL = 'https://arthur-online.fly.dev';
const OUT_DIR = '/tmp/arthur-online-audit-v3';

const pages = [
  '/',
  '/dashboard',
  '/inbox',
  '/calendar',
  '/goals',
  '/legal',
  '/messenger',
  '/subscriptions',
  '/superlearner',
  '/iphone',
  '/settings/email',
  '/brain',
  '/graph',
  '/skills',
  '/benchmarks',
  '/principles',
];

const desktopViewport = { width: 1280, height: 800 };
const mobileViewport = { width: 390, height: 844 };

async function screenshot(page, route, suffix) {
  const slug = route === '/' ? 'home' : route.replace(/\//g, '-').replace(/^-/, '');
  const filename = `${slug}-${suffix}.png`;
  const filepath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  // resize for reading
  const small = filepath.replace('.png', '-small.png');
  try { execSync(`sips -Z 1400 "${filepath}" --out "${small}" 2>/dev/null`); } catch(e) {}
  console.log(`SAVED: ${filename}`);
  return filepath;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  for (const route of pages) {
    console.log(`\n=== Auditing ${route} ===`);
    
    // Desktop
    const dPage = await browser.newPage();
    await dPage.setViewportSize(desktopViewport);
    try {
      await dPage.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 20000 });
      await dPage.waitForTimeout(1500);
      await screenshot(dPage, route, 'desktop');
    } catch(e) {
      console.error(`Desktop error for ${route}:`, e.message);
    }
    await dPage.close();
    
    // Mobile
    const mPage = await browser.newPage();
    await mPage.setViewportSize(mobileViewport);
    try {
      await mPage.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 20000 });
      await mPage.waitForTimeout(1500);
      await screenshot(mPage, route, 'mobile');
    } catch(e) {
      console.error(`Mobile error for ${route}:`, e.message);
    }
    await mPage.close();
  }
  
  await browser.close();
  console.log('\nDone!');
})();
