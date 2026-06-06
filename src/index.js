import { AssetManager } from './classes/AssetManager.js';
import { createMap } from './map/mapbox.js';
import { SFLayer } from './map/sfLayer.js';
import { PlayerCar } from './agents/PlayerCar.js';
import { CameraToggle } from './ui/CameraToggle.js';
import { TrafficManager } from './agents/Traffic.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';

// Car start position: intersection of Market St and 1st St.
const CAR_START = { lng: -122.3988, lat: 37.7916 };

window.game = new Game();

class Game {

  constructor() {
    this.keys = {};
    window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup',   (e) => this.keys[e.key.toLowerCase()] = false);

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
    this.map.on('load', () => this.onMapLoad());
  }

  onMapLoad() {
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

    // camera toggle (bird's eye <-> follow), C key
    this.cameraToggle = new CameraToggle(this.map, document.getElementById('hud'));

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
    this.cameraToggle.update(this.player);
  }

}
