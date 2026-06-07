# DriveBy: File-by-File Technical Guide

This document lists the purpose, implementation, and core concepts for every major file in the project.

---

## 1. Core Source Files (`src/`)

### `src/index.js`
- **Purpose**: Main entry point for the client-side simulation.
- **Implementation**: Sets up the Mapbox map, instantiates the custom WebGL `SFLayer`, initializes Rapier3D physics (`PhysicsWorld`), and handles the animation/render loop for all active actors (player, traffic, neural agents, sensors).
- **Concept**: **Unified Game Loop**. Integrates real-time 3D rendering (Three.js), physical simulation stepping (Rapier3D), and geospatial coordinates projection (Mapbox).

---

### `src/ui/TrainingHUD.js`
- **Purpose**: Interactive Head-Up Display (HUD) showing live training metrics.
- **Implementation**: Renders real-time statistics (steps, episode rewards, losses), neural network weights, sensor activations, and performance graphs. Uses CSS Grid and Canvas for rendering dynamic weight matrices and graphs.
- **Concept**: **Real-Time Visual Diagnostics**. Visualizes high-dimensional neural states and reinforcement learning parameters directly in the simulator viewport.

---

### `src/ui/CameraToggle.js`
- **Purpose**: Viewport camera control.
- **Implementation**: Exposes UI buttons and maps key bindings to toggle the active Three.js camera viewpoint between Chase Cam (third-person), Helicopter Cam (overhead), and individual Neural Agent sensor feeds.
- **Concept**: **Multi-Viewport Orthogonal Perspective**. Dynamically adjusts camera target groups and projection matrices to view active actors.

---

### `src/classes/AssetManager.js`
- **Purpose**: Handles loading and registration of 3D models and textures.
- **Implementation**: Uses Three.js `OBJLoader`, `MTLLoader`, and `TextureLoader` wrapped in a central `LoadingManager` to load assets and register them as reuseable geometries and materials.
- **Concept**: **Asset Cache & Loader Pool**. Centralizes asset references to prevent duplicate network requests and optimize memory consumption.

---

### `src/network/AgentSocket.js`
- **Purpose**: WebSocket communication layer between client and RL backend.
- **Implementation**: Establishes a persistent `WebSocket` connection to the Python server. Serializes agent sensor states/rewards into JSON payloads and deserializes incoming actions (steering, throttle) for the physics controller.
- **Concept**: **Asynchronous State-Action Loop**. Real-time message exchange enabling remote model inference and training.

---

### `src/agents/AgentManager.js`
- **Purpose**: Spawns and manages all autonomous neural driving agents.
- **Implementation**: Instantiates `NeuralAgent` actors, distributes their starting geographical positions along the road network graph, and orchestrates their state serialization to the websocket.
- **Concept**: **Entity-Component-System (ECS) Orchestrator**. Tracks active agent lifecycles, resetting their positions and updating their states upon collision or target completion.

---

### `src/agents/NeuralAgent.js`
- **Purpose**: Represents an autonomous vehicle agent controlled by a neural network.
- **Implementation**: Uses raycasts (Three.js/Rapier3D) to sense obstacles in front and to the sides. Calculates rewards based on distance traveled, lane-centering, and collision avoidance.
- **Concept**: **Deep Reinforcement Learning Agent**. Maps continuous sensor readings (states) to discrete/continuous control commands (actions) via a deep neural model.

---

### `src/agents/CarAgent.js`
- **Purpose**: Base class for all motorized vehicle entities.
- **Implementation**: Implements general vehicle movements, tire friction animations, and meshes.
- **Concept**: **Subclass Inheritance**. Decouples base physical vehicle properties from control controllers (player vs. neural network vs. traffic script).

---

### `src/agents/PlayerCar.js`
- **Purpose**: Represents the player's controllable vehicle.
- **Implementation**: Translates keyboard inputs (`WASD` / arrows) into physical forces applied to a Rapier3D rigid body. Handles collisions, plays autopilot warning chimes, and triggers crash sounds.
- **Concept**: **Rigid Body Physics Controller**. Applies impulses and torques directly to a physical collider while maintaining camera tracking offsets.

---

### `src/agents/SensorCamera.js`
- **Purpose**: Renders visual representation of camera sensors.
- **Implementation**: Creates offscreen WebGL render targets simulating the onboard camera sensors on autonomous agents, drawing depth and segmentation masks.
- **Concept**: **Synthetic Visual Perception**. Replicates autonomous vehicle camera streams for perception task validation.

---

### `src/agents/Traffic.js`
- **Purpose**: Manages background city traffic and pedestrians.
- **Implementation**: Scripted actors that spawn along the road network. Vehicles follow lanes and stop at intersection signals. Pedestrians cross streets using detected crosswalk vertices.
- **Concept**: **Heuristic Ambient Simulation**. Uses path-following behaviors and finite-state machines to populate the environment with reactive obstacles.

---

