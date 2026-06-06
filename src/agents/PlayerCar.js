import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

// Start: Market St & 1st St
const START_LNG = -122.3988;
const START_LAT  = 37.7916;

// Metres-per-degree at SF latitude (~37.79)
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(START_LAT * Math.PI / 180);

// Car model is ~7 units long; a real car ~4.5m
function carScale() {
  return (4.5 * mercatorScale()) / 7;
}

// Reusable axis vectors for quaternion math
const _X = new THREE.Vector3(1, 0, 0);
const _Z = new THREE.Vector3(0, 0, 1);

export class PlayerCar {
  constructor(scene) {
    this.scene = scene;

    // State in geographic space — intuitive and matches the map
    this.lng = START_LNG;
    this.lat = START_LAT;
    this.heading = 0;          // radians, 0 = north, clockwise positive
    this.speed = 0;            // metres / second

    this.mesh = null;
    this.windowsMesh = null;
    this._load();
  }

  _load() {
    const scale = carScale();
    const matBody = new THREE.MeshPhongMaterial({
      color: 0x33ccff, emissive: 0x0a2a44, shininess: 140,
    });
    const matWin = new THREE.MeshPhongMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.55, shininess: 220,
    });

    const loader = new OBJLoader();
    loader.load('assets/models/spinner.obj', (obj) => {
      this.mesh = obj.children[0];
      this.mesh.material = matBody;
      this.mesh.scale.setScalar(scale);
      this.scene.add(this.mesh);
      this._syncMesh();
    });
    loader.load('assets/models/spinner_windows.obj', (obj) => {
      this.windowsMesh = obj.children[0];
      this.windowsMesh.material = matWin;
      this.windowsMesh.scale.setScalar(scale);
      this.scene.add(this.windowsMesh);
      this._syncMesh();
    });
  }

  update(delta, keys = {}) {
    const MAX_SPEED = 22;   // m/s ≈ 80 km/h
    const ACCEL     = 14;
    const BRAKE     = 28;
    const REVERSE   = 8;
    const STEER     = 2.2;  // rad/s at full speed

    const throttle  = (keys['w'] || keys['ArrowUp'])    ? 1 : 0;
    const braking   = (keys['s'] || keys['ArrowDown'])  ? 1 : 0;
    const turnLeft  = (keys['a'] || keys['ArrowLeft'])  ? 1 : 0;
    const turnRight = (keys['d'] || keys['ArrowRight']) ? 1 : 0;

    // longitudinal
    if (throttle) {
      this.speed += ACCEL * delta;
    } else if (braking) {
      this.speed -= BRAKE * delta;
    } else {
      // coast: friction pulls toward zero
      this.speed -= Math.sign(this.speed) * 10 * delta;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -REVERSE, MAX_SPEED);

    // steering — proportional to speed, reversed when going backward
    if (Math.abs(this.speed) > 0.1) {
      const steer = turnRight - turnLeft;
      const ratio = Math.min(Math.abs(this.speed) / MAX_SPEED + 0.25, 1);
      this.heading += steer * STEER * ratio * delta * Math.sign(this.speed);
    }

    // integrate position: heading 0 = north (+lat), clockwise
    const distM = this.speed * delta;
    const dNorth = Math.cos(this.heading) * distM;
    const dEast  = Math.sin(this.heading) * distM;
    this.lat += dNorth / M_PER_DEG_LAT;
    this.lng += dEast  / M_PER_DEG_LNG;

    this._syncMesh();
  }

  _syncMesh() {
    if (!this.mesh) return;
    const p = worldToMap(this.lng, this.lat, 0);

    // Compose two rotations as quaternions (order-independent, unambiguous):
    //  1) tilt: model is Y-up, mercator world is Z-up → rotate +90° about X
    //  2) yaw : spin around world-Z (up) by -heading so local +X faces heading
    const tilt = new THREE.Quaternion().setFromAxisAngle(_X, Math.PI / 2);
    const yaw  = new THREE.Quaternion().setFromAxisAngle(_Z, -this.heading);
    const q = yaw.multiply(tilt); // apply tilt first, then yaw

    this.mesh.position.copy(p);
    this.mesh.quaternion.copy(q);
    if (this.windowsMesh) {
      this.windowsMesh.position.copy(p);
      this.windowsMesh.quaternion.copy(q);
    }
  }

  // For camera + network
  getState() {
    return { lng: this.lng, lat: this.lat, heading: this.heading, speed: this.speed };
  }
}
