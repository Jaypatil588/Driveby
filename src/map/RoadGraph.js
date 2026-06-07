import { Vector3 } from 'three';
import roadData from './sfRoadData.json';
import { worldToMapbox } from './sfLayer.js';

export { roadData };

export class RoadGraph {
  constructor(data = roadData) {
    this.data = data;
    this.nodes = [];
    this.nodeById = new Map();
    this.adjacency = [];
    this._buildGraph(data.roads);

    if (this.nodes.length < 2) {
      throw new Error('RoadGraph requires at least two road nodes.');
    }
  }

  _getNode(nodeRef) {
    let nodeIdx = this.nodeById.get(nodeRef.id);
    if (nodeIdx !== undefined) return nodeIdx;

    const pos = worldToMapbox(nodeRef.lng, nodeRef.lat, 0);
    nodeIdx = this.nodes.length;
    this.nodes.push({
      id: nodeRef.id,
      lng: nodeRef.lng,
      lat: nodeRef.lat,
      pos,
    });
    this.nodeById.set(nodeRef.id, nodeIdx);
    this.adjacency.push([]);
    return nodeIdx;
  }

  _buildGraph(roads) {
    for (const road of roads) {
      if (!Number.isInteger(road.forwardLanes) || !Number.isInteger(road.backwardLanes)) {
        throw new Error(`Road ${road.id} is missing strict directional lane counts.`);
      }

      for (let i = 0; i < road.nodes.length - 1; i++) {
        const fromIdx = this._getNode(road.nodes[i]);
        const toIdx = this._getNode(road.nodes[i + 1]);
        if (fromIdx === toIdx) continue;

        if (road.forwardLanes > 0) this._addEdge(fromIdx, toIdx, road, road.forwardLanes);
        if (road.backwardLanes > 0) this._addEdge(toIdx, fromIdx, road, road.backwardLanes);
      }
    }
  }

  _addEdge(fromIdx, toIdx, road, laneCount) {
    const from = this.nodes[fromIdx].pos;
    const to = this.nodes[toIdx].pos;
    const length = from.distanceTo(to);
    if (length <= 0) throw new Error(`Road ${road.id} produced a zero-length graph edge.`);

    this.adjacency[fromIdx].push({
      from: fromIdx,
      to: toIdx,
      length,
      laneCount,
      roadId: road.id,
      roadName: road.name,
      highway: road.highway,
    });
  }

  findPath(startIdx, endIdx) {
    if (startIdx < 0 || startIdx >= this.nodes.length || endIdx < 0 || endIdx >= this.nodes.length) {
      throw new Error(`Invalid RoadGraph path indices: ${startIdx} -> ${endIdx}.`);
    }

    const openSet = [startIdx];
    const cameFrom = new Map();
    const cameEdge = new Map();
    const gScore = new Map([[startIdx, 0]]);
    const fScore = new Map([[startIdx, this.nodes[startIdx].pos.distanceTo(this.nodes[endIdx].pos)]]);

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
        const nodePath = [current];
        const edgePath = [];
        while (cameFrom.has(current)) {
          edgePath.unshift(cameEdge.get(current));
          current = cameFrom.get(current);
          nodePath.unshift(current);
        }
        return {
          nodeIndices: nodePath,
          path: nodePath.map((idx) => this.nodes[idx].pos),
          edges: edgePath,
        };
      }

      openSet.splice(lowestIdx, 1);

      for (const edge of this.adjacency[current]) {
        const tentativeG = (gScore.get(current) ?? 0) + edge.length;
        if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
          cameFrom.set(edge.to, current);
          cameEdge.set(edge.to, edge);
          gScore.set(edge.to, tentativeG);
          fScore.set(edge.to, tentativeG + this.nodes[edge.to].pos.distanceTo(this.nodes[endIdx].pos));
          if (!openSet.includes(edge.to)) openSet.push(edge.to);
        }
      }
    }

    throw new Error(`RoadGraph could not find a directed path from node ${startIdx} to node ${endIdx}.`);
  }

  getRandomNodeIdx() {
    return Math.floor(Math.random() * this.nodes.length);
  }

  getValidRoute(minDistance = 100, excludedStarts = new Set(), excludedEnds = new Set()) {
    for (let tries = 0; tries < 300; tries++) {
      const startIdx = this.getRandomNodeIdx();
      if (excludedStarts.has(startIdx)) continue;
      const endIdx = this.getRandomNodeIdx();
      if (excludedEnds.has(endIdx)) continue;
      if (startIdx === endIdx) continue;
      if (this.nodes[startIdx].pos.distanceTo(this.nodes[endIdx].pos) <= minDistance) continue;

      try {
        const route = this.findPath(startIdx, endIdx);
        if (route.path.length >= 2 && route.edges.length === route.path.length - 1) {
          return { startIdx, endIdx, ...route };
        }
      } catch (error) {
        if (!String(error.message).startsWith('RoadGraph could not find a directed path')) throw error;
      }
    }

    // fallback with relaxed exclusions if tight constraints cannot be satisfied
    for (let tries = 0; tries < 100; tries++) {
      const startIdx = this.getRandomNodeIdx();
      const endIdx = this.getRandomNodeIdx();
      if (startIdx === endIdx) continue;
      if (this.nodes[startIdx].pos.distanceTo(this.nodes[endIdx].pos) <= minDistance) continue;

      try {
        const route = this.findPath(startIdx, endIdx);
        if (route.path.length >= 2 && route.edges.length === route.path.length - 1) {
          return { startIdx, endIdx, ...route };
        }
      } catch (error) {
        if (!String(error.message).startsWith('RoadGraph could not find a directed path')) throw error;
      }
    }

    throw new Error(`RoadGraph could not produce a valid directed route after attempts with minDistance=${minDistance}.`);
  }
}

export function sampleRouteToWaypoints(route, spacing = 18) {
  if (!route || !Array.isArray(route.path) || !Array.isArray(route.edges) || route.path.length < 2) {
    throw new Error('sampleRouteToWaypoints requires a route with path and directed edges.');
  }
  if (route.edges.length !== route.path.length - 1) {
    throw new Error(`Route has ${route.path.length} points but ${route.edges.length} edges.`);
  }
  if (spacing <= 0) {
    throw new Error(`sampleRouteToWaypoints requires positive spacing, received ${spacing}.`);
  }

  const segments = [];
  let totalLength = 0;
  for (let i = 0; i < route.path.length - 1; i++) {
    const a = route.path[i];
    const b = route.path[i + 1];
    const len = a.distanceTo(b);
    if (len <= 0) throw new Error(`RoadGraph route has a zero-length segment at index ${i}.`);
    segments.push({ a, b, len, startDist: totalLength, edge: route.edges[i] });
    totalLength += len;
  }

  const count = Math.max(2, Math.ceil(totalLength / spacing) + 1);
  const step = totalLength / (count - 1);
  const waypoints = [];
  const waypointEdges = [];

  for (let i = 0; i < count; i++) {
    const targetDist = i * step;
    const seg = segments.find((candidate) => targetDist <= candidate.startDist + candidate.len) ?? segments[segments.length - 1];
    const t = (targetDist - seg.startDist) / seg.len;
    waypoints.push(new Vector3().lerpVectors(seg.a, seg.b, t));
    if (i > 0) waypointEdges.push(seg.edge);
  }

  return { waypoints, waypointEdges };
}
