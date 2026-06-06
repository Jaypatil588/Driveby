import { CarAgent } from './CarAgent.js';

// 20 spawn points on real SF streets (Market, Montgomery, Kearny, etc.)
const SPAWN_POINTS = [
  [-122.3988, 37.7916], [-122.3975, 37.7920], [-122.3962, 37.7924],
  [-122.3995, 37.7930], [-122.3980, 37.7935], [-122.3968, 37.7940],
  [-122.4000, 37.7945], [-122.3985, 37.7950], [-122.3972, 37.7955],
  [-122.3958, 37.7960], [-122.4005, 37.7916], [-122.3993, 37.7922],
  [-122.3978, 37.7928], [-122.3965, 37.7933], [-122.4010, 37.7938],
  [-122.3997, 37.7943], [-122.3983, 37.7948], [-122.3970, 37.7953],
  [-122.3956, 37.7958], [-122.4002, 37.7963],
];

const AGENT_COUNT = 100;

export class AgentManager {
  constructor(physicsWorld, scene) {
    this.agents = [];
    this._actionQueue = new Map(); // id → action

    for (let i = 0; i < AGENT_COUNT; i++) {
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      // small random offset so agents at same spawn don't overlap exactly
      const lng = spawn[0] + (Math.random() - 0.5) * 0.0002;
      const lat = spawn[1] + (Math.random() - 0.5) * 0.0002;
      const hue = i / AGENT_COUNT;
      this.agents.push(new CarAgent(i, lng, lat, physicsWorld, scene, hue));
    }
  }

  update(delta) {
    for (const agent of this.agents) {
      if (this._actionQueue.has(agent.id)) {
        agent.applyAction(this._actionQueue.get(agent.id));
        this._actionQueue.delete(agent.id);
      }
      agent.update(delta);
    }
  }

  getAllObservations() {
    return this.agents.map(a => a.getObservation());
  }

  applyActions(actions) {
    for (const action of actions) {
      this._actionQueue.set(action.id, action);
    }
  }
}
