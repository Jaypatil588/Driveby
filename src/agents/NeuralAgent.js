import * as THREE from 'three';
import { CarAgent } from './CarAgent.js';
import { BOUNDS } from './PlayerCar.js';
import { samplePathToWaypoints } from '../map/RoadGraph.js';

const MAX_SPEED_MS = 14;

export class NeuralAgent extends CarAgent {
  constructor(id, lng, lat, physicsWorld, scene, hue, roadGraph) {
    super(id, lng, lat, physicsWorld, scene, hue, true);

    this.roadGraph = roadGraph;
    this.generation = 1;
    this.score = 0;
    this.bestScore = -9999;
    this.collided = false;
    this.collisionReported = false;
    this.reachedWaypoint = false;
    this.lastAction = { throttle: 0, steering: 0, brake: 0 };
    this.waypoints = [];
    this.currentWpIdx = 0;
    this.targetWp = null;

    this.reset();
  }

  reset(resetCurrentRoute = false) {
    this.speed = 0;
    this.score = 0;
    this.collided = false;
    this.collisionReported = false;
    this.reachedWaypoint = false;
    this.lastAction = { throttle: 0, steering: 0, brake: 0 };

    if (!resetCurrentRoute || this.waypoints.length < 2) {
      const route = this.roadGraph.getValidRoute();
      this.waypoints = samplePathToWaypoints(route.path, 20);
    }

    this.pos.copy(this.waypoints[0]);
    this.currentWpIdx = 1;
    this.targetWp = this.waypoints[1];
    this._setHeadingToTarget();
    this._syncMeshAndBody();
  }

  _setHeadingToTarget() {
    const dir = new THREE.Vector3().subVectors(this.targetWp, this.pos);
    this.heading = Math.atan2(dir.x, dir.z);
  }

  _syncMeshAndBody() {
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.set(0, this.heading, 0);

    const body = this.physicsWorld.bodies.get(this.bodyHandle);
    if (!body) {
      throw new Error(`NeuralAgent ${this.id} is missing physics body ${this.bodyHandle}.`);
    }
    body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
  }

  update(delta, allAgents, environment) {
    if (delta <= 0) throw new Error(`NeuralAgent ${this.id} received non-positive delta ${delta}.`);
    if (!Array.isArray(allAgents)) throw new Error('NeuralAgent update requires allAgents array.');
    this._validateEnvironment(environment);

    this.applyAction(this.lastAction);
    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.z += Math.cos(this.heading) * this.speed * delta;
    this._syncMeshAndBody();

    this.score -= 0.01;
    this._advanceWaypoint();
    this._checkCollisions(allAgents, environment);
  }

  _advanceWaypoint() {
    const distToWp = this.pos.distanceTo(this.targetWp);
    if (distToWp >= 14) return;

    this.score += 100;
    this.reachedWaypoint = true;

    if (this.currentWpIdx < this.waypoints.length - 1) {
      this.currentWpIdx++;
      this.targetWp = this.waypoints[this.currentWpIdx];
      return;
    }

    this.score += 200;
    const route = this.roadGraph.getValidRoute();
    this.waypoints = samplePathToWaypoints(route.path, 20);
    this.currentWpIdx = 1;
    this.targetWp = this.waypoints[1];
    this.pos.copy(this.waypoints[0]);
    this._setHeadingToTarget();
  }

  _checkCollisions(allAgents, environment) {
    const pos = this.getPosition();
    if (pos.lng < BOUNDS.minLng || pos.lng > BOUNDS.maxLng || pos.lat < BOUNDS.minLat || pos.lat > BOUNDS.maxLat) {
      this._markCollision();
      return;
    }

    for (const building of window.buildingObstacles) {
      if (this.pos.x >= building.minX - 1.1 && this.pos.x <= building.maxX + 1.1 &&
          this.pos.z >= building.minZ - 1.1 && this.pos.z <= building.maxZ + 1.1) {
        this._markCollision();
        return;
      }
    }

    for (const other of allAgents) {
      if (other.id === this.id) continue;
      if (this.pos.distanceTo(other.pos) < 3.2) {
        this._markCollision();
        return;
      }
    }

    for (const ped of environment.pedestrians) {
      if (this.pos.distanceTo(ped.mesh.position) < 1.6) {
        this._markCollision();
        return;
      }
    }

    for (const car of environment.cars) {
      if (this.pos.distanceTo(car.mesh.position) < 3.2) {
        this._markCollision();
        return;
      }
    }
  }

  _markCollision() {
    this.collided = true;
    this.score -= 100;
  }

  getStateVector(allAgents, environment) {
    if (!Array.isArray(allAgents)) throw new Error('getStateVector requires allAgents array.');
    this._validateEnvironment(environment);

    const state = [];
    state.push(this.speed / MAX_SPEED_MS);
    state.push(this.heading / (Math.PI * 2));

    const distToWp = this.pos.distanceTo(this.targetWp);
    state.push(Math.min(distToWp / 100, 1));

    const angleToWp = Math.atan2(this.targetWp.z - this.pos.z, this.targetWp.x - this.pos.x) - (Math.PI / 2 - this.heading);
    const relWpAngle = Math.atan2(Math.sin(angleToWp), Math.cos(angleToWp));
    state.push(relWpAngle / Math.PI);

    const detectedAssets = [];
    for (const building of window.buildingObstacles) {
      const dist = this.pos.distanceTo(new THREE.Vector3(building.cx, 0, building.cz));
      if (dist < 45) detectedAssets.push(this._assetState(1, building.cx, building.cz, dist));
    }

    for (const car of environment.cars) {
      const dist = this.pos.distanceTo(car.mesh.position);
      if (dist < 45) detectedAssets.push(this._assetState(3, car.mesh.position.x, car.mesh.position.z, dist));
    }

    for (const ped of environment.pedestrians) {
      const dist = this.pos.distanceTo(ped.mesh.position);
      if (dist < 45) detectedAssets.push(this._assetState(4, ped.mesh.position.x, ped.mesh.position.z, dist));
    }

    for (const other of allAgents) {
      if (other.id === this.id) continue;
      const dist = this.pos.distanceTo(other.pos);
      if (dist < 45) detectedAssets.push(this._assetState(3, other.pos.x, other.pos.z, dist));
    }

    detectedAssets.sort((a, b) => a.dist - b.dist);

    for (let i = 0; i < 3; i++) {
      const asset = detectedAssets[i];
      if (asset) {
        state.push(asset.type, asset.dist / 50, asset.angle / Math.PI, asset.ruleState);
      } else {
        state.push(0, 0, 0, 0);
      }
    }

    if (state.length !== 16) {
      throw new Error(`NeuralAgent ${this.id} produced invalid state vector length ${state.length}.`);
    }
    return state;
  }

  _assetState(type, x, z, dist) {
    const angle = Math.atan2(z - this.pos.z, x - this.pos.x) - (Math.PI / 2 - this.heading);
    return {
      type,
      dist,
      angle: Math.atan2(Math.sin(angle), Math.cos(angle)),
      ruleState: -1
    };
  }

  _validateEnvironment(environment) {
    if (!environment || !Array.isArray(environment.pedestrians) || !Array.isArray(environment.cars)) {
      throw new Error('NeuralAgent requires a TrafficManager environment with pedestrians and cars arrays.');
    }
    if (!Array.isArray(window.buildingObstacles)) {
      throw new Error('NeuralAgent requires window.buildingObstacles from buildColliders().');
    }
  }
}
