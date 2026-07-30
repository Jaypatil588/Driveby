import { AssetManager } from './classes/AssetManager.js';
import { createMap } from './map/mapbox.js';
import { SFLayer } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { CameraToggle } from './ui/CameraToggle.js';
import { TrafficManager } from './agents/Traffic.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { AgentManager } from './agents/AgentManager.js';
import { AgentSocket } from './network/AgentSocket.js';
import { buildColliders } from './physics/Colliders.js';
import { TrainingHUD } from './ui/TrainingHUD.js';

// Car start position: intersection of Market St and 1st St.
const CAR_START = { lng: -122.3988, lat: 37.7916 };

class Game {

  constructor() {
    this.keys = {};
    this.rlSocketStatus = 'not-started';
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup',   (e) => this.keys[e.key.toLowerCase()] = false);

    // --- debug overlay ---
    this.dbg = document.createElement('div');
    this.dbg.style.cssText =
      'position:absolute;top:8px;right:8px;z-index:99;background:rgba(0,0,0,.8);' +
      'color:#0f0;font:11px monospace;padding:8px;white-space:pre;line-height:1.5;' +
      'pointer-events:none;border-radius:4px;max-width:46ch;';
    document.body.appendChild(this.dbg);
    this.fps = 0; this.frames = 0; this.fpsT = 0;
    this.infoPanel = document.getElementById('info');

    // start immediately — no terminal, no launch screen
    this.load();
  }

  load() {
    this.assets = new AssetManager();
    this.assets.setPath('assets/');
    this.assets.load();
  }

  // called by AssetManager when all assets have loaded
  async onLoad() {
    this.physics = new PhysicsWorld();
    await this.physics.init();

    this.map = createMap('map');
    this.sfLayer = new SFLayer();
    if (this.map.loaded()) {
      this.onMapLoad();
    } else {
      this.map.on('load', () => this.onMapLoad());
    }
  }

  onMapLoad() {
    // Build physics colliders for buildings and boundaries
    buildColliders(this.map, this.physics);

    // inject the Three.js scene as a Mapbox custom layer, above the buildings
    this.map.addLayer(this.sfLayer, 'waterway-label');

    // player car at Market & 1st
    this.player = new PlayerCar({
      scene: this.sfLayer,
      lng: CAR_START.lng,
      lat: CAR_START.lat,
      heading: 0,
      scale: 1
    });

    // traffic system (other cars, trees, pedestrians)
    this.traffic = new TrafficManager(this.sfLayer);

    // rl agents system
    this.agentManager = new AgentManager(this.physics, this.sfLayer);
    this.agentSocket = new AgentSocket(this.agentManager, (status) => {
      this.rlSocketStatus = status;
    });
    this.agentSocket.setEnvironment(this.traffic);
    this.focusTarget = this.player;
    // camera toggle (bird's eye <-> follow), C key
    this.cameraToggle = new CameraToggle(this.map, document.getElementById('hud'));

    this.trainingHud = new TrainingHUD(this.agentManager.agents, (agentId) => {
      this.focusTarget = this.agentManager.getAgentById(agentId);
      this.cameraToggle.follow();
    });

    // per-frame update, driven by Mapbox's continuous repaint
    this.lastTime = performance.now();
    this.map.on('render', () => this.update());
  }

  update() {
    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (this.physics) this.physics.step(delta);
    this.player.update(delta, this.keys);
    if (this.traffic) this.traffic.update(delta);
    if (this.agentManager) this.agentManager.update(delta, this.traffic);
    this.cameraToggle.update(this.focusTarget);
    this.trainingHud.update(this.agentManager.agents, this.traffic);

    const pos = this.player.getPosition();
    const speed = this.player.speed;
    this.frames++; this.fpsT += delta;
    if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }
    const held = Object.keys(this.keys).filter(k => this.keys[k]).join(',') || '(none)';
    this.dbg.textContent =
      `fps:        ${this.fps}\n` +
      `delta(ms):  ${(delta * 1000).toFixed(1)}\n` +
      `keys:       ${held}\n` +
      `speed(m/s): ${speed.toFixed(2)}\n` +
      `heading:    ${(pos.heading * 180 / Math.PI).toFixed(1)}°\n` +
      `lng,lat:    ${pos.lng.toFixed(6)}, ${pos.lat.toFixed(6)}\n` +
      `bearing:    ${this.map.getBearing().toFixed(1)}°  pitch:${this.map.getPitch().toFixed(0)}  zoom:${this.map.getZoom().toFixed(2)}`;

    this.updateInfoPanel();
  }

  updateInfoPanel() {
    if (!this.infoPanel || !this.agentManager) return;

    const stats = this.agentManager.getStats();
    this.infoPanel.innerHTML = `
      <h3>DriveBy RL Training</h3>
      <p>Simulation-first training for dangerous edge cases before real cars touch the road.</p>
      <div class="info-grid">
        <div><span>RL agents</span><strong>${stats.total}</strong></div>
        <div><span>Sensor feeds</span><strong>${stats.sensors}</strong></div>
        <div><span>Backend</span><strong>${this.rlSocketStatus}</strong></div>
        <div><span>RL controlled</span><strong>${stats.rlControlled}/${stats.total}</strong></div>
      </div>
      <div class="info-foot">Cyan beacons mark RL-enabled vehicles. WASD/Arrows drive. C toggles camera.</div>
    `;
  }

}

window.game = new Game();
