import * as THREE from 'three';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';

// ── Exported constants (used by perception.py and AgentManager) ───────────────
export const ASSET_TYPE = { STATIC: 0, TRAFFIC_LIGHT: 1, VEHICLE: 2, PEDESTRIAN: 3, SIGN: 4 };
export const SIGN_TYPE  = { STOP: 0, YIELD: 1 };

// Traffic light phase sequence: green → yellow → red → repeat
const PHASES = [
  { duration: 25, state:  1.0, hex: 0x00dd44 },
  { duration:  4, state:  0.0, hex: 0xffcc00 },
  { duration: 25, state: -1.0, hex: 0xff2222 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function normAngle(a) {
  while (a >  Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Returns relative angle (0=N, +cw heading convention) and Euclidean distance
// from ego mercator position to asset mercator position.
function toEgo(ex, ey, ax, ay, egoHeading) {
  const dx = ax - ex, dy = ay - ey;
  return {
    dist: Math.sqrt(dx * dx + dy * dy),
    rel:  normAngle(Math.atan2(dx, -dy) - egoHeading),
  };
}

// ── TrafficLight ──────────────────────────────────────────────────────────────
class TrafficLight {
  constructor(lng, lat, scene, phaseOffset) {
    const m       = mercatorScale();
    this.pos      = worldToMap(lng, lat, 0);
    this._phase   = phaseOffset % PHASES.length;
    this._timer   = 0;
    this._bulbMats = [];
    this.state    = PHASES[this._phase].state;
    this.timeLeft = PHASES[this._phase].duration;
    this.mesh     = this._build(scene, m);
    this._syncLights();
  }

  _build(scene, m) {
    const g = new THREE.Group();

    const poleGeo = new THREE.CylinderGeometry(m * 0.3, m * 0.3, m * 8, 8);
    poleGeo.rotateX(Math.PI / 2);
    const pole = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x444444 }));
    pole.position.z = m * 4;
    g.add(pole);

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(m * 2.5, m * 2.5, m * 3),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    );
    housing.position.z = m * 9.5;
    g.add(housing);

    // Bulbs order in mesh: 0=red(top), 1=yellow(mid), 2=green(bot)
    const bulbColors  = [0xff2222, 0xffcc00, 0x00dd44];
    const bulbOffsets = [m * 1.0, 0, -m * 1.0];
    bulbColors.forEach((col, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: 0x000000, emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(m * 0.7, 8, 8), mat);
      bulb.position.z = m * 9.5 + bulbOffsets[i];
      g.add(bulb);
      this._bulbMats.push(mat);
    });

    g.position.copy(this.pos);
    scene.add(g);
    return g;
  }

  _syncLights() {
    // PHASES[0]=green → light bulb index 2; [1]=yellow → 1; [2]=red → 0
    const litIdx  = [2, 1, 0][this._phase];
    const hexes   = [0xff2222, 0xffcc00, 0x00dd44];
    this._bulbMats.forEach((mat, i) => {
      mat.emissiveIntensity = i === litIdx ? 2.0 : 0;
      mat.emissive.setHex(i === litIdx ? hexes[i] : 0x000000);
    });
  }

  update(delta) {
    this._timer += delta;
    if (this._timer >= PHASES[this._phase].duration) {
      this._timer -= PHASES[this._phase].duration;
      this._phase  = (this._phase + 1) % PHASES.length;
      this._syncLights();
    }
    this.state    = PHASES[this._phase].state;
    this.timeLeft = PHASES[this._phase].duration - this._timer;
  }

  getRawArray(ex, ey, eH) {
    const { dist, rel } = toEgo(ex, ey, this.pos.x, this.pos.y, eH);
    return [ASSET_TYPE.TRAFFIC_LIGHT, rel, this.pos.x, this.pos.y, 0.0, dist, this.state, this.timeLeft];
  }
}

// ── Pedestrian ────────────────────────────────────────────────────────────────
class Pedestrian {
  constructor(lng0, lat0, lng1, lat1, scene) {
    const m      = mercatorScale();
    this._a      = worldToMap(lng0, lat0, 0);
    this._b      = worldToMap(lng1, lat1, 0);
    this._t      = Math.random();
    this._dir    = 1;
    this.pos     = this._a.clone();
    this.speed   = 1.4 * m;
    this.heading = 0;
    this.onCrosswalk = 1;
    this.mesh    = this._build(scene, m);
    this._syncPos();
  }

  _build(scene, m) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(m * 2, m * 2, m * 4),
      new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.9 })
    );
    mesh.position.z = m * 2;
    scene.add(mesh);
    return mesh;
  }

  _syncPos() {
    const dx = this._b.x - this._a.x;
    const dy = this._b.y - this._a.y;
    this.pos.set(this._a.x + dx * this._t, this._a.y + dy * this._t, 0);
    this.heading = Math.atan2(dx * this._dir, -dy * this._dir);
    if (this.mesh) this.mesh.position.set(this.pos.x, this.pos.y, this.mesh.position.z);
  }

  update(delta) {
    const dx  = this._b.x - this._a.x;
    const dy  = this._b.y - this._a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this._t  += (this._dir * this.speed * delta) / len;
    if (this._t >= 1) { this._t = 1; this._dir = -1; }
    if (this._t <= 0) { this._t = 0; this._dir =  1; }
    this._syncPos();
  }

  getRawArray(ex, ey, eH) {
    const { dist, rel } = toEgo(ex, ey, this.pos.x, this.pos.y, eH);
    return [ASSET_TYPE.PEDESTRIAN, rel, this.pos.x, this.pos.y, this.speed, dist, this.heading, this.onCrosswalk];
  }
}

