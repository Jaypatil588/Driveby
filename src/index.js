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

  // Per frame, in order:
  //   1) advance car physics (updates lng/lat/heading)
  //   2) move the MAP camera onto the car (jumpTo)
  //   3) pin the car mesh to the map centre
  // Steps 2 & 3 share the same centre, so car + camera are locked together.
  sfLayer.onFrame = (delta) => {
    playerCar.update(delta, keys);   // step 1 (and a provisional sync)
    cameras.update(playerCar);       // step 2 — moves map to car's lng/lat
    playerCar.pinToCentre();         // step 3 — re-pin to the now-updated centre
  };

  // Kick off continuous rendering (the layer re-triggers itself thereafter).
  map.triggerRepaint();
}

main().catch(console.error);
