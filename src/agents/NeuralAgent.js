import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';
import { samplePathToWaypoints } from '../map/RoadGraph.js';

const MAX_SPEED_MS = 14;

export class NeuralAgent {
  constructor(id, scene, hue, roadGraph) {
    this.id = id;
    this.scene = scene;
    this.roadGraph = roadGraph;
    
    // Agent identity
    this.generation = 1;
    this.score = 0.0;
    this.bestScore = -9999.0;
    
    // Status flags
    this.collided = false;
    this.reachedWaypoint = false;
    
    // Active states
    this.speed = 0.0;
    this.heading = 0.0;
    this.pos = new THREE.Vector3();
    this.lng = 0.0;
    this.lat = 0.0;
    
    // Route states
    this.waypoints = [];
    this.currentWpIdx = 0;
    this.targetWp = null;
    
    // 3D Mesh
    this._color = new THREE.Color().setHSL(hue, 0.9, 0.55);
    this.mesh = null;
    this._spawnMesh();

    // Reset to a starting point along a valid A* path
    this.reset();
  }

  reset() {
    this.speed = 0.0;
    this.collided = false;
    this.reachedWaypoint = false;
    this.score = 0.0;

    // Retrieve a valid road-aligned A* route from the graph
    const route = this.roadGraph.getValidRoute();
    this.waypoints = samplePathToWaypoints(route.path, 20);
    
    // Spawn exactly at the start node (centerline)
    this.pos.copy(this.waypoints[0]);
    this.currentWpIdx = 1;
    this.targetWp = this.waypoints[1];

    // Compute heading towards the first waypoint
    const dir = new THREE.Vector3().subVectors(this.targetWp, this.pos);
    this.heading = Math.atan2(dir.x, -dir.y); // align with map coordinates

    // Convert Mercator back to real-world Lng/Lat for follow camera support
    const mc = new maplibregl.MercatorCoordinate(this.pos.x, this.pos.y, this.pos.z);
    const lngLat = mc.toLngLat();
    this.lng = lngLat.lng;
    this.lat = lngLat.lat;

    this._syncMesh();
  }

  _spawnMesh() {
    const m = mercatorScale();
    const boxW = 3.6 * m;
    const boxD = 1.8 * m;
    const boxH = 1.5 * m;
    const geo = new THREE.BoxGeometry(boxW, boxD, boxH);
    const mat = new THREE.MeshPhongMaterial({
      color: this._color,
      emissive: this._color.clone().multiplyScalar(0.12),
      shininess: 70
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.mesh);
  }

  _syncMesh() {
    if (this.mesh) {
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z + 0.75 * mercatorScale());
      this.mesh.rotation.set(0, 0, -this.heading + Math.PI / 2);
    }
  }

  applyAction({ throttle, steering, brake }) {
    const m = mercatorScale();
    const maxSpd = m * MAX_SPEED_MS;
    const accel = m * 6;
    const timeStep = 1 / 60; // 60Hz step
    
    if (throttle > 0) {
      this.speed += throttle * accel * timeStep;
    }
    if (brake > 0) {
      this.speed -= brake * accel * timeStep * 1.5;
    }
    
    if (throttle === 0 && brake === 0) {
      this.speed -= Math.sign(this.speed) * m * 2 * timeStep;
      if (Math.abs(this.speed) < 0.25 * m) this.speed = 0;
    }
    
    this.speed = THREE.MathUtils.clamp(this.speed, -maxSpd * 0.2, maxSpd);

    if (Math.abs(this.speed) > 0.05 * m) {
      this.heading += steering * 1.8 * (this.speed / maxSpd) * timeStep;
    }
  }

  update(delta, allAgents, environment) {
    const m = mercatorScale();

    // Advance position kinematically using lat/lng
    const distM = (this.speed * delta) / m;
    const M_PER_DEG_LAT = 111320;
    const M_PER_DEG_LNG = 111320 * Math.cos(this.lat * Math.PI / 180);
    
    this.lat += (Math.cos(this.heading) * distM) / M_PER_DEG_LAT;
    this.lng += (Math.sin(this.heading) * distM) / M_PER_DEG_LNG;
    
    const p = worldToMap(this.lng, this.lat, 0);
    this.pos.copy(p);

    this._syncMesh();

    // Time step penalty (discourages idling)
    this.score -= 0.01;
    
    // --- Waypoint Navigation ---
    const distToWp = this.pos.distanceTo(this.targetWp);
    if (distToWp < 14 * m) {
      this.score += 100.0; // Waypoint success reward
      this.reachedWaypoint = true;
      
      if (this.currentWpIdx < 19) {
        this.currentWpIdx++;
        this.targetWp = this.waypoints[this.currentWpIdx];
      } else {
        // Route complete: receive route completion reward and pick new A* route
        this.score += 200.0;
        
        // Target a new A* route starting from current location node
        let closestNodeIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < this.roadGraph.nodes.length; i++) {
          const d = this.pos.distanceTo(this.roadGraph.nodes[i]);
          if (d < minDist) {
            minDist = d;
            closestNodeIdx = i;
          }
        }
        
        // Find new random destination index
        let endIdx = this.roadGraph.getRandomNodeIdx();
        while (endIdx === closestNodeIdx) {
          endIdx = this.roadGraph.getRandomNodeIdx();
        }
        
        const path = this.roadGraph.findPath(closestNodeIdx, endIdx);
        if (path && path.length >= 2) {
          this.waypoints = samplePathToWaypoints(path, 20);
        }
        
        this.currentWpIdx = 1;
        this.targetWp = this.waypoints[1];
      }
    }

