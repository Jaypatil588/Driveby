// Manages the two camera modes (Task 6). Because the Three.js scene is rendered
// through Mapbox's shared camera, both modes drive the Mapbox camera, keeping
// the player car centred so it never drives off-screen:
//   - bird's eye: top-down view (pitch 0, north up)
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
    this.mode = this.mode === 'bird' ? 'follow' : 'bird';
    this.updateLabel();
  }

  // Called every frame with the player car. Keeps the camera locked on the car.
  update(car) {
    const { lng, lat, heading } = car.getPosition();

    if (this.mode === 'bird') {
      this.map.jumpTo({ center: [lng, lat], bearing: 0, pitch: 0, zoom: 16.25 });
    } else {
      // follow cam: look in the car's direction of travel, pitched back
      const bearing = heading * 180 / Math.PI;
      const target = { center: [lng, lat], bearing, pitch: 45, zoom: 20.5 };

      // lerp bearing for smoothness, snap centre to the car
      const cur = this.map.getBearing();
      const smooth = cur + shortestAngle(cur, bearing) * 0.15;
      this.map.jumpTo({ center: target.center, bearing: smooth, pitch: 45, zoom: 20.5 });
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
