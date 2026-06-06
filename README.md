# DriveBy — SF Multi-Agent RL Driving Environment

A browser-based reinforcement learning environment set in real San Francisco downtown. Ten autonomous car agents drive simultaneously through the SF Financial District, each wired for backend-driven policy actions. A human player can take control at any time using WASD keys.

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
| RL backend | Python PyTorch policy over WebSocket |

---

## How to Run

### Requirements

- [Node.js](https://nodejs.org/en) v18+
- npm (comes with Node)
- Python 3 with `torch` and `websocket-client`

### 1. Install dependencies

```bash
npm install
```

### 2. Start the full dev stack

```bash
npm run dev
```

This clears ports `3000` and `3001`, starts webpack in watch mode, starts the Express server, starts the WebSocket relay, and launches the Python PyTorch RL backend.

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
npm run build
```

### Start components individually

```bash
npm start
npm run rl:backend
```

The in-app backend indicator should show `backend-connected`, and `RL controlled` should update as action messages arrive.

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
│   │   ├── AgentManager.js   — spawns and updates all 10 RL-enabled agents
│   │   └── SensorCamera.js   — WebGLRenderTarget front/back/side cameras
│   ├── physics/
│   │   ├── PhysicsWorld.js   — Rapier.js world
│   │   └── Colliders.js      — building + boundary colliders from map data
│   ├── network/
│   │   └── AgentSocket.js    — WebSocket client (observations out, actions in)
│   └── ui/
│       └── CameraToggle.js   — bird's eye and follow camera manager
└── server/
    ├── dev.js                — full dev stack launcher
    ├── index.js              — Express server, WebSocket relay, and RL backend launcher
    └── wsRelay.js            — WebSocket relay to RL backend (port 3001)
```

---

## Connecting the RL Backend

The browser sends observations to the RL backend through `ws://localhost:3001?type=browser`. The PyTorch backend connects through `ws://localhost:3001?type=rl_backend`.

1. Start the full stack (`npm run dev`)
2. Or start components individually with `npm start` and `npm run rl:backend`
3. Receive observation JSON, send back action JSON per the message format below

**Observation (browser → backend):**
```json
{
  "type": "observations",
  "tick": 1234,
  "agents": [{ "id": 0, "state": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], "collided": false, "score": 12.3 }]
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
