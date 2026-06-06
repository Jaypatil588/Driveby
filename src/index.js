import { initMap } from './map/mapbox.js';
import { sfLayer } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { CameraToggle } from './ui/CameraToggle.js';

async function main() {
  const map = await initMap();

  // Three.js layer, inserted under the first label layer
  const layers = map.getStyle().layers;
  const firstSymbol = layers.find(l => l.type === 'symbol');
  map.addLayer(sfLayer, firstSymbol ? firstSymbol.id : undefined);
  const scene = sfLayer.getScene();

  // Keyboard
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  const playerCar = new PlayerCar(scene);
  playerCar.attachMap(map);
  const cameras = new CameraToggle(map);

  // --- live debug overlay ---
  const dbg = document.createElement('div');
  dbg.style.cssText =
    'position:absolute;top:8px;left:8px;z-index:99;background:rgba(0,0,0,.8);' +
    'color:#0f0;font:11px monospace;padding:8px;white-space:pre;line-height:1.5;' +
    'pointer-events:none;border-radius:4px;max-width:46ch;';
  document.body.appendChild(dbg);

  let frames = 0, fpsAccum = 0, fps = 0;
  let lastCarLng = playerCar.lng, lastCarLat = playerCar.lat;

  sfLayer.onFrame = (delta) => {
    // step 1: physics
    playerCar.update(delta, keys);
    const sBefore = playerCar.getState();
    const carMoveM = Math.hypot(
      (sBefore.lng - lastCarLng) * 111320 * Math.cos(sBefore.lat * Math.PI / 180),
      (sBefore.lat - lastCarLat) * 111320
    );
    lastCarLng = sBefore.lng; lastCarLat = sBefore.lat;

    // step 2: camera follows
    cameras.update(playerCar);
    const center = map.getCenter();

    // step 3: pin
    playerCar.pinToCentre();

    // how far is the map centre from the car? (should be ~0 if locked)
    const centerErrM = Math.hypot(
      (center.lng - sBefore.lng) * 111320 * Math.cos(sBefore.lat * Math.PI / 180),
      (center.lat - sBefore.lat) * 111320
    );

    // fps
    frames++; fpsAccum += delta;
    if (fpsAccum >= 0.5) { fps = Math.round(frames / fpsAccum); frames = 0; fpsAccum = 0; }

    const heldKeys = Object.keys(keys).filter(k => keys[k]).join(',') || '(none)';
    dbg.textContent =
      `fps:        ${fps}\n` +
      `delta(ms):  ${(delta * 1000).toFixed(1)}\n` +
      `keys:       ${heldKeys}\n` +
      `speed(m/s): ${sBefore.speed.toFixed(2)}\n` +
      `heading:    ${(sBefore.heading * 180 / Math.PI).toFixed(1)}°\n` +
      `car move/f: ${carMoveM.toFixed(3)} m\n` +
      `lng,lat:    ${sBefore.lng.toFixed(6)}, ${sBefore.lat.toFixed(6)}\n` +
      `centerErr:  ${centerErrM.toFixed(4)} m  ${centerErrM > 0.5 ? '<< DESYNC' : 'ok'}\n` +
      `bearing:    ${map.getBearing().toFixed(1)}°  pitch:${map.getPitch().toFixed(0)}  zoom:${map.getZoom().toFixed(2)}`;
  };

  // expose for console poking
  window.car = playerCar;
  window.map = map;

  map.triggerRepaint();
}

main().catch(console.error);
