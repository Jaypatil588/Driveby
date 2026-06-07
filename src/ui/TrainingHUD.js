import { mercatorScale } from '../map/sfLayer.js';

export class TrainingHUD {
  constructor(agents, onSelectAgent) {
    if (!Array.isArray(agents) || agents.length !== 10) {
      throw new Error(`TrainingHUD requires exactly 10 agents, received ${agents?.length}.`);
    }

    this.agents = agents;
    this.onSelectAgent = onSelectAgent;
    this.selectedAgentId = 0;
    this.container = null;
    this._createDOM();
  }

  _createDOM() {
    if (document.getElementById('hud-fonts')) {
      throw new Error('TrainingHUD font link already exists.');
    }

    const link = document.createElement('link');
    link.id = 'hud-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap';
    document.head.appendChild(link);

    if (document.getElementById('training-hud-style')) {
      throw new Error('TrainingHUD styles already exist.');
    }

    const style = document.createElement('style');
    style.id = 'training-hud-style';
    style.textContent = `
      #training-hud {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 320px;
        max-height: calc(100vh - 32px);
        overflow-y: auto;
        background: rgba(10, 12, 18, 0.82);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        color: #f1f5f9;
        font-family: 'Outfit', sans-serif;
        padding: 20px;
        box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.6);
        z-index: 1000;
        pointer-events: auto;
        user-select: none;
        scrollbar-width: thin;
      }

      #training-hud h2 {
        font-family: 'Outfit', sans-serif;
        font-size: 14px;
        font-weight: 700;
        margin: 0 0 12px;
        color: #38bdf8;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .hud-section {
        margin-bottom: 16px;
      }

      .agent-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin-bottom: 12px;
      }

      .agent-btn {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        color: #94a3b8;
        padding: 6px 0;
        text-align: center;
        cursor: pointer;
        font-size: 11px;
        font-family: 'Outfit', sans-serif;
        font-weight: 500;
      }

      .agent-btn:hover {
        background: rgba(56, 189, 248, 0.12);
        border-color: rgba(56, 189, 248, 0.3);
        color: #fff;
      }

      .agent-btn.active {
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(56, 189, 248, 0.1) 100%);
        border-color: #38bdf8;
        color: #38bdf8;
        font-weight: 700;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
      }

      .telemetry-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 12px;
        align-items: center;
      }

      .telemetry-label {
        color: #94a3b8;
        font-weight: 400;
      }

      .telemetry-val {
        color: #f1f5f9;
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
      }

      .state-vector-box {
        background: rgba(0, 0, 0, 0.4);
        border-radius: 8px;
        padding: 12px;
        font-size: 11px;
        line-height: 1.5;
        border: 1px solid rgba(255, 255, 255, 0.04);
        max-height: 250px;
        overflow-y: auto;
        scrollbar-width: thin;
      }

      .state-group {
        margin-bottom: 12px;
      }

      .state-group-title {
        color: #38bdf8;
        font-weight: 700;
        margin-bottom: 4px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .state-item {
        display: flex;
        justify-content: space-between;
        padding-left: 8px;
        margin-bottom: 2px;
      }

      .state-item-name {
        color: #64748b;
      }

      .state-item-val {
        color: #34d399;
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
      }

      .state-item-val.negative {
        color: #f87171;
      }
    `;
    document.head.appendChild(style);

    this.container = document.createElement('div');
    this.container.id = 'training-hud';
    document.body.appendChild(this.container);
    this.render();
  }

  selectAgent(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.agents.length) {
      throw new Error(`TrainingHUD cannot select invalid agent id ${id}.`);
    }

