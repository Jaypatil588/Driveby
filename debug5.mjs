import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 20000 });
// instrument update
await page.evaluate(() => {
  window.__upd = 0;
  const g = window.game;
  const orig = g.update.bind(g);
  g.update = () => { window.__upd++; return orig(); };
});
await page.waitForTimeout(2500);
const r = await page.evaluate(() => ({
  updateCalls: window.__upd,
  center: window.game.map.getCenter(),
  bearing: window.game.map.getBearing(),
  pitch: window.game.map.getPitch(),
  hasRenderListener: true
}));
console.log(JSON.stringify(r, null, 2));
await browser.close();
