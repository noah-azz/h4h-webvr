VR AI Integration - Quick Start

This project contains a minimal scaffold for integrating conversational AI and an animation pipeline for a WebXR/A-Frame client.

What was added

- server.js: replaced with an HTTP server + WebSocket server (path: /anim). Added POST /events to receive conversation/transcript events and broadcast a stubbed animation payload to connected clients.
- package.json: added `ws` dependency for WebSocket server.
- site/ai-client.js: client-side WebSocket listener that applies basic commands to A-Frame entities (viseme stubs, gesture triggers).
- site/animation-schema.json: JSON schema describing the animation command format.
- site/scenario.html: includes `ai-client.js` and adds an id to the avatar entity so it can be targeted.
- site/scenario.html: includes `ai-client.js` and adds an id to the avatar entity so it can be targeted.

Quick test UI

I added a quick test field and button to `control.html` so you can send events from the browser:

- Open http://localhost:5173/control.html
- Enter text into the "Quick test" input and click "Send Test Event" — you'll get an alert with the server response and the scenario page will receive the commands.

Debug overlay

`scenario.html` now contains a small "AI Debug" overlay showing recent incoming messages for quick inspection.

How it works (local stub)

1. Start the server:

```powershell
# from project root
npm install
node server.js
```

2. Open the control page at http://localhost:5173/control.html and the scenario at http://localhost:5173/scenario.html

3. Send POST events to the server to simulate assistant messages. Example using PowerShell:

```powershell
$body = @{ text = 'Hello, how are you?' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5173/events -Body $body -ContentType 'application/json'
```

The server will generate a stub animation payload and broadcast it to any connected clients via ws://localhost:5173/anim. The scenario page includes `/ai-client.js` which listens and applies simple animations.

Next steps to integrate real AI and low-latency voice:

- Use WebRTC to connect client audio to OpenAI Realtime (or another speech-to-speech API). Prefer direct client->OpenAI Realtime where possible for lowest latency.
- Implement a backend event pipeline that receives Realtime assistant messages or transcripts and constructs structured prompts (JSON) for the animation generator.
- Replace the stub `generateAnimationCommandsFromEvent` with a call to your fast Llama 70B endpoint (Groq). Prefer streaming the JSON command output.
- For deterministic lip-sync, either use the audio timestamps from the Realtime TTS stream or perform client-side phoneme alignment using WebAudio Analyser + existing viseme maps.
- Add authentication, TLS, and validate/authorize control UI users.

Security notes

- This scaffold is intentionally minimal and does not authenticate / rate-limit incoming POST /events. Do not expose to the public internet without protecting the route.

