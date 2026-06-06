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
    // Advance driving for THIS frame. onFrame moves the MAP (not the car in
    // mercator space), and the car mesh is positioned at the map's current
    // centre — so the car can never desync from the camera (no jitter).
    if (this.onFrame) {
      const now = performance.now();
      const delta = Math.min((now - this._lastTime) / 1000, 0.05);
      this._lastTime = now;
      this.onFrame(delta);
    }

    // MapLibre v5 passes a ProjectionData object; v4 a flat array.
    const m = Array.isArray(args)
      ? args
      : (args?.defaultProjectionData?.mainMatrix ?? args?.projectionData?.mainMatrix ?? args);

    this.camera.projectionMatrix.fromArray(m);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    this.renderer.resetState();
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  // Expose scene so other modules can add objects
  getScene() { return this.scene; }
  getRenderer() { return this.renderer; }
  getCamera() { return this.camera; }
}

export const sfLayer = new SFLayer();
