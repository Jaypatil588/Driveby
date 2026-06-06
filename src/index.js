import { initMap, getMap } from './map/mapbox.js';
import { sfLayer } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { AgentManager } from './agents/AgentManager.js';
import { AgentSocket } from './network/AgentSocket.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { buildColliders } from './physics/Colliders.js';
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

  // --- Physics ---
  const physics = new PhysicsWorld();
  await physics.init();
  buildColliders(map, physics);

  // --- Keyboard state ---
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.key] = true; });
  window.addEventListener('keyup',   (e) => { keys[e.key] = false; });

  // --- Player car ---
  const playerCar = new PlayerCar(scene, physics);

  // --- AI agents ---
  const agentManager = new AgentManager(physics, scene);

  // --- WebSocket relay (falls back to rule-based if server not running) ---
  new AgentSocket(agentManager);

  // --- Camera toggle ---
  const cameras = new CameraToggle(map);

  // --- Clock ---
  const clock = new THREE.Clock();

  // --- Animation loop ---
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    physics.step(delta);
    playerCar.update(delta, keys);
    agentManager.update(delta);
    cameras.update(playerCar);
  }

  animate();
}

main().catch(console.error);
