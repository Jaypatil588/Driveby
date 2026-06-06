// Mapbox GL JS is loaded from the CDN in index.html and available as a global.
const mapboxgl = window.mapboxgl;

// Token is injected at build time by webpack DefinePlugin (see webpack.config.js).
// Never hardcode it here. Set MAPBOX_TOKEN in a .env file (see .env.example).
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// Centered on the player car spawn (Market St & 1st St) so the car is in view.
const SF_CENTER = [-122.3988, 37.7916];

// Creates the Mapbox map locked to a top-down bird's-eye view of downtown SF
// with the 3D buildings layer enabled. Returns the map instance.
function createMap(container = 'map') {

  if (!MAPBOX_TOKEN) {
    console.error('mapbox: MAPBOX_TOKEN is not set. Copy .env.example to .env, add your token, and rebuild.');
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;

  const map = new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/dark-v11',
    center: SF_CENTER,
    zoom: 18,
    pitch: 0,    // bird's eye to start
    bearing: 0,
    antialias: true
  });

  // Lock interaction — the map must not be draggable or zoomable by the user.
  map.dragPan.disable();
  map.scrollZoom.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.dragRotate.disable();
  map.keyboard.disable();
  map.touchZoomRotate.disable();

  map.on('load', () => add3dBuildings(map));

  return map;

}

// Adds the Mapbox 3D buildings fill-extrusion layer, dark themed.
function add3dBuildings(map) {

  map.addLayer({
    id: '3d-buildings',
    source: 'composite',
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    type: 'fill-extrusion',
    paint: {
      'fill-extrusion-color': '#1a1a2e',
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'min_height'],
      'fill-extrusion-opacity': 0.9
    }
  });

}

export { createMap, SF_CENTER };
