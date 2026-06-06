import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 20000 });
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const g = window.game;
  const car = g.player.mesh;
  const sceneChildren = g.sfLayer.scene.children.map(c => c.type);
  return {
    carPos: { x: car.position.x, y: car.position.y, z: car.position.z },
    carWorldVisible: car.visible,
    carChildCount: car.children.length,
    sceneChildren,
    mapCenter: g.map.getCenter(),
    mapZoom: g.map.getZoom(),
    layerWorldMatrix: g.sfLayer.worldMatrix.elements.slice(0,16)
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
