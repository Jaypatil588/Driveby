import * as THREE from 'three';
import { CarAgent } from './CarAgent.js';
import { BOUNDS } from './PlayerCar.js';
import { sampleRouteToWaypoints } from '../map/RoadGraph.js';

const MAX_SPEED_MS = 14;
const ACCEL_MS2 = 7;
const BRAKE_MS2 = 12;
const DRAG_MS2 = 1.5;
const MAX_STEER_RADS = 1.7;
const LANE_WIDTH_M = 3.6;
const WAYPOINT_REACHED_M = 10;
const RULE_LOOKAHEAD_M = 55;
const STUCK_SECONDS = 7;
const STUCK_PROGRESS_MPS = 0.25;

export class NeuralAgent extends CarAgent {
  constructor(id, lng, lat, physicsWorld, scene, hue, roadGraph, excludedStarts = new Set(), excludedEnds = new Set()) {
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
    this.routeStartIdx = null;
    this.routeEndIdx = null;
    this.routeSegments = [];
    this.routeLength = 0;
    this.routeProgress = 0;
    this.waypointEdges = [];
    this.stuckTimer = 0;

    this.reset(false, excludedStarts, excludedEnds);
  }

  reset(resetCurrentRoute = false, excludedStarts = new Set(), excludedEnds = new Set()) {
    this.speed = 0;
    this.score = 0;
    this.collided = false;
    this.collisionReported = false;
    this.reachedWaypoint = false;
    this.lastAction = { throttle: 0, steering: 0, brake: 0 };
    this.stuckTimer = 0;

    if (!resetCurrentRoute || this.waypoints.length < 2) {
      if (excludedStarts.size === 0 && excludedEnds.size === 0 && window.game?.agentManager) {
        const otherAgents = window.game.agentManager.agents || [];
        for (const a of otherAgents) {
          if (a.id !== this.id) {
            if (a.routeStartIdx !== null) excludedStarts.add(a.routeStartIdx);
            if (a.routeEndIdx !== null) excludedEnds.add(a.routeEndIdx);
          }
        }
      }

      const route = this.roadGraph.getValidRoute(400, excludedStarts, excludedEnds);
      this.routeStartIdx = route.startIdx;
      this.routeEndIdx = route.endIdx;
      const sampled = sampleRouteToWaypoints(route);
      this.waypoints = sampled.waypoints;
      this.waypointEdges = sampled.waypointEdges;
      this._buildRouteSegments();
    }

    this.pos.copy(this.waypoints[0]);
    this.currentWpIdx = 1;
    this.targetWp = this.waypoints[1];
    this._setHeadingToTarget();
    this._placeOnRandomLane();
    this.routeProgress = this._getRouteMetrics(this.pos).progress;
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

  _buildRouteSegments() {
    this.routeSegments = [];
    this.routeLength = 0;

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const start = this.waypoints[i];
      const end = this.waypoints[i + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length <= 0) throw new Error(`NeuralAgent ${this.id} route has zero-length segment ${i}.`);
      const edge = this.waypointEdges[i];
      if (!edge || !Number.isInteger(edge.laneCount) || edge.laneCount <= 0) {
        throw new Error(`NeuralAgent ${this.id} route segment ${i} is missing lane metadata.`);
      }

      this.routeSegments.push({
        start,
        end,
        dx,
        dz,
        length,
        laneCount: edge.laneCount,
        roadId: edge.roadId,
        roadName: edge.roadName,
        startProgress: this.routeLength,
        heading: Math.atan2(dx, dz),
      });
      this.routeLength += length;
    }
  }

  _placeOnRandomLane() {
    const segment = this.routeSegments[0];
    if (!segment) throw new Error(`NeuralAgent ${this.id} cannot place on lane without route segments.`);

    const laneIndex = Math.floor(Math.random() * segment.laneCount);
    const laneOffset = (laneIndex - (segment.laneCount - 1) / 2) * LANE_WIDTH_M;
    const perpX = segment.dz / segment.length;
    const perpZ = -segment.dx / segment.length;
    this.pos.x += perpX * laneOffset;
    this.pos.z += perpZ * laneOffset;
  }

  applyAction(action, delta) {
    const { throttle, steering, brake } = action;
    if (![throttle, steering, brake].every(Number.isFinite)) {
      throw new Error(`Invalid route action for agent ${this.id}: throttle, steering, and brake must be finite numbers.`);
    }

    const drag = Math.sign(this.speed) * DRAG_MS2 * delta;
    this.speed = THREE.MathUtils.clamp(
      this.speed + throttle * ACCEL_MS2 * delta - brake * BRAKE_MS2 * delta - drag,
      0,
      MAX_SPEED_MS
    );
    this.heading += steering * MAX_STEER_RADS * Math.max(this.speed / MAX_SPEED_MS, 0.25) * delta;
  }

