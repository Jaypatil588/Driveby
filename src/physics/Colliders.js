import { worldToMapbox } from '../map/sfLayer.js';

const BOUNDS = {
  minLng: -122.404, maxLng: -122.393,
  minLat: 37.788,  maxLat: 37.797,
};

export function buildColliders(map, physicsWorld) {
  // --- building colliders ---
  const features = map.queryRenderedFeatures({ layers: ['3d-buildings'] });
  for (const f of features) {
    const h = f.properties?.height ?? 0;
    if (h < 3) continue; // skip lamp posts, kerbs

    // gather all ring coordinates from the polygon
    let coords = [];
    const geom = f.geometry;
    if (geom.type === 'Polygon') coords = geom.coordinates[0];
    else if (geom.type === 'MultiPolygon') coords = geom.coordinates[0][0];
    else continue;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [lng, lat] of coords) {
      const p = worldToMapbox(lng, lat, 0);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const halfW = (maxX - minX) / 2;
    const halfD = (maxZ - minZ) / 2;
    const halfH = h / 2;

    if (halfW < 1e-8 || halfD < 1e-8) continue;

    physicsWorld.addBoxCollider(cx, halfH, cz, halfW, halfH, halfD, true);
  }

  // --- four boundary walls so cars can't escape the SF block ---
  const minM = worldToMapbox(BOUNDS.minLng, BOUNDS.minLat, 0);
  const maxM = worldToMapbox(BOUNDS.maxLng, BOUNDS.maxLat, 0);
  
  const minX = Math.min(minM.x, maxM.x);
  const maxX = Math.max(minM.x, maxM.x);
  const minZ = Math.min(minM.z, maxM.z);
  const maxZ = Math.max(minM.z, maxM.z);

  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const hw = (maxX - minX) / 2;
  const hd = (maxZ - minZ) / 2;
  const thick = 2;
  const wallH = 20;

  // west wall
  physicsWorld.addBoxCollider(minX - thick, wallH, cz, thick, wallH, hd, true);
  // east wall
  physicsWorld.addBoxCollider(maxX + thick, wallH, cz, thick, wallH, hd, true);
  // north wall (minZ is north)
  physicsWorld.addBoxCollider(cx, wallH, minZ - thick, hw, wallH, thick, true);
  // south wall
  physicsWorld.addBoxCollider(cx, wallH, maxZ + thick, hw, wallH, thick, true);
}
