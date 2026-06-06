import {
  LoadingManager,
  TextureLoader,
  SRGBColorSpace,
  MeshStandardMaterial,
  MeshPhongMaterial
} from 'three';

import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

class AssetManager {

  constructor() {

    this.path = '';

    this.textures = {};
    this.models = {};
    this.materials = {};

  }

  setPath(path) {
    this.path = path;
  }

  load() {

    console.log( 'AssetManager: Loading assets' );

    const self = this;

    /*----- loaders -----*/

    this.loadingManager = new LoadingManager();
    this.loadingManager.onProgress = function ( url, itemsLoaded, itemsTotal ) {
      console.log( 'AssetManager: ' + itemsLoaded + '/' + itemsTotal + ' ' + url );
    };
    this.loadingManager.onLoad = function () {
      console.log( 'AssetManager: Assets loaded' );
      window.game.onLoad();
    };
    this.loadingManager.onError = function ( url ) {
      console.error( 'AssetManager: Failed to load ' + url );
    };

    this.textureLoader = new TextureLoader(this.loadingManager);
    this.objLoader = new OBJLoader(this.loadingManager);
    this.mtlLoader = new MTLLoader(this.loadingManager);

    /*----- textures -----*/

    this.textures['spinner_interior'] = this.textureLoader.load(this.path+'textures/0QuazDeckardCarLowpoly_interior_BaseColor.png');
    this.textures['spinner_interior'].colorSpace = SRGBColorSpace;
    this.textures['spinner_interior_norm'] = this.textureLoader.load(this.path+'textures/0QuazDeckardCarLowpoly_interior_Normal.png');
    this.textures['spinner_interior_ao'] = this.textureLoader.load(this.path+'textures/0QuazDeckardCarLowpoly_interior_AmbientOcclusion.png');
    this.textures['spinner_exterior'] = this.textureLoader.load(this.path+'textures/0QuazDeckardCarLowpoly_car_BaseColor.png');
    this.textures['spinner_exterior'].colorSpace = SRGBColorSpace;

    /*----- models -----*/

    this.objLoader.load(this.path+'models/spinner.obj', function (obj) {
      self.models['spinner'] = obj.children[0].geometry;
      self.models['spinner'].rotateY(-Math.PI/2);
    });

    const sedanObjLoader = new OBJLoader(this.loadingManager);
    this.mtlLoader.setPath(this.path + 'models/');
    sedanObjLoader.setPath(this.path + 'models/');
    this.mtlLoader.load('Sedan.mtl', function (materials) {
      materials.preload();
      sedanObjLoader.setMaterials(materials);
      sedanObjLoader.load('Sedan.obj', function (obj) {
        self.models['sedan'] = obj;
      });
    });

    /*----- materials -----*/

    this.materials['spinner_interior'] = new MeshStandardMaterial( {
      map: this.getTexture('spinner_interior'),
      normalMap: this.getTexture('spinner_interior_norm'),
      aoMap: this.getTexture('spinner_interior_ao'),
      aoMapIntensity: 1,
      roughness: 0.6,
      metalness: 0
    } );
    this.materials['spinner_exterior'] = new MeshPhongMaterial( {
      map: this.getTexture('spinner_exterior'),
      shininess: 0
    } );

  }

  getTexture(id) {
    return this.textures[id];
  }

  getModel(id) {
    return this.models[id];
  }

  getMaterial(id) {
    return this.materials[id];
  }

}

export { AssetManager };
