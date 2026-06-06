import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.game && window.game.player, null, { timeout: 20000 });
await page.waitForTimeout(2000);
const r = await page.evaluate(() => {
  const g = window.game;
  // use mapbox's own project() to get the car's screen pixel
  const { lng, lat } = g.player.getPosition();
  const px = g.map.project([lng, lat]);
  const canvas = g.map.getCanvas();
  // also compute car world pos projected through our camera matrix
  const car = g.player.mesh;
  const THREEVec = car.position.clone();
  const cam = g.sfLayer.camera;
  const clip = THREEVec.clone().applyMatrix4(cam.projectionMatrix);
  return {
    carLngLat: { lng, lat },
    mapboxProjectPx: px,
    canvasSize: { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight },
    carWorld: { x: car.position.x, y: car.position.y, z: car.position.z },
    clipSpace: { x: clip.x, y: clip.y, z: clip.z },
    camProjFirst8: Array.from(cam.projectionMatrix.elements).slice(0,8)
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
