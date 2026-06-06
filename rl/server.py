import torch
import torch.nn as nn
import json
import websocket
import sys
import os
import random
import time

# PyTorch MLP Policy Network
class PolicyNet(nn.Module):
    def __init__(self):
        super(PolicyNet, self).__init__()
        self.net = nn.Sequential(
            nn.Linear(16, 12),
            nn.ReLU(),
            nn.Linear(12, 8),
            nn.ReLU(),
            nn.Linear(8, 2),
            nn.Tanh()  # Outputs: throttle/brake in [-1, 1], steering in [-1, 1]
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

# Population of 10 agents
agents = {i: AgentState(i) for i in range(10)}
generation_count = 1

def mutate_policy(parent_policy, child_policy, mutation_rate=0.25, mutation_scale=0.06):
    """Clones parent weights into child and applies random Gaussian mutations."""
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
    global generation_count
    try:
        data = json.loads(message)
        if data.get("type") != "observations":
            return
        
        tick = data.get("tick", 0)
        observations = data.get("agents", [])
        
        response_agents = []
        
        for obs in observations:
            agent_id = obs.get("id")
            if agent_id is None or agent_id not in agents:
                continue
                
            agent = agents[agent_id]
            state_vector = obs.get("state", [0.0] * 16)
            collided = obs.get("collided", False)
            current_score = obs.get("score", 0.0)
            
            agent.score = current_score
            
            # --- Check failure states (crashed or out of bounds) ---
            if collided:
                # Save best score
                if agent.score > agent.best_score:
                    agent.best_score = agent.score
                
                # Retrieve the best agent overall to mutate from
                parent = get_best_agent()
                
                # Evolve weights: if parent has a decent score, mutate. Otherwise random.
                if parent.best_score > -50.0:
                    mutate_policy(parent.policy, agent.policy)
                else:
                    # Re-initialize weights randomly
                    agent.policy = PolicyNet()
                
                agent.generation += 1
                agent.reset_needed = True
                
                print(f"[Agent {agent_id}] CRASHED! Resetting... Gen {agent.generation} | Score: {agent.score:.2f} (Best: {agent.best_score:.2f})")
            
            # --- Evaluate policy network ---
            state_tensor = torch.FloatTensor(state_vector)
            with torch.no_grad():
                action_output = agent.policy(state_tensor).numpy()
            
            # Map action values [-1.0, 1.0]
            throttle_raw = action_output[0]
            steering = action_output[1]
            
            # Actuator logic: positive throttle is accelerate, negative is brake/reverse
            if throttle_raw > 0:
                throttle = throttle_raw
                brake = 0.0
            else:
                throttle = 0.0
                brake = abs(throttle_raw)
            
            # Action payload back to browser
            response_agents.append({
                "id": agent_id,
                "throttle": float(throttle),
                "steering": float(steering),
                "brake": float(brake),
                "reset": agent.reset_needed,
                "generation": agent.generation,
                "bestScore": float(agent.best_score if agent.best_score > -9999 else agent.score)
            })
            
            # Reset the flag after sending
            agent.reset_needed = False
            
        # Send actions back to the browser
        ws.send(json.dumps({
            "type": "actions",
            "tick": tick,
            "agents": response_agents
        }))
        
    except Exception as e:
        print(f"Error processing message: {e}", file=sys.stderr)

def on_error(ws, error):
    print(f"WebSocket Error: {error}", file=sys.stderr)

def on_close(ws, close_status_code, close_msg):
    print("WebSocket connection closed. Reconnecting in 3 seconds...")
    time.sleep(3)
    connect_ws()

def on_open(ws):
    print("Connected to Driveby WebSocket server as rl_backend.")

def connect_ws():
    ws_url = "ws://localhost:3001?type=rl_backend"
    print(f"Connecting to wsRelay at {ws_url}...")
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    ws.run_forever()

if __name__ == "__main__":
    # Ensure dependencies are met
    try:
        import websocket
    except ImportError:
        print("Required package 'websocket-client' is missing. Please run: pip install websocket-client")
        sys.exit(1)
        
    connect_ws()
