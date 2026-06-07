import json
import sys

import torch
import torch.nn as nn
import websocket

STATE_SIZE = 20
AGENT_COUNT = 100


class PolicyNet(nn.Module):
    def __init__(self):
        super(PolicyNet, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(STATE_SIZE, 24),
            nn.ReLU(),
            nn.Linear(24, 12),
            nn.ReLU(),
            nn.Linear(12, 2),
            nn.Tanh(),
        )

    def forward(self, x):
        return self.net(x)


class AgentState:
    def __init__(self, agent_id):
        self.id = agent_id
        self.policy = PolicyNet()
        self.generation = 1
        self.score = 0.0
        self.best_score = -9999.0
        self.reset_needed = False


agents = {i: AgentState(i) for i in range(AGENT_COUNT)}


def mutate_policy(parent_policy, child_policy, mutation_rate=0.25, mutation_scale=0.06):
    child_policy.load_state_dict(parent_policy.state_dict())
    with torch.no_grad():
        for param in child_policy.parameters():
            mutation_mask = (torch.rand(param.size()) < mutation_rate).float()
            noise = torch.randn(param.size()) * mutation_scale
            param.add_(mutation_mask * noise)


def get_best_agent():
    best_id = max(agents.keys(), key=lambda k: agents[k].best_score)
    return agents[best_id]


def on_message(ws, message):
    data = json.loads(message)
    if data.get("type") != "observations":
        raise ValueError(f"Unexpected browser message type: {data.get('type')}")

    if "tick" not in data:
        raise ValueError("Observation message is missing tick.")
    if "agents" not in data:
        raise ValueError("Observation message is missing agents.")

    tick = data["tick"]
    observations = data["agents"]
    if not isinstance(observations, list):
        raise ValueError("Observation message is missing agents array.")

    response_agents = []

    for obs in observations:
        agent_id = obs.get("id")
        if agent_id is None or agent_id not in agents:
            raise ValueError(f"Observation has invalid agent id: {agent_id}")

        state_vector = obs.get("state")
        if not isinstance(state_vector, list) or len(state_vector) != STATE_SIZE:
            raise ValueError(f"Agent {agent_id} observation requires a {STATE_SIZE}-value state vector.")

        agent = agents[agent_id]
        if "collided" not in obs:
            raise ValueError(f"Agent {agent_id} observation is missing collided.")
        if "score" not in obs:
            raise ValueError(f"Agent {agent_id} observation is missing score.")

        collided = obs["collided"]
        agent.score = float(obs["score"])

        if collided:
            if agent.score > agent.best_score:
                agent.best_score = agent.score

            parent = get_best_agent()
            if parent.best_score > -50.0:
                mutate_policy(parent.policy, agent.policy)
            else:
                agent.policy = PolicyNet()

            agent.generation += 1
            agent.reset_needed = True
            print(
                f"[Agent {agent_id}] CRASHED. Resetting gen {agent.generation} "
                f"score={agent.score:.2f} best={agent.best_score:.2f}"
            )

        state_tensor = torch.FloatTensor(state_vector)
        with torch.no_grad():
            action_output = agent.policy(state_tensor).numpy()

        throttle_raw = float(action_output[0])
        steering = float(action_output[1])

        if throttle_raw > 0:
            throttle = throttle_raw
            brake = 0.0
        else:
            throttle = 0.0
            brake = abs(throttle_raw)

        response_agents.append({
            "id": agent_id,
            "throttle": throttle,
            "steering": steering,
            "brake": brake,
            "reset": agent.reset_needed,
            "generation": agent.generation,
            "bestScore": float(agent.best_score if agent.best_score > -9999 else agent.score),
        })

        agent.reset_needed = False

    ws.send(json.dumps({
        "type": "actions",
        "tick": tick,
        "agents": response_agents,
    }))


def on_error(ws, error):
    print(f"WebSocket error: {error}", file=sys.stderr)


def on_close(ws, close_status_code, close_msg):
    raise RuntimeError(f"WebSocket connection closed: code={close_status_code} message={close_msg}")


def on_open(ws):
    print("Connected to DriveBy WebSocket server as rl_backend.")


def connect_ws():
    ws_url = "ws://localhost:3001?type=rl_backend"
    print(f"Connecting to wsRelay at {ws_url}...")
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    ws.run_forever()


if __name__ == "__main__":
    if not hasattr(websocket, "WebSocketApp"):
        print("Required package websocket-client is missing or shadowed by legacy websocket.", file=sys.stderr)
        sys.exit(1)

    connect_ws()
