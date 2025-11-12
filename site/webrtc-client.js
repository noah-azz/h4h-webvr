// webrtc-client.js
// Simple WebRTC client that negotiates with server endpoints which proxy to OpenAI Realtime.
// Behavior:
//  - start(): getUserMedia, create RTCPeerConnection, add audio track, create offer, POST to /realtime/offer,
//             setRemoteDescription(answer), open datachannel for transcripts (if provided), forward transcripts to /events
//  - stop(): stop tracks and close peer connection

(function () {
    let pc = null;
    let localStream = null;
    let dc = null;

    async function start() {
        if (pc) throw new Error('Already started');
        // get mic
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        pc = new RTCPeerConnection();
        // forward remote audio to the page (so you can hear TTS from the remote)
        pc.ontrack = (evt) => {
            let el = document.getElementById('remoteAudio');
            if (!el) {
                el = document.createElement('audio');
                el.id = 'remoteAudio';
                el.autoplay = true;
                document.body.appendChild(el);
            }
            el.srcObject = evt.streams[0];
        };

        // data channel for transcripts / assistant messages
        dc = pc.createDataChannel('assistant-events');
        dc.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                console.log('Realtime data:', msg);
                // forward transcripts to /events
                if (msg && msg.type === 'transcript') {
                    fetch('/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: msg.text, source: 'realtime' }) }).catch(console.error);
                }
            } catch (err) {
                console.warn('Failed to parse data channel message', err);
            }
        };

        // add local tracks
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

        // create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // send offer to server which proxies to OpenAI Realtime
        const resp = await fetch('/realtime/offer', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp });
        const answerSdp = await resp.text();

        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        console.log('WebRTC established with remote realtime model');
    }

    async function stop() {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        if (pc) {
            try { pc.close(); } catch (e) { }
            pc = null;
        }
    }

    window.webrtcClient = { start, stop };
})();
