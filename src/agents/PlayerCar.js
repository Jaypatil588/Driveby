import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

const START_LNG = -122.3988;
const START_LAT  = 37.7916;

// A car is ~4.5m long. mercatorScale() gives metres-per-mercator-unit.
// So car length in mercator = 4.5 * mercatorScale().
// The OBJ is ~7 units long, so: scale = (4.5 * m) / 7
function carScale() {
  return (4.5 * mercatorScale()) / 7;
}

export class PlayerCar {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    this.mesh = null;
    this.windowsMesh = null;
    this.heading = 0;
    this.speed = 0;
    this.bodyHandle = null;

    const m = mercatorScale();
    this.pos = worldToMap(START_LNG, START_LAT, 0);

    const hw = m * 2.5, hh = m * 0.8, hd = m * 1.2;
    this.bodyHandle = physicsWorld.addCarCollider(
      this.pos.x, this.pos.y, hh, hw, hh, hd
    );

    this._load();
  }

  _load() {
    const scale = carScale();
    const matBody = new THREE.MeshPhongMaterial({ color: 0x4488ff, shininess: 120, emissive: 0x112244 });
    const matWin  = new THREE.MeshPhongMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, shininess: 200 });

    const loader = new OBJLoader();
    loader.load('assets/models/spinner.obj', (obj) => {
      this.mesh = obj.children[0];
      this.mesh.material = matBody;
      this.mesh.scale.setScalar(scale);
      // OBJ is oriented along Z; rotate so front faces +X (east) to match heading=0
      this.mesh.rotation.x = -Math.PI / 2;
      this.scene.add(this.mesh);
      this._syncMesh();
    });
    loader.load('assets/models/spinner_windows.obj', (obj) => {
      this.windowsMesh = obj.children[0];
      this.windowsMesh.material = matWin;
      this.windowsMesh.scale.setScalar(scale);
      this.windowsMesh.rotation.x = -Math.PI / 2;
      this.scene.add(this.windowsMesh);
    });
  }

  update(delta, keys = {}) {
    const m = mercatorScale();
    const MAX_SPEED = m * 14;   // ~14 m/s ≈ 50 km/h
    const ACCEL     = m * 7;
    const BRAKE     = m * 14;
    const STEER     = 1.6;      // rad/s at full speed

    const throttle  = (keys['w'] || keys['ArrowUp'])    ? 1 : 0;
    const braking   = (keys['s'] || keys['ArrowDown'])  ? 1 : 0;
    const turnLeft  = (keys['a'] || keys['ArrowLeft'])  ? 1 : 0;
    const turnRight = (keys['d'] || keys['ArrowRight']) ? 1 : 0;

    if (throttle) {
      this.speed = Math.min(this.speed + ACCEL * delta, MAX_SPEED);
    } else if (braking) {
      this.speed = Math.max(this.speed - BRAKE * delta, -MAX_SPEED * 0.3);
    } else {
      this.speed *= Math.pow(0.88, delta * 60);
      if (Math.abs(this.speed) < 1e-10) this.speed = 0;
    }

    if (this.speed !== 0) {
      const steer = turnRight - turnLeft;
      const ratio = Math.min(Math.abs(this.speed) / MAX_SPEED, 1);
      this.heading += steer * STEER * ratio * delta * Math.sign(this.speed);
    }

    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.y -= Math.cos(this.heading) * this.speed * delta; // mercator Y is flipped

    const body = this.physicsWorld.getBody(this.bodyHandle);
    if (body) {
      body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
      const t = body.translation();
      this.pos.x = t.x;
      this.pos.y = t.y;
    }

    this._syncMesh();
  }

  _syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.set(-Math.PI / 2, 0, this.heading);
    if (this.windowsMesh) {
      this.windowsMesh.position.copy(this.mesh.position);
      this.windowsMesh.rotation.copy(this.mesh.rotation);
    }
  }

  getPosition() {
    return { pos: this.pos.clone(), heading: this.heading };
  }

  applyInput({ throttle = 0, steering = 0, brake = 0 }) {
    const m = mercatorScale();
    const maxSpd = m * 14;
    const accel  = m * 7;
    this.speed = THREE.MathUtils.clamp(
      this.speed + throttle * accel * (1/60) - brake * accel * (1/60),
      -maxSpd * 0.3, maxSpd
    );
    this.heading += steering * 1.6 * (this.speed / maxSpd) * (1/60);
  }
}
