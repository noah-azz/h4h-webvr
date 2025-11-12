const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();

// serve static site/
app.use(express.static('site'));
app.use(express.json());

// Create HTTP server so we can attach a WebSocket server on the same port
const server = http.createServer(app);

// WebSocket server for streaming animation commands to clients
const wss = new WebSocket.Server({ server, path: '/anim' });

wss.on('connection', (ws, req) => {
    console.log('Animation client connected');
    ws.on('close', () => console.log('Animation client disconnected'));
});

function broadcastAnimation(command) {
    const msg = JSON.stringify(command);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// Simple event webhook: in a real deployment this route would receive assistant
// messages or Realtime transcript events and forward them to an animation
// generator service (Groq / Llama 70B). For now we stub the animation generator
// with a deterministic mapper so you can test client behavior locally.
app.post('/events', (req, res) => {
    const event = req.body || {};
    console.log('Received event:', event);

    // In production: validate event, call your animation generator service,
    // await result and broadcast the structured animation commands.
    const anim = generateAnimationCommandsFromEvent(event);
    broadcastAnimation(anim);

    res.json({ ok: true, forwardedTo: 'stub-animation-generator', anim });
});

// Minimal stub that turns text or simple event types into animation commands.
// Replace this with a call to your Llama 70B / Groq service that returns JSON commands.
function generateAnimationCommandsFromEvent(event) {
    const text = (event.text || event.message || event.transcript || '').toLowerCase();
    const commands = [];

    if (!text) {
        commands.push({ target: 'emma-entity', type: 'idle', start: 0 });
    } else if (text.includes('hello') || text.includes('hi')) {
        commands.push({ target: 'emma-entity', type: 'speak', visemes: [{ v: 'AA', t: 0 }, { v: 'OH', t: 300 }], audioUrl: null });
        commands.push({ target: 'emma-entity', type: 'gesture', name: 'wave', start: 0 });
    } else if (text.includes('angry') || text.includes('upset')) {
        commands.push({ target: 'emma-entity', type: 'emotion', emotion: 'sad', intensity: 0.8 });
    } else {
        // default speak command with mock visemes
        commands.push({ target: 'emma-entity', type: 'speak', visemes: [{ v: 'M', t: 0 }, { v: 'AH', t: 400 }], audioUrl: null });
    }

    return { source: 'stub', original: event, commands };
}

const port = process.env.PORT || 5173;
server.listen(port, () => {
    console.log(`Listening on http://localhost:${port} (ws path: /anim)`);
});

// --- OpenAI Realtime helper routes (simple proxy / minting)
// POST /realtime-session -> creates an ephemeral realtime session using your OPENAI_API_KEY
// POST /realtime/offer -> proxies an SDP offer to OpenAI Realtime and returns the SDP answer

app.post('/realtime-session', async (req, res) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });

    try {
        const resp = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model: 'gpt-4o-realtime-preview', voice: 'alloy' })
        });
        const data = await resp.json();
        res.json(data);
    } catch (err) {
        console.error('realtime-session error', err);
        res.status(500).json({ error: String(err) });
    }
});

// Accepts raw SDP offer in the request body (text) and forwards it to OpenAI Realtime endpoint
app.post('/realtime/offer', express.text({ type: '*/*' }), async (req, res) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });

    const offer = req.body;
    if (!offer) return res.status(400).json({ error: 'Missing SDP offer in request body' });

    try {
        // POST the offer (SDP) to OpenAI Realtime and return answer SDP
        const resp = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/sdp'
            },
            body: offer
        });

        const answer = await resp.text();
        res.type('application/sdp').send(answer);
    } catch (err) {
        console.error('realtime/offer error', err);
        res.status(500).json({ error: String(err) });
    }
});
