const { WebSocketServer } = require('ws');

function startRelay(port = 3001) {
  const wss = new WebSocketServer({ port });
  let browser = null;
  let rlBackend = null;

  function sendBackendStatus() {
    if (browser && browser.readyState === 1) {
      browser.send(JSON.stringify({
        type: 'backend_status',
        connected: Boolean(rlBackend && rlBackend.readyState === 1)
      }));
    }
  }

  wss.on('connection', (ws, req) => {
    const type = new URL(req.url, 'ws://localhost').searchParams.get('type');

    if (type === 'rl_backend') {
      rlBackend = ws;
      sendBackendStatus();
      ws.on('message', (data) => {
        if (browser && browser.readyState === 1) browser.send(data);
      });
      ws.on('close', () => {
        rlBackend = null;
        sendBackendStatus();
      });
    } else if (type === 'browser') {
      browser = ws;
      sendBackendStatus();
      ws.on('message', (data) => {
        if (rlBackend && rlBackend.readyState === 1) rlBackend.send(data);
      });
      ws.on('close', () => { browser = null; });
    } else {
      ws.close(1008, `Unexpected client type: ${type}`);
    }
  });

  console.log(`WS relay listening on ws://localhost:${port}`);
}

module.exports = { startRelay };
