const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();

// serve static site/
app.use(express.static('site'));
app.use(express.json());

// Convenience route: serve the new therapist control panel at /control
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'site', 'control-new.html'));
});

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
    try {
        const event = req.body || {};
        console.log('Received event:', event);

        // In production: validate event, call your animation generator service,
        // await result and broadcast the structured animation commands.
        const anim = generateAnimationCommandsFromEvent(event);
        broadcastAnimation(anim);

        res.json({ ok: true, forwardedTo: 'stub-animation-generator', anim });
    } catch (err) {
        console.error('Error in /events handler:', err);
        res.status(500).json({ error: String(err) });
    }
});

// Minimal stub that turns text or simple event types into animation commands.
// Enhanced to support therapist UI: personality, events, and system prompts.
// Replace this with a call to your Llama 70B / Groq service that returns JSON commands.
function generateAnimationCommandsFromEvent(event) {
    const text = (event.text || event.message || event.transcript || '').toLowerCase();
    const personality = event.personality || 'neutral';
    const events = event.events || [];
    const systemPrompt = event.systemPrompt || '';
    const source = event.source || 'unknown';

    const commands = [];

    // Determine animation type based on therapist input + personality + events
    let animationType = 'speak'; // default
    let gesture = null;
    let emotion = 'neutral';

    if (!text) {
        animationType = 'idle';
    } else if (events.includes('agent-apologises') || text.includes('sorry') || text.includes('apologise')) {
        animationType = 'speak';
        gesture = 'apologetic-bow';
        emotion = 'remorseful';
    } else if (events.includes('set-boundary')) {
        animationType = 'speak';
        gesture = 'hand-stop';
        emotion = 'firm';
    } else if (events.includes('validate-emotion')) {
        animationType = 'speak';
        gesture = 'open-hands';
        emotion = 'caring';
    } else if (events.includes('celebrate-win')) {
        animationType = 'speak';
        gesture = 'celebration';
        emotion = 'joyful';
    } else if (personality === 'playful') {
        animationType = 'speak';
        emotion = 'happy';
    } else if (text.includes('hello') || text.includes('hi')) {
        animationType = 'speak';
        gesture = 'wave';
    } else {
        animationType = 'speak';
    }

    // Build animation commands
    if (animationType === 'idle') {
        commands.push({ target: 'emma-entity', type: 'idle', start: 0 });
    } else {
        // speak command with mock visemes
        commands.push({
            target: 'emma-entity',
            type: 'speak',
            visemes: [{ v: 'M', t: 0 }, { v: 'AH', t: 400 }, { v: 'AH', t: 800 }],
            audioUrl: null
        });

        if (gesture) {
            commands.push({ target: 'emma-entity', type: 'gesture', name: gesture, start: 0, duration: 2000 });
        }

        if (emotion && emotion !== 'neutral') {
            commands.push({ target: 'emma-entity', type: 'emotion', emotion, intensity: 0.7 });
        }
    }

    return {
        source: 'stub-with-therapist-context',
        original: event,
        personality,
        events,
        systemPrompt: systemPrompt.substring(0, 500), // truncate for logging
        commands
    };
}

const port = process.env.PORT || 5173;
server.listen(port, () => {
    console.log(`Listening on http://localhost:${port} (ws path: /anim)`);
});

// Error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
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
