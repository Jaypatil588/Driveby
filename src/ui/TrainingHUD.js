import { mercatorScale } from '../map/sfLayer.js';

export class TrainingHUD {
  constructor(agents, onSelectAgent) {
    this.agents = agents;
    this.onSelectAgent = onSelectAgent;
    this.selectedAgentId = 0;

    this.container = null;
    this._createDOM();
  }

  _createDOM() {
    // 1. Inject Styles
    if (!document.getElementById('training-hud-style')) {
      const style = document.createElement('style');
      style.id = 'training-hud-style';
      style.textContent = `
        #training-hud {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 360px;
          max-height: calc(100vh - 32px);
          overflow-y: auto;
          background: rgba(10, 12, 16, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: #e2e8f0;
          font-family: monospace;
          padding: 16px;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
          z-index: 1000;
          pointer-events: auto;
          user-select: none;
        }

        #training-hud h2 {
          font-size: 15px;
          font-weight: bold;
          margin-bottom: 12px;
          color: #38bdf8;
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
          padding-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .hud-section {
          margin-bottom: 16px;
        }

        .agent-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
          margin-bottom: 12px;
        }

        .agent-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: #94a3b8;
          padding: 6px 0;
          text-align: center;
          cursor: pointer;
          font-size: 11px;
          transition: all 0.2s ease;
        }

        .agent-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }

        .agent-btn.active {
          background: rgba(56, 189, 248, 0.25);
          border-color: #38bdf8;
          color: #38bdf8;
          font-weight: bold;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
        }

        .telemetry-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 12px;
        }

        .telemetry-label {
          color: #64748b;
        }

        .telemetry-val {
          color: #f1f5f9;
          font-weight: bold;
        }

        .state-vector-box {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
          padding: 10px;
          font-size: 11px;
          line-height: 1.4;
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .state-group {
          margin-bottom: 8px;
        }

        .state-group:last-child {
          margin-bottom: 0;
        }

        .state-group-title {
          color: #38bdf8;
          font-weight: bold;
          margin-bottom: 2px;
          text-decoration: underline;
        }

        .state-item {
          display: flex;
          justify-content: space-between;
          padding-left: 8px;
        }

        .state-item-name {
          color: #94a3b8;
        }

        .state-item-val {
          color: #10b981;
        }

        .state-item-val.negative {
          color: #ef4444;
        }
      `;
      document.head.appendChild(style);
    }

    // 2. Create Panel
    this.container = document.createElement('div');
    this.container.id = 'training-hud';
    document.body.appendChild(this.container);

    this.render();
  }

  selectAgent(id) {
    this.selectedAgentId = id;
    if (this.onSelectAgent) {
      this.onSelectAgent(id);
    }
    this.render();
  }

  update(allAgents, environment) {
    const agent = this.agents[this.selectedAgentId];
    if (!agent) return;

    // Refresh Telemetry Values
    const telemetryElements = {
      'score-val': `${agent.score.toFixed(2)}`,
      'best-val': `${agent.bestScore > -9999 ? agent.bestScore.toFixed(2) : 'N/A'}`,
      'gen-val': `${agent.generation}`,
      'speed-val': `${(agent.speed / mercatorScale()).toFixed(1)} m/s`,
      'heading-val': `${(agent.heading * 180 / Math.PI).toFixed(0)}°`,
      'status-val': agent.collided ? 'CRASHED' : 'DRIVING'
    };

    for (const [id, val] of Object.entries(telemetryElements)) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    }

