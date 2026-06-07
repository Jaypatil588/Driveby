const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORTS = ['3000', '3001'];
const ROOT = path.join(__dirname, '..');

function getPortPids(port) {
  try {
    const output = execFileSync('lsof', ['-ti', `tcp:${port}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return output ? output.split(/\s+/).filter(Boolean) : [];
  } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

function waitForPortClear(port) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (getPortPids(port).length === 0) return;
    execFileSync('sleep', ['0.1']);
  }
  throw new Error(`Port ${port} did not clear after SIGTERM.`);
}

function clearPort(port) {
  const pids = getPortPids(port);
  if (pids.length === 0) return;

  for (const pid of pids) {
    process.kill(Number(pid), 'SIGTERM');
  }

  waitForPortClear(port);
  console.log(`Cleared port ${port}: ${pids.join(', ')}`);
}

for (const port of PORTS) {
  clearPort(port);
}

const children = new Set();
let shuttingDown = false;

function rubyPathPrefix() {
  const candidates = [
    '/opt/homebrew/opt/ruby/bin',
    '/opt/homebrew/lib/ruby/gems/4.0.0/bin',
    '/usr/local/opt/ruby/bin'
  ];
  return candidates.filter((dir) => fs.existsSync(dir)).join(':');
}

function start(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: 'inherit'
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    shutdown();
    throw new Error(`${name} exited: code=${code} signal=${signal}`);
  });

  return child;
}

function shutdown() {
  shuttingDown = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

const bundleBin = process.env.BUNDLE_BIN || 'bundle';
const prefix = rubyPathPrefix();
const envPath = prefix
  ? `${prefix}:${process.env.PATH || ''}`
  : process.env.PATH;

start('webpack', 'npx', ['webpack', '--mode', 'development', '--watch']);
start('rails', bundleBin, ['exec', 'rails', 'server', '-b', '0.0.0.0', '-p', '3000'], {
  cwd: path.join(ROOT, 'backend'),
  env: { PATH: envPath }
});
