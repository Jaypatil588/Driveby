const MODES = ['follow', 'birds-eye'];

const FOLLOW    = { zoom: 18.5, pitch: 55 };
const BIRDS_EYE = { zoom: 16.5, pitch: 0 };

export class CameraToggle {
  constructor(map) {
    this.map = map;
    this.modeIndex = 0; // start in follow so driving reads clearly
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

  // Called every frame with the player car
  update(car) {
    const s = car.getState();
    const mode = MODES[this.modeIndex];

    if (mode === 'follow') {
      // GPS-style: car stays centred, pointing up; world rotates beneath it
      const bearingDeg = s.heading * 180 / Math.PI;
      this.map.jumpTo({
        center: [s.lng, s.lat],
        bearing: bearingDeg,
        pitch: FOLLOW.pitch,
        zoom: FOLLOW.zoom,
      });
    } else {
      // Bird's-eye: follow position, north-up, no rotation
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
      MODES[this.modeIndex] === 'follow' ? '[C] Follow Cam' : "[C] Bird's Eye";
  }
}
