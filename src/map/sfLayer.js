import {
  Scene,
  Camera,
  WebGLRenderer,
  Matrix4,
  Vector3,
  DirectionalLight,
  AmbientLight
} from 'three';

const mapboxgl = window.mapboxgl;

// Origin the Three.js world is built around. All geographic coordinates are
// expressed in metres relative to this point so Three.js stays near the origin.
const SF_ORIGIN = [-122.3988, 37.7956];

// Mercator anchor + metre scale for the origin, computed once.
const ORIGIN_MERCATOR = mapboxgl.MercatorCoordinate.fromLngLat(SF_ORIGIN, 0);
const METRE = ORIGIN_MERCATOR.meterInMercatorCoordinateUnits();

// Converts geographic coordinates to Three.js world coordinates (in metres),
// relative to SF_ORIGIN. X = east, Y = up (altitude), Z = south.
function worldToMapbox(lng, lat, altitude = 0) {
  const p = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], altitude);
  return new Vector3(
    (p.x - ORIGIN_MERCATOR.x) / METRE,
    altitude,
    (p.y - ORIGIN_MERCATOR.y) / METRE
  );
}

// Mapbox custom layer that renders a Three.js scene sharing Mapbox's WebGL
// context, aligned to the map's coordinate system.
class SFLayer {

  constructor() {
    this.id = 'sf-three-layer';
    this.type = 'custom';
    this.renderingMode = '3d';

    this.scene = new Scene();
    this.camera = new Camera();

    // Lights so models added to the scene are visible.
    const sun = new DirectionalLight(0xffffff, 2.0);
    sun.position.set(0.5, -1, 0.5);   // pointing down onto the scene
    this.scene.add(sun);
    this.scene.add(new AmbientLight(0xffffff, 1.0));

    this.worldMatrix = new Matrix4();
  }

  onAdd(map, gl) {
    this.map = map;

    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true
    });
    this.renderer.autoClear = false;

    // Transform from the metre-based, origin-anchored Three.js world into
    // Mapbox's Mercator world. RotX(90°) maps Three.js +Y (up) onto Mercator's
    // +Z (up); the -METRE on Y flips Mercator's south-positive axis so our
    // world +Z points south.
    this.worldMatrix = new Matrix4()
      .makeTranslation(ORIGIN_MERCATOR.x, ORIGIN_MERCATOR.y, ORIGIN_MERCATOR.z)
      .multiply(new Matrix4().makeScale(METRE, -METRE, METRE))
      .multiply(new Matrix4().makeRotationX(Math.PI / 2));
  }

  render(gl, matrix) {
    const projection = new Matrix4().fromArray(matrix);
    this.camera.projectionMatrix = projection.multiply(this.worldMatrix);

    this.renderer.resetState();

    // Clear the depth buffer so our objects are not occluded by the map's
    // own geometry (buildings/terrain) that was drawn before this layer.
    gl.clear(gl.DEPTH_BUFFER_BIT);

    this.renderer.render(this.scene, this.camera);

    // Keep the map continuously repainting so animated objects update.
    this.map.triggerRepaint();
  }

  // Adds a Three.js Object3D to the layer's scene.
  add(object) {
    this.scene.add(object);
  }

}

export { SFLayer, worldToMapbox, SF_ORIGIN, METRE };
