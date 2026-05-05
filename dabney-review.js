const { chromium } = require('./node_modules/playwright');

const pages = [
  { hash: '', name: 'home' },
  { hash: '#calendar', name: 'calendar' },
  { hash: '#menu', name: 'menu' },
  { hash: '#events', name: 'events' },
  { hash: '#spaces', name: 'spaces' },
  { hash: '#about', name: 'about' },
  { hash: '#press', name: 'press' },
  { hash: '#contact', name: 'contact' },
  { hash: '#reserve', name: 'reserve' },
  { hash: '#society', name: 'society' },
  { hash: '#gift', name: 'gift' },
  { hash: '#roster', name: 'roster' },
];

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 }
  });
  
  // Block all external fonts and tracking
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ 
    contentType: 'text/css', 
    body: '' 
  }));
  await context.route('https://fonts.gstatic.com/**', route => route.fulfill({
    contentType: 'font/woff2',
    body: Buffer.alloc(0)
  }));
  await context.route('https://connect.facebook.net/**', route => route.abort());
  await context.route('https://www.facebook.com/**', route => route.abort());
  
  const page = await context.newPage();
  const baseUrl = 'http://localhost:8765';
  
  await page.goto(baseUrl, { waitUntil: 'commit', timeout: 10000 });
  console.log('goto fired');
  await page.waitForTimeout(1500);
  
  const shot = async (name, full) => {
    await page.screenshot({ 
      path: `/tmp/dabney-design-review/desktop/${name}${full ? '-full' : ''}.png`, 
      fullPage: full,
      timeout: 15000
    });
  };
  
  await shot('home', false);
  await shot('home', true);
  console.log('home done');

  for (const p of pages.slice(1)) {
    try {
      await page.evaluate((hash) => { window.location.hash = hash; }, p.hash);
      await page.waitForTimeout(500);
      await shot(p.name, false);
      await shot(p.name, true);
      console.log(`${p.name} done`);
    } catch (e) {
      console.error(`${p.name} failed: ${e.message}`);
    }
  }

  await browser.close();
})();
