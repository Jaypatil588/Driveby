import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.sfLayer, null, { timeout: 20000 });
// instrument render
await page.evaluate(() => {
  window.__renderCount = 0;
  const layer = window.game.sfLayer;
  const orig = layer.render.bind(layer);
  layer.render = (gl, m) => { window.__renderCount++; window.__lastMatrix = Array.from(m).slice(0,4); return orig(gl, m); };
});
await page.waitForTimeout(2500);
const r = await page.evaluate(() => ({ count: window.__renderCount, lastMatrix: window.__lastMatrix, center: window.game.map.getCenter(), camProj: window.game.sfLayer.camera.projectionMatrix.elements.slice(0,4) }));
console.log(JSON.stringify(r, null, 2));
await browser.close();
