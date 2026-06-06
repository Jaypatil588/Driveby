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

// inject a giant bright box at the car's exact world position
await page.evaluate(() => {
  const THREE = window.game.player.mesh.children[0].geometry.constructor; // hack not used
});

await page.evaluate(() => {
  const car = window.game.player.mesh;
  // build a huge box using the same Mesh/Geometry classes via the car's child
  const proto = window.game.player.mesh.children[0];
  const big = proto.clone();
  big.scale.set(50, 50, 50);
  big.material = proto.material.clone();
  big.material.color.set(0xffff00);
  car.add(big); // child of car group, at car location
});

await page.waitForTimeout(1000);
await page.screenshot({ path: 'debug_bigbox.png' });
console.log('screenshot taken');

await browser.close();
