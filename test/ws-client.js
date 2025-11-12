const WebSocket = require('ws');

const url = process.env.WS_URL || 'ws://localhost:5173/anim';
console.log('Connecting to', url);
const ws = new WebSocket(url);
ws.on('open', () => console.log('WS open'));
ws.on('message', (m) => {
  console.log('WS message:');
  try { console.log(JSON.stringify(JSON.parse(m.toString()), null, 2)); }
  catch (e) { console.log(m.toString()); }
});
ws.on('close', () => console.log('WS closed'));
ws.on('error', (e) => console.error('WS error', e));

// keep process alive
setInterval(() => {}, 1000);
