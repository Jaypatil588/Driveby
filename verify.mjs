import { chromium } from 'playwright';

const URL = 'http://localhost:3000/index.html';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });

// wait for the map + car to initialise
await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 20000 })
  .catch(() => console.log('!! window.game.player never appeared'));

await page.waitForTimeout(3000);
const before = await page.evaluate(() => window.game?.player?.getPosition?.());
await page.screenshot({ path: 'verify_before.png' });

// drive forward for 2 seconds
await page.keyboard.down('w');
await page.waitForTimeout(2000);
await page.keyboard.up('w');
await page.waitForTimeout(500);

const after = await page.evaluate(() => window.game?.player?.getPosition?.());
await page.screenshot({ path: 'verify_after.png' });

// toggle camera
await page.keyboard.press('c');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'verify_followcam.png' });
const hud = await page.textContent('#hud').catch(() => null);

console.log('--- RESULT ---');
console.log('before pos:', JSON.stringify(before));
console.log('after  pos:', JSON.stringify(after));
console.log('moved:', before && after ? (Math.abs(after.lat - before.lat) + Math.abs(after.lng - before.lng)).toExponential(3) : 'n/a');
console.log('hud:', hud);
console.log('console errors:', errors.length);
errors.slice(0, 15).forEach(e => console.log('  -', e));

await browser.close();
