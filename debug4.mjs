import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 20000 });
await page.waitForTimeout(1500);
// force car materials depthTest off + huge scale + bright
await page.evaluate(() => {
  const car = window.game.player.mesh;
  car.scale.set(20,20,20);
  car.traverse(o => { if (o.material) { o.material.depthTest = false; o.material.color.set(0xffff00); o.material.emissive && o.material.emissive.set(0xffff00); o.renderOrder = 999; } });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'debug_nodepth.png' });
console.log('done');
await browser.close();
