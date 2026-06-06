import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import { worldToMap, mercatorScale } from './sfLayer.js';

// Places street lights, footpaths, trees and pedestrians along the real SF
// road network queried from the map's vector tiles.
export class Environment {
  constructor(map, scene) {
    this.map = map;
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this._peds = [];          // animated pedestrians
    this._m = mercatorScale();
  }

  build() {
    const roads = this._queryRoads();
    if (!roads.length) return;

    this._addFootpaths(roads);
    this._addStreetLights(roads);
    this._addTrees(roads);
    this._addPedestrians(roads);
  }

  // --- gather road centrelines as arrays of mercator points ---
  _queryRoads() {
    const layers = this.map.getStyle().layers
      .filter(l => l.type === 'line' && /road|transportation|street/i.test(l.id))
      .map(l => l.id);

    let feats = [];
    try {
      feats = this.map.queryRenderedFeatures({ layers });
    } catch {
      try { feats = this.map.queryRenderedFeatures(); } catch { feats = []; }
    }

    const lines = [];
    for (const f of feats) {
      const g = f.geometry;
      if (g.type === 'LineString') lines.push(g.coordinates);
      else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
    }
    return lines.map(coords => coords.map(([lng, lat]) => worldToMap(lng, lat, 0)));
  }

  // sample evenly-spaced points along a polyline, with the local direction
  _sampleAlong(line, spacingM) {
    const m = this._m;
    const spacing = spacingM * m;
    const out = [];
    let carry = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const seg = new THREE.Vector3().subVectors(b, a);
      const segLen = seg.length();
      if (segLen < 1e-9) continue;
      const dir = seg.clone().normalize();
      let t = carry;
      while (t < segLen) {
        out.push({ pos: a.clone().addScaledVector(dir, t), dir });
        t += spacing;
      }
      carry = t - segLen;
    }
    return out;
  }

  _addFootpaths(roads) {
    const m = this._m;
    const mat = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.95 });
    const walkW = 2.5 * m;     // footpath width
    const offset = 7 * m;       // distance from road centreline to footpath
    const up = new THREE.Vector3(0, 0, 1);

    for (const line of roads) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        const seg = new THREE.Vector3().subVectors(b, a);
        const len = seg.length();
        if (len < 0.5 * m) continue;
        const dir = seg.clone().normalize();
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();

        for (const s of [1, -1]) {
          const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, walkW), mat);
          const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(side, s * offset);
          strip.position.copy(mid);
          strip.position.z = 0.02 * m;
          strip.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
          this.group.add(strip);
        }
      }
    }
  }

  _addStreetLights(roads) {
    const m = this._m;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, metalness: 0.6, roughness: 0.5 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffdd88, emissiveIntensity: 2.0 });
    const poleGeo = new THREE.CylinderGeometry(0.12 * m, 0.15 * m, 6 * m, 8);
    poleGeo.rotateX(Math.PI / 2);          // stand upright (Z-up)
    const armGeo  = new THREE.BoxGeometry(1.5 * m, 0.15 * m, 0.15 * m);
    const bulbGeo = new THREE.SphereGeometry(0.35 * m, 8, 8);
    const up = new THREE.Vector3(0, 0, 1);
    const offset = 7.5 * m;

    for (const line of roads) {
      const pts = this._sampleAlong(line, 35); // a lamp every ~35 m
      for (const { pos, dir } of pts) {
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        for (const s of [1, -1]) {
          const base = pos.clone().addScaledVector(side, s * offset);

          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.copy(base); pole.position.z = 3 * m;
          this.group.add(pole);

          const arm = new THREE.Mesh(armGeo, poleMat);
          arm.position.copy(base).addScaledVector(side, -s * 0.75 * m);
          arm.position.z = 5.8 * m;
          this.group.add(arm);

          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.copy(base).addScaledVector(side, -s * 1.4 * m);
          bulb.position.z = 5.7 * m;
          this.group.add(bulb);
        }
      }
    }
  }

  _addTrees(roads) {
    const m = this._m;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a21, roughness: 0.9 });
    const leafMat  = new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.8 });
    const trunkGeo = new THREE.CylinderGeometry(0.2 * m, 0.25 * m, 3 * m, 6);
    trunkGeo.rotateX(Math.PI / 2);
    const leafGeo  = new THREE.IcosahedronGeometry(1.6 * m, 0);
    const up = new THREE.Vector3(0, 0, 1);
    const offset = 9 * m;

    for (const line of roads) {
      const pts = this._sampleAlong(line, 55); // sparser than lamps
      for (const { pos, dir } of pts) {
        if (Math.random() > 0.6) continue;
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        const s = Math.random() < 0.5 ? 1 : -1;
        const base = pos.clone().addScaledVector(side, s * offset);

        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.copy(base); trunk.position.z = 1.5 * m;
        this.group.add(trunk);

        const leaves = new THREE.Mesh(leafGeo, leafMat);
        leaves.position.copy(base); leaves.position.z = 3.6 * m;
        this.group.add(leaves);
      }
    }
  }

  _addPedestrians(roads) {
    const m = this._m;
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const up = new THREE.Vector3(0, 0, 1);
    const offset = 7 * m;

    for (const line of roads) {
      const pts = this._sampleAlong(line, 25);
      for (const { pos, dir } of pts) {
        if (Math.random() > 0.35) continue; // sparse
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        const s = Math.random() < 0.5 ? 1 : -1;
        const base = pos.clone().addScaledVector(side, s * offset);

        // a little capsule person
        const ped = new THREE.Group();
        const mat = bodyMat.clone();
        mat.color = new THREE.Color().setHSL(Math.random(), 0.5, 0.5);
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25 * m, 0.9 * m, 4, 8), mat);
        body.rotation.x = Math.PI / 2;
        body.position.z = 0.9 * m;
        ped.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * m, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xe0b48a }));
        head.position.z = 1.6 * m;
        ped.add(head);

        ped.position.copy(base);
        // walk back and forth along the footpath direction
        ped.userData = {
          dir: dir.clone(),
          phase: Math.random() * Math.PI * 2,
          range: (3 + Math.random() * 6) * m,
          home: base.clone(),
          speed: 0.5 + Math.random(),
        };
        this.group.add(ped);
        this._peds.push(ped);
      }
    }
  }

  // animate pedestrians each frame
  update(delta) {
    for (const ped of this._peds) {
      const u = ped.userData;
      u.phase += delta * u.speed;
      const d = Math.sin(u.phase) * u.range;
      ped.position.copy(u.home).addScaledVector(u.dir, d);
    }
  }
}
