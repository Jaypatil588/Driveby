# CLAUDE.md — Autonomous Driving RL Environment

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# SF City Block — Multi-Agent Simulation

## What This Project Is

A browser-based reinforcement learning environment built on top of SynthCity
(https://github.com/jeffbeene/synthcity), with the procedural cyberpunk city
replaced by a real San Francisco downtown block powered by Mapbox GL JS. The
environment hosts up to 100 autonomous car agents simultaneously, each trained
to drive like a Waymo. A human player can also take control of one car at any
time. The whole thing runs as a web server — no desktop app, no GPU required
on the client.

**Main priority for every task: the interactive SF driving experience comes
first. Training infrastructure is secondary.**

---

## Tech Stack

| Layer               | Technology                                    |
| ------------------- | --------------------------------------------- |
| City rendering      | Mapbox GL JS (3D buildings, real SF geometry) |
| 3D agents & scene   | Three.js (custom Mapbox layer)                |
| Physics & collision | Rapier.js (WASM, runs in browser)             |
| Web server          | Node.js + Express                             |
| Real-time comms     | WebSocket (ws library)                        |
| RL backend          | Python — FastAPI + Ray RLlib                  |
| RL algorithm        | PPO with CNN policy                           |
| Agent observations  | WebGLRenderTarget (front/back/side cameras)   |
| Build tool          | Webpack (already in SynthCity)                |

---

## Repository Structure (target state)

```
/
├── CLAUDE.md                  ← this file
├── index.html                 ← entry point, Mapbox + Three.js canvas
├── package.json
├── webpack.config.js
├── src/
│   ├── main.js                ← app bootstrap
│   ├── map/
│   │   ├── mapbox.js          ← Mapbox GL JS init, SF downtown view
│   │   ├── sfLayer.js         ← Three.js custom layer injected into Mapbox
│   │   └── roads.js           ← road mesh + drivable area from OSM GeoJSON
│   ├── agents/
│   │   ├── CarAgent.js        ← single car: model, physics body, sensors
│   │   ├── AgentManager.js    ← spawns/updates all 100 agents
│   │   ├── PlayerCar.js       ← human-controlled car (WASD + arrow keys)
│   │   └── SensorCamera.js    ← WebGLRenderTarget for front/back/side views
│   ├── physics/
│   │   ├── PhysicsWorld.js    ← Rapier.js world init
│   │   └── Colliders.js       ← building + road boundary colliders from map
│   ├── network/
│   │   └── AgentSocket.js     ← WebSocket client — sends state, receives actions
│   ├── ui/
│   │   ├── Dashboard.js       ← bird's-eye HUD, agent count, fps, training stats
│   │   └── CameraToggle.js    ← switch between bird's eye and player follow cam
│   └── assets/
│       └── car/               ← GLTF car model (keep from SynthCity)
├── server/
│   ├── index.js               ← Express server, serves static files
│   └── wsRelay.js             ← WebSocket relay between browser and Python
└── rl/
    ├── env.py                 ← OpenAI Gym environment wrapper
    ├── train.py               ← Ray RLlib multi-agent training entry point
    ├── policy.py              ← CNN policy network definition
    └── server.py              ← FastAPI server, receives observations, sends actions
```

---

## Task List

Tasks are ordered by priority. Complete Phase 1 and 2 before anything else —
the interactive SF driving experience is the demo centrepiece.

Read this file in full before starting any task. Each task lists the files it
touches so agents do not duplicate work.

---

### PHASE 1 — SF City Foundation

---

#### TASK 1 — Fork SynthCity and strip the procedural city

**Goal:** Remove everything cyberpunk/procedural from SynthCity. Keep only the
car model, the Three.js renderer setup, and the webpack build. The output is a
blank Three.js scene on a white background — nothing visible except the car.

**Files to modify:**

- `src/main.js` — remove procedural city calls, keep renderer init
- `src/` — delete any city generation files (buildings, roads, skybox,
  neon lights, synthwave music loader)
- `package.json` — remove unused dependencies
- `webpack.config.js` — keep as-is

**Steps:**

1. Clone https://github.com/jeffbeene/synthcity
2. Run `npm install` and confirm it builds with `npm run build`
3. Identify and delete all files responsible for procedural city generation
4. Keep: Three.js renderer, the Bladerunner Sedan GLTF model, the animation
   loop, and the basic lighting setup
5. Confirm the scene renders: black background, one car visible, no errors in
   console

**Acceptance criteria:**

- `npm run build` succeeds with no errors
- Browser shows a Three.js scene with a single car and no city geometry
- No console errors

---

#### TASK 2 — Integrate Mapbox GL JS with SF downtown 3D buildings

**Goal:** Render real San Francisco downtown in the browser using Mapbox GL JS
with the 3D buildings layer enabled. The map must be centred on the SF
Financial District and locked to a top-down bird's-eye angle.

**Files to create/modify:**

- `index.html` — add Mapbox GL JS CDN, map container div
- `src/map/mapbox.js` — Mapbox init, style, camera, 3D buildings

**Steps:**

1. Add Mapbox GL JS v3 via CDN to `index.html`
2. Create a `<div id="map">` that fills the full viewport
3. In `mapbox.js` initialise the map:
   ```js
   const map = new mapboxgl.Map({
     container: "map",
     style: "mapbox://styles/mapbox/dark-v11",
     center: [-122.3988, 37.7956], // SF Financial District
     zoom: 16,
     pitch: 0, // bird's eye to start
     bearing: 0,
     antialias: true,
   });
   ```
4. On `map.on('load')` add the Mapbox 3D buildings layer:
   ```js
   map.addLayer({
     id: "3d-buildings",
     source: "composite",
     "source-layer": "building",
     filter: ["==", "extrude", "true"],
     type: "fill-extrusion",
     paint: {
       "fill-extrusion-color": "#1a1a2e",
       "fill-extrusion-height": ["get", "height"],
       "fill-extrusion-base": ["get", "min_height"],
       "fill-extrusion-opacity": 0.9,
     },
   });
   ```
5. Add a Mapbox access token — read from `process.env.MAPBOX_TOKEN` so it is
   never hardcoded
6. The map must not be draggable or zoomable by the user — lock interaction:
   ```js
   map.dragPan.disable();
   map.scrollZoom.disable();
   map.doubleClickZoom.disable();
   ```

**Acceptance criteria:**

- Browser shows SF Financial District with dark-themed 3D buildings
- Map is static (no user pan/zoom)
- No Mapbox token in source code

---

#### TASK 3 — Inject Three.js as a Mapbox custom layer

**Goal:** Mount a Three.js WebGL renderer on top of the Mapbox map so that
Three.js objects (cars) appear correctly positioned in the SF world. Mapbox and
Three.js must share the same WebGL context.

**Files to create:**

- `src/map/sfLayer.js` — Mapbox CustomLayerInterface implementation

**Steps:**

1. Implement the Mapbox `CustomLayerInterface` with `type: 'custom'` and
   `renderingMode: '3d'`
2. In the `onAdd(map, gl)` callback, create the Three.js renderer using the
   shared `gl` context:
   ```js
   this.renderer = new THREE.WebGLRenderer({
     canvas: map.getCanvas(),
     context: gl,
     antialias: true,
   });
   this.renderer.autoClear = false;
   ```
3. Create a Three.js `Scene` and `Camera` in `onAdd`
4. In the `render(gl, matrix)` callback, update the Three.js camera matrix from
   the Mapbox `matrix` parameter so Three.js objects align with the map
5. Export a helper function `worldToMapbox(lng, lat, altitude)` that converts
   geographic coordinates to Three.js world coordinates using
   `mapboxgl.MercatorCoordinate.fromLngLat()`
6. Add the layer to the map after the buildings layer with:
   ```js
   map.addLayer(sfLayer, "waterway-label");
   ```

**Acceptance criteria:**

- Three.js scene renders on top of Mapbox without flickering
- A test `THREE.BoxGeometry` placed at SF city hall coordinates appears at the
  correct location on the map
- No Z-fighting between building layer and Three.js objects

---

### PHASE 2 — Interactive Driving (HIGHEST PRIORITY)

---

#### TASK 4 — Add the player car to the SF map

**Goal:** Place the SynthCity car model (Bladerunner Sedan GLTF) in the Three.js
layer at a start position on a real SF street. The car must be visible from the
bird's-eye camera and correctly scaled relative to the buildings.

**Files to create/modify:**

- `src/agents/PlayerCar.js` — player car class
- `src/map/sfLayer.js` — add car to scene

**Steps:**

1. In `PlayerCar.js` load the GLTF car model with `THREE.GLTFLoader`
2. Scale the model so it is proportionally correct against Mapbox building scale
   (test against a known SF building)
3. Set the initial position to the intersection of Market St and 1st St:
   - lng: -122.3988, lat: 37.7916
   - Use `worldToMapbox()` from Task 3 to convert to Three.js coordinates
4. Export a `PlayerCar` class with methods:
   - `update(delta)` — called every frame
   - `getPosition()` — returns `{ lng, lat, heading }`
   - `applyInput(input)` — takes `{ throttle, steering, brake }`
5. Add the car to the Three.js scene in `sfLayer.js`

**Acceptance criteria:**

- Car model visible on the SF map at the correct street location
- Model is the correct scale — not giant, not microscopic
- No console errors from GLTF loader

---

#### TASK 5 — Implement keyboard driving controls

**Goal:** The player can drive the car around SF using WASD or arrow keys.
Steering must feel responsive. The car must follow real road geometry — it
should not clip through buildings.

**Files to create/modify:**

- `src/agents/PlayerCar.js` — add keyboard input handling and simple vehicle
  dynamics
- `src/main.js` — wire up keyboard listener

**Steps:**

1. Add a keyboard state tracker to `main.js`:
   ```js
   const keys = {};
   window.addEventListener("keydown", (e) => (keys[e.key] = true));
   window.addEventListener("keyup", (e) => (keys[e.key] = false));
   ```
2. In `PlayerCar.update(delta, keys)`:
   - `W` or `ArrowUp` → throttle forward
   - `S` or `ArrowDown` → brake / reverse
   - `A` or `ArrowLeft` → steer left
   - `D` or `ArrowRight` → steer right
3. Implement a simple bicycle model for vehicle dynamics:
   - `speed` — current speed, clamped to max 60 km/h equivalent
   - `heading` — current bearing in radians
   - Apply steering as `heading += steeringAngle * (speed / maxSpeed) * delta`
   - Update Three.js position and rotation each frame
4. Convert the updated position back to lng/lat using Mapbox
   `MercatorCoordinate` for use by other systems
5. The car must NOT clip through buildings — collision is handled in Task 7,
   but add a basic boundary check here so the car cannot leave the defined SF
   block area (bounding box: lng -122.404 to -122.393, lat 37.788 to 37.797)

**Acceptance criteria:**

- WASD drives the car smoothly around the map
- Car turns correctly relative to its heading (not world axes)
- Car cannot drive outside the SF block bounding box
- Driving feels responsive — no noticeable input lag

---

#### TASK 6 — Camera system: bird's eye and follow cam

**Goal:** Two camera modes. Bird's eye (default): locked top-down view showing
all agents. Follow cam: smooth third-person camera that trails the player car.
Toggle with the `C` key.

**Files to create:**

- `src/ui/CameraToggle.js` — camera mode manager

**Steps:**

1. Create two Three.js cameras:
   - `birdEyeCamera`: `OrthographicCamera` positioned directly above the SF
     block centre, looking down. Frustum sized to show the full block.
   - `followCamera`: `PerspectiveCamera` positioned behind and above the player
     car, looking at the car. Use lerp for smooth following:
     ```js
     followCamera.position.lerp(targetPosition, 0.05);
     followCamera.lookAt(car.mesh.position);
     ```
2. Default to `birdEyeCamera`
3. On `C` keypress, toggle between cameras
4. In the Mapbox custom layer `render()` callback, use whichever camera is
   active
5. Add a small on-screen label showing current mode: `[C] Bird's Eye` or
   `[C] Follow Cam`

**Acceptance criteria:**

- Default view shows all of the SF block from above
- `C` key smoothly transitions to a follow camera behind the player car
- Follow camera does not jerk or snap

---

### PHASE 3 — Physics and Collision

---

#### TASK 7 — Integrate Rapier.js physics engine

**Goal:** Set up a Rapier.js physics world that runs in the browser. This is
the foundation for collision detection between cars and between cars and
buildings.

**Files to create:**

- `src/physics/PhysicsWorld.js` — Rapier world init and step loop

**Steps:**

1. Install Rapier WASM: `npm install @dimforge/rapier3d-compat`
2. In `PhysicsWorld.js`, initialise Rapier asynchronously:
   ```js
   import RAPIER from "@dimforge/rapier3d-compat";
   await RAPIER.init();
   const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
   ```
3. Export a `PhysicsWorld` class with:
   - `step(delta)` — advances the simulation
   - `addBoxCollider(x, y, z, halfW, halfH, halfD, isStatic)` — adds a box
     rigid body, returns the body handle
   - `addCarCollider(x, y, z)` — adds a dynamic box body sized for the car
   - `getPosition(handle)` — returns `{ x, y, z }` of a body
   - `applyForce(handle, fx, fy, fz)` — apply force to a dynamic body
4. Call `world.step()` inside the Three.js animation loop at 60Hz
5. Gravity should be effectively disabled for cars (they are on a flat plane) —
   lock the Y axis of all car bodies

**Acceptance criteria:**

- Rapier initialises without errors
- A dynamic box body falls under gravity in a test scene and stops on a static
  plane body
- Physics step runs at 60Hz without frame drops on a standard laptop

---

#### TASK 8 — Generate building colliders from Mapbox data

**Goal:** Extract building footprints from Mapbox and create Rapier static box
colliders so that cars cannot drive through buildings.

**Files to create:**

- `src/physics/Colliders.js` — building + road boundary collider generator

**Steps:**

1. After the Mapbox map loads, query building features in the SF block:
   ```js
   const buildings = map.queryRenderedFeatures({ layers: ["3d-buildings"] });
   ```
2. For each building feature, extract its bounding box (min/max lng/lat from
   the GeoJSON polygon coordinates)
3. Convert the bounding box corners to Three.js world coordinates using
   `worldToMapbox()`
4. Create a static Rapier box collider for each building:
   ```js
   physicsWorld.addBoxCollider(cx, 0, cz, halfW, 10, halfD, true);
   ```
   where `cx, cz` is the centre and `halfW, halfD` are half the dimensions
5. Add the outer boundary of the SF block as four static wall colliders so
   cars cannot escape the area
6. Do not create colliders for buildings with `height < 3` (lamp posts, kerbs)

**Acceptance criteria:**

- Driving the player car into a building stops the car
- No car can pass through or over a building
- Performance does not drop when building colliders are added (target: 60fps)

---

#### TASK 9 — Connect player car physics to Rapier

**Goal:** Replace the simple positional update in `PlayerCar.js` with a proper
Rapier dynamic body so that physics (collision response, momentum) apply to the
player car.

**Files to modify:**

- `src/agents/PlayerCar.js`

**Steps:**

1. On car spawn, create a Rapier dynamic body for the player car via
   `physicsWorld.addCarCollider(startX, 0, startZ)`
2. On `update(delta, keys)`:
   - Read current position and rotation from the Rapier body
   - Apply throttle as a forward force relative to car heading:
     ```js
     const force = heading.multiplyScalar(throttle * FORCE_SCALE);
     physicsWorld.applyForce(carHandle, force.x, 0, force.z);
     ```
   - Apply steering by rotating the rigid body's angular velocity
   - Apply damping when no throttle is pressed so the car decelerates naturally
3. Sync the Three.js car mesh position and rotation from the Rapier body each
   frame
4. Remove the manual bounding box clamp from Task 5 — the boundary wall
   colliders from Task 8 handle this now

**Acceptance criteria:**

- Player car bounces off buildings realistically
- Car decelerates when throttle is released
- Car mesh position matches physics body position exactly

---

### PHASE 4 — Multi-Agent System

---

#### TASK 10 — Spawn 100 AI car agents

**Goal:** Spawn 100 car agents at random valid road positions across the SF
block. Each agent must have its own Three.js mesh, Rapier physics body, and
unique colour tint so they are distinguishable.

**Files to create:**

- `src/agents/CarAgent.js` — AI agent class
- `src/agents/AgentManager.js` — spawns and updates all agents

**Steps:**

1. In `CarAgent.js` create a class that mirrors `PlayerCar.js` but takes
   actions externally rather than from keyboard:
   - `constructor(id, startLng, startLat, physicsWorld, scene)`
   - `applyAction({ throttle, steering, brake })` — called by RL backend or
     simple rule-based fallback
   - `getObservation()` — returns `{ id, lng, lat, heading, speed, colliding }`
   - `update(delta)` — steps physics, syncs mesh
2. Apply a unique `THREE.Color` tint to each agent's car material so they are
   visually distinct (use HSL with varying hue)
3. In `AgentManager.js`:
   - Define 20 valid spawn points on real SF streets (hardcode lat/lng pairs
     on Market St, Montgomery St, Kearny St, etc.)
   - Spawn 100 agents distributed across those points (5 per spawn point)
   - Each frame call `agent.update(delta)` for all agents
   - Provide `getAllObservations()` — returns array of all agent observations
   - Provide `applyActions(actions)` — takes `[{ id, throttle, steering }]`
     and routes each to the correct agent
4. Until the RL backend is connected, agents use a simple rule-based fallback:
   drive straight, turn randomly every 3 seconds

**Acceptance criteria:**

- 100 cars visible on the SF map in bird's-eye view
- All cars move — none are stationary or frozen
- Frame rate stays above 30fps with all 100 agents active
- No two cars spawn inside the same building

---

#### TASK 11 — WebSocket server for agent control

**Goal:** A Node.js WebSocket server that relays observations from the browser
to the Python RL backend and returns actions back to the browser. This is the
communication bridge.

**Files to create:**

- `server/index.js` — Express server
- `server/wsRelay.js` — WebSocket relay
- `src/network/AgentSocket.js` — browser-side WebSocket client

**Steps:**

1. In `server/index.js`:
   - Serve the built frontend as static files from `/dist`
   - Start an Express server on port 3000
   - Start a `ws` WebSocket server on port 3001
2. In `server/wsRelay.js`:
   - Accept two types of clients: `browser` and `rl_backend`
   - When a `browser` client sends observations, forward them to `rl_backend`
   - When `rl_backend` sends actions, forward them to `browser`
   - Message format (JSON):
     ```json
     {
       "type": "observations",
       "tick": 1234,
       "agents": [
         {
           "id": 0,
           "lng": -122.3988,
           "lat": 37.7956,
           "heading": 1.2,
           "speed": 5.3
         }
       ]
     }
     ```
     ```json
     {
       "type": "actions",
       "tick": 1234,
       "agents": [{ "id": 0, "throttle": 0.8, "steering": -0.2, "brake": 0.0 }]
     }
     ```
3. In `AgentSocket.js` (browser):
   - Connect to `ws://localhost:3001`
   - Every 100ms send `getAllObservations()` from `AgentManager`
   - On receiving actions message, call `agentManager.applyActions(actions)`
4. If the RL backend is not connected, the relay must not crash — fall back to
   the rule-based behaviour in Task 10

**Acceptance criteria:**

- Browser connects to WebSocket server without errors
- Observations are transmitted from browser to server every 100ms
- Actions received from server are applied to the correct agents
- Server handles browser disconnect and reconnect gracefully

---

### PHASE 5 — Sensor System

---

#### TASK 12 — Per-agent camera sensors (front, back, sides)

**Goal:** Each agent has four `WebGLRenderTarget` cameras — front, back, left,
right — that capture what the agent "sees". For the demo, render sensors for
the player car and the 10 nearest agents only (performance constraint).

**Files to create:**

- `src/agents/SensorCamera.js`

**Steps:**

1. In `SensorCamera.js` create a class that attaches four
   `THREE.PerspectiveCamera` instances to a car mesh:
   - Front: `position(0, 0.5, 1.2)` relative to car, looking forward
   - Back: `position(0, 0.5, -1.2)` looking backward
   - Left: `position(-1, 0.5, 0)` looking left
   - Right: `position(1, 0.5, 0)` looking right
2. Each camera renders to a `THREE.WebGLRenderTarget` of size `84x84` pixels
   (standard RL image observation size)
3. After rendering each frame, extract pixel data:
   ```js
   renderer.readRenderTargetPixels(target, 0, 0, 84, 84, pixelBuffer);
   ```
4. Export `getFrames()` — returns `{ front, back, left, right }` as
   `Uint8Array` buffers
5. In `AgentManager.js`, attach `SensorCamera` to the player car and the 10
   nearest agents, updated every other frame (every ~33ms) to limit GPU load
6. Include sensor frames in the observation payload sent over WebSocket:
   ```json
   { "id": 0, "sensors": { "front": "<base64>", "back": "<base64>" } }
   ```

**Acceptance criteria:**

- Four sensor views render correctly for the player car
- Sensor images show actual scene geometry (buildings, road, other cars)
- Frame rate does not drop below 25fps when sensors are active
- Pixel data is correctly extracted and base64-encoded for WebSocket
