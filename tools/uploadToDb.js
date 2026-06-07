const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INPUT_FILE = path.join(__dirname, '..', 'src', 'map', 'sfRoadData.json');

function runSqlQuery(sql) {
  try {
    const escapedSql = sql.replace(/"/g, '\\"');
    execSync(`npx @insforge/cli db query "${escapedSql}"`, { stdio: 'ignore' });
  } catch (error) {
    console.error('SQL query execution failed:', error.message);
    throw error;
  }
}

function escapeString(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

function uploadRoads(roads) {
  console.log(`Uploading ${roads.length} roads...`);
  const batchSize = 40;
  for (let i = 0; i < roads.length; i += batchSize) {
    const batch = roads.slice(i, i + batchSize);
    const values = batch.map(road => {
      const id = road.id;
      const name = escapeString(road.name);
      const highway = escapeString(road.highway);
      const oneway = escapeString(road.oneway);
      const forwardLanes = road.forwardLanes;
      const backwardLanes = road.backwardLanes;
      const nodesJson = escapeString(JSON.stringify(road.nodes));

      return `(${id}, ${name}, ${highway}, ${oneway}, ${forwardLanes}, ${backwardLanes}, ${nodesJson}::jsonb)`;
    }).join(', ');

    const sql = `
      INSERT INTO roads (id, name, highway, oneway, forward_lanes, backward_lanes, nodes) VALUES
      ${values}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        highway = EXCLUDED.highway,
        oneway = EXCLUDED.oneway,
        forward_lanes = EXCLUDED.forward_lanes,
        backward_lanes = EXCLUDED.backward_lanes,
        nodes = EXCLUDED.nodes;
    `;
    runSqlQuery(sql);
    console.log(`Uploaded roads batch ${i} to ${Math.min(i + batchSize, roads.length)}`);
  }
}

function uploadSignals(signals) {
  console.log(`Uploading ${signals.length} signals...`);
  const batchSize = 100;
  for (let i = 0; i < signals.length; i += batchSize) {
    const batch = signals.slice(i, i + batchSize);
    const values = batch.map(sig => `(${sig.id}, ${sig.lng}, ${sig.lat})`).join(', ');

    const sql = `
      INSERT INTO signals (id, lng, lat) VALUES
      ${values}
      ON CONFLICT (id) DO UPDATE SET
        lng = EXCLUDED.lng,
        lat = EXCLUDED.lat;
    `;
    runSqlQuery(sql);
    console.log(`Uploaded signals batch ${i} to ${Math.min(i + batchSize, signals.length)}`);
  }
}

function uploadCrossings(crossings) {
  console.log(`Uploading ${crossings.length} crossings...`);
  const batchSize = 100;
  for (let i = 0; i < crossings.length; i += batchSize) {
    const batch = crossings.slice(i, i + batchSize);
    const values = batch.map(cross => `(${cross.id}, ${cross.lng}, ${cross.lat})`).join(', ');

    const sql = `
      INSERT INTO crossings (id, lng, lat) VALUES
      ${values}
      ON CONFLICT (id) DO UPDATE SET
        lng = EXCLUDED.lng,
        lat = EXCLUDED.lat;
    `;
    runSqlQuery(sql);
    console.log(`Uploaded crossings batch ${i} to ${Math.min(i + batchSize, crossings.length)}`);
  }
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  uploadRoads(data.roads);
  uploadSignals(data.signals);
  uploadCrossings(data.crossings);

  console.log('\nSuccessfully uploaded all road data to the database!');
}

main();
