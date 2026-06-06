# DriveBy — SF Multi-Agent RL Driving Environment

A browser-based reinforcement learning environment set in real San Francisco downtown. Up to 100 autonomous car agents drive simultaneously through the SF Financial District, each trainable to drive like a Waymo. A human player can take control at any time using WASD keys.

Built on top of [SynthCity](https://github.com/jeffbeene/synthcity) by Jeff Beene — the Three.js renderer setup and Bladerunner Sedan car model are derived from that project.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Map & 3D buildings | MapLibre GL JS (free, no API key) |
| 3D agents & scene | Three.js (custom MapLibre layer) |
| Physics & collision | Rapier.js (WASM, runs in browser) |
| Web server | Node.js + Express |
| Real-time comms | WebSocket |
| RL backend (optional) | Python — FastAPI + Ray RLlib |

---

## How to Run

### Requirements

- [Node.js](https://nodejs.org/en) v18+
- npm (comes with Node)

### 1. Install dependencies

```bash
npm install
```

### 2. Build the frontend

```bash
npm run build
```

For live rebuilding during development:

```bash
npm run dev
```

### 3. Start the server

```bash
node server/index.js
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Controls

| Key | Action |
|---|---|
| `W` / `Arrow Up` | Accelerate |
| `S` / `Arrow Down` | Brake / reverse |
| `A` / `Arrow Left` | Steer left |
| `D` / `Arrow Right` | Steer right |
| `C` | Toggle bird's eye / follow camera |

---

## Project Structure

```
/
├── src/
│   ├── index.js              — app bootstrap
│   ├── map/
│   │   ├── mapbox.js         — MapLibre GL JS init, SF downtown view
│   │   └── sfLayer.js        — Three.js custom layer injected into MapLibre
│   ├── agents/
│   │   ├── PlayerCar.js      — human-controlled car (WASD)
│   │   ├── CarAgent.js       — single AI agent
│   │   ├── AgentManager.js   — spawns and updates all 100 agents
│   │   └── SensorCamera.js   — WebGLRenderTarget front/back/side cameras
│   ├── physics/
│   │   ├── PhysicsWorld.js   — Rapier.js world
│   │   └── Colliders.js      — building + boundary colliders from map data
│   ├── network/
│   │   └── AgentSocket.js    — WebSocket client (observations out, actions in)
│   └── ui/
│       └── CameraToggle.js   — bird's eye and follow camera manager
└── server/
    ├── index.js              — Express static server (port 3000)
    └── wsRelay.js            — WebSocket relay to Python RL backend (port 3001)
```

---

## Connecting the RL Backend (optional)

The browser falls back to rule-based driving if no RL backend is connected. To connect a Python backend:

1. Start the Node server (`node server/index.js`)
2. Connect your Python client to `ws://localhost:3001?type=rl_backend`
3. Receive observation JSON, send back action JSON per the message format below

**Observation (browser → backend):**
```json
{
  "type": "observations",
  "tick": 1234,
  "agents": [{ "id": 0, "x": 0.512, "y": 0.734, "heading": 1.2, "speed": 0.0003 }]
}
```

**Action (backend → browser):**
```json
{
  "type": "actions",
  "tick": 1234,
  "agents": [{ "id": 0, "throttle": 0.8, "steering": -0.2, "brake": 0.0 }]
}
```

---

## Credits

- [SynthCity](https://github.com/jeffbeene/synthcity) by Jeff Beene — base Three.js renderer and Bladerunner Sedan model
- Bladerunner Sedan 3D model — Quaz30 ([sketchfab.com/quaz30](https://sketchfab.com/quaz30))
- Map tiles — [OpenFreeMap](https://openfreemap.org/) (free, no API key required)
