import * as THREE from 'three';
import { worldToMap, mercatorScale } from '../map/sfLayer.js';
import { SF_CENTER } from '../map/mapbox.js';

const MODES = ['birds-eye', 'follow'];

export class CameraToggle {
  constructor(scene) {
    this.scene = scene;
    this.modeIndex = 0;

    const m = mercatorScale();

    // Bird's eye — orthographic looking straight down
    const halfW = m * 400;
    this.birdEye = new THREE.OrthographicCamera(-halfW, halfW, halfW, -halfW, -1, 1);
    const centre = worldToMap(SF_CENTER[0], SF_CENTER[1], 0);
    this.birdEye.position.set(centre.x, centre.y, 1);
    this.birdEye.up.set(0, 1, 0); // +Y = north in mercator

    // Follow cam — perspective, positioned behind/above car
    this.followCam = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, m * 0.1, m * 5000);
    this._followTarget = new THREE.Vector3();
    this._followPos = new THREE.Vector3();

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

  // Call each frame; car is a PlayerCar instance
  update(car) {
    if (this.modeIndex === 1 && car && car.mesh) {
      const m = mercatorScale();
      const mesh = car.mesh;

      // target = car position
      this._followTarget.copy(mesh.position);

      // desired position: behind and above the car
      const offset = new THREE.Vector3(
        -Math.sin(car.heading) * m * 20,
        -Math.cos(car.heading) * m * 20,
        m * 8
      );
      const desired = mesh.position.clone().add(offset);
      this._followPos.lerp(desired, 0.05);

      this.followCam.position.copy(this._followPos);
      this.followCam.lookAt(this._followTarget);
      this.followCam.up.set(0, 0, 1);
    }
  }

  activeCamera() {
    return this.modeIndex === 0 ? this.birdEye : this.followCam;
  }

  onResize() {
    this.followCam.aspect = window.innerWidth / window.innerHeight;
    this.followCam.updateProjectionMatrix();
  }

  _updateLabel() {
    if (!this._label) return;
    const mode = MODES[this.modeIndex];
    this._label.textContent = mode === 'birds-eye' ? "[C] Bird's Eye" : '[C] Follow Cam';
  }
}
