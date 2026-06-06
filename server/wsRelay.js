const { WebSocketServer } = require('ws');

function startRelay(port = 3001) {
  const wss = new WebSocketServer({ port });
  let browser = null;
  let rlBackend = null;

  wss.on('connection', (ws, req) => {
    const type = new URL(req.url, 'ws://localhost').searchParams.get('type');

    if (type === 'rl_backend') {
      rlBackend = ws;
      ws.on('message', (data) => {
        if (browser && browser.readyState === 1) browser.send(data);
      });
      ws.on('close', () => { rlBackend = null; });
    } else {
      // default: browser client
      browser = ws;
      ws.on('message', (data) => {
        if (rlBackend && rlBackend.readyState === 1) rlBackend.send(data);
      });
      ws.on('close', () => { browser = null; });
    }
  });

  console.log(`WS relay listening on ws://localhost:${port}`);
}

module.exports = { startRelay };
