import { chromium } from 'playwright';
// headed with real GPU
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist','--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 20000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'headed_before.png' });
await page.keyboard.down('w');
await page.waitForTimeout(1500);
await page.keyboard.up('w');
await page.waitForTimeout(800);
await page.screenshot({ path: 'headed_after.png' });
console.log('done');
await browser.close();
