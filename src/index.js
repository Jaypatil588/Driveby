import { initMap } from './map/mapbox.js';
import { sfLayer } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { CameraToggle } from './ui/CameraToggle.js';
import { Environment } from './map/Environment.js';

async function main() {
  const map = await initMap();

  const layers = map.getStyle().layers;
  const firstSymbol = layers.find(l => l.type === 'symbol');
  map.addLayer(sfLayer, firstSymbol ? firstSymbol.id : undefined);
  const scene = sfLayer.getScene();

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  const playerCar = new PlayerCar(scene);
  playerCar.attachMap(map);
  const cameras = new CameraToggle(map);

  // Environment (street lights, footpaths, trees, pedestrians). Built once the
  // road tiles are loaded so queryRenderedFeatures returns real geometry.
  const env = new Environment(map, scene);
  map.once('idle', () => env.build());

  // --- debug overlay ---
  const dbg = document.createElement('div');
  dbg.style.cssText =
    'position:absolute;top:8px;left:8px;z-index:99;background:rgba(0,0,0,.8);' +
    'color:#0f0;font:11px monospace;padding:8px;white-space:pre;line-height:1.5;' +
    'pointer-events:none;border-radius:4px;max-width:46ch;';
  document.body.appendChild(dbg);

  let fps = 0, frames = 0, fpsT = 0;
  let last = performance.now();

  // The car mesh is pinned to the map centre INSIDE render (consistent matrix).
  sfLayer.onFrame = () => playerCar.pinToCentre();

  // Driving + camera run in their OWN rAF loop, NOT inside the render callback —
  // MapLibre ignores camera moves (jumpTo) issued during rendering. This is why
  // pitch/zoom were stuck at their initial values.
  function loop(now) {
    requestAnimationFrame(loop);
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    playerCar.update(delta, keys);  // advance physics
    cameras.update(playerCar);      // move map camera (works here)
    env.update(delta);              // animate pedestrians

    const s = playerCar.getState();
    const c = map.getCenter();
    frames++; fpsT += delta;
    if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    const held = Object.keys(keys).filter(k => keys[k]).join(',') || '(none)';
    dbg.textContent =
      `fps:        ${fps}\n` +
      `delta(ms):  ${(delta * 1000).toFixed(1)}\n` +
      `keys:       ${held}\n` +
      `speed(m/s): ${s.speed.toFixed(2)}\n` +
      `heading:    ${(s.heading * 180 / Math.PI).toFixed(1)}°\n` +
      `lng,lat:    ${s.lng.toFixed(6)}, ${s.lat.toFixed(6)}\n` +
      `bearing:    ${map.getBearing().toFixed(1)}°  pitch:${map.getPitch().toFixed(0)}  zoom:${map.getZoom().toFixed(2)}`;

    map.triggerRepaint(); // keep the three.js layer drawing
  }
  requestAnimationFrame(loop);

  window.car = playerCar;
  window.map = map;
}

main().catch(console.error);
