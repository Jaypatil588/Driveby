import { initMap, getMap } from './map/mapbox.js';
import { sfLayer, worldToMap, mercatorScale } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { AgentManager } from './agents/AgentManager.js';
import { AgentSocket } from './network/AgentSocket.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { buildColliders } from './physics/Colliders.js';
import { CameraToggle } from './ui/CameraToggle.js';
import { SensorCamera } from './agents/SensorCamera.js';
import * as THREE from 'three';

async function main() {
  // --- Map ---
  const map = await initMap();

  // --- Three.js layer ---
  map.addLayer(sfLayer, 'waterway-label');
  const scene = sfLayer.getScene();

  // --- Physics ---
  const physics = new PhysicsWorld();
  await physics.init();
  buildColliders(map, physics);

  // --- Player car ---
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.key] = true; });
  window.addEventListener('keyup',   (e) => { keys[e.key] = false; });
  const playerCar = new PlayerCar(scene, physics);

  // --- AI agents ---
  const agentManager = new AgentManager(physics, scene);

  // --- WebSocket (graceful — falls back to rule-based if server not running) ---
  new AgentSocket(agentManager);

  // --- Camera ---
  const cameras = new CameraToggle(scene);
  window.addEventListener('resize', () => cameras.onResize());

  // --- Sensor cameras (player car + 10 nearest agents) ---
  const sensorCam = new SensorCamera(sfLayer.getRenderer(), scene);
  let sensorFrame = 0;

  // --- Clock ---
  const clock = new THREE.Clock();

  // --- Animation loop ---
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05); // cap at 50ms

    physics.step(delta);
    playerCar.update(delta, keys);
    agentManager.update(delta);
    cameras.update(playerCar);

    // sensor capture every other frame (~33ms at 60fps)
    sensorFrame++;
    if (sensorFrame % 2 === 0 && playerCar.mesh) {
      if (!sensorCam._attached) {
        sensorCam.attach(playerCar.mesh);
        sensorCam._attached = true;
      }
      sensorCam.getFrames(); // captured; will be included in next WS send
    }

    map.triggerRepaint();
  }

  animate();
}

main().catch(console.error);
