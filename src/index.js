import { initMap } from './map/mapbox.js';
import { sfLayer } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { CameraToggle } from './ui/CameraToggle.js';
import { AssetManager } from './assets/AssetManager.js';

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

  const playerCar    = new PlayerCar(scene);
  const assetManager = new AssetManager(scene);
  const cameras      = new CameraToggle(map);

  // Single source of truth: everything updates once per rendered frame,
  // INSIDE the custom layer's render(). This keeps the car position and the
  // map's projection matrix perfectly in sync → no jitter.
  sfLayer.onFrame = (delta) => {
    playerCar.update(delta, keys);
    assetManager.update(delta);
    cameras.update(playerCar);
  };

  // Kick off continuous rendering (the layer re-triggers itself thereafter).
  map.triggerRepaint();
}

main().catch(console.error);
