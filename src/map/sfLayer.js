import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import { SF_CENTER } from './mapbox.js';

// Converts lng/lat/altitude to Three.js world coordinates aligned with MapLibre
export function worldToMap(lng, lat, altitude = 0) {
  const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new THREE.Vector3(mc.x, mc.y, mc.z);
}

// Converts a MercatorCoordinate scale to metres (approx at SF latitude)
export function mercatorScale() {
  const mc = maplibregl.MercatorCoordinate.fromLngLat(SF_CENTER, 0);
  return mc.meterInMercatorCoordinateUnits();
}

class SFLayer {
  constructor() {
    this.id = 'sf-three-layer';
    this.type = 'custom';
    this.renderingMode = '3d';

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.renderer = null;
    this.map = null;

    // Per-frame callback (driving + camera). Runs INSIDE render() so the car
    // position and the map matrix are always computed for the same frame —
    // this is what removes the jitter from a separate rAF loop.
    this.onFrame = null;
    this._lastTime = performance.now();
  }

  onAdd(map, gl) {
    this.map = map;

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Daylight: warm sun + sky-blue fill + bright ambient
    const sun = new THREE.DirectionalLight(0xfff4e0, 3.0);
    sun.position.set(0.6, -0.8, 1).normalize();
    this.scene.add(sun);
    const sky = new THREE.HemisphereLight(0xbfd8ff, 0x88886a, 2.0);
    this.scene.add(sky);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  }

  render(gl, args) {
    // Pin the car mesh to the map centre using THIS frame's matrix so the mesh
    // and projection stay consistent. Driving + camera happen in the rAF loop.
    if (this.onFrame) this.onFrame();

    // MapLibre v5 passes a ProjectionData object; v4 a flat array.
    const m = Array.isArray(args)
      ? args
      : (args?.defaultProjectionData?.mainMatrix ?? args?.projectionData?.mainMatrix ?? args);

    this.camera.projectionMatrix.fromArray(m);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    this.renderer.resetState();
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    // NOTE: repaint is driven by the rAF loop in index.js, not here, so the
    // camera (jumpTo) and physics run outside the render callback.
  }

  // Expose scene so other modules can add objects
  getScene() { return this.scene; }
  getRenderer() { return this.renderer; }
  getCamera() { return this.camera; }
}

export const sfLayer = new SFLayer();
