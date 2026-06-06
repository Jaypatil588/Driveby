import maplibregl from 'maplibre-gl';

const MODES = ['birds-eye', 'follow'];

// Bird's eye map settings
const BIRDS_EYE = { pitch: 45, zoom: 16, bearing: 0 };
// Follow cam offsets (applied relative to car heading)
const FOLLOW = { pitch: 60, zoom: 18 };

export class CameraToggle {
  constructor(map) {
    this.map = map;
    this.modeIndex = 0;
    this._label = document.getElementById('cam-label');

    window.addEventListener('keydown', (e) => {
      if (e.key === 'c' || e.key === 'C') this.toggle();
    });

    this._updateLabel();
  }

  toggle() {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
    if (this.modeIndex === 0) {
      // snap back to birds eye
      this.map.easeTo({ pitch: BIRDS_EYE.pitch, zoom: BIRDS_EYE.zoom, bearing: BIRDS_EYE.bearing, duration: 600 });
    }
    this._updateLabel();
  }

  // Call each frame with the player car
  update(car) {
    if (this.modeIndex !== 1 || !car) return;

    // Convert heading (radians, clockwise from north) to MapLibre bearing (degrees, clockwise from north)
    const bearingDeg = (car.heading * 180 / Math.PI) % 360;

    // Re-centre map on car's lng/lat each frame in follow mode
    // We need lng/lat back from mercator pos
    const mc = new maplibregl.MercatorCoordinate(car.pos.x, car.pos.y, car.pos.z);
    const lngLat = mc.toLngLat();

    this.map.jumpTo({
      center: [lngLat.lng, lngLat.lat],
      bearing: bearingDeg,
      pitch: FOLLOW.pitch,
      zoom: FOLLOW.zoom,
    });
  }

  _updateLabel() {
    if (!this._label) return;
    this._label.textContent = this.modeIndex === 0 ? "[C] Bird's Eye" : '[C] Follow Cam';
  }
}
