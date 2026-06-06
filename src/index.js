import { initMap } from './map/mapbox.js';
import { sfLayer } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { CameraToggle } from './ui/CameraToggle.js';
import * as THREE from 'three';

async function main() {
  // --- Map ---
  const map = await initMap();

  // --- Three.js layer: insert before the first symbol (label) layer ---
  const layers = map.getStyle().layers;
  const firstSymbol = layers.find(l => l.type === 'symbol');
  map.addLayer(sfLayer, firstSymbol ? firstSymbol.id : undefined);
  const scene = sfLayer.getScene();

  // --- Keyboard state ---
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    // stop arrow keys scrolling the page
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  // --- Player car ---
  const playerCar = new PlayerCar(scene);

  // --- Camera (starts in follow mode) ---
  const cameras = new CameraToggle(map);

  // --- Clock ---
  const clock = new THREE.Clock();

  // --- Animation loop ---
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    playerCar.update(delta, keys);
    cameras.update(playerCar);
  }

  animate();
}

main().catch(console.error);
