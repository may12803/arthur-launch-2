const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'https://arthur-online.fly.dev';
const OUT_DIR = '/tmp/arthur-online-audit-v3';

const pages = [
  '/dashboard',
  '/inbox',
  '/superlearner',
  '/iphone',
  '/settings/email',
];

const mobileViewport = { width: 390, height: 844 };
const desktopViewport = { width: 1280, height: 800 };

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const route of pages) {
    const slug = route.replace(/\//g, '-').replace(/^-/, '');
    
    for (const [vp, suffix] of [[mobileViewport, 'mobile-v2'], [desktopViewport, 'desktop-v2']]) {
      const page = await browser.newPage();
      await page.setViewportSize(vp);
      try {
        await page.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(2000);
        const fp = path.join(OUT_DIR, `${slug}-${suffix}.png`);
        await page.screenshot({ path: fp, fullPage: true });
        try { execSync(`sips -Z 1400 "${fp}" --out "${fp.replace('.png','-small.png')}" 2>/dev/null`); } catch {}
        console.log(`SAVED: ${slug}-${suffix}.png`);
      } catch(e) { console.error(e.message); }
      await page.close();
    }
  }
  await browser.close();
})();
