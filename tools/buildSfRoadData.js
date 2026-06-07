const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'data', 'sf-osm-raw.json');
const outputPath = path.join(__dirname, '..', 'src', 'map', 'sfRoadData.json');

const EXCLUDED_HIGHWAYS = new Set([
  'footway',
  'path',
  'steps',
  'cycleway',
  'service',
  'pedestrian',
  'track',
  'corridor',
]);

function parsePositiveInt(value, label, wayId) {
  if (value === undefined) return 0;
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`Way ${wayId} has non-integer ${label}: ${value}`);
  }
  const parsed = Number(value);
  if (parsed <= 0) throw new Error(`Way ${wayId} has non-positive ${label}: ${value}`);
  return parsed;
}

function directionalLanes(tags, wayId) {
  const oneway = tags.oneway;
  const lanes = parsePositiveInt(tags.lanes, 'lanes', wayId);
  const forward = parsePositiveInt(tags['lanes:forward'], 'lanes:forward', wayId);
  const backward = parsePositiveInt(tags['lanes:backward'], 'lanes:backward', wayId);

  if (oneway === 'yes' || oneway === '1' || oneway === 'true') {
    if (lanes === 0) return null;
    return { forwardLanes: lanes, backwardLanes: 0 };
  }

  if (oneway === '-1') {
    if (lanes === 0) return null;
    return { forwardLanes: 0, backwardLanes: lanes };
  }

  if (forward > 0 && backward > 0) {
    return { forwardLanes: forward, backwardLanes: backward };
  }

  return null;
}

function main() {
  const osm = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const nodes = new Map();
  for (const element of osm.elements) {
    if (element.type === 'node') nodes.set(element.id, element);
  }

  const roads = [];
  const skippedRoads = [];

  for (const element of osm.elements) {
    if (element.type !== 'way' || !element.tags?.highway) continue;
    if (EXCLUDED_HIGHWAYS.has(element.tags.highway)) continue;

    const lanes = directionalLanes(element.tags, element.id);
    if (!lanes) {
      skippedRoads.push({
        id: element.id,
        name: element.tags.name || null,
        highway: element.tags.highway,
        lanes: element.tags.lanes || null,
        forward: element.tags['lanes:forward'] || null,
        backward: element.tags['lanes:backward'] || null,
        oneway: element.tags.oneway || null,
      });
      continue;
    }

    const nodeRefs = element.nodes
      .map((id) => {
        const node = nodes.get(id);
        if (!node) throw new Error(`Way ${element.id} references missing node ${id}`);
        return { id, lng: node.lon, lat: node.lat };
      })
      .filter((node) => (
        node.lng >= -122.404 &&
        node.lng <= -122.393 &&
        node.lat >= 37.788 &&
        node.lat <= 37.797
      ));

    if (nodeRefs.length < 2) continue;

    roads.push({
      id: element.id,
      name: element.tags.name || null,
      highway: element.tags.highway,
      oneway: element.tags.oneway || null,
      forwardLanes: lanes.forwardLanes,
      backwardLanes: lanes.backwardLanes,
      nodes: nodeRefs,
    });
  }

  const signals = osm.elements
    .filter((element) => element.type === 'node' && element.tags?.highway === 'traffic_signals')
    .map((node) => ({ id: node.id, lng: node.lon, lat: node.lat }));

  const crossings = osm.elements
    .filter((element) => element.type === 'node' && element.tags?.highway === 'crossing')
    .map((node) => ({ id: node.id, lng: node.lon, lat: node.lat }));

  const output = {
    source: 'OpenStreetMap Overpass extract for DriveBy SF bounds',
    generatedAt: new Date().toISOString(),
    bounds: { minLng: -122.404, maxLng: -122.393, minLat: 37.788, maxLat: 37.797 },
    roads,
    signals,
    crossings,
    skippedRoads,
  };

  if (roads.length < 20) throw new Error(`Expected at least 20 strict lane roads, got ${roads.length}`);
  if (signals.length < 10) throw new Error(`Expected at least 10 traffic signals, got ${signals.length}`);
  if (crossings.length < 20) throw new Error(`Expected at least 20 crossings, got ${crossings.length}`);

  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log({
    roads: roads.length,
    signals: signals.length,
    crossings: crossings.length,
    skippedRoads: skippedRoads.length,
  });
}

main();
