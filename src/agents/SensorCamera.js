import * as THREE from 'three';

const RES = 84;

const OFFSETS = {
  front: { pos: [0, 1.2, 2.5],  rot: [0, 0, 0] },
  back:  { pos: [0, 1.2, -2.5], rot: [0, Math.PI, 0] },
  left:  { pos: [-1.2, 1.2, 0],   rot: [0, -Math.PI / 2, 0] },
  right: { pos: [1.2, 1.2, 0],    rot: [0, Math.PI / 2, 0] },
};

export class SensorCamera {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.cameras = {};
    this.targets = {};
    this.buffers = {};

    for (const [name, cfg] of Object.entries(OFFSETS)) {
      const cam = new THREE.PerspectiveCamera(90, 1, 0.1, 500);
      cam.position.set(...cfg.pos);
      cam.rotation.set(...cfg.rot);
      this.cameras[name] = cam;

      this.targets[name] = new THREE.WebGLRenderTarget(RES, RES);
      this.buffers[name] = new Uint8Array(RES * RES * 4);
    }
  }

  // Attach cameras to a car mesh so they move with it
  attach(mesh) {
    for (const cam of Object.values(this.cameras)) {
      mesh.add(cam);
    }
  }

  detach(mesh) {
    for (const cam of Object.values(this.cameras)) {
      mesh.remove(cam);
    }
  }

  // Returns { front, back, left, right } as base64 strings
  getFrames() {
    const frames = {};
    for (const [name, cam] of Object.entries(this.cameras)) {
      this.renderer.setRenderTarget(this.targets[name]);
      this.renderer.render(this.scene, cam);
      this.renderer.readRenderTargetPixels(
        this.targets[name], 0, 0, RES, RES, this.buffers[name]
      );
      frames[name] = _toBase64(this.buffers[name]);
    }
    this.renderer.setRenderTarget(null);
    return frames;
  }

  dispose() {
    for (const t of Object.values(this.targets)) t.dispose();
  }
}

function _toBase64(buf) {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}
