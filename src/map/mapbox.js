import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Free OpenFreeMap "liberty" style — no API key required, has 3D buildings
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// SF Financial District centre
export const SF_CENTER = [-122.3988, 37.7956];

let _map = null;

export function initMap() {
  return new Promise((resolve) => {
    _map = new maplibregl.Map({
      container: 'map',
      style: STYLE,
      center: SF_CENTER,
      zoom: 16,
      pitch: 0,
      bearing: 0,
      antialias: true,
    });

    // lock all user interaction
    _map.dragPan.disable();
    _map.scrollZoom.disable();
    _map.doubleClickZoom.disable();
    _map.dragRotate.disable();
    _map.keyboard.disable();
    _map.touchZoomRotate.disable();

    _map.on('load', () => {
      // add dark 3D buildings layer on top of whatever the style provides
      if (!_map.getLayer('3d-buildings')) {
        _map.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          paint: {
            'fill-extrusion-color': '#1a1a2e',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.9,
          },
        });
      }
      resolve(_map);
    });
  });
}

export function getMap() {
  return _map;
}
