// Manages the two camera modes (Task 6). Because the Three.js scene is rendered
// through Mapbox's shared camera:
//   - bird's eye: free map view controlled by user pan/zoom/drag
//   - follow cam: pitched view that rotates to trail behind the car
class CameraToggle {

  constructor(map, label) {
    this.map = map;
    this.label = label;       // HUD element for the mode text
    this.mode = 'bird';       // default to bird's eye

    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'c') this.toggle();
    });

    this.updateLabel();
  }

  toggle() {
    this.setMode(this.mode === 'bird' ? 'follow' : 'bird');
  }

  follow() {
    this.setMode('follow');
  }

  setMode(mode) {
    if (mode !== 'bird' && mode !== 'follow') {
      throw new Error(`CameraToggle cannot switch to unknown mode: ${mode}.`);
    }

    this.mode = mode;
    this.updateLabel();
  }

  // Called every frame with the player car. Follow mode locks onto the car;
  // bird mode leaves the map under direct user control.
  update(car) {
    const { lng, lat, heading } = car.getPosition();

    if (this.mode === 'bird') {
      return;
    } else {
      // follow cam: look in the car's direction of travel, pitched back
      const bearing = heading * 180 / Math.PI;
      const target = { center: [lng, lat], bearing, pitch: 45, zoom: 17.5 };

      // lerp bearing for smoothness, snap centre to the car
      const cur = this.map.getBearing();
      const smooth = cur + shortestAngle(cur, bearing) * 0.15;
      this.map.jumpTo({ center: target.center, bearing: smooth, pitch: 45, zoom: 17.5 });
    }
  }

  updateLabel() {
    if (!this.label) return;
    this.label.textContent = this.mode === 'bird' ? "[C] Bird's Eye" : '[C] Follow Cam';
  }

}

// shortest signed angular distance a->b in degrees
function shortestAngle(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export { CameraToggle };
