import * as THREE from 'three';
import { worldToMapbox } from '../map/sfLayer.js';

const MAX_SPEED_MS = 12;

export class CarAgent {
  constructor(id, lng, lat, physicsWorld, scene, hue) {
    this.id = id;
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    this.pos = worldToMapbox(lng, lat, 0);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;

    this._turnTimer = 2 + Math.random() * 3;
    this._turnDir = Math.random() < 0.5 ? 1 : -1;

    this._colorHex = new THREE.Color().setHSL(hue, 0.85, 0.55).getHex();
    this.mesh = new THREE.Group();
    this._spawnMesh();

    this.bodyHandle = physicsWorld.addCarCollider(
      this.pos.x, this.pos.y, this.pos.z
    );
  }

  _spawnMesh() {
    const sedanModel = window.game.assets?.models['sedan'];
    if (sedanModel) {
      const carModel = sedanModel.clone();
      
      const box = new THREE.Box3().setFromObject(carModel);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      
      const targetLength = 4.8;
      const scale = targetLength / size.z;
      carModel.scale.set(scale, scale, scale);
      carModel.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      
      carModel.rotateX(-Math.PI / 2);

      carModel.traverse((node) => {
        if (node.isMesh && node.material) {
          if (Array.isArray(node.material)) {
            node.material = node.material.map((mat) => {
              const m = mat.clone();
              if (m.color && (m.name === 'blinn2SG' || m.name === 'dull')) {
                m.color.setHex(this._colorHex);
              }
              return m;
            });
          } else {
            node.material = node.material.clone();
            if (node.material.color && (node.material.name === 'blinn2SG' || node.material.name === 'dull')) {
              node.material.color.setHex(this._colorHex);
            }
          }
        }
      });
      
      this.mesh.add(carModel);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry( 2, 1.4, 4.6 ),
        new THREE.MeshStandardMaterial({ color: this._colorHex, roughness: 0.5 })
      );
      body.position.y = 0.7;
      this.mesh.add(body);
    }

    this.scene.add(this.mesh);
    this.mesh.position.copy(this.pos);
  }

  _ruleBased(delta) {
    const maxSpd = MAX_SPEED_MS;
    this.speed = Math.min(this.speed + 3 * delta, maxSpd * 0.5);

    this._turnTimer -= delta;
    if (this._turnTimer <= 0) {
      this._turnTimer = 2 + Math.random() * 4;
      this._turnDir = Math.random() < 0.5 ? 1 : -1;
    }
    this.heading += this._turnDir * 0.35 * delta;
  }

  applyAction({ throttle = 0, steering = 0, brake = 0 }) {
    const maxSpd = MAX_SPEED_MS;
    const accel = 6;
    this.speed = THREE.MathUtils.clamp(
      this.speed + throttle * accel * (1/60) - brake * accel * (1/60),
      -maxSpd * 0.2, maxSpd
    );
    this.heading += steering * 1.4 * (this.speed / maxSpd) * (1/60);
  }

  update(delta) {
    this._ruleBased(delta);
    
    // X is east, Z is south in Three.js world coordinates
    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.z += Math.cos(this.heading) * this.speed * delta;

    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.rotation.set(0, this.heading, 0);
    }
  }

  getObservation() {
    const obs = { id: this.id, x: this.pos.x, y: this.pos.z, heading: this.heading, speed: this.speed };
    if (this.sensorCamera) {
      obs.camera = this.sensorCamera.getFrames();
    }
    return obs;
  }

  attachSensorCamera(sensorCamera) {
    this.sensorCamera = sensorCamera;
    this.sensorCamera.attach(this.mesh);
  }

  dispose() {
    if (this.sensorCamera) this.sensorCamera.detach(this.mesh);
    if (this.mesh) { this.scene.remove(this.mesh); }
    if (this.bodyHandle !== null) {
        const body = this.physicsWorld.bodies.get(this.bodyHandle);
        if (body) this.physicsWorld.world.removeRigidBody(body);
    }
  }
}
