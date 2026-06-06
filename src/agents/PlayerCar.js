import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Box3, Vector3 } from 'three';
import { worldToMapbox } from '../map/sfLayer.js';

const mapboxgl = window.mapboxgl;

// SF block bounding box the car must stay inside (Task 5).
const BOUNDS = { minLng: -122.404, maxLng: -122.393, minLat: 37.788, maxLat: 37.797 };

// Vehicle dynamics tuning.
const MAX_SPEED = 16.7;        // ~60 km/h in m/s
const ACCEL = 18;              // m/s^2 throttle acceleration
const BRAKE = 30;              // m/s^2 braking deceleration
const DRAG = 4;                // passive deceleration when coasting
const MAX_STEER = 1.6;         // max steering rate (rad/s) at full lock

// Human-controlled car. Uses a simple bicycle model and keeps its position in
// both Three.js world space (for rendering) and lng/lat (for other systems).
class PlayerCar {

  constructor(params) {

    this.scene = params.scene;        // the SFLayer
    this.lng = params.lng;
    this.lat = params.lat;
    this.heading = params.heading || 0;  // radians, 0 = +Z (south-ish)
    this.speed = 0;

    // Bright box car, sized in real metres (length runs along +Z = heading 0).
    this.mesh = new Group();

    const sedanModel = window.game.assets?.models['sedan'];
    if (sedanModel) {
      const carModel = sedanModel.clone();
      
      // Rotate the model by -90 degrees around X so it lies flat on the road (right side up)
      carModel.rotateX(-Math.PI / 2);
      
      const box = new Box3().setFromObject(carModel);
      const size = new Vector3();
      box.getSize(size);
      const center = new Vector3();
      box.getCenter(center);
      
      const targetLength = 4.8;
      const scale = targetLength / size.z;
      carModel.scale.set(scale, scale, scale);
      
      // Center the model so it sits on y = 0
      carModel.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      
      this.mesh.add(carModel);
    } else {
      const body = new Mesh(
        new BoxGeometry( 2, 1.5, 4.5 ),                 // width, height, length
        new MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x004f5c })
      );
      body.position.y = 0.75;                            // sit on the ground
      this.mesh.add( body );

      // contrasting nose so the facing direction is obvious
      const nose = new Mesh(
        new BoxGeometry( 2, 0.6, 1 ),
        new MeshStandardMaterial({ color: 0xff2266, emissive: 0x5c0011 })
      );
      nose.position.set( 0, 0.75, 2.5 );                 // front of the car (+Z)
      this.mesh.add( nose );
    }

    this.syncMesh();
    this.scene.add( this.mesh );
  }

  // Drives the car from the keyboard state map for this frame.
  update(delta, keys) {

    if (delta <= 0) return;
    if (delta > 0.1) delta = 0.1; // clamp huge frame gaps

    const throttle = keys['w'] || keys['arrowup'];
    const reverse  = keys['s'] || keys['arrowdown'];
    const left     = keys['a'] || keys['arrowleft'];
    const right    = keys['d'] || keys['arrowright'];

    // longitudinal
    if (throttle) {
      this.speed += ACCEL * delta;
    } else if (reverse) {
      this.speed -= BRAKE * delta;
    } else {
      // coast: decay toward zero
      const drag = DRAG * delta;
      if (this.speed > drag) this.speed -= drag;
      else if (this.speed < -drag) this.speed += drag;
      else this.speed = 0;
    }
    this.speed = Math.max( -MAX_SPEED / 2, Math.min( MAX_SPEED, this.speed ) );

    // steering — scales with speed so the car turns about its heading, not world axes
    let steer = 0;
    if (left) steer += 1;
    if (right) steer -= 1;
    this.heading += steer * MAX_STEER * (this.speed / MAX_SPEED) * delta;

    // advance position along heading
    const dist = this.speed * delta;                 // metres this frame
    const east = Math.sin(this.heading) * dist;
    const south = Math.cos(this.heading) * dist;

    // convert metre delta to lng/lat delta
    const metresPerDegLat = 111320;
    const metresPerDegLng = 111320 * Math.cos(this.lat * Math.PI / 180);
    this.lng += east / metresPerDegLng;
    this.lat -= south / metresPerDegLat;

    // keep inside the SF block bounding box (Task 5)
    if (this.lng < BOUNDS.minLng || this.lng > BOUNDS.maxLng ||
        this.lat < BOUNDS.minLat || this.lat > BOUNDS.maxLat) {
      this.lng = Math.max( BOUNDS.minLng, Math.min( BOUNDS.maxLng, this.lng ) );
      this.lat = Math.max( BOUNDS.minLat, Math.min( BOUNDS.maxLat, this.lat ) );
      this.speed = 0;
    }

    this.syncMesh();
  }

  // Updates the Three.js mesh from the current lng/lat/heading.
  syncMesh() {
    const pos = worldToMapbox( this.lng, this.lat );
    this.mesh.position.copy( pos );
    this.mesh.rotation.set( 0, this.heading, 0 );
  }

  getPosition() {
    return { lng: this.lng, lat: this.lat, heading: this.heading };
  }

}

export { PlayerCar, BOUNDS, MAX_SPEED };
