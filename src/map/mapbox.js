import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Free OpenFreeMap "dark" style — no API key, OpenMapTiles source
const STYLE = 'https://tiles.openfreemap.org/styles/dark';

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
      pitch: 45,
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
      // Find the vector tile source name dynamically (differs by style)
      const sources = _map.getStyle().sources;
      const vecSource = Object.keys(sources).find(k =>
        sources[k].type === 'vector'
      );

      if (vecSource && !_map.getLayer('3d-buildings')) {
        _map.addLayer({
          id: '3d-buildings',
          source: vecSource,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#1a1a2e',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
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
