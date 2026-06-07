const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { startRelay } = require('./wsRelay');

const app = express();
const PORT = 3000;
let shuttingDown = false;
let rlBackend = null;
let rlRestartTimer = null;

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

startRelay(3001);

startRlBackend();

function startRlBackend() {
  if (shuttingDown) return;

  rlBackend = spawn('python3', [path.join(__dirname, '..', 'rl', 'server.py')], {
    env: {
      ...process.env
    },
    stdio: 'inherit'
  });

  rlBackend.on('exit', (code, signal) => {
    if (shuttingDown) {
      console.log(`RL backend stopped: code=${code} signal=${signal}`);
      return;
    }

    console.error(`RL backend exited unexpectedly: code=${code} signal=${signal}. Restarting...`);
    rlRestartTimer = setTimeout(() => {
      rlRestartTimer = null;
      startRlBackend();
    }, 1000);
  });
}

function shutdown() {
  shuttingDown = true;
  if (rlRestartTimer) clearTimeout(rlRestartTimer);
  if (rlBackend && !rlBackend.killed) rlBackend.kill('SIGTERM');
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
