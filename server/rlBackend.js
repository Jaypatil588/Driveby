const WebSocket = require('ws');

const RELAY_URL = process.env.RL_RELAY_URL || 'ws://localhost:3001?type=rl_backend';
const TARGET_SPEED = 7.5;
const MAX_STEERING = 0.35;

const routeMemory = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRoute(agent) {
  let route = routeMemory.get(agent.id);
  if (!route) {
    route = {
      steeringBias: ((agent.id % 5) - 2) * 0.08,
      phase: agent.id * 0.7
    };
    routeMemory.set(agent.id, route);
  }
  return route;
}

function policyAction(agent, tick) {
  if (!Number.isFinite(agent.id) || !Array.isArray(agent.state) || agent.state.length !== 16) {
    throw new Error(`Invalid observation for agent ${agent.id}: ${JSON.stringify(agent)}`);
  }

  if (agent.collided) {
    return {
      id: agent.id,
      reset: true,
      generation: 1,
      bestScore: Math.max(agent.score, 0)
    };
  }

  const route = getRoute(agent);
  const normalizedSpeed = agent.state[0];
  const waypointAngle = agent.state[3];
  const speedError = TARGET_SPEED - normalizedSpeed * TARGET_SPEED;
  const throttle = clamp(speedError * 0.18, 0, 1);
  const brake = clamp(-speedError * 0.12, 0, 0.5);

  const weave = Math.sin((tick * 0.025) + route.phase) * 0.12;
  const headingCorrection = -waypointAngle * 0.45;
  const steering = clamp(route.steeringBias + weave + headingCorrection, -MAX_STEERING, MAX_STEERING);

  return {
    id: agent.id,
    throttle,
    steering,
    brake,
    generation: 1,
    bestScore: Math.max(agent.score, 0)
  };
}

function connect() {
  const ws = new WebSocket(RELAY_URL);

  ws.on('open', () => {
    console.log(`RL backend connected to ${RELAY_URL}`);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type !== 'observations') {
      throw new Error(`Unexpected browser message type: ${msg.type}`);
    }
    if (!Array.isArray(msg.agents)) {
      throw new Error('Observation message is missing agents array.');
    }

    ws.send(JSON.stringify({
      type: 'actions',
      tick: msg.tick,
      agents: msg.agents.map((agent) => policyAction(agent, msg.tick))
    }));
  });

  ws.on('close', (code, reason) => {
    throw new Error(`RL backend disconnected from relay: ${code} ${reason.toString()}`);
  });

  ws.on('error', (error) => {
    throw error;
  });
}

connect();
