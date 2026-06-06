import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

const MAX_SPEED_MS = 12;

function carScale() {
  return (4.5 * mercatorScale()) / 7;
}

// Shared geometry + per-instance material for performance
let _sharedGeo = null;
function getSharedGeo(scene) {
  // Fallback box until OBJ loads — reused across all agents
  if (!_sharedGeo) _sharedGeo = new THREE.BoxGeometry(1, 0.4, 0.5);
  return _sharedGeo;
}

export class CarAgent {
  constructor(id, lng, lat, physicsWorld, scene, hue) {
    this.id = id;
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    const m = mercatorScale();
    this.pos = worldToMap(lng, lat, 0);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;

    this._turnTimer = 2 + Math.random() * 3;
    this._turnDir = Math.random() < 0.5 ? 1 : -1;

    this._color = new THREE.Color().setHSL(hue, 0.85, 0.55);
    this._scale = carScale();
    this.mesh = null;
    this._spawnMesh();

    const hw = m * 2.5, hh = m * 0.8, hd = m * 1.2;
    this.bodyHandle = physicsWorld.addCarCollider(
      this.pos.x, this.pos.y, hh, hw, hh, hd
    );
  }

  _spawnMesh() {
    // Lightweight box placeholder — visually correct size, loads instantly
    const s = this._scale;
    const geo = new THREE.BoxGeometry(s * 7, s * 3, s * 3);
    const mat = new THREE.MeshPhongMaterial({
      color: this._color,
      emissive: this._color.clone().multiplyScalar(0.15),
      shininess: 60,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);
  }

  _ruleBased(delta) {
    const m = mercatorScale();
    const maxSpd = m * MAX_SPEED_MS;
    this.speed = Math.min(this.speed + m * 3 * delta, maxSpd * 0.5);

    this._turnTimer -= delta;
    if (this._turnTimer <= 0) {
      this._turnTimer = 2 + Math.random() * 4;
      this._turnDir = Math.random() < 0.5 ? 1 : -1;
    }
    this.heading += this._turnDir * 0.35 * delta;
  }

  applyAction({ throttle = 0, steering = 0, brake = 0 }) {
    const m = mercatorScale();
    const maxSpd = m * MAX_SPEED_MS;
    const accel = m * 6;
    this.speed = THREE.MathUtils.clamp(
      this.speed + throttle * accel * (1/60) - brake * accel * (1/60),
      -maxSpd * 0.2, maxSpd
    );
    this.heading += steering * 1.4 * (this.speed / maxSpd) * (1/60);
  }

  update(delta) {
    this._ruleBased(delta);
    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.y -= Math.cos(this.heading) * this.speed * delta;

    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.rotation.set(0, -this.heading, 0);
    }
  }

  getObservation() {
    return { id: this.id, x: this.pos.x, y: this.pos.y, heading: this.heading, speed: this.speed };
  }

  dispose() {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    if (this.bodyHandle !== null) this.physicsWorld.removeBody(this.bodyHandle);
  }
}