    // Update state vector box contents
    const state = agent.getStateVector(allAgents, environment);
    this._updateStateVectorUI(state);
  }

  _updateStateVectorUI(state) {
    const el = document.getElementById('state-vector-container');
    if (!el) return;

    if (state.length < 16) return;

    const formatVal = (v) => {
      const valStr = v.toFixed(3);
      if (v < 0) return `<span class="state-item-val negative">${valStr}</span>`;
      return `<span class="state-item-val">${valStr}</span>`;
    };

    const getAssetTypeName = (typeId) => {
      if (typeId === 1.0) return 'Building/Curb';
      if (typeId === 3.0) return 'NPC Vehicle';
      if (typeId === 4.0) return 'Pedestrian';
      return 'None';
    };

    el.innerHTML = `
      <div class="state-group">
        <div class="state-group-title">Ego Vehicle</div>
        <div class="state-item"><span class="state-item-name">Speed (Norm):</span> ${formatVal(state[0])}</div>
        <div class="state-item"><span class="state-item-name">Heading (Norm):</span> ${formatVal(state[1])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Navigation Target</div>
        <div class="state-item"><span class="state-item-name">Dist to Waypoint:</span> ${formatVal(state[2])}</div>
        <div class="state-item"><span class="state-item-name">Angle to Waypoint:</span> ${formatVal(state[3])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Asset 1 (Closest)</div>
        <div class="state-item"><span class="state-item-name">Type:</span> <span class="state-item-val">${getAssetTypeName(state[4])}</span></div>
        <div class="state-item"><span class="state-item-name">Relative Dist:</span> ${formatVal(state[5])}</div>
        <div class="state-item"><span class="state-item-name">Relative Angle:</span> ${formatVal(state[6])}</div>
        <div class="state-item"><span class="state-item-name">Rule State:</span> ${formatVal(state[7])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Asset 2</div>
        <div class="state-item"><span class="state-item-name">Type:</span> <span class="state-item-val">${getAssetTypeName(state[8])}</span></div>
        <div class="state-item"><span class="state-item-name">Relative Dist:</span> ${formatVal(state[9])}</div>
        <div class="state-item"><span class="state-item-name">Relative Angle:</span> ${formatVal(state[10])}</div>
        <div class="state-item"><span class="state-item-name">Rule State:</span> ${formatVal(state[11])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Asset 3</div>
        <div class="state-item"><span class="state-item-name">Type:</span> <span class="state-item-val">${getAssetTypeName(state[12])}</span></div>
        <div class="state-item"><span class="state-item-name">Relative Dist:</span> ${formatVal(state[13])}</div>
        <div class="state-item"><span class="state-item-name">Relative Angle:</span> ${formatVal(state[14])}</div>
        <div class="state-item"><span class="state-item-name">Rule State:</span> ${formatVal(state[15])}</div>
      </div>
    `;
  }

  render() {
    if (!this.container) return;

    let gridHtml = '';
    for (let i = 0; i < 10; i++) {
      const activeClass = this.selectedAgentId === i ? 'active' : '';
      gridHtml += `<div class="agent-btn ${activeClass}" onclick="window.hud.selectAgent(${i})">Agent ${i + 1}</div>`;
    }

    const agent = this.agents[this.selectedAgentId];

    this.container.innerHTML = `
      <h2>PyTorch Agent Monitor</h2>
      
      <div class="hud-section">
        <div class="telemetry-row"><span class="telemetry-label">Active Agents:</span> <span class="telemetry-val">10 (PyTorch backend)</span></div>
      </div>

      <div class="hud-section">
        <div class="telemetry-label" style="margin-bottom: 6px;">Focus Target:</div>
        <div class="agent-grid">${gridHtml}</div>
      </div>

      <h2 style="font-size: 13px; color: #10b981; margin-top: 12px;">Agent Telemetry</h2>
      <div class="hud-section">
        <div class="telemetry-row"><span class="telemetry-label">Generation:</span> <span class="telemetry-val" id="gen-val">${agent ? agent.generation : 1}</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Current Score:</span> <span class="telemetry-val" id="score-val">${agent ? agent.score.toFixed(2) : '0.00'}</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Best Score:</span> <span class="telemetry-val" id="best-val">${agent && agent.bestScore > -9999 ? agent.bestScore.toFixed(2) : 'N/A'}</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Speed:</span> <span class="telemetry-val" id="speed-val">${agent ? (agent.speed / mercatorScale()).toFixed(1) : 0} m/s</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Heading:</span> <span class="telemetry-val" id="heading-val">${agent ? (agent.heading * 180 / Math.PI).toFixed(0) : 0}°</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Status:</span> <span class="telemetry-val" id="status-val" style="color: #38bdf8; font-weight: bold;">DRIVING</span></div>
      </div>

      <h2 style="font-size: 13px; color: #f59e0b; margin-top: 12px;">16-D State Vector ($S_t$)</h2>
      <div class="hud-section">
        <div class="state-vector-box" id="state-vector-container">
          Loading state vector...
        </div>
      </div>
    `;

    // Make selectAgent globally accessible for onclick events
    window.hud = this;
  }
}