    this.selectedAgentId = id;
    if (this.onSelectAgent) this.onSelectAgent(id);
    this.render();
  }

  update(allAgents, environment) {
    const agent = this.agents[this.selectedAgentId];
    if (!agent) {
      throw new Error(`TrainingHUD selected agent ${this.selectedAgentId} does not exist.`);
    }

    const telemetryElements = {
      'score-val': `${agent.score.toFixed(2)}`,
      'best-val': `${agent.bestScore > -9999 ? agent.bestScore.toFixed(2) : 'N/A'}`,
      'gen-val': `${agent.generation}`,
      'speed-val': `${(agent.speed / mercatorScale()).toFixed(1)} m/s`,
      'heading-val': `${(agent.heading * 180 / Math.PI).toFixed(0)} deg`,
      'status-val': agent.collided ? 'CRASHED' : 'DRIVING'
    };

    for (const [id, val] of Object.entries(telemetryElements)) {
      const el = document.getElementById(id);
      if (!el) throw new Error(`TrainingHUD missing telemetry element #${id}.`);
      el.textContent = val;
    }

    this._updateStateVectorUI(agent.getStateVector(allAgents, environment));
  }

  _updateStateVectorUI(state) {
    const el = document.getElementById('state-vector-container');
    if (!el) throw new Error('TrainingHUD missing #state-vector-container.');
    if (state.length !== 20) throw new Error(`TrainingHUD expected 20 state values, received ${state.length}.`);

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
        <div class="state-item"><span class="state-item-name">Remaining Route:</span> ${formatVal(state[2])}</div>
        <div class="state-item"><span class="state-item-name">Lane Offset:</span> ${formatVal(state[3])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Traffic Rules</div>
        <div class="state-item"><span class="state-item-name">Signal Distance:</span> ${formatVal(state[4])}</div>
        <div class="state-item"><span class="state-item-name">Signal State:</span> ${formatVal(state[5])}</div>
        <div class="state-item"><span class="state-item-name">Crosswalk Distance:</span> ${formatVal(state[6])}</div>
        <div class="state-item"><span class="state-item-name">Crosswalk Occupied:</span> ${formatVal(state[7])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Asset 1 (Closest)</div>
        <div class="state-item"><span class="state-item-name">Type:</span> <span class="state-item-val">${getAssetTypeName(state[8])}</span></div>
        <div class="state-item"><span class="state-item-name">Relative Dist:</span> ${formatVal(state[9])}</div>
        <div class="state-item"><span class="state-item-name">Relative Angle:</span> ${formatVal(state[10])}</div>
        <div class="state-item"><span class="state-item-name">Rule State:</span> ${formatVal(state[11])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Asset 2</div>
        <div class="state-item"><span class="state-item-name">Type:</span> <span class="state-item-val">${getAssetTypeName(state[12])}</span></div>
        <div class="state-item"><span class="state-item-name">Relative Dist:</span> ${formatVal(state[13])}</div>
        <div class="state-item"><span class="state-item-name">Relative Angle:</span> ${formatVal(state[14])}</div>
        <div class="state-item"><span class="state-item-name">Rule State:</span> ${formatVal(state[15])}</div>
      </div>
      <div class="state-group">
        <div class="state-group-title">Asset 3</div>
        <div class="state-item"><span class="state-item-name">Type:</span> <span class="state-item-val">${getAssetTypeName(state[16])}</span></div>
        <div class="state-item"><span class="state-item-name">Relative Dist:</span> ${formatVal(state[17])}</div>
        <div class="state-item"><span class="state-item-name">Relative Angle:</span> ${formatVal(state[18])}</div>
        <div class="state-item"><span class="state-item-name">Rule State:</span> ${formatVal(state[19])}</div>
      </div>
    `;
  }

  render() {
    if (!this.container) throw new Error('TrainingHUD render called before container creation.');

    let gridHtml = '';
    for (let i = 0; i < 10; i++) {
      const activeClass = this.selectedAgentId === i ? 'active' : '';
      gridHtml += `<div class="agent-btn ${activeClass}" onclick="window.hud.selectAgent(${i})">Agent ${i + 1}</div>`;
    }

    const agent = this.agents[this.selectedAgentId];
    if (!agent) throw new Error(`TrainingHUD selected agent ${this.selectedAgentId} does not exist.`);

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
        <div class="telemetry-row"><span class="telemetry-label">Generation:</span> <span class="telemetry-val" id="gen-val">${agent.generation}</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Current Score:</span> <span class="telemetry-val" id="score-val">${agent.score.toFixed(2)}</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Best Score:</span> <span class="telemetry-val" id="best-val">${agent.bestScore > -9999 ? agent.bestScore.toFixed(2) : 'N/A'}</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Speed:</span> <span class="telemetry-val" id="speed-val">${(agent.speed / mercatorScale()).toFixed(1)} m/s</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Heading:</span> <span class="telemetry-val" id="heading-val">${(agent.heading * 180 / Math.PI).toFixed(0)} deg</span></div>
        <div class="telemetry-row"><span class="telemetry-label">Status:</span> <span class="telemetry-val" id="status-val" style="color: #38bdf8; font-weight: bold;">DRIVING</span></div>
      </div>
      <h2 style="font-size: 13px; color: #f59e0b; margin-top: 12px;">20-D State Vector ($S_t$)</h2>
      <div class="hud-section">
        <div class="state-vector-box" id="state-vector-container">Loading state vector...</div>
      </div>
    `;

    window.hud = this;
  }
}
