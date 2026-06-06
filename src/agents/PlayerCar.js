import * as THREE from 'three';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

// Start: Market St & 1st St
const START_LNG = -122.3988;
const START_LAT  = 37.7916;

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(START_LAT * Math.PI / 180);

// Builds a clean low-poly car from primitives, sized in metres, +X = forward.
function buildCarMesh(scale, bodyColor = 0x2266dd) {
  const car = new THREE.Group();

  const body = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.4, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111418, metalness: 0.3, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x99c4e0, metalness: 0.6, roughness: 0.2 });
  const light = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffee88, emissiveIntensity: 0.8 });

  // dimensions in metres (length along X, width along Y, height along Z)
  const L = 4.4, W = 1.9, H = 0.8;

  // lower body
  const lower = new THREE.Mesh(new THREE.BoxGeometry(L, W, H), body);
  lower.position.z = H / 2 + 0.35; // sit on wheels
  car.add(lower);

  // cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, W * 0.85, H * 0.9), glass);
  cabin.position.set(-0.2, 0, H + 0.45);
  car.add(cabin);

  // wheels (cylinders along Y axis)
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16);
  wheelGeo.rotateX(Math.PI / 2); // align cylinder axis to Y (width)
  const offsets = [
    [ L * 0.32,  W / 2 - 0.05], [ L * 0.32, -W / 2 + 0.05],
    [-L * 0.32,  W / 2 - 0.05], [-L * 0.32, -W / 2 + 0.05],
  ];
  for (const [x, y] of offsets) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(x, y, 0.45);
    car.add(wheel);
  }

  // headlights (front = +X)
  for (const y of [W / 2 - 0.35, -W / 2 + 0.35]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.3), light);
    hl.position.set(L / 2 - 0.05, y, H / 2 + 0.4);
    car.add(hl);
  }

  car.scale.setScalar(scale);
  return car;
}

export class PlayerCar {
  constructor(scene) {
    this.scene = scene;

    this.lng = START_LNG;
    this.lat = START_LAT;
    this.heading = 0;       // compass bearing, radians (0=N, +cw)
    this.speed = 0;         // m/s, signed

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // primitives authored in metres → scale by mercator-units-per-metre.
    // 2.5× oversize so the car reads clearly against the buildings.
    const m = mercatorScale() * 2.5;
    this.car = buildCarMesh(m, 0x2266dd);
    this.group.add(this.car);

    this._sync();
  }

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

    // Yaw the group so the car's +X (forward) points along travel direction.
    // Derive the mercator-space angle from a step ahead (handles Y-flip).
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
