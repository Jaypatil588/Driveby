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

    // Basic lighting
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(0.5, 1, 0.5);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x404060, 1.5));
  }

  render(gl, args) {
    // MapLibre v4 passes a flat array; v5 passes a ProjectionData object
    const m = Array.isArray(args)
      ? args
      : (args.defaultProjectionData?.mainMatrix ?? args.projectionData?.mainMatrix ?? args);

    this.camera.projectionMatrix.fromArray(m);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  // Expose scene so other modules can add objects
  getScene() { return this.scene; }
  getRenderer() { return this.renderer; }
  getCamera() { return this.camera; }
}

export const sfLayer = new SFLayer();
