"""Synthetic RL trajectory dataset logger.

Writes one JSONL record per agent per tick to rl/dataset/. Each record captures
the agent's observation (state vector + map context), the action the policy
chose, the reward/score, and any episode events (collision, reset, generation).

This is an MVP (hackathon) artifact. The simulation runs in a 3D world — real
San Francisco 3D buildings and geo-located agents rendered with Mapbox GL JS +
Three.js — while route planning uses a 2D building-footprint grid (A*). The
dataset is SYNTHETIC (simulator-generated), an RL research/benchmark artifact,
not real-world sensor data or human driving demonstrations. Higher-fidelity
vehicle dynamics, camera/LiDAR sensor streams, and richer traffic are future
scope. Label it as simulated wherever it is shared.

Format: newline-delimited JSON (.jsonl), one run per file, plus a meta.json
describing the run. JSONL streams cleanly and loads into pandas/HF datasets.
"""

import json
import os
import time
from datetime import datetime, timezone

DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset")


class DatasetLogger:
    def __init__(self, state_size, agent_count, enabled=True):
        self.enabled = enabled
        self.state_size = state_size
        self.agent_count = agent_count
        self.record_count = 0
        self._fh = None
        if not self.enabled:
            return

        os.makedirs(DATASET_DIR, exist_ok=True)
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.run_id = run_id
        self.path = os.path.join(DATASET_DIR, f"run_{run_id}.jsonl")
        self.meta_path = os.path.join(DATASET_DIR, f"run_{run_id}.meta.json")
        self._fh = open(self.path, "w", buffering=1)  # line-buffered
        self._write_meta()
        print(f"[dataset] logging synthetic trajectories -> {self.path}")

    def _write_meta(self):
        meta = {
            "run_id": self.run_id,
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "data_type": "synthetic_simulation",
            "stage": "mvp",
            "disclaimer": (
                "Synthetic RL trajectories from the DriveBy simulator (MVP). "
                "3D world (real SF 3D buildings, geo-located agents) with 2D "
                "A* route planning. Not real sensor data or human driving. "
                "For RL research/benchmarking only."
            ),
            "simulator": "DriveBy — 3D Mapbox/Three.js world, 2D A* pathfinding, bicycle-model dynamics",
            "future_scope": [
                "higher-fidelity vehicle dynamics",
                "camera/LiDAR sensor streams",
                "richer traffic and pedestrian behaviour",
            ],
            "state_size": self.state_size,
            "agent_count": self.agent_count,
            "schema": {
                "tick": "int simulation tick",
                "agent_id": "int agent index",
                "state": f"float[{self.state_size}] observation vector",
                "lng": "float agent longitude (map context)",
                "lat": "float agent latitude (map context)",
                "waypoint": "[dist, angle] to current A* waypoint (map context)",
                "action": "{throttle, steering, brake} chosen by the policy",
                "reward": "float reward/score this tick",
                "events": "{collided, reset, generation}",
                "ts_unix": "float wall-clock time the record was logged",
            },
        }
        with open(self.meta_path, "w") as f:
            json.dump(meta, f, indent=2)

    def log(self, tick, agent_id, state, action, reward, events, lng=None,
            lat=None, waypoint=None):
        if not self.enabled or self._fh is None:
            return
        record = {
            "tick": tick,
            "agent_id": agent_id,
            "state": state,
            "lng": lng,
            "lat": lat,
            "waypoint": waypoint,
            "action": action,
            "reward": reward,
            "events": events,
            "ts_unix": time.time(),
        }
        self._fh.write(json.dumps(record) + "\n")
        self.record_count += 1

    def close(self):
        if self._fh is not None:
            self._fh.close()
            self._fh = None
            print(f"[dataset] wrote {self.record_count} records to {self.path}")
