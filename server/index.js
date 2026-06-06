const express = require('express');
const path = require('path');
const { fork } = require('child_process');
const { startRelay } = require('./wsRelay');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

startRelay(3001);

const rlBackend = fork(path.join(__dirname, 'rlBackend.js'), {
  env: {
    ...process.env,
    RL_RELAY_URL: process.env.RL_RELAY_URL || 'ws://localhost:3001?type=rl_backend'
  },
  stdio: 'inherit'
});

rlBackend.on('exit', (code, signal) => {
  throw new Error(`RL backend process exited: code=${code} signal=${signal}`);
});

process.on('SIGINT', () => {
  rlBackend.kill('SIGINT');
  process.exit(0);
});