  update(delta, allAgents, environment) {
    if (delta <= 0) throw new Error(`NeuralAgent ${this.id} received non-positive delta ${delta}.`);
    if (!Array.isArray(allAgents)) throw new Error('NeuralAgent update requires allAgents array.');
    this._validateEnvironment(environment);

    const before = this._getRouteMetrics(this.pos);

    let actionToApply = this.lastAction;
    if (this._detectPedestrianInFront(environment)) {
      actionToApply = { throttle: 0, steering: this.lastAction.steering, brake: 1 };
    }

    this.applyAction(actionToApply, delta);
    this.pos.x += Math.sin(this.heading) * this.speed * delta;
    this.pos.z += Math.cos(this.heading) * this.speed * delta;

    const after = this._getRouteMetrics(this.pos);
    this._scoreRouteProgress(before, after);
    this._syncRouteTarget(after);
    this._syncMeshAndBody();

    this.score -= 0.01;
    this._checkStuck(delta, before, after, environment);
    this._checkCollisions(allAgents, environment);
  }

  _getRouteMetrics(pos) {
    if (this.routeSegments.length === 0) {
      throw new Error(`NeuralAgent ${this.id} cannot measure route without route segments.`);
    }

    let best = null;
    for (let i = 0; i < this.routeSegments.length; i++) {
      const segment = this.routeSegments[i];
      const relX = pos.x - segment.start.x;
      const relZ = pos.z - segment.start.z;
      const t = THREE.MathUtils.clamp((relX * segment.dx + relZ * segment.dz) / (segment.length * segment.length), 0, 1);
      const closestX = segment.start.x + segment.dx * t;
      const closestZ = segment.start.z + segment.dz * t;
      const offX = pos.x - closestX;
      const offZ = pos.z - closestZ;
      const distance = Math.hypot(offX, offZ);
      const signedLateral = offX * (segment.dz / segment.length) + offZ * (-segment.dx / segment.length);

      if (!best || distance < best.distance) {
        best = {
          segmentIndex: i,
          progress: segment.startProgress + segment.length * t,
          distance,
          signedLateral,
          halfWidth: (segment.laneCount * LANE_WIDTH_M) / 2,
          laneCount: segment.laneCount,
          heading: segment.heading,
        };
      }
    }

    if (!best) throw new Error(`NeuralAgent ${this.id} could not compute route metrics.`);
    return best;
  }

  _scoreRouteProgress(before, after) {
    const deltaProgress = after.progress - before.progress;
    if (deltaProgress >= 0) {
      this.score += deltaProgress * 0.8;
    } else {
      this.score += deltaProgress * 2.5;
    }

    this.score -= Math.abs(after.signedLateral) * 0.02;
    this.routeProgress = after.progress;
  }

  _syncRouteTarget(metrics) {
    while (this.currentWpIdx < this.waypoints.length - 1) {
      const targetProgress = this._waypointProgress(this.currentWpIdx);
      if (metrics.progress + WAYPOINT_REACHED_M < targetProgress) break;
      const changedRoute = this._completeWaypoint();
      if (changedRoute) return;
    }
  }

  _completeWaypoint() {
    this.score += 100;
    this.reachedWaypoint = true;

    if (this.currentWpIdx < this.waypoints.length - 1) {
      this.currentWpIdx++;
      this.targetWp = this.waypoints[this.currentWpIdx];
      return false;
    }

    this.score += 200;
    const route = this.roadGraph.getValidRoute();
    this.routeStartIdx = route.startIdx;
    this.routeEndIdx = route.endIdx;
    const sampled = sampleRouteToWaypoints(route);
    this.waypoints = sampled.waypoints;
    this.waypointEdges = sampled.waypointEdges;
    this._buildRouteSegments();
    this.currentWpIdx = 1;
    this.targetWp = this.waypoints[1];
    this.pos.copy(this.waypoints[0]);
    this._setHeadingToTarget();
    this._placeOnRandomLane();
    this.routeProgress = this._getRouteMetrics(this.pos).progress;
    this.stuckTimer = 0;
    return true;
  }

  _waypointProgress(index) {
    if (index < 0 || index >= this.waypoints.length) {
      throw new Error(`NeuralAgent ${this.id} cannot read waypoint progress for invalid index ${index}.`);
    }
    if (index === 0) return 0;

    let progress = 0;
    for (let i = 0; i < index; i++) {
      progress += this.waypoints[i].distanceTo(this.waypoints[i + 1]);
    }
    return progress;
  }

  _checkCollisions(allAgents, environment) {
    const routeMetrics = this._getRouteMetrics(this.pos);
    if (Math.abs(routeMetrics.signedLateral) > routeMetrics.halfWidth) {
      this._markCollision();
      return;
    }

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

    this._applyTrafficRulePenalty(environment, routeMetrics);
  }

  _markCollision() {
    this.collided = true;
    this.score -= 100;
  }

  _detectPedestrianInFront(environment) {
    if (!environment || !Array.isArray(environment.pedestrians)) return false;

    for (const ped of environment.pedestrians) {
      const pedPos = ped.mesh.position;
      const dist = this.pos.distanceTo(pedPos);
      if (dist < 10.0) {
        const angle = Math.atan2(pedPos.z - this.pos.z, pedPos.x - this.pos.x) - (Math.PI / 2 - this.heading);
        const relAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
        if (Math.abs(relAngle) < Math.PI / 2) {
          return true;
        }
      }
    }
    return false;
  }

