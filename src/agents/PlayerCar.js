import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

// Start: Market St & 1st St
const START_LNG = -122.3988;
const START_LAT  = 37.7916;

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(START_LAT * Math.PI / 180);

function carScale() {
  return (4.5 * mercatorScale()) / 7; // model ~7 units → ~4.5 m
}

export class PlayerCar {
  constructor(scene) {
    this.scene = scene;

    // heading = compass bearing in radians (0 = N, +clockwise → π/2 = E)
    this.lng = START_LNG;
    this.lat = START_LAT;
    this.heading = 0;
    this.speed = 0; // m/s, signed

    // Group holds the world position + driving yaw.
    // The model child holds the fixed "stand upright + face forward" transform,
    // so the two rotations never interfere (this is what fixes the deformation).
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._load();
  }

  _load() {
    const scale = carScale();
    const matBody = new THREE.MeshStandardMaterial({
      color: 0x2299ff, metalness: 0.6, roughness: 0.35, emissive: 0x062138,
    });
    const matWin = new THREE.MeshStandardMaterial({
      color: 0x99ddff, metalness: 0.9, roughness: 0.1,
      transparent: true, opacity: 0.5,
    });

    const loader = new OBJLoader();
    loader.load('assets/models/spinner.obj', (obj) => {
      const mesh = obj.children[0];
      mesh.material = matBody;
      mesh.geometry.computeVertexNormals();
      this._fitModel(mesh, scale);
      this.group.add(mesh);
    });
    loader.load('assets/models/spinner_windows.obj', (obj) => {
      const mesh = obj.children[0];
      mesh.material = matWin;
      this._fitModel(mesh, scale);
      this.group.add(mesh);
    });
  }

  // Apply the fixed model-space correction: scale, stand upright (Y-up → Z-up),
  // and rotate so the nose points along the group's local +Y (forward).
  _fitModel(mesh, scale) {
    mesh.scale.setScalar(scale);
    // Tilt the Y-up model to be Z-up.
    mesh.rotation.x = Math.PI / 2;
    // The model's length runs along local X; after the tilt, rotate about Z so
    // the nose aligns with the group's forward axis. Flip via _modelYawOffset.
    mesh.rotateZ(this._modelYawOffset ?? -Math.PI / 2);
    // Lift slightly so wheels sit on the road, not through it.
    mesh.position.z = scale * 1.3;
  }

  // Knob: if the car drives sideways/backward, set to 0, π/2, π, or -π/2.
  get _modelYawOffset() { return -Math.PI / 2; }

  update(delta, keys = {}) {
    const MAX_SPEED = 22, ACCEL = 14, BRAKE = 28, REVERSE = 8, STEER = 2.0;

    const throttle  = (keys['w'] || keys['ArrowUp'])    ? 1 : 0;
    const braking   = (keys['s'] || keys['ArrowDown'])  ? 1 : 0;
    const turnLeft  = (keys['a'] || keys['ArrowLeft'])  ? 1 : 0;
    const turnRight = (keys['d'] || keys['ArrowRight']) ? 1 : 0;

    if (throttle)      this.speed += ACCEL * delta;
    else if (braking)  this.speed -= BRAKE * delta;
    else {
      this.speed -= Math.sign(this.speed) * 10 * delta;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -REVERSE, MAX_SPEED);

    if (Math.abs(this.speed) > 0.1) {
      const steer = turnRight - turnLeft;
      const ratio = Math.min(Math.abs(this.speed) / MAX_SPEED + 0.3, 1);
      this.heading += steer * STEER * ratio * delta * Math.sign(this.speed);
    }

    const distM = this.speed * delta;
    this.lat += (Math.cos(this.heading) * distM) / M_PER_DEG_LAT;
    this.lng += (Math.sin(this.heading) * distM) / M_PER_DEG_LNG;

    this._sync();
  }

  _sync() {
    const p = worldToMap(this.lng, this.lat, 0);
    this.group.position.copy(p);
    // Yaw the whole group to face the heading, in mercator space.
    // mercator Y is flipped vs north, so derive yaw from a step ahead.
    const ahead = worldToMap(
      this.lng + Math.sin(this.heading) * 1e-5,
      this.lat + Math.cos(this.heading) * 1e-5, 0
    );
    const yaw = Math.atan2(ahead.y - p.y, ahead.x - p.x);
    this.group.rotation.set(0, 0, yaw);
  }

  getState() {
    return { lng: this.lng, lat: this.lat, heading: this.heading, speed: this.speed };
  }
}