// ── RegulatorySign ────────────────────────────────────────────────────────────
class RegulatorySign {
  constructor(lng, lat, type, scene) {
    const m   = mercatorScale();
    this.pos  = worldToMap(lng, lat, 0);
    this.type = type;
    this.mesh = this._build(scene, m);
  }

  _build(scene, m) {
    const g = new THREE.Group();

    const poleGeo = new THREE.CylinderGeometry(m * 0.25, m * 0.25, m * 6, 6);
    poleGeo.rotateX(Math.PI / 2);
    const pole = new THREE.Mesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole.position.z = m * 3;
    g.add(pole);

    const face = new THREE.Mesh(
      new THREE.BoxGeometry(m * 2.5, m * 0.5, m * 2.5),
      new THREE.MeshStandardMaterial({ color: this.type === SIGN_TYPE.STOP ? 0xcc0000 : 0xffffff })
    );
    face.position.z = m * 6.5;
    g.add(face);

    g.position.copy(this.pos);
    scene.add(g);
    return g;
  }

  getRawArray(ex, ey, eH) {
    const { dist, rel } = toEgo(ex, ey, this.pos.x, this.pos.y, eH);
    return [ASSET_TYPE.SIGN, rel, this.pos.x, this.pos.y, 0.0, dist, this.type];
  }
}

// ── StaticObstacle ────────────────────────────────────────────────────────────
// No mesh — buildings are rendered by Mapbox; these exist only for the obs system.
class StaticObstacle {
  constructor(lng, lat) {
    this.pos = worldToMap(lng, lat, 0);
  }

  getRawArray(ex, ey, eH) {
    const { dist, rel } = toEgo(ex, ey, this.pos.x, this.pos.y, eH);
    return [ASSET_TYPE.STATIC, rel, this.pos.x, this.pos.y, 0.0, dist];
  }
}

// ── World data — real SF Financial District ───────────────────────────────────
// [lng, lat, phaseOffset]
const LIGHT_DATA = [
  [-122.3988, 37.7916, 0],  // Market & 1st
  [-122.4005, 37.7916, 1],  // Market & New Montgomery
  [-122.3975, 37.7916, 2],  // Market & Fremont
  [-122.3988, 37.7941, 0],  // 1st & Mission
  [-122.4005, 37.7941, 1],  // New Montgomery & Mission
  [-122.3975, 37.7941, 2],  // Fremont & Mission
  [-122.3988, 37.7956, 0],  // 1st & Howard
  [-122.4005, 37.7956, 1],  // 2nd & Howard
];

// [lng0, lat0, lng1, lat1] — pedestrian patrols between these two crosswalk ends
const PED_DATA = [
  [-122.3990, 37.7916, -122.3986, 37.7916],  // Market & 1st, E–W
  [-122.3988, 37.7914, -122.3988, 37.7918],  // Market & 1st, N–S
  [-122.4007, 37.7941, -122.4003, 37.7941],  // New Montgomery & Mission
  [-122.3988, 37.7939, -122.3988, 37.7943],  // 1st & Mission, N–S
  [-122.3977, 37.7941, -122.3973, 37.7941],  // Fremont & Mission
  [-122.3988, 37.7954, -122.3988, 37.7958],  // 1st & Howard, N–S
  [-122.4007, 37.7956, -122.4003, 37.7956],  // 2nd & Howard
];

// [lng, lat, SIGN_TYPE]
const SIGN_DATA = [
  [-122.3995, 37.7920, SIGN_TYPE.STOP],
  [-122.3980, 37.7928, SIGN_TYPE.STOP],
  [-122.4012, 37.7945, SIGN_TYPE.YIELD],
  [-122.3965, 37.7950, SIGN_TYPE.STOP],
];

// Mid-block curb/debris positions (observation system only, no mesh)
const STATIC_DATA = [
  [-122.3993, 37.7923],
  [-122.3978, 37.7932],
  [-122.4001, 37.7948],
  [-122.3969, 37.7958],
];

// ── AssetManager ──────────────────────────────────────────────────────────────
export class AssetManager {
  constructor(scene) {
    this._lights  = LIGHT_DATA.map(([lng, lat, off]) => new TrafficLight(lng, lat, scene, off));
    this._peds    = PED_DATA.map(([l0, a0, l1, a1]) => new Pedestrian(l0, a0, l1, a1, scene));
    this._signs   = SIGN_DATA.map(([lng, lat, type]) => new RegulatorySign(lng, lat, type, scene));
    this._statics = STATIC_DATA.map(([lng, lat]) => new StaticObstacle(lng, lat));
  }

  update(delta) {
    for (const l of this._lights) l.update(delta);
    for (const p of this._peds)   p.update(delta);
  }

  // Returns all non-vehicle asset raw arrays sorted by distance from the ego
  // mercator position. egoHeading: radians, 0=N, +cw.
  getRawArraysFor(egoX, egoY, egoHeading) {
    const out = [];
    for (const a of this._lights)  out.push(a.getRawArray(egoX, egoY, egoHeading));
    for (const a of this._peds)    out.push(a.getRawArray(egoX, egoY, egoHeading));
    for (const a of this._signs)   out.push(a.getRawArray(egoX, egoY, egoHeading));
    for (const a of this._statics) out.push(a.getRawArray(egoX, egoY, egoHeading));
    out.sort((a, b) => a[5] - b[5]);  // index 5 = distance in every base array
    return out;
  }

  dispose(scene) {
    [...this._lights, ...this._peds, ...this._signs].forEach(a => scene.remove(a.mesh));
  }
}
