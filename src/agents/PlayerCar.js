import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

// Start: Market St & 1st St
const START_LNG = -122.3988;
const START_LAT  = 37.7916;

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = 111320 * Math.cos(START_LAT * Math.PI / 180);

const CAR_LENGTH_M = 5; // target real-world length of the model

export class PlayerCar {
  constructor(scene) {
    this.scene = scene;

    // heading = compass bearing in radians (0 = N, +clockwise → π/2 = E)
    this.lng = START_LNG;
    this.lat = START_LAT;
    this.heading = 0;
    this.speed = 0; // m/s, signed

    // Outer group: world position + driving yaw.
    // Inner model: fixed scale + upright/forward correction.
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._load();
  }

  _load() {
    const loader = new GLTFLoader();
    loader.load('assets/models/car/truck.glb', (gltf) => {
      const model = gltf.scene;

      // --- normalise the model into a 1-unit-up, forward-facing local frame ---
      // 1) measure its bounding box
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // 2) recentre to origin, sit on ground (z=0 base)
      model.position.sub(center);
      model.position.z += size.z / 2; // (after the upright tilt, see below)

      // Kenney models are Y-up, facing -Z. Stand them up into our Z-up world.
      const wrapper = new THREE.Group();
      wrapper.add(model);
      wrapper.rotation.x = Math.PI / 2; // Y-up → Z-up

      // 3) scale so the longest horizontal axis ≈ CAR_LENGTH_M in mercator units
      const longest = Math.max(size.x, size.z); // x or z is the length
      const targetMerc = CAR_LENGTH_M * mercatorScale();
      const scale = targetMerc / longest;
      wrapper.scale.setScalar(scale);

      // brighten materials a touch so it reads in daylight
      model.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.metalness = Math.min(o.material.metalness ?? 0.3, 0.4);
          o.material.roughness = 0.5;
        }
      });

      this.group.add(wrapper);
      this._modelReady = true;
      this._sync();
    });
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

    // Derive yaw in mercator space (Y is flipped vs north) from a step ahead.
    const ahead = worldToMap(
      this.lng + Math.sin(this.heading) * 1e-5,
      this.lat + Math.cos(this.heading) * 1e-5, 0
    );
    const yaw = Math.atan2(ahead.y - p.y, ahead.x - p.x);
    // +HALF_PI aligns the model's forward (-Z → after tilt) with travel.
    this.group.rotation.set(0, 0, yaw + this._yawOffset);
  }

  // Knob if the truck faces the wrong way: try 0, π/2, π, -π/2.
  get _yawOffset() { return -Math.PI / 2; }

  getState() {
    return { lng: this.lng, lat: this.lat, heading: this.heading, speed: this.speed };
  }
}
