// webrtc-client.js
// Simple WebRTC client that negotiates with server endpoints which proxy to OpenAI Realtime.
// Behavior:
//  - start(): getUserMedia, create RTCPeerConnection, add audio track, create offer, POST to /realtime/offer,
//             setRemoteDescription(answer), listen for remote data channels and forward transcripts to /events
//  - stop(): stop tracks and close peer connection

(function () {
    let pc = null;
    let localStream = null;

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
            console.log('Remote audio track received and playing');
        };

        // Listen for remote data channels (Realtime API sends data on its own channels)
        pc.ondatachannel = (evt) => {
            const remoteDc = evt.channel;
            console.log('Remote data channel opened:', remoteDc.label);
            remoteDc.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    console.log('Remote DC message:', msg);
                    
                    // OpenAI Realtime sends messages with various types:
                    // response.transcript_delta: incremental transcript from speech-to-text
                    // conversation.item.create: full conversation item (user or assistant message)
                    // response.audio_transcript.delta: incremental TTS transcript
                    
                    let textToForward = null;
                    
                    if (msg.type === 'response.transcript_delta' && msg.delta) {
                        // User or assistant speech recognized incrementally
                        textToForward = msg.delta;
                        console.log('Transcript delta:', textToForward);
                    } else if (msg.type === 'conversation.item.create' && msg.item) {
                        // Full conversation item (user or assistant)
                        if (msg.item.role === 'assistant' && msg.item.content && Array.isArray(msg.item.content)) {
                            const textContent = msg.item.content.find(c => c.type === 'text');
                            if (textContent && textContent.text) {
                                textToForward = textContent.text;
                                console.log('Assistant message:', textToForward);
                            }
                        } else if (msg.item.role === 'user' && msg.item.content && Array.isArray(msg.item.content)) {
                            const textContent = msg.item.content.find(c => c.type === 'text');
                            if (textContent && textContent.text) {
                                textToForward = textContent.text;
                                console.log('User message:', textToForward);
                            }
                        }
                    } else if (msg.type === 'response.audio_transcript.delta' && msg.delta) {
                        // TTS transcript (what the assistant is saying)
                        textToForward = msg.delta;
                        console.log('Audio transcript (TTS):', textToForward);
                    }
                    
                    // Forward any extracted text to /events so it triggers animation generation
                    if (textToForward) {
                        fetch('/events', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ transcript: textToForward, source: 'realtime' })
                        }).catch(err => console.error('Failed to forward transcript to /events', err));
                    }
                } catch (err) {
                    console.warn('Failed to parse remote DC message', err, e.data);
                }
            };
        };

        // add local tracks
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

        // create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // send offer to server which proxies to OpenAI Realtime
        const resp = await fetch('/realtime/offer', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/sdp' }, 
            body: offer.sdp 
        });
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