    // --- Obstacle/Collision checks ---
    this._checkCollisions(allAgents, environment);
  }

  _checkCollisions(allAgents, environment) {
    const m = mercatorScale();

    // 1. Check boundary walls
    const bounds = {
      minLng: -122.404, maxLng: -122.393,
      minLat: 37.788,  maxLat: 37.797
    };
    const minM = worldToMap(bounds.minLng, bounds.minLat, 0);
    const maxM = worldToMap(bounds.maxLng, bounds.maxLat, 0);
    const minX = minM.x, maxX = maxM.x;
    const minY = maxM.y, maxY = minM.y;

    if (this.pos.x < minX || this.pos.x > maxX || this.pos.y < minY || this.pos.y > maxY) {
      this.collided = true;
      this.score -= 100.0; // Collision penalty
      return;
    }

    // 2. Check overlap with building bounding boxes
    if (window.buildingObstacles) {
      const padding = 1.1 * m;
      for (const b of window.buildingObstacles) {
        if (this.pos.x >= b.minX - padding && this.pos.x <= b.maxX + padding &&
            this.pos.y >= b.minY - padding && this.pos.y <= b.maxY + padding) {
          this.collided = true;
          this.score -= 100.0; // Collision penalty
          return;
        }
      }
    }

    // 3. Check other vehicles
    const carRadius = 3.2 * m;
    for (const other of allAgents) {
      if (other.id === this.id) continue;
      if (this.pos.distanceTo(other.pos) < carRadius) {
        this.collided = true;
        this.score -= 100.0; // Collision penalty
        return;
      }
    }

    // 4. Check pedestrians
    const pedRadius = 1.6 * m;
    if (environment && environment._peds) {
      for (const ped of environment._peds) {
        if (this.pos.distanceTo(ped.position) < pedRadius) {
          this.collided = true;
          this.score -= 100.0; // Collision penalty
          return;
        }
      }
    }
  }

  // --- Compile the 16-Dimensional State Vector ---
  getStateVector(allAgents, environment) {
    const m = mercatorScale();
    const state = [];

    // 1. Ego state (2 dims)
    state.push(this.speed / (MAX_SPEED_MS * m)); // normalized speed
    state.push(this.heading / (Math.PI * 2));    // normalized heading

    // 2. Nav target (2 dims)
    const distToWp = this.pos.distanceTo(this.targetWp);
    state.push(Math.min(distToWp / (100 * m), 1.0)); // normalized distance

    const angleToWp = Math.atan2(this.targetWp.y - this.pos.y, this.targetWp.x - this.pos.x) - (Math.PI / 2 - this.heading);
    let relWpAngle = Math.atan2(Math.sin(angleToWp), Math.cos(angleToWp));
    state.push(relWpAngle / Math.PI); // normalized relative angle

    // 3. Surrounding Assets (12 dims: top 3 closest assets)
    const detectedAssets = [];

    // Scan buildings (static assets - type 1.0 in modular_agent.md)
    if (window.buildingObstacles) {
      for (const b of window.buildingObstacles) {
        const bPos = new THREE.Vector3(b.cx, b.cy, 0);
        const dist = this.pos.distanceTo(bPos);
        if (dist < 45 * m) {
          const angle = Math.atan2(b.cy - this.pos.y, b.cx - this.pos.x) - (Math.PI / 2 - this.heading);
          const relAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
          detectedAssets.push({
            type: 1.0, // Building/Curb
            dist: dist / (50 * m),
            angle: relAngle / Math.PI,
            ruleState: -1.0 // static obstacle
          });
        }
      }
    }

    // Scan pedestrians (dynamic assets - type 4.0)
    if (environment && environment._peds) {
      for (const ped of environment._peds) {
        const dist = this.pos.distanceTo(ped.position);
        if (dist < 45 * m) {
          const angle = Math.atan2(ped.position.y - this.pos.y, ped.position.x - this.pos.x) - (Math.PI / 2 - this.heading);
          const relAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
          detectedAssets.push({
            type: 4.0, // Pedestrian
            dist: dist / (50 * m),
            angle: relAngle / Math.PI,
            ruleState: -1.0 // obstacle
          });
        }
      }
    }

    // Scan other agents (dynamic assets - type 3.0)
    for (const other of allAgents) {
      if (other.id === this.id) continue;
      const dist = this.pos.distanceTo(other.pos);
      if (dist < 45 * m) {
        const angle = Math.atan2(other.pos.y - this.pos.y, other.pos.x - this.pos.x) - (Math.PI / 2 - this.heading);
        const relAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
        detectedAssets.push({
          type: 3.0, // Vehicle
          dist: dist / (50 * m),
          angle: relAngle / Math.PI,
          ruleState: -1.0 // obstacle
        });
      }
    }

    // Sort by normalized distance
    detectedAssets.sort((a, b) => a.dist - b.dist);

    // Take top 3 and populate state
    for (let i = 0; i < 3; i++) {
      if (i < detectedAssets.length) {
        const asset = detectedAssets[i];
        state.push(asset.type);
        state.push(asset.dist);
        state.push(asset.angle);
        state.push(asset.ruleState);
      } else {
        // Padding
        state.push(0.0);
        state.push(0.0);
        state.push(0.0);
        state.push(0.0);
      }
    }

    return state;
  }

  getState() {
    return {
      lng: this.lng,
      lat: this.lat,
      heading: this.heading,
      speed: this.speed / mercatorScale() // in m/s
    };
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}