### `src/map/RoadGraph.js`
- **Purpose**: Directed road network graph for pathfinding.
- **Implementation**: Parses compiled road lanes and intersections, building a directed adjacency list representation. Uses an A* (A-Star) heuristic search algorithm to compute shortest paths between road nodes.
- **Concept**: **Geospatial Graph Routing**. Resolves continuous latitude/longitude paths into discrete graph nodes and edge traversals.

---

### `src/map/sfLayer.js`
- **Purpose**: Three.js integration layer for Mapbox GL JS.
- **Implementation**: Implements Mapbox's `CustomLayerInterface`. Synchronizes Three.js projection matrices and light rigs with Mapbox's camera coordinates using WebGL context sharing.
- **Concept**: **Mercator Anchor Projection**. Projects local metric coordinates into global Web Mercator units relative to a geographical origin.

---

### `src/map/mapbox.js`
- **Purpose**: Initializes the core mapping interface.
- **Implementation**: Configures Mapbox GL JS map settings, sets visual styles (night mode presets), and binds view events.
- **Concept**: **Vector Tile Rasterization**. Displays high-fidelity geographical base maps alongside custom 3D overlays.

---

### `src/map/SFLowPolyCity.js`
- **Purpose**: Unused module designed to load a low-poly San Francisco 3D mesh.
- **Implementation**: Imports `FBXLoader` to parse city geometries and link texture maps.
- **Concept**: **Mesh Hierarchical Loading**. Loads large 3D scene files in a single WebGL group overlay.

---

### `src/physics/Colliders.js`
- **Purpose**: Custom intersection and bounding volume definitions.
- **Implementation**: Wraps common intersection algorithms (Sphere-Sphere, AABB-AABB, OBB, Raycast) for fast collision testing.
- **Concept**: **Bounding Volume Hierarchy (BVH)**. Simplifies complex meshes into primitive shapes to accelerate collision checks.

---

### `src/physics/PhysicsWorld.js`
- **Purpose**: Core 3D physics engine integration.
- **Implementation**: Initializes `@dimforge/rapier3d-compat`. Manages rigid bodies (dynamic, kinematic, static), colliders, gravity, and steps the physics world at regular intervals.
- **Concept**: **Deterministic Rigid Body Dynamics**. Solves contact forces and velocity constraints for moving vehicles.

---

## 2. Server Stack (`server/`)

### `server/dev.js`
- **Purpose**: Webpack development server and proxy.
- **Implementation**: Starts the webpack compiler with file-watching, serves the local site, and launches a WebSocket proxy relay for the Python backend.
- **Concept**: **Hot Module Reloading (HMR) & Proxy Relay**. Connects local static frontend files with active backend server runtimes.

---

### `server/index.js`
- **Purpose**: Production application server.
- **Implementation**: Simple Express static server hosting directory routes and handling assets.
- **Concept**: **Static File Delivery**. Serves production-built bundles and assets with minimal overhead.

---

### `server/wsRelay.js`
- **Purpose**: WebSockets communication relay.
- **Implementation**: Intermediary server that routes incoming simulator messages to the Python RL backend and returns model inferences.
- **Concept**: **Cross-Protocol Communication Bridge**. Channels high-throughput client states to computation servers.

---

## 3. RL Backend (`rl/`)

### `rl/server.py`
- **Purpose**: Python-based Deep Reinforcement Learning server.
- **Implementation**: Built with PyTorch and websockets. Implements PPO (Proximal Policy Optimization) / DQN (Deep Q-Network) algorithms. Receives agent observation vectors, evaluates actions, updates model weights, and saves checkpoints.
- **Concept**: **Off-Policy RL Agent Training**. Decouples slow, memory-intensive neural network gradient descents from high-speed client-side physics.

---

## 4. Helper Tools & Scripts (`tools/`)

### `tools/buildSfRoadData.js`
- **Purpose**: Processes raw OpenStreetMap data into game-ready structures.
- **Implementation**: Reads raw JSON map files, filters out pedestrian walkways/service lanes, extracts road node arrays bounded by coordinate limits, and writes `src/map/sfRoadData.json`.
- **Concept**: **ETL (Extract, Transform, Load) Pipeline**. Converts raw geographical formats into lightweight structural simulation graphs.

---

### `tools/uploadAssets.js`
- **Purpose**: Uploads large 3D models and textures to cloud storage.
- **Implementation**: Scans model folders and executes InsForge CLI storage commands to upload files to a public bucket, saving URL outputs.
- **Concept**: **CDN-Backed Asset Hosting**. Moves heavy binary files out of the repository codebase into cloud storage buckets.

---

### `tools/uploadToDb.js`
- **Purpose**: Populates the Postgres database with the SF road network.
- **Implementation**: Parses the compiled road/crossing JSON and executes batch SQL inserts into the InsForge database via CLI query tools.
- **Concept**: **Relational Road Schema Migration**. Maps coordinate-based road lists into queryable relational database tables.

---

## 5. Configurations

### `webpack.config.js`
- **Purpose**: Bundles frontend JavaScript modules.
- **Implementation**: Bundles Three.js, Rapier, and HUD components into static files.
- **Concept**: **Static Asset Dependency Bundling**. Optimizes, resolves, and minifies ES module imports for browser distribution.
