# Autonomous Vehicle RL - System Design Specification

## 1. Core Architecture Overview
A lightweight, headless 2D Reinforcement Learning environment mapping to a 3D Three.js visualizer. The system relies on a strictly rules-based asset architecture rather than pixel data, optimized for rapid local terminal training.

* **Physics Space:** 2D Planar $SE(2)$ (X, Y, Yaw).
* **Observation Space:** 16-Dimensional flattened 1D array.
* **Agent Architecture:** Modular pipeline (Perception -> Policy -> Actuation). No consolidated `agent.py`.

---

## 2. The Environment Setup

### 2.1 Raw Asset Data Templates (Environment Output)
When the environment scans the map, it extracts the raw data for each asset. The base format for all assets is a 6-element array:
`[asset_id, angle_to_asset, x, y, speed_of_asset, distance_to_asset]`

Specialized assets append unique context variables to the end of this base array:

* **Base/Static Asset (e.g., Curb, Building, Debris):**
  `[asset_id, angle_to_asset, x, y, 0.0, distance_to_asset]`
* **Traffic Light:**
  `[asset_id, angle_to_asset, x, y, 0.0, distance_to_asset, current_color_state, time_to_phase_change]`
* **Other Vehicle (Agent/NPC):**
  `[asset_id, angle_to_asset, x, y, speed_of_asset, distance_to_asset, heading_angle, turn_signal_state]`
* **Pedestrian:**
  `[asset_id, angle_to_asset, x, y, speed_of_asset, distance_to_asset, heading_angle, is_on_crosswalk_flag]`
* **Regulatory Sign (Stop/Yield):**
  `[asset_id, angle_to_asset, x, y, 0.0, distance_to_asset, sign_type_enum]`

### 2.2 The 16-Dimensional State Vector ($S_t$)
Because a simple neural network requires a fixed-size input, the agent's `perception.py` module must ingest the raw, variable-length asset arrays above and compress the top 3 closest ones into this exact 16-element array at every timestep:

1. **Ego Vehicle (2 dims):** `[speed, heading]`
2. **Navigation Target (2 dims):** `[distance_to_waypoint, angle_to_waypoint]`
3. **Asset 1 - Closest (4 dims):** `[type_id, relative_distance, relative_angle, rule_state]`
4. **Asset 2 - Second Closest (4 dims):** `[type_id, relative_distance, relative_angle, rule_state]`
5. **Asset 3 - Third Closest (4 dims):** `[type_id, relative_distance, relative_angle, rule_state]`

*(Note: If fewer than 3 assets exist in the radius, pad remaining slots with `0.0`)*

**Rule State Map (Calculated by Perception Module):**
* `1.0`: Green Light / Go / Clear
* `-1.0`: Red Light / Stop / Static Obstacle (Curb) / Pedestrian / Vehicle in path

### 2.3 Required Environment Functions
1. **Spatial Sorting:** Calculate Euclidean distance from Ego to all active assets. Sort the list and pass only the raw arrays of the top 3 closest assets to the agent.
2. **Rule-State Manager:** Update dynamic asset rules before evaluating collisions (e.g., flipping a traffic light asset's `current_color_state` based on a timer).

### 2.4 Reward Function
* **Fatal Collision (Car, Pedestrian, Curb):** `-1000.0` (Terminal)
* **Traffic Rule Violation (Running Red Light, Blowing Stop Sign):** `-1000.0` (Terminal)
* **Route Completion:** `+1000.0` (Terminal)
* **A* Waypoint Reached:** `+10.0` (Pops waypoint off queue)
* **Time Step Penalty:** `-0.01` (Encourages driving efficiency)

---

## 3. The Agent Architecture

The agent is split into three discrete modules to process the raw environment data into a physical command.

### Module A: The State Processor (`perception.py`)
* **Responsibility:** The bridge between the Environment and the Neural Network.
* **Inputs:** Raw data arrays from the simulation backend (Ego state, A* target, and the top 3 variable-length specialized asset arrays).
* **Logic:** Translates the specialized data (like `current_color_state` or `is_on_crosswalk_flag`) into a single `-1.0` to `1.0` float, and flattens everything into the strict 16-element float array ($S_t$).
* **Outputs:** The normalized 1D tensor.

### Module B: The Policy Network (`policy.py`)
* **Responsibility:** The "Brain" (Multi-Layer Perceptron).
* **Inputs:** The 16-D tensor ($S_t$).
* **Logic:** * Pushes the tensor through 2-3 fully connected hidden layers.
  * Uses standard activation functions (e.g., ReLU) for hidden layers.
* **Outputs:** Raw action logits (Pending decision: Discrete classification probabilities OR Continuous regression floats).

### Module C: The Action Controller (`actuator.py`)
* **Responsibility:** Converts the neural network's mathematical output back into physics commands.
* **Inputs:** Action logits from `policy.py`.
* **Logic:** Translates abstract values into physical boundaries (e.g., mapping a raw float to a steering angle constraint, or decoding a discrete choice into an acceleration vector).
* **Outputs:** The final physical payload sent back to the physics loop.
