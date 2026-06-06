import * as THREE from 'three';
import { LoadingManager } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { SF_CENTER } from './mapbox.js';
import { mercatorScale, worldToMap } from './sfLayer.js';

const ASSET_ROOT = '/assets/models/sf-lowpoly/';
const MODEL_URL = `${ASSET_ROOT}SanFrancisco_City.fbx`;
const TEXTURE_ROOT = `${ASSET_ROOT}high-textures/`;

const TEXTURE_FILES = new Set([
  'SanFrancisco_Part-0.jpg',
  'SanFrancisco_Part-1.jpg',
  'SanFrancisco_Part-2.jpg',
  'SanFrancisco_Part-3.jpg',
  'SanFrancisco_Part-4.jpg',
  'SanFrancisco_Part-5.jpg',
  'SanFrancisco_Part-6.jpg',
]);

const MODEL_BOUNDS = {
  min: new THREE.Vector3(-4.606732070446014, -0.16173792907122844, -4.5155768311015265),
  max: new THREE.Vector3(2.897095024585724, 0.5234614222131632, 2.9504810044486587),
};

const METRES_PER_MODEL_UNIT = 350;

function fileNameFromUrl(url) {
  return url.split(/[\\/]/).pop();
}

function cityUrlModifier(url) {
  const fileName = fileNameFromUrl(url);

  if (fileName === 'SanFrancisco_City.fbx') return MODEL_URL;
  if (TEXTURE_FILES.has(fileName)) return `${TEXTURE_ROOT}${fileName}`;

  throw new Error(`Unexpected SF low-poly asset reference: ${url}`);
}

function configureMaterial(material, renderer) {
  if (!material) return;

  if (material.map) {
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    material.map.needsUpdate = true;
  }

  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
}

export function loadLowPolyCity(scene, renderer) {
  if (!renderer) {
    throw new Error('Cannot load SF low-poly city before the Three.js renderer exists.');
  }

  const manager = new LoadingManager();
  manager.setURLModifier(cityUrlModifier);

  const loader = new FBXLoader(manager);

  return new Promise((resolve, reject) => {
    let settled = false;
    let loadedModel = null;

    function finalizeLoad() {
      if (settled || !loadedModel) return;

      const model = loadedModel;
      const bounds = MODEL_BOUNDS;
      const center = new THREE.Vector3(
        (bounds.min.x + bounds.max.x) / 2,
        (bounds.min.y + bounds.max.y) / 2,
        (bounds.min.z + bounds.max.z) / 2
      );

      model.position.set(-center.x, -bounds.min.y, -center.z);
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
          child.material.forEach((material) => configureMaterial(material, renderer));
        } else {
          configureMaterial(child.material, renderer);
        }
      });

      const city = new THREE.Group();
      city.name = 'SF Low Poly City';
      city.position.copy(worldToMap(SF_CENTER[0], SF_CENTER[1], 0));
      city.rotation.x = Math.PI / 2;
      city.scale.setScalar(mercatorScale() * METRES_PER_MODEL_UNIT);
      city.add(model);

      scene.add(city);
      settled = true;
      resolve(city);
    }

    manager.onLoad = finalizeLoad;
    manager.onError = (url) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Failed to load SF low-poly asset: ${url}`));
    };

    try {
      loader.load(
        MODEL_URL,
        (model) => {
          loadedModel = model;
        },
        undefined,
        (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      );
    } catch (error) {
      if (!settled) {
        settled = true;
        reject(error);
      }
    }
  });
}
