const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUCKET = 'driveby-assets';
const OUTPUT_MAP_FILE = path.join(__dirname, '..', 'src', 'map', 'insforgeAssets.json');

const filesToUpload = [
  // Raw data
  { local: 'data/sf-osm-raw.json', key: 'raw-data/sf-osm-raw.json' },
  // Sedan model files
  { local: 'assets/models/Sedan.obj', key: 'models/Sedan.obj' },
  { local: 'assets/models/Sedan.mtl', key: 'models/Sedan.mtl' },
  { local: 'assets/models/FourDoorSedanC.jpg', key: 'models/FourDoorSedanC.jpg' },
  { local: 'assets/models/Lakerem.jpg', key: 'models/Lakerem.jpg' },
  // Low-poly city model
  { local: 'assets/models/sf-lowpoly/SanFrancisco_City.fbx', key: 'sf-lowpoly/SanFrancisco_City.fbx' }
];

// Scan lowpoly textures and high-textures
const texturesDir = path.join(__dirname, '..', 'assets', 'models', 'sf-lowpoly', 'Textures');
if (fs.existsSync(texturesDir)) {
  fs.readdirSync(texturesDir).forEach(file => {
    if (file.endsWith('.jpg') || file.endsWith('.png')) {
      filesToUpload.push({
        local: `assets/models/sf-lowpoly/Textures/${file}`,
        key: `sf-lowpoly/Textures/${file}`
      });
    }
  });
}

const highTexturesDir = path.join(__dirname, '..', 'assets', 'models', 'sf-lowpoly', 'high-textures');
if (fs.existsSync(highTexturesDir)) {
  fs.readdirSync(highTexturesDir).forEach(file => {
    if (file.endsWith('.jpg') || file.endsWith('.png')) {
      filesToUpload.push({
        local: `assets/models/sf-lowpoly/high-textures/${file}`,
        key: `sf-lowpoly/high-textures/${file}`
      });
    }
  });
}

function uploadFile(localPath, key) {
  const fullLocalPath = path.join(__dirname, '..', localPath);
  if (!fs.existsSync(fullLocalPath)) {
    console.warn(`File does not exist: ${fullLocalPath}`);
    return null;
  }

  console.log(`Uploading ${localPath} -> ${key}...`);
  try {
    const cmd = `npx @insforge/cli storage upload "${fullLocalPath}" --bucket "${BUCKET}" --key "${key}" --json`;
    const resultJson = execSync(cmd, { encoding: 'utf8' });
    const parsed = JSON.parse(resultJson);
    console.log(`✓ Uploaded. Size: ${(parsed.size / 1024 / 1024).toFixed(2)} MB`);
    return parsed.url;
  } catch (error) {
    console.error(`Failed to upload ${localPath}:`, error.message);
    throw error;
  }
}

function main() {
  const assetMap = {};

  for (const item of filesToUpload) {
    const url = uploadFile(item.local, item.key);
    if (url) {
      assetMap[item.local] = url;
    }
  }

  fs.writeFileSync(OUTPUT_MAP_FILE, JSON.stringify(assetMap, null, 2));
  console.log(`\nSuccessfully uploaded all assets! Saved map to ${OUTPUT_MAP_FILE}`);
}

main();
