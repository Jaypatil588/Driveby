import { initMap } from './map/mapbox.js';
import { sfLayer } from './map/sfLayer.js';
import { CameraToggle } from './ui/CameraToggle.js';
import { Environment } from './map/Environment.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { buildColliders } from './physics/Colliders.js';
import { NeuralAgent } from './agents/NeuralAgent.js';
import { AgentSocket } from './network/AgentSocket.js';
import { TrainingHUD } from './ui/TrainingHUD.js';
import { RoadGraph } from './map/RoadGraph.js';
import { AssetManager } from './assets/AssetManager.js';
import * as THREE from 'three';

async function main() {
  // --- Map ---
  const map = await initMap();

  // --- Three.js layer: insert before the first symbol (label) layer ---
  const layers = map.getStyle().layers;
  const firstSymbol = layers.find(l => l.type === 'symbol');
  map.addLayer(sfLayer, firstSymbol ? firstSymbol.id : undefined);
  const scene = sfLayer.getScene();

  // --- Physics World & Building Footprints ---
  const physicsWorld = new PhysicsWorld();
  await physicsWorld.init();
  buildColliders(map, physicsWorld);

  // --- Environment Assets (Sidewalks, trees, streetlights, pedestrians) ---
  const environment = new Environment(map, scene);
  environment.build();

  // --- Road Network Graph & Connectivity ---
  const roads = environment._queryRoads();
  const roadGraph = new RoadGraph(roads);

  // --- Asset Manager (traffic lights, signs, pedestrians) ---
  const assetManager = new AssetManager(scene);

  // --- Spawning 10 Autonomous RL Agents along safe road nodes ---
  const agents = [];
  for (let i = 0; i < 10; i++) {
    const hue = i / 10;
    agents.push(new NeuralAgent(i, scene, hue, roadGraph));
  }

  // --- WebSocket Relay Client ---
  const socket = new AgentSocket(agents, environment);

  // --- Camera Toggle ---
  const cameras = new CameraToggle(map);

  // --- Training Telemetry Panel ---
  const hud = new TrainingHUD(agents);

  // --- Clock ---
  const clock = new THREE.Clock();

  // --- Animation loop ---
  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);

    physicsWorld.step(delta);
    environment.update(delta);
    assetManager.update(delta);

    for (const agent of agents) {
      agent.update(delta, agents, environment);
    }

    hud.update(agents, environment);

    const followedAgent = agents[hud.selectedAgentId];
    if (followedAgent) {
      cameras.update(followedAgent);
    }
  }

  animate();
}

main().catch(console.error);
