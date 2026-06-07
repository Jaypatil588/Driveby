import * as THREE from 'three';
import { mapboxWorldToLngLat, worldToMapbox } from '../map/sfLayer.js';

const MAX_SPEED_MS = 12;
const VISIBLE_AGENT_CAR_LENGTH_M = 9.5;
const AGENT_LABEL_Y = 11.5;

export class CarAgent {
  constructor(id, lng, lat, physicsWorld, scene, hue, rlEnabled = false) {
    this.id = id;
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.rlEnabled = rlEnabled;
    this._rlActionAge = Infinity;

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
    if (!sedanModel) {
      throw new Error(`CarAgent ${this.id} requires assets.models.sedan to be loaded.`);
    }

    const carModel = sedanModel.clone();

    const box = new THREE.Box3().setFromObject(carModel);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const targetLength = VISIBLE_AGENT_CAR_LENGTH_M;
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

    if (this.rlEnabled) {
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 6.5, 12),
        new THREE.MeshBasicMaterial({ color: 0x00fff7 })
      );
      beacon.position.y = 4.6;
      beacon.name = 'RL enabled beacon';
      this.mesh.add(beacon);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(4.2, 0.12, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0x00ff95 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.08;
      halo.name = 'RL enabled footprint';
      this.mesh.add(halo);

      const label = this._createAgentNumberLabel();
      label.position.y = AGENT_LABEL_Y;
      label.name = `Agent ${this.id} number label`;
      this.mesh.add(label);
    }

    this.scene.add(this.mesh);
    this.mesh.position.copy(this.pos);
  }

  _createAgentNumberLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`CarAgent ${this.id} could not create label canvas context.`);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `#${this._colorHex.toString(16).padStart(6, '0')}`;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    this._roundRect(ctx, 28, 24, 200, 136, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#05070a';
    ctx.font = 'bold 104px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.id + 1), 128, 93);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(13, 9.75, 1);
    sprite.renderOrder = 100;
    return sprite;
  }

  _roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
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

  applyAction(action) {
    const { throttle, steering, brake } = action;
    if (![throttle, steering, brake].every(Number.isFinite)) {
      throw new Error(`Invalid RL action for agent ${this.id}: throttle, steering, and brake must be finite numbers.`);
    }

    const maxSpd = MAX_SPEED_MS;
    const accel = 6;
    this.speed = THREE.MathUtils.clamp(
      this.speed + throttle * accel * (1/60) - brake * accel * (1/60),
      -maxSpd * 0.2, maxSpd
    );
    this.heading += steering * 1.4 * (this.speed / maxSpd) * (1/60);
  }

  markRlControlled() {
    this._rlActionAge = 0;
  }

  update(delta) {
    this._rlActionAge += delta;
    if (!this.rlEnabled) {
      this._ruleBased(delta);
    }

    // X is east, Z is south in Three.js world coordinates
    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.z += Math.cos(this.heading) * this.speed * delta;

    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.rotation.set(0, this.heading, 0);
    }
  }

  isRlControlled() {
    return this.rlEnabled && this._rlActionAge < 0.5;
  }

  getPosition() {
    const { lng, lat } = mapboxWorldToLngLat(this.pos.x, this.pos.z);
    return { lng, lat, heading: this.heading };
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
