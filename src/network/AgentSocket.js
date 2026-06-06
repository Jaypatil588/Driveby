const WS_URL = 'ws://localhost:3001';
const SEND_INTERVAL_MS = 100;

export class AgentSocket {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.ws = null;
    this._tick = 0;
    this._connected = false;
    this._connect();
  }

  _connect() {
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      return; // server not running — rule-based fallback stays active
    }

    this.ws.addEventListener('open', () => {
      this._connected = true;
      this._startSending();
    });

    this.ws.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'actions') {
          this.agentManager.applyActions(msg.agents);
        }
      } catch { /* ignore malformed */ }
    });

    this.ws.addEventListener('close', () => {
      this._connected = false;
      // reconnect after 3s
      setTimeout(() => this._connect(), 3000);
    });

    this.ws.addEventListener('error', () => {
      this.ws.close();
    });
  }

  _startSending() {
    setInterval(() => {
      if (!this._connected || this.ws.readyState !== WebSocket.OPEN) return;
      const payload = {
        type: 'observations',
        tick: this._tick++,
        agents: this.agentManager.getAllObservations(),
      };
      this.ws.send(JSON.stringify(payload));
    }, SEND_INTERVAL_MS);
  }
}