  _checkStuck(delta, before, after, environment) {
    if (this.collided) return;

    const rules = this._getForwardRuleState(environment, after);
    const waitingForTrafficRule =
      (rules.signalDistance < 0.18 && rules.signalState >= 0.5) ||
      (rules.crosswalkDistance < 0.18 && rules.crosswalkOccupied > 0.5);

    const hasPedInFront = this._detectPedestrianInFront(environment);

    if (waitingForTrafficRule || hasPedInFront) {
      this.stuckTimer = 0;
      return;
    }

    const progressRate = (after.progress - before.progress) / delta;
    if (progressRate < STUCK_PROGRESS_MPS) {
      this.stuckTimer += delta;
    } else {
      this.stuckTimer = 0;
    }

    if (this.stuckTimer >= STUCK_SECONDS) {
      this.score -= 50;
      this._markCollision();
    }
  }

  getStateVector(allAgents, environment) {
    if (!Array.isArray(allAgents)) throw new Error('getStateVector requires allAgents array.');
    this._validateEnvironment(environment);

    const state = [];
    state.push(this.speed / MAX_SPEED_MS);

    const routeMetrics = this._getRouteMetrics(this.pos);
    const routeHeadingError = Math.atan2(Math.sin(routeMetrics.heading - this.heading), Math.cos(routeMetrics.heading - this.heading));
    state.push(routeHeadingError / Math.PI);

    const remainingRoute = this.routeLength - routeMetrics.progress;
    state.push(THREE.MathUtils.clamp(remainingRoute / this.routeLength, 0, 1));
    state.push(THREE.MathUtils.clamp(routeMetrics.signedLateral / routeMetrics.halfWidth, -1, 1));

    const ruleState = this._getForwardRuleState(environment, routeMetrics);
    state.push(ruleState.signalDistance);
    state.push(ruleState.signalState);
    state.push(ruleState.crosswalkDistance);
    state.push(ruleState.crosswalkOccupied);

    const angleToWp = Math.atan2(this.targetWp.z - this.pos.z, this.targetWp.x - this.pos.x) - (Math.PI / 2 - this.heading);
    const relWpAngle = Math.atan2(Math.sin(angleToWp), Math.cos(angleToWp));
    this.reachedWaypoint = Math.abs(relWpAngle) < 0.25;

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

    if (state.length !== 20) {
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
    if (!environment || !Array.isArray(environment.pedestrians) || !Array.isArray(environment.cars) ||
        !Array.isArray(environment.trafficLights) || !Array.isArray(environment.crosswalks)) {
      throw new Error('NeuralAgent requires a TrafficManager environment with pedestrians, cars, trafficLights, and crosswalks arrays.');
    }
    if (!Array.isArray(window.buildingObstacles)) {
      throw new Error('NeuralAgent requires window.buildingObstacles from buildColliders().');
    }
  }

  _getForwardRuleState(environment, routeMetrics) {
    const signal = this._nearestForwardFeature(environment.trafficLights, routeMetrics, (light) => light.pos);
    const crosswalk = this._nearestForwardFeature(environment.crosswalks, routeMetrics, (crossing) => crossing.pos);

    return {
      signalDistance: signal ? THREE.MathUtils.clamp(signal.ahead / RULE_LOOKAHEAD_M, 0, 1) : 1,
      signalState: signal ? signal.item.ruleState : 0,
      crosswalkDistance: crosswalk ? THREE.MathUtils.clamp(crosswalk.ahead / RULE_LOOKAHEAD_M, 0, 1) : 1,
      crosswalkOccupied: crosswalk ? crosswalk.item.occupiedState : 0,
    };
  }

  _nearestForwardFeature(items, routeMetrics, getPos) {
    let nearest = null;
    for (const item of items) {
      const metrics = this._getRouteMetrics(getPos(item));
      const ahead = metrics.progress - routeMetrics.progress;
      if (ahead < 0 || ahead > RULE_LOOKAHEAD_M) continue;
      if (Math.abs(metrics.signedLateral) > metrics.halfWidth + 3) continue;
      if (!nearest || ahead < nearest.ahead) nearest = { item, ahead };
    }
    return nearest;
  }

  _applyTrafficRulePenalty(environment, routeMetrics) {
    const rules = this._getForwardRuleState(environment, routeMetrics);
    const mustStopForSignal = rules.signalDistance < 0.18 && rules.signalState >= 0.5;
    const mustStopForCrosswalk = rules.crosswalkDistance < 0.18 && rules.crosswalkOccupied > 0.5;

    if ((mustStopForSignal || mustStopForCrosswalk) && this.speed > 1.5) {
      this.score -= 2.0 + this.speed * 0.4;
    }

    if (!mustStopForSignal && !mustStopForCrosswalk && this.speed < 0.3) {
      this.score -= 0.05;
    }
  }
}
