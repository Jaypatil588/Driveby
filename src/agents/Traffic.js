import { Group, Mesh, CylinderGeometry, SphereGeometry, ConeGeometry, BoxGeometry, MeshStandardMaterial, Box3, Vector3 } from 'three';
import { worldToMapbox } from '../map/sfLayer.js';

// Real SF street routes in Lng/Lat for traffic to follow
const ROUTES = [
  // Market St (SW to NE)
  {
    start: { lng: -122.404, lat: 37.789 },
    end: { lng: -122.393, lat: 37.795 }
  },
  // Market St (NE to SW)
  {
    start: { lng: -122.393, lat: 37.795 },
    end: { lng: -122.404, lat: 37.789 }
  },
  // 1st St (SE to NW)
  {
    start: { lng: -122.395, lat: 37.789 },
    end: { lng: -122.401, lat: 37.797 }
  },
  // 1st St (NW to SE)
  {
    start: { lng: -122.401, lat: 37.797 },
    end: { lng: -122.395, lat: 37.789 }
  },
  // Mission St (SW to NE)
  {
    start: { lng: -122.403, lat: 37.786 },
    end: { lng: -122.392, lat: 37.793 }
  },
  // Mission St (NE to SW)
  {
    start: { lng: -122.392, lat: 37.793 },
    end: { lng: -122.403, lat: 37.786 }
  }
];

class TrafficManager {

  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.pedestrians = [];
    this.trees = [];
    this.trafficLights = [];

