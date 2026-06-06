import * as THREE from 'three';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

// Start: Market St & 1st St
const START_LNG = -122.3988;
const START_LAT  = 37.7916;

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(START_LAT * Math.PI / 180);

// Builds a car-shaped mesh by extruding a smooth side-profile across the width.
// In metres, +X = forward, +Z = up. Renders reliably (pure procedural geometry).
function buildCarMesh(scale, bodyColor = 0x2266dd) {
  const car = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.55, roughness: 0.3 });
  const tyre  = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.1, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x182838, metalness: 0.5, roughness: 0.12 });
  const light = new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xffdd66, emissiveIntensity: 1.4 });
  const tail  = new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xcc1100, emissiveIntensity: 1.1 });

  const L = 4.4, W = 1.8;
  const wheelR = 0.40, wheelW = 0.32;
  const floor = wheelR * 0.6; // body floor sits a bit above wheel centres

  // --- side profile (a classic car silhouette) in the X(length)-Z(height) plane ---
  const x0 = -L / 2, x1 = L / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x0 + 0.1, floor);                 // rear bottom
  shape.lineTo(x1 - 0.1, floor);                 // front bottom
  shape.lineTo(x1,        floor + 0.35);         // front bumper
  shape.lineTo(x1 - 0.05, floor + 0.7);          // hood front
  shape.lineTo(x1 - 1.25, floor + 0.78);         // hood/base of windshield
  shape.lineTo(x1 - 1.95, floor + 1.35);         // windshield top (front of roof)
  shape.lineTo(x0 + 1.55, floor + 1.4);          // roof rear
  shape.lineTo(x0 + 0.75, floor + 0.82);         // rear window base
  shape.lineTo(x0 + 0.05, floor + 0.75);         // trunk
  shape.lineTo(x0,        floor + 0.4);           // rear bumper
  shape.lineTo(x0 + 0.1,  floor);                 // close
  shape.closePath();

  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }),
    paint
  );
  // Extrude runs along +Z; rotate so width is along Y, and centre it.
  body.rotation.x = Math.PI / 2;
  body.position.y = W / 2;
  car.add(body);

  // --- greenhouse / windows: a darker slab tucked under the roofline ---
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, W * 0.92, 0.5), glass);
  cabin.position.set(-0.2, 0, floor + 1.05);
  car.add(cabin);

  // --- wheels ---
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 20);
  wheelGeo.rotateX(Math.PI / 2);
  for (const x of [L * 0.3, -L * 0.3]) {
    for (const y of [W / 2 - 0.05, -(W / 2 - 0.05)]) {
      const w = new THREE.Mesh(wheelGeo, tyre);
      w.position.set(x, y, wheelR);
      car.add(w);
    }
  }

  // --- head/taillights ---
  for (const y of [W / 2 - 0.3, -(W / 2 - 0.3)]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.22), light);
    hl.position.set(L / 2 - 0.04, y, floor + 0.6);
    car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.2), tail);
    tl.position.set(-L / 2 + 0.04, y, floor + 0.6);
    car.add(tl);
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
