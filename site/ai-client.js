// ai-client.js
// Connects to backend WebSocket '/anim' and applies simple animation commands
// to entities in the A-Frame scene. This file is intentionally minimal and
// provides stub implementations for viseme/lip-sync and gestures.

(function () {
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/anim';
    let ws;

    function connect() {
        ws = new WebSocket(wsUrl);
        ws.addEventListener('open', () => console.log('Connected to animation WS'));
        ws.addEventListener('message', onMessage);
        ws.addEventListener('close', () => {
            console.log('Animation WS closed, reconnecting in 2s');
            setTimeout(connect, 2000);
        });
        ws.addEventListener('error', (e) => console.warn('Animation WS error', e));
    }

    function onMessage(evt) {
        try {
            const data = JSON.parse(evt.data);
            showDebug(data);
            if (data && Array.isArray(data.commands)) {
                data.commands.forEach(applyCommand);
            } else if (data && data.commands) {
                applyCommand(data.commands);
            } else if (data.commands === undefined && data.command) {
                applyCommand(data.command);
            } else if (data.commands) {
                applyCommand(data.commands);
            } else if (data.command) {
                applyCommand(data.command);
            } else if (data.commands || data.command) {
                // noop handled above
            } else if (data && data.commands === undefined && data.commands === undefined) {
                // fallback: if top-level contains commands
                if (data && data.commands) data.commands.forEach(applyCommand);
            }
        } catch (err) {
            console.warn('Failed to parse animation message', err, evt.data);
        }
    }

    function showDebug(obj) {
        try {
            const container = document.getElementById('ai-debug-body');
            if (!container) return;
            const el = document.createElement('pre');
            el.style.whiteSpace = 'pre-wrap';
            el.style.margin = '0.25rem 0';
            el.textContent = JSON.stringify(obj, null, 2);
            container.insertBefore(el, container.firstChild);
            // limit entries
            while (container.children.length > 12) container.removeChild(container.lastChild);
        } catch (e) {
            /* ignore */
        }
    }

    function applyCommand(cmd) {
        if (!cmd || !cmd.target) return;
        const el = document.getElementById(cmd.target);
        if (!el) {
            console.warn('Target element not found for animation command', cmd.target);
            return;
        }

        switch (cmd.type) {
            case 'idle':
                // set to idle animation clip if using animation-mixer
                el.setAttribute('animation-mixer', 'clip: idle;');
                break;
            case 'speak':
                // For speak we expect visemes array: [{v: 'M', t: 0}, ...]
                applyVisemes(el, cmd.visemes || []);
                // If audioUrl is provided, play it and sync visemes to audio
                if (cmd.audioUrl) playAudioForVisemes(cmd.audioUrl, cmd.visemes || []);
                break;
            case 'gesture':
                // apply a simple rotation or animation by toggling a class or animation-mixer clip
                if (cmd.name) {
                    el.setAttribute('animation-mixer', `clip: ${cmd.name};`);
                    // revert to idle after a short delay
                    setTimeout(() => el.setAttribute('animation-mixer', 'clip: idle;'), (cmd.duration || 1200));
                }
                break;
            case 'emotion':
                // emotion mapping: set a material tint or play a short animation
                if (cmd.emotion === 'sad') {
                    el.setAttribute('animation', 'property: rotation; to: 0 10 0; dur: 400; easing: easeInOutQuad');
                }
                break;
            default:
                console.log('Unknown animation command type', cmd.type, cmd);
        }
    }

    function applyVisemes(el, visemes) {
        // Very simple viseme mapper: set a scale/position on the head or blendshape
        // Real implementations should map visemes to morph targets or use audio phoneme timings.
        visemes.forEach(v => {
            setTimeout(() => {
                // flash the entity to indicate viseme (visual debugging)
                el.object3D.traverse((node) => {
                    if (node.isMesh) {
                        node.material = node.material || new THREE.MeshStandardMaterial();
                        const old = node.material.emissive ? node.material.emissive.clone() : null;
                        if (node.material.emissive) node.material.emissive.setHex(0x333333);
                        setTimeout(() => {
                            if (node.material.emissive && old) node.material.emissive.copy(old);
                        }, 180);
                    }
                });
            }, v.t || 0);
        });
    }

    function playAudioForVisemes(url, visemes) {
        const audio = new Audio(url);
        audio.crossOrigin = 'anonymous';
        audio.addEventListener('play', () => {
            console.log('Playing TTS audio for viseme sync');
        });
        audio.play().catch(err => console.warn('Audio play failed', err));
    }

    // expose for debugging
    window.aiClient = {
        connect,
    };

    connect();
})();
