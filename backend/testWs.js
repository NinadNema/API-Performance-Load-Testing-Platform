const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:4001');

ws.on('open', () => console.log('Connected to server'));
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log(`Progress: ${msg.completed}/${msg.total} — request ${msg.result.requestIndex} took ${msg.result.durationMs}ms`);
});