    this.spawnEnvironment();
  }

  spawnEnvironment() {
    // 0. Spawn Traffic Lights at the main intersection
    this.spawnTrafficLights();

    // 1. Spawn Trees along the sidewalks
    // Place trees at 8 intervals along each route, offset by 6 meters to the side
    ROUTES.forEach((route, routeIdx) => {
      // Only place trees for even routes to prevent double placement on bidirectional streets
      if (routeIdx % 2 !== 0) return;

      const steps = 12;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        // Sidewalk offset (perpendicular vector)
        const dLng = route.end.lng - route.start.lng;
        const dLat = route.end.lat - route.start.lat;
        const length = Math.sqrt(dLng * dLng + dLat * dLat);

        // Perpendicular offset (about 6 meters in degrees)
        const offsetDist = 0.00006;
        const pLng = (-dLat / length) * offsetDist;
        const pLat = (dLng / length) * offsetDist;

        // Spawn on left sidewalk
        this.createTree(
          route.start.lng + t * dLng + pLng,
          route.start.lat + t * dLat + pLat
        );

        // Spawn on right sidewalk
        this.createTree(
          route.start.lng + t * dLng - pLng,
          route.start.lat + t * dLat - pLat
        );
      }
    });

    // 2. Spawn Pedestrians walking along sidewalks
    const pedColors = [0xff2266, 0x00ff66, 0xffcc00, 0x9900ff, 0x00ccff, 0xffffff];
    ROUTES.forEach((route) => {
      // 2 pedestrians per route
      for (let j = 0; j < 2; j++) {
        // Sidewalk offset
        const dLng = route.end.lng - route.start.lng;
        const dLat = route.end.lat - route.start.lat;
        const length = Math.sqrt(dLng * dLng + dLat * dLat);

        const offsetDist = 0.00006;
        const pLng = (-dLat / length) * offsetDist * (j === 0 ? 1 : -1);
        const pLat = (dLng / length) * offsetDist * (j === 0 ? 1 : -1);

        const startLng = route.start.lng + pLng;
        const startLat = route.start.lat + pLat;
        const endLng = route.end.lng + pLng;
        const endLat = route.end.lat + pLat;

        const color = pedColors[Math.floor(Math.random() * pedColors.length)];
        this.createPedestrian(startLng, startLat, endLng, endLat, color, Math.random());
      }
    });

    // 3. Spawn Other Cars
    const carColors = [0xff5533, 0x33aa55, 0xddbb22, 0x6644ee, 0xaaaaaa, 0x222222, 0x1177ee];
    ROUTES.forEach((route, idx) => {
      // 2 cars per route, offset in progress
      for (let j = 0; j < 2; j++) {
        const color = carColors[(idx * 2 + j) % carColors.length];
        this.createCar(route, color, (j * 0.5 + Math.random() * 0.1) % 1.0);
      }
    });
  }

  createTree(lng, lat) {
    const group = new Group();

    // Trunk
    const trunkGeo = new CylinderGeometry(0.12, 0.18, 1.8, 8);
    const trunkMat = new MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const trunk = new Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.9;
    group.add(trunk);

    // Foliage
    const canopyGeo = new ConeGeometry(1.0, 2.2, 8);
    const canopyMat = new MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.7 });
    const canopy = new Mesh(canopyGeo, canopyMat);
    canopy.position.y = 2.2;
    group.add(canopy);

    // Position tree on the map
    const pos = worldToMapbox(lng, lat);
    group.position.copy(pos);

    // Random rotation and scale for variety
    group.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.8 + Math.random() * 0.4;
    group.scale.set(s, s, s);

    this.scene.add(group);
    this.trees.push(group);
  }

  createPedestrian(startLng, startLat, endLng, endLat, color, initialProgress) {
    const group = new Group();

    // Body (color coat)
    const bodyGeo = new CylinderGeometry(0.18, 0.18, 1.1, 8);
    const bodyMat = new MeshStandardMaterial({ color: color, roughness: 0.6 });
    const body = new Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    group.add(body);

    // Head
    const headGeo = new SphereGeometry(0.15, 8, 8);
    const headMat = new MeshStandardMaterial({ color: 0xffdbac, roughness: 0.6 });
    const head = new Mesh(headGeo, headMat);
    head.position.y = 1.2;
    group.add(head);

    this.scene.add(group);

    this.pedestrians.push({
      mesh: group,
      start: { lng: startLng, lat: startLat },
      end: { lng: endLng, lat: endLat },
      progress: initialProgress,
      direction: 1, // 1 = forward, -1 = backward
      speed: 0.01 + Math.random() * 0.01 // progress speed per second
    });
  }

  createCar(route, colorHex, initialProgress) {
    const mesh = new Group();

    const sedanModel = window.game.assets?.models['sedan'];
    if (!sedanModel) {
      throw new Error('TrafficManager requires assets.models.sedan to be loaded.');
    }

    const carModel = sedanModel.clone();

    const box = new Box3().setFromObject(carModel);
    const size = new Vector3();
    box.getSize(size);
    const center = new Vector3();
    box.getCenter(center);

    const targetLength = 4.8;
    const scale = targetLength / size.z;
    carModel.scale.set(scale, scale, scale);
    carModel.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    // Rotate -90 deg around X so it lies flat on the road (right side up)
    carModel.rotateX(-Math.PI / 2);

    // Color the car body paint
    carModel.traverse((node) => {
      if (node.isMesh && node.material) {
        if (Array.isArray(node.material)) {
          node.material = node.material.map((mat) => {
            const m = mat.clone();
            if (m.color && (m.name === 'blinn2SG' || m.name === 'dull')) {
              m.color.setHex(colorHex);
            }
            return m;
          });
        } else {
          node.material = node.material.clone();
          if (node.material.color && (node.material.name === 'blinn2SG' || node.material.name === 'dull')) {
            node.material.color.setHex(colorHex);
          }
        }
      }
    });

    mesh.add(carModel);

    this.scene.add(mesh);

    this.cars.push({
      mesh,
      route,
      progress: initialProgress,
      speed: 0.015 + Math.random() * 0.01 // progress speed per second (around 25-40 km/h equivalent)
    });
  }

  spawnTrafficLights() {
    const corners = [
      { lng: -122.39865, lat: 37.79175 }, // NE corner
      { lng: -122.39865, lat: 37.79145 }, // SE corner
      { lng: -122.39895, lat: 37.79175 }, // NW corner
      { lng: -122.39895, lat: 37.79145 }  // SW corner
    ];

    corners.forEach((corner, idx) => {
      this.createTrafficLight(corner.lng, corner.lat, idx);
    });
  }

  createTrafficLight(lng, lat, index) {
    const group = new Group();

    // Pole
    const postGeo = new CylinderGeometry(0.06, 0.08, 3.2, 8);
    const postMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const post = new Mesh(postGeo, postMat);
    post.position.y = 1.6;
    group.add(post);

    // Head housing
    const headGeo = new BoxGeometry(0.3, 0.8, 0.3);
    const headMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const head = new Mesh(headGeo, headMat);
    head.position.set(0, 3.0, 0);
    group.add(head);

    // Light spheres (Red, Yellow, Green)
    const lightGeo = new SphereGeometry(0.08, 8, 8);

    // Create separate materials for each signal head light
    const redMat = new MeshStandardMaterial({ color: 0x330000, emissive: 0x000000, roughness: 0.5 });
    const yellowMat = new MeshStandardMaterial({ color: 0x333300, emissive: 0x000000, roughness: 0.5 });
    const greenMat = new MeshStandardMaterial({ color: 0x003300, emissive: 0x000000, roughness: 0.5 });

    const redLight = new Mesh(lightGeo, redMat);
    redLight.position.set(0, 3.25, 0.15);
    group.add(redLight);

    const yellowLight = new Mesh(lightGeo, yellowMat);
    yellowLight.position.set(0, 3.0, 0.15);
    group.add(yellowLight);

    const greenLight = new Mesh(lightGeo, greenMat);
    greenLight.position.set(0, 2.75, 0.15);
    group.add(greenLight);

    const pos = worldToMapbox(lng, lat);
    group.position.copy(pos);

    // Face the intersection center
    const centerPos = worldToMapbox(-122.3988, 37.7916);
    const angle = Math.atan2(centerPos.x - pos.x, centerPos.z - pos.z);
    group.rotation.y = angle;

    this.scene.add(group);

    // Stagger cycles by index so perpendicular directions alternate signals
    const initialCycleTime = (index % 2 === 0) ? 0 : 5;

    this.trafficLights.push({
      mesh: group,
      redMat,
      yellowMat,
      greenMat,
      cycleTime: initialCycleTime
    });
  }

  update(delta) {
    if (delta <= 0) return;

    // 1. Update Pedestrians
    this.pedestrians.forEach((ped) => {
      ped.progress += ped.speed * ped.direction * delta;

      if (ped.progress >= 1.0) {
        ped.progress = 1.0;
        ped.direction = -1;
      } else if (ped.progress <= 0.0) {
        ped.progress = 0.0;
        ped.direction = 1;
      }

      // Interpolate position
      const lng = ped.start.lng + ped.progress * (ped.end.lng - ped.start.lng);
      const lat = ped.start.lat + ped.progress * (ped.end.lat - ped.start.lat);

      const pos = worldToMapbox(lng, lat);
      ped.mesh.position.copy(pos);

      // Rotate towards walking direction
      const dLng = ped.end.lng - ped.start.lng;
      const dLat = ped.end.lat - ped.start.lat;
      const heading = Math.atan2(dLng, -dLat) + (ped.direction === 1 ? 0 : Math.PI);
      ped.mesh.rotation.y = heading;
    });

    // 2. Update Cars
    this.cars.forEach((car) => {
      car.progress += car.speed * delta;

      if (car.progress >= 1.0) {
        car.progress = 0.0; // Loop back
      }

      // Interpolate position
      const lng = car.route.start.lng + car.progress * (car.route.end.lng - car.route.start.lng);
      const lat = car.route.start.lat + car.progress * (car.route.end.lat - car.route.start.lat);

      const pos = worldToMapbox(lng, lat);
      car.mesh.position.copy(pos);

      // Rotate towards driving direction
      const dLng = car.route.end.lng - car.route.start.lng;
      const dLat = car.route.end.lat - car.route.start.lat;

      // Mapbox direction heading matching
      const heading = Math.atan2(dLng, -dLat);
      car.mesh.rotation.y = heading;
    });

    // 3. Update Traffic Lights (Green 5s -> Yellow 2s -> Red 5s)
    this.trafficLights.forEach((light) => {
      light.cycleTime = (light.cycleTime + delta) % 12;

      let state; // 0 = Green, 1 = Yellow, 2 = Red
      if (light.cycleTime < 5) {
        state = 0;
      } else if (light.cycleTime < 7) {
        state = 1;
      } else {
        state = 2;
      }

      if (state === 0) {
        light.greenMat.color.setHex(0x00ff00);
        light.greenMat.emissive.setHex(0x00ff00);
        light.yellowMat.color.setHex(0x333300);
        light.yellowMat.emissive.setHex(0x000000);
        light.redMat.color.setHex(0x330000);
        light.redMat.emissive.setHex(0x000000);
      } else if (state === 1) {
        light.greenMat.color.setHex(0x003300);
        light.greenMat.emissive.setHex(0x000000);
        light.yellowMat.color.setHex(0xffff00);
        light.yellowMat.emissive.setHex(0xffff00);
        light.redMat.color.setHex(0x330000);
        light.redMat.emissive.setHex(0x000000);
      } else {
        light.greenMat.color.setHex(0x003300);
        light.greenMat.emissive.setHex(0x000000);
        light.yellowMat.color.setHex(0x333300);
        light.yellowMat.emissive.setHex(0x000000);
        light.redMat.color.setHex(0xff0000);
        light.redMat.emissive.setHex(0xff0000);
      }
    });
  }

}

export { TrafficManager };
