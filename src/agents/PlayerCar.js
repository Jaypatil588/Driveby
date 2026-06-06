import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

const START_LNG = -122.3988;
const START_LAT  = 37.7916;

export class PlayerCar {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    this.mesh = null;
    this.windowsMesh = null;
    this.heading = 0;  // radians
    this.speed = 0;    // mercator units / second
    this.bodyHandle = null;

    const m = mercatorScale();
    this.pos = worldToMap(START_LNG, START_LAT, 0);

    // Rapier body for collision (walls + buildings stop the car)
    const hw = m * 2, hh = m * 0.75, hd = m * 1;
    this.bodyHandle = physicsWorld.addCarCollider(
      this.pos.x, this.pos.y, hh, hw, hh, hd
    );

    this._load(m);
  }

  _load(m) {
    const scale = m * 4;
    const matBody = new THREE.MeshPhongMaterial({ color: 0x2255aa, shininess: 120 });
    const matWin  = new THREE.MeshPhongMaterial({
      color: 0x88aacc, transparent: true, opacity: 0.45, shininess: 200,
    });

    const loader = new OBJLoader();
    loader.load('assets/models/spinner.obj', (obj) => {
      this.mesh = obj.children[0];
      this.mesh.material = matBody;
      this.mesh.scale.setScalar(scale);
      this.mesh.position.copy(this.pos);
      this.scene.add(this.mesh);
    });
    loader.load('assets/models/spinner_windows.obj', (obj) => {
      this.windowsMesh = obj.children[0];
      this.windowsMesh.material = matWin;
      this.windowsMesh.scale.setScalar(scale);
      this.windowsMesh.position.copy(this.pos);
      this.scene.add(this.windowsMesh);
    });
  }

  update(delta, keys = {}) {
    const m = mercatorScale();
    const MAX_SPEED = m * 16;
    const ACCEL     = m * 8;
    const BRAKE     = m * 16;
    const STEER     = 1.8;

    const throttle  = (keys['w'] || keys['ArrowUp'])    ? 1 : 0;
    const braking   = (keys['s'] || keys['ArrowDown'])  ? 1 : 0;
    const turnLeft  = (keys['a'] || keys['ArrowLeft'])  ? 1 : 0;
    const turnRight = (keys['d'] || keys['ArrowRight']) ? 1 : 0;

    if (throttle) {
      this.speed = Math.min(this.speed + ACCEL * delta, MAX_SPEED);
    } else if (braking) {
      this.speed = Math.max(this.speed - BRAKE * delta, -MAX_SPEED * 0.4);
    } else {
      this.speed *= Math.pow(0.92, delta * 60);
      if (Math.abs(this.speed) < 1e-8) this.speed = 0;
    }

    if (this.speed !== 0) {
      const steer = turnRight - turnLeft;
      const ratio = Math.min(Math.abs(this.speed) / MAX_SPEED, 1);
      this.heading += steer * STEER * ratio * delta * Math.sign(this.speed);
    }

    // Apply movement, then check Rapier body for collision correction
    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.y += Math.cos(this.heading) * this.speed * delta;

    const body = this.physicsWorld.getBody(this.bodyHandle);
    if (body) {
      // Push body to desired position so Rapier resolves collisions
      body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
      // Read back corrected position after collision resolution
      const t = body.translation();
      this.pos.x = t.x;
      this.pos.y = t.y;
    }

    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.rotation.set(0, this.heading, 0);
      if (this.windowsMesh) {
        this.windowsMesh.position.copy(this.mesh.position);
        this.windowsMesh.rotation.copy(this.mesh.rotation);
      }
    }
  }

  getPosition() {
    return { pos: this.pos.clone(), heading: this.heading };
  }

  applyInput({ throttle = 0, steering = 0, brake = 0 }) {
    const m = mercatorScale();
    const maxSpd = m * 16;
    const accel  = m * 8;
    this.speed = THREE.MathUtils.clamp(
      this.speed + throttle * accel * (1/60) - brake * accel * (1/60),
      -maxSpd * 0.4, maxSpd
    );
    this.heading += steering * 1.8 * (this.speed / maxSpd) * (1/60);
  }
}
