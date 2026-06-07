import {
  Group,
  Mesh,
  CylinderGeometry,
  SphereGeometry,
  ConeGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  Box3,
  Vector3,
} from 'three';
import { roadData } from '../map/RoadGraph.js';
import { worldToMapbox } from '../map/sfLayer.js';

const LANE_WIDTH_M = 3.6;
const MAX_CROSSWALK_PEDS = 80;
const MAX_TRAFFIC_CARS = 24;
const SIGNAL_CYCLE_SECONDS = 32;
const SIGNAL_GREEN_SECONDS = 12;
const SIGNAL_YELLOW_SECONDS = 3;
const SIGNAL_PHASE_OFFSET_SECONDS = SIGNAL_CYCLE_SECONDS / 2;
const PED_WALK_START_SECONDS = 16;
const PED_WALK_SECONDS = 10;
const PED_CLEARANCE_SECONDS = 4;
const PED_CROSSING_SECONDS = 8;

class TrafficManager {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.pedestrians = [];
    this.trees = [];
    this.trafficLights = [];
    this.crosswalks = [];
    this.simulationTime = 0;
    this.trafficRoutes = this._buildTrafficRoutes();

    this.spawnEnvironment();
  }

  spawnEnvironment() {
    this.spawnTrafficLights();
    this.spawnCrosswalks();
    this.spawnTrees();
    this.spawnPedestrians();
    this.spawnCars();
  }

  _buildTrafficRoutes() {
    const routes = [];

    for (const road of roadData.roads) {
      const points = road.nodes.map((node) => worldToMapbox(node.lng, node.lat, 0));
      const totalLength = this._polylineLength(points);
      if (totalLength < 70) continue;

      if (road.forwardLanes > 0) {
        routes.push({ road, points, laneCount: road.forwardLanes, totalLength });
      }
      if (road.backwardLanes > 0) {
        const reversed = [...points].reverse();
        routes.push({ road, points: reversed, laneCount: road.backwardLanes, totalLength });
      }
    }

    if (routes.length < 8) {
      throw new Error(`TrafficManager requires at least 8 lane-valid traffic routes, got ${routes.length}.`);
    }

    return routes.sort((a, b) => b.totalLength - a.totalLength);
  }

  _polylineLength(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) total += points[i].distanceTo(points[i + 1]);
    return total;
  }

  _sampleRoute(route, distance) {
    let remaining = ((distance % route.totalLength) + route.totalLength) % route.totalLength;
    for (let i = 0; i < route.points.length - 1; i++) {
      const start = route.points[i];
      const end = route.points[i + 1];
      const length = start.distanceTo(end);
      if (remaining <= length) {
        const t = remaining / length;
        const pos = new Vector3().lerpVectors(start, end, t);
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        return { pos, heading: Math.atan2(dx, dz), segmentStart: start, segmentEnd: end };
      }
      remaining -= length;
    }

    throw new Error(`Traffic route ${route.road.id} could not be sampled at distance ${distance}.`);
  }

  _nearestRoadSegment(pos) {
    let best = null;
    for (const route of this.trafficRoutes) {
      for (let i = 0; i < route.points.length - 1; i++) {
        const start = route.points[i];
        const end = route.points[i + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lengthSq = dx * dx + dz * dz;
        if (lengthSq <= 0) continue;
        const t = Math.max(0, Math.min(1, ((pos.x - start.x) * dx + (pos.z - start.z) * dz) / lengthSq));
        const closest = new Vector3(start.x + dx * t, 0, start.z + dz * t);
        const dist = pos.distanceTo(closest);
        if (!best || dist < best.dist) {
          best = { dist, start, end, heading: Math.atan2(dx, dz), laneCount: route.laneCount };
        }
      }
    }

    if (!best) throw new Error('TrafficManager could not locate a road segment for crossing placement.');
    return best;
  }

  spawnTrees() {
    for (let i = 0; i < Math.min(60, this.trafficRoutes.length * 3); i++) {
      const route = this.trafficRoutes[i % this.trafficRoutes.length];
      const sample = this._sampleRoute(route, (route.totalLength * ((i % 12) + 1)) / 13);
      const side = i % 2 === 0 ? 1 : -1;
      const offset = this._rightVector(sample.heading).multiplyScalar(side * (route.laneCount * LANE_WIDTH_M / 2 + 3.5));
      this.createTree(sample.pos.clone().add(offset));
    }
  }

  createTree(pos) {
    const group = new Group();

    const trunkGeo = new CylinderGeometry(0.12, 0.18, 1.8, 8);
    const trunkMat = new MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const trunk = new Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.9;
    group.add(trunk);

    const canopyGeo = new ConeGeometry(1.0, 2.2, 8);
    const canopyMat = new MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.7 });
    const canopy = new Mesh(canopyGeo, canopyMat);
    canopy.position.y = 2.2;
    group.add(canopy);

    group.position.copy(pos);
    group.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.4;
    group.scale.set(s, s, s);

    this.scene.add(group);
    this.trees.push(group);
  }

  spawnCrosswalks() {
    for (const crossing of roadData.crossings) {
      const pos = worldToMapbox(crossing.lng, crossing.lat, 0);
      const road = this._nearestRoadSegment(pos);
      this.createCrosswalk(crossing.id, pos, road.heading, road.laneCount);
    }
  }

  createCrosswalk(id, pos, roadHeading, laneCount) {
    const group = new Group();
    const stripeMat = new MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
    const length = Math.max(8, laneCount * LANE_WIDTH_M + 3);

    for (let i = -2; i <= 2; i++) {
      const stripe = new Mesh(new BoxGeometry(0.55, 0.04, length), stripeMat);
      stripe.position.x = i * 0.95;
      group.add(stripe);
    }

    group.position.copy(pos);
    group.position.y = 0.04;
    group.rotation.y = roadHeading;
    this.scene.add(group);

    const crossDir = this._rightVector(roadHeading);
    const crosswalk = {
      id,
      mesh: group,
      pos,
      roadHeading,
      phaseGroup: this._phaseGroupForHeading(roadHeading),
      crossDir,
      length,
      occupiedState: 0,
      walkState: 0,
    };
    this.crosswalks.push(crosswalk);
    return crosswalk;
  }

  spawnPedestrians() {
    const pedColors = [0xff2266, 0x00ff66, 0xffcc00, 0x9900ff, 0x00ccff, 0xffffff];
    const step = Math.max(1, Math.floor(this.crosswalks.length / MAX_CROSSWALK_PEDS));
    let spawned = 0;

    for (let i = 0; i < this.crosswalks.length && spawned < MAX_CROSSWALK_PEDS; i += step) {
      const color = pedColors[spawned % pedColors.length];
      this.createPedestrian(this.crosswalks[i], color, spawned);
      spawned++;
    }
  }

  createPedestrian(crosswalk, color, sequence) {
    const group = new Group();

    const bodyGeo = new CylinderGeometry(0.18, 0.18, 1.1, 8);
    const bodyMat = new MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    group.add(body);

    const headGeo = new SphereGeometry(0.15, 8, 8);
    const headMat = new MeshStandardMaterial({ color: 0xffdbac, roughness: 0.6 });
    const head = new Mesh(headGeo, headMat);
    head.position.y = 1.2;
    group.add(head);

    this.scene.add(group);

    const half = crosswalk.length / 2 + 1.5;
    this.pedestrians.push({
      mesh: group,
      crosswalk,
      start: crosswalk.pos.clone().add(crosswalk.crossDir.clone().multiplyScalar(-half)),
      end: crosswalk.pos.clone().add(crosswalk.crossDir.clone().multiplyScalar(half)),
      progress: 0,
      direction: 1,
      crossing: false,
      startDelay: (sequence % 6) * 0.75,
      speed: 1 / PED_CROSSING_SECONDS,
    });
  }

  spawnCars() {
    const carColors = [0xff5533, 0x33aa55, 0xddbb22, 0x6644ee, 0xaaaaaa, 0x222222, 0x1177ee];
    for (let i = 0; i < Math.min(MAX_TRAFFIC_CARS, this.trafficRoutes.length); i++) {
      const route = this.trafficRoutes[i];
      const color = carColors[i % carColors.length];
      this.createCar(route, color, route.totalLength * ((i % 6) / 6), i);
    }
  }

  createCar(route, colorHex, initialDistance, sequence) {
    const mesh = new Group();

    const sedanModel = window.game.assets?.models['sedan'];
    if (!sedanModel) {
      throw new Error('TrafficManager requires assets.models.sedan to be loaded.');
    }

    const carModel = sedanModel.clone();
    const box = new Box3().setFromObject(carModel);
    const size = new Vector3();
    box.getSize(size);
    const center = new Vector3();
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
            if (m.color && (m.name === 'blinn2SG' || m.name === 'dull')) m.color.setHex(colorHex);
            return m;
          });
        } else {
          node.material = node.material.clone();
          if (node.material.color && (node.material.name === 'blinn2SG' || node.material.name === 'dull')) {
            node.material.color.setHex(colorHex);
          }
        }
      }
    });

    mesh.add(carModel);
    this.scene.add(mesh);

    this.cars.push({
      mesh,
      route,
      distance: initialDistance,
      speed: 0,
      baseSpeed: 7 + (sequence % 5),
    });
  }

  spawnTrafficLights() {
    roadData.signals.forEach((signal) => {
      this.createTrafficLight(signal);
    });
  }

  createTrafficLight(signal) {
    const group = new Group();

    const postGeo = new CylinderGeometry(0.06, 0.08, 3.2, 8);
    const postMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const post = new Mesh(postGeo, postMat);
    post.position.y = 1.6;
    group.add(post);

    const headGeo = new BoxGeometry(0.3, 0.8, 0.3);
    const headMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const head = new Mesh(headGeo, headMat);
    head.position.set(0, 3.0, 0);
    group.add(head);

    const lightGeo = new SphereGeometry(0.08, 8, 8);
    const redMat = new MeshStandardMaterial({ color: 0x330000, emissive: 0x000000, roughness: 0.5 });
    const yellowMat = new MeshStandardMaterial({ color: 0x333300, emissive: 0x000000, roughness: 0.5 });
    const greenMat = new MeshStandardMaterial({ color: 0x003300, emissive: 0x000000, roughness: 0.5 });

    const redLight = new Mesh(lightGeo, redMat);
    redLight.position.set(0, 3.25, 0.15);
    group.add(redLight);

    const yellowLight = new Mesh(lightGeo, yellowMat);
    yellowLight.position.set(0, 3.0, 0.15);
    group.add(yellowLight);

    const greenLight = new Mesh(lightGeo, greenMat);
    greenLight.position.set(0, 2.75, 0.15);
    group.add(greenLight);

    const pos = worldToMapbox(signal.lng, signal.lat, 0);
    const road = this._nearestRoadSegment(pos);
    group.position.copy(pos);
    group.rotation.y = road.heading;

    this.scene.add(group);

    this.trafficLights.push({
      id: signal.id,
      mesh: group,
      pos,
      phaseGroup: this._phaseGroupForHeading(road.heading),
      redMat,
      yellowMat,
      greenMat,
      ruleState: 0,
    });
  }

  update(delta) {
    if (delta <= 0) return;
    this.simulationTime = (this.simulationTime + delta) % SIGNAL_CYCLE_SECONDS;

    this.crosswalks.forEach((crosswalk) => {
      crosswalk.occupiedState = 0;
      crosswalk.walkState = this._crosswalkWalkState(crosswalk);
    });

    this.pedestrians.forEach((ped) => {
      const phase = this._crosswalkPhaseSeconds(ped.crosswalk);
      if (!ped.crossing && ped.crosswalk.walkState === 1 && phase >= ped.startDelay) {
        ped.crossing = true;
      }

      if (ped.crossing) {
        ped.progress += ped.speed * ped.direction * delta;

        if (ped.progress >= 1.0) {
          ped.progress = 1.0;
          ped.direction = -1;
          ped.crossing = false;
        } else if (ped.progress <= 0.0) {
          ped.progress = 0.0;
          ped.direction = 1;
          ped.crossing = false;
        }
      }

      ped.mesh.position.lerpVectors(ped.start, ped.end, ped.progress);
      const walkDir = new Vector3().subVectors(ped.end, ped.start).multiplyScalar(ped.direction);
      ped.mesh.rotation.y = Math.atan2(walkDir.x, walkDir.z);
      if (ped.crossing && ped.progress > 0.08 && ped.progress < 0.92) ped.crosswalk.occupiedState = 1;
    });

    this.cars.forEach((car) => {
      const current = this._sampleRoute(car.route, car.distance);
      const targetSpeed = this._trafficCarShouldStop(current) ? 0 : car.baseSpeed;
      const accel = targetSpeed > car.speed ? 4 : 8;
      car.speed += Math.sign(targetSpeed - car.speed) * Math.min(Math.abs(targetSpeed - car.speed), accel * delta);
      car.distance = (car.distance + car.speed * delta) % car.route.totalLength;
      const sample = this._sampleRoute(car.route, car.distance);
      const laneIndex = car.route.laneCount === 1 ? 0 : (car.route.road.id + Math.floor(car.distance / 60)) % car.route.laneCount;
      const laneOffset = (laneIndex - (car.route.laneCount - 1) / 2) * LANE_WIDTH_M;
      const lanePos = sample.pos.clone().add(this._rightVector(sample.heading).multiplyScalar(laneOffset));

      car.mesh.position.copy(lanePos);
      car.mesh.rotation.y = sample.heading;
    });

    this.trafficLights.forEach((light) => {
      light.ruleState = this._signalState(light.phaseGroup);
      this._applySignalMaterial(light, light.ruleState);
    });
  }

  _phaseGroupForHeading(heading) {
    const axis = ((heading % Math.PI) + Math.PI) % Math.PI;
    return axis < Math.PI / 4 || axis >= (Math.PI * 3) / 4 ? 0 : 1;
  }

  _phaseSeconds(phaseGroup) {
    return (this.simulationTime - phaseGroup * SIGNAL_PHASE_OFFSET_SECONDS + SIGNAL_CYCLE_SECONDS) % SIGNAL_CYCLE_SECONDS;
  }

  _signalState(phaseGroup) {
    const phase = this._phaseSeconds(phaseGroup);
    if (phase < SIGNAL_GREEN_SECONDS) return 0;
    if (phase < SIGNAL_GREEN_SECONDS + SIGNAL_YELLOW_SECONDS) return 0.5;
    return 1;
  }

  _crosswalkPhaseSeconds(crosswalk) {
    return this._phaseSeconds(crosswalk.phaseGroup);
  }

  _crosswalkWalkState(crosswalk) {
    const phase = this._crosswalkPhaseSeconds(crosswalk);
    if (phase >= PED_WALK_START_SECONDS && phase < PED_WALK_START_SECONDS + PED_WALK_SECONDS) return 1;
    if (phase >= PED_WALK_START_SECONDS + PED_WALK_SECONDS &&
        phase < PED_WALK_START_SECONDS + PED_WALK_SECONDS + PED_CLEARANCE_SECONDS) {
      return 0.5;
    }
    return 0;
  }

  _trafficCarShouldStop(sample) {
    for (const light of this.trafficLights) {
      if (light.ruleState < 0.5) continue;
      const rel = this._relativeToHeading(sample.pos, sample.heading, light.pos);
      if (rel.forward > 0 && rel.forward < 16 && Math.abs(rel.lateral) < 7) return true;
    }

    for (const crosswalk of this.crosswalks) {
      if (crosswalk.occupiedState < 0.5) continue;
      const rel = this._relativeToHeading(sample.pos, sample.heading, crosswalk.pos);
      if (rel.forward > 0 && rel.forward < 13 && Math.abs(rel.lateral) < crosswalk.length / 2) return true;
    }

    return false;
  }

  _relativeToHeading(origin, heading, target) {
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    return {
      forward: dx * Math.sin(heading) + dz * Math.cos(heading),
      lateral: dx * Math.cos(heading) - dz * Math.sin(heading),
    };
  }

  _applySignalMaterial(light, state) {
    if (state === 0) {
      light.greenMat.color.setHex(0x00ff00);
      light.greenMat.emissive.setHex(0x00ff00);
      light.yellowMat.color.setHex(0x333300);
      light.yellowMat.emissive.setHex(0x000000);
      light.redMat.color.setHex(0x330000);
      light.redMat.emissive.setHex(0x000000);
      return;
    }

    if (state === 0.5) {
      light.greenMat.color.setHex(0x003300);
      light.greenMat.emissive.setHex(0x000000);
      light.yellowMat.color.setHex(0xffff00);
      light.yellowMat.emissive.setHex(0xffff00);
      light.redMat.color.setHex(0x330000);
      light.redMat.emissive.setHex(0x000000);
      return;
    }

    light.greenMat.color.setHex(0x003300);
    light.greenMat.emissive.setHex(0x000000);
    light.yellowMat.color.setHex(0x333300);
    light.yellowMat.emissive.setHex(0x000000);
    light.redMat.color.setHex(0xff0000);
    light.redMat.emissive.setHex(0xff0000);
  }

  _rightVector(heading) {
    return new Vector3(Math.cos(heading), 0, -Math.sin(heading));
  }
}

export { TrafficManager };
