import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

const MAX_SPEED_MS = 16; // m/s ≈ 60 km/h

export class CarAgent {
  constructor(id, lng, lat, physicsWorld, scene, hue) {
    this.id = id;
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    const m = mercatorScale();
    this.pos = worldToMap(lng, lat, 0);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;

    // simple rule-based state
    this._turnTimer = 2 + Math.random() * 2;
    this._turnDir = (Math.random() < 0.5 ? 1 : -1);

    this.mesh = null;
    this._scale = m * 4;
    this._color = new THREE.Color().setHSL(hue, 0.9, 0.55);
    this._load();

    // physics
    const hw = m * 2, hh = m * 0.75, hd = m * 1;
    this.bodyHandle = physicsWorld.addCarCollider(
      this.pos.x, this.pos.y, hh, hw, hh, hd
    );
  }

  _load() {
    const mat = new THREE.MeshPhongMaterial({ color: this._color, shininess: 80 });
    new OBJLoader().load('assets/models/spinner.obj', (obj) => {
      this.mesh = obj.children[0];
      this.mesh.material = mat;
      this.mesh.scale.setScalar(this._scale);
      this.mesh.position.copy(this.pos);
      this.scene.add(this.mesh);
    });
  }

  // Called by RL backend relay
  applyAction({ throttle = 0, steering = 0, brake = 0 }) {
    const m = mercatorScale();
    const maxSpd = m * MAX_SPEED_MS;
    const accel = m * 8;
    this.speed = THREE.MathUtils.clamp(
      this.speed + throttle * accel * (1/60) - brake * accel * (1/60),
      -maxSpd * 0.3, maxSpd
    );
    this.heading += steering * 1.8 * (this.speed / maxSpd) * (1/60);
  }

  // Rule-based fallback: drive straight, random turn every few seconds
  _ruleBased(delta) {
    const m = mercatorScale();
    const maxSpd = m * MAX_SPEED_MS;
    this.speed = Math.min(this.speed + m * 4 * delta, maxSpd * 0.5);

    this._turnTimer -= delta;
    if (this._turnTimer <= 0) {
      this._turnTimer = 2 + Math.random() * 3;
      this._turnDir = (Math.random() < 0.5 ? 1 : -1);
    }
    this.heading += this._turnDir * 0.4 * delta;
  }

  update(delta) {
    this._ruleBased(delta);

    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.y += Math.cos(this.heading) * this.speed * delta;

    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.rotation.set(0, this.heading, 0);
    }
  }

  getObservation() {
    return {
      id: this.id,
      x: this.pos.x,
      y: this.pos.y,
      heading: this.heading,
      speed: this.speed,
    };
  }

  dispose() {
    if (this.mesh) this.scene.remove(this.mesh);
    if (this.bodyHandle !== null) this.physicsWorld.removeBody(this.bodyHandle);
  }
}
