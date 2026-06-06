import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 20000 });
await page.waitForTimeout(2000);
// force the map to redraw and wait for 'idle'
await page.evaluate(() => new Promise(res => {
  window.game.map.once('idle', res);
  window.game.map.triggerRepaint();
  setTimeout(res, 3000);
}));
await page.waitForTimeout(500);
await page.screenshot({ path: 'debug_idle.png' });
// also read center pixel color from the mapbox canvas via toDataURL is tainted; instead check tiles loaded
const loaded = await page.evaluate(() => window.game.map.areTilesLoaded());
console.log('tilesLoaded', loaded, 'center', JSON.stringify(window.game?.map?.getCenter?.()));
await browser.close();
