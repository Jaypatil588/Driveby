import maplibregl from 'maplibre-gl';
import { mercatorScale } from '../map/sfLayer.js';

const BOUNDS = {
  minLng: -122.404, maxLng: -122.393,
  minLat: 37.788,  maxLat: 37.797,
};

// Convert lng/lat to flat mercator X/Y (z=0)
function toMerc(lng, lat) {
  const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
  return { x: mc.x, y: mc.y };
}

export function buildColliders(map, physicsWorld) {
  const m = mercatorScale();

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

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [lng, lat] of coords) {
      const { x, y } = toMerc(lng, lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfW = (maxX - minX) / 2;
    const halfD = (maxY - minY) / 2;
    const halfH = m * (h / 2);

    if (halfW < 1e-8 || halfD < 1e-8) continue;

    physicsWorld.addBoxCollider(cx, cy, halfH, halfW, halfH, halfD);
  }

  // --- four boundary walls so cars can't escape the SF block ---
  const minM = toMerc(BOUNDS.minLng, BOUNDS.minLat);
  const maxM = toMerc(BOUNDS.maxLng, BOUNDS.maxLat);
  const cx = (minM.x + maxM.x) / 2;
  const cy = (minM.y + maxM.y) / 2;
  const hw = (maxM.x - minM.x) / 2;
  const hh = (maxM.y - minM.y) / 2;
  const thick = m * 2;
  const wallH = m * 20;

  // west wall
  physicsWorld.addBoxCollider(minM.x, cy, wallH, thick, hh, wallH);
  // east wall
  physicsWorld.addBoxCollider(maxM.x, cy, wallH, thick, hh, wallH);
  // south wall
  physicsWorld.addBoxCollider(cx, minM.y, wallH, hw, thick, wallH);
  // north wall
  physicsWorld.addBoxCollider(cx, maxM.y, wallH, hw, thick, wallH);
}
