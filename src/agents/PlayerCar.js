import * as THREE from 'three';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

// Start: Market St & 1st St
const START_LNG = -122.3988;
const START_LAT  = 37.7916;

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(START_LAT * Math.PI / 180);

// Builds a recognizable low-poly car from primitives, in metres, +X = forward.
function buildCarMesh(scale, bodyColor = 0x2266dd) {
  const car = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.5, roughness: 0.35 });
  const tyre  = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.1, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.4, roughness: 0.15 });
  const light = new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xffdd66, emissiveIntensity: 1.2 });
  const tail  = new THREE.MeshStandardMaterial({ color: 0xff3322, emissive: 0xcc1100, emissiveIntensity: 1.0 });

  const L = 4.4, W = 1.85;
  const wheelR = 0.42, wheelW = 0.3;
  const groundClear = 0.18;
  const hullZ = wheelR + groundClear;   // bottom of hull above ground
  const hullH = 0.55;                    // lower hull height

  // ---- wheels first (tucked under, partly inside wheel wells) ----
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 18);
  wheelGeo.rotateX(Math.PI / 2);
  for (const x of [L * 0.31, -L * 0.31]) {
    for (const y of [W / 2 - wheelW * 0.4, -(W / 2 - wheelW * 0.4)]) {
      const w = new THREE.Mesh(wheelGeo, tyre);
      w.position.set(x, y, wheelR);
      car.add(w);
    }
  }

  // ---- lower hull (slightly narrower than track so wheels show) ----
  const hull = new THREE.Mesh(new THREE.BoxGeometry(L, W * 0.92, hullH), paint);
  hull.position.set(0, 0, hullZ + hullH / 2);
  car.add(hull);

  // ---- hood + trunk taper: a thin top deck over front and rear ----
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, W * 0.82, 0.18), paint);
  deck.position.set(0, 0, hullZ + hullH + 0.05);
  car.add(deck);

  // ---- cabin: sits in the middle, narrower + sloped feel via smaller box ----
  const cabinL = L * 0.46;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinL, W * 0.78, 0.5), paint);
  cabin.position.set(-0.15, 0, hullZ + hullH + 0.35);
  car.add(cabin);

  // greenhouse (glass) wrapping the cabin
  const green = new THREE.Mesh(new THREE.BoxGeometry(cabinL * 0.96, W * 0.8, 0.42), glass);
  green.position.set(-0.15, 0, hullZ + hullH + 0.4);
  car.add(green);

  // ---- headlights (front +X) ----
  for (const y of [W / 2 - 0.32, -(W / 2 - 0.32)]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.2), light);
    hl.position.set(L / 2 - 0.02, y, hullZ + hullH * 0.6);
    car.add(hl);
  }
  // ---- taillights (rear -X) ----
  for (const y of [W / 2 - 0.32, -(W / 2 - 0.32)]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.18), tail);
    tl.position.set(-L / 2 + 0.02, y, hullZ + hullH * 0.6);
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
