const MODES = ['chase', 'birds-eye'];

// Close 3rd-person chase cam.
// Lower pitch = look more level down the street (buildings stop blocking the car).
const CHASE = {
  zoom: 19.5,       // close
  pitch: 50,        // moderate — avoids looking through buildings ahead
  aheadMetres: 8,   // small offset so car sits just below centre
};
const BIRDS_EYE = { zoom: 16.5, pitch: 0 };

const M_PER_DEG_LAT = 111320;

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
    this._updateLabel();
  }

  update(car) {
    const s = car.getState();

    if (MODES[this.modeIndex] === 'chase') {
      const bearingDeg = s.heading * 180 / Math.PI;
      const mPerDegLng = 111320 * Math.cos(s.lat * Math.PI / 180);
      const aheadLat = s.lat + (Math.cos(s.heading) * CHASE.aheadMetres) / M_PER_DEG_LAT;
      const aheadLng = s.lng + (Math.sin(s.heading) * CHASE.aheadMetres) / mPerDegLng;

      this.map.jumpTo({
        center: [aheadLng, aheadLat],
        bearing: bearingDeg,
        pitch: CHASE.pitch,
        zoom: CHASE.zoom,
      });
    } else {
      this.map.jumpTo({
        center: [s.lng, s.lat],
        bearing: 0,
        pitch: BIRDS_EYE.pitch,
        zoom: BIRDS_EYE.zoom,
      });
    }
  }

  _updateLabel() {
    if (!this._label) return;
    this._label.textContent =
      MODES[this.modeIndex] === 'chase' ? '[C] Chase Cam' : "[C] Bird's Eye";
  }
}
