import * as THREE from 'three';
import { worldToMapbox } from './sfLayer.js';

const ROUTE_COORDS = [
  [
    [-122.4005, 37.7916],
    [-122.3988, 37.7916],
    [-122.3975, 37.7916],
    [-122.3962, 37.7924],
    [-122.3968, 37.7940],
    [-122.3972, 37.7955],
    [-122.3983, 37.7948],
    [-122.3997, 37.7943],
    [-122.4000, 37.7945],
    [-122.4005, 37.7916],
  ],
  [
    [-122.3988, 37.7916],
    [-122.3995, 37.7930],
    [-122.3980, 37.7935],
    [-122.3985, 37.7950],
    [-122.3983, 37.7948],
  ],
  [
    [-122.3975, 37.7916],
    [-122.3978, 37.7928],
    [-122.3970, 37.7953],
    [-122.3958, 37.7960],
  ],
  [
    [-122.4005, 37.7916],
    [-122.3993, 37.7922],
    [-122.4010, 37.7938],
    [-122.4002, 37.7963],
  ],
];

export class RoadGraph {
  constructor(routes = ROUTE_COORDS) {
    this.nodes = [];
    this.adjacency = [];
    this._buildGraph(routes.map((route) => route.map(([lng, lat]) => worldToMapbox(lng, lat, 0))));

    if (this.nodes.length < 2) {
      throw new Error('RoadGraph requires at least two road nodes.');
    }
  }

  _buildGraph(roads) {
    const threshold = 8;

    for (const polyline of roads) {
      let prevIdx = -1;

      for (const pt of polyline) {
        let nodeIdx = this._findCloseNode(pt, threshold);

        if (nodeIdx === -1) {
          this.nodes.push(pt.clone());
          nodeIdx = this.nodes.length - 1;
          this.adjacency.push([]);
        }

        if (prevIdx !== -1 && prevIdx !== nodeIdx) {
          if (!this.adjacency[prevIdx].includes(nodeIdx)) this.adjacency[prevIdx].push(nodeIdx);
          if (!this.adjacency[nodeIdx].includes(prevIdx)) this.adjacency[nodeIdx].push(prevIdx);
        }

        prevIdx = nodeIdx;
      }
    }
  }

  _findCloseNode(pt, threshold) {
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].distanceTo(pt) < threshold) return i;
    }
    return -1;
  }

  findPath(startIdx, endIdx) {
    if (startIdx < 0 || startIdx >= this.nodes.length || endIdx < 0 || endIdx >= this.nodes.length) {
      throw new Error(`Invalid RoadGraph path indices: ${startIdx} -> ${endIdx}.`);
    }

    const openSet = [startIdx];
    const cameFrom = new Map();
    const gScore = new Map([[startIdx, 0]]);
    const fScore = new Map([[startIdx, this.nodes[startIdx].distanceTo(this.nodes[endIdx])]]);

    while (openSet.length > 0) {
      let current = openSet[0];
      let lowestF = fScore.get(current) ?? Infinity;
      let lowestIdx = 0;

      for (let i = 1; i < openSet.length; i++) {
        const f = fScore.get(openSet[i]) ?? Infinity;
        if (f < lowestF) {
          current = openSet[i];
          lowestF = f;
          lowestIdx = i;
        }
      }

      if (current === endIdx) {
        const path = [current];
        while (cameFrom.has(current)) {
          current = cameFrom.get(current);
          path.unshift(current);
        }
        return path.map((idx) => this.nodes[idx]);
      }

      openSet.splice(lowestIdx, 1);

      for (const neighbor of this.adjacency[current]) {
        const tentativeG = (gScore.get(current) ?? 0) + this.nodes[current].distanceTo(this.nodes[neighbor]);
        if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentativeG);
          fScore.set(neighbor, tentativeG + this.nodes[neighbor].distanceTo(this.nodes[endIdx]));
          if (!openSet.includes(neighbor)) openSet.push(neighbor);
        }
      }
    }

    throw new Error(`RoadGraph could not find a path from node ${startIdx} to node ${endIdx}.`);
  }

  getRandomNodeIdx() {
    return Math.floor(Math.random() * this.nodes.length);
  }

  getValidRoute() {
    for (let tries = 0; tries < 100; tries++) {
      const startIdx = this.getRandomNodeIdx();
      const endIdx = this.getRandomNodeIdx();
      if (startIdx === endIdx) continue;
      if (this.nodes[startIdx].distanceTo(this.nodes[endIdx]) <= 60) continue;

      const path = this.findPath(startIdx, endIdx);
      if (path.length >= 2) return { startIdx, endIdx, path };
    }

    throw new Error('RoadGraph could not produce a valid route after 100 attempts.');
  }
}

export function samplePathToWaypoints(path, count = 20) {
  if (!Array.isArray(path) || path.length < 2) {
    throw new Error('samplePathToWaypoints requires a path with at least two points.');
  }

  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = a.distanceTo(b);
    if (len <= 0) throw new Error(`RoadGraph path has a zero-length segment at index ${i}.`);
    segments.push({ a, b, len, startDist: totalLength });
    totalLength += len;
  }

  const step = totalLength / (count - 1);
  const waypoints = [];

  for (let i = 0; i < count; i++) {
    const targetDist = i * step;
    const seg = segments.find((candidate) => targetDist <= candidate.startDist + candidate.len) ?? segments[segments.length - 1];
    const t = (targetDist - seg.startDist) / seg.len;
    waypoints.push(new THREE.Vector3().lerpVectors(seg.a, seg.b, t));
  }

  return waypoints;
}
