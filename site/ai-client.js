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

    // pending commands keyed by element id for models that are not loaded yet
    const pendingCommands = {};

    function applyCommand(cmd) {
        if (!cmd || !cmd.target) return;
        const el = document.getElementById(cmd.target);
        if (!el) {
            console.warn('Target element not found for animation command', cmd.target);
            return;
        }

        // If the model hasn't loaded yet, queue the command and attach a model-loaded listener
        const mesh = el.getObject3D && el.getObject3D('mesh');
        if (!mesh) {
            console.log(`Model not yet loaded for ${cmd.target}, queuing command`, cmd.type || cmd);
            pendingCommands[cmd.target] = pendingCommands[cmd.target] || [];
            pendingCommands[cmd.target].push(cmd);
            el.addEventListener('model-loaded', function onLoaded() {
                el.removeEventListener('model-loaded', onLoaded);
                flushPendingCommands(cmd.target);
            });
            return;
        }

        // Apply immediately
        console.log('Applying animation command to', cmd.target, cmd);
        try {
            switch (cmd.type) {
                case 'idle':
                    // set to idle animation clip if using animation-mixer
                    el.setAttribute('animation-mixer', 'clip: idle;');
                    break;
                case 'speak':
                    applyVisemes(el, cmd.visemes || []);
                    if (cmd.audioUrl) playAudioForVisemes(cmd.audioUrl, cmd.visemes || []);
                    break;
                case 'gesture':
                    if (cmd.name) {
                        // Check whether the mesh actually contains an animation clip with this name
                        const meshObj = el.getObject3D && el.getObject3D('mesh');
                        let availableClips = [];
                        if (meshObj) {
                            availableClips = meshObj.animations || (meshObj.children && meshObj.children.reduce((a,c) => a.concat(c.animations||[]), [])) || [];
                        }
                        const found = availableClips.find(c => c && c.name === cmd.name);
                        if (found) {
                            el.setAttribute('animation-mixer', `clip: ${cmd.name}; loop: once;`);
                            setTimeout(() => {
                                try { el.setAttribute('animation-mixer', 'clip: idle;'); } catch (e) { /* ignore */ }
                            }, (cmd.duration || 1400));
                        } else {
                            console.warn(`Requested gesture clip '${cmd.name}' not found on model. Available clips:`, availableClips.map(c=>c.name));
                            // Fallback: try procedural bone-based gestures (better than global rotation)
                            performProceduralGesture(el, cmd.name);
                        }
                    }
                    break;
                case 'emotion':
                    // emotion mapping: set a material tint or play a short animation if present
                    if (cmd.emotion) {
                        console.log(`Setting emotion ${cmd.emotion} on ${cmd.target}`);
                        // simple visual cue fallback
                        if (cmd.emotion === 'remorseful' || cmd.emotion === 'sad' || cmd.emotion === 'caring') {
                            el.setAttribute('animation', 'property: rotation; to: 0 6 0; dur: 600; easing: easeInOutQuad');
                        } else if (cmd.emotion === 'joyful' || cmd.emotion === 'happy') {
                            el.setAttribute('animation', 'property: position; to: 3 0.05 -2; dur: 400; dir: alternate; loop: 1');
                        }
                    }
                    break;
                default:
                    console.log('Unknown animation command type', cmd.type, cmd);
            }
        } catch (err) {
            console.warn('Error applying command', err, cmd);
        }
    }

    function flushPendingCommands(targetId) {
        const list = pendingCommands[targetId] || [];
        if (!list.length) return;
        console.log(`Flushing ${list.length} pending command(s) for ${targetId}`);
        list.forEach(c => applyCommand(c));
        pendingCommands[targetId] = [];
    }

    // ----- Procedural bone-based gestures (fallback when no animation clips exist) -----
    function findBone(root, boneName) {
        let found = null;
        root.traverse((node) => {
            if (node && node.isBone && node.name === boneName) found = node;
        });
        return found;
    }

    function animateBone(bone, axis, from, to, duration = 400) {
        if (!bone) return;
        const start = performance.now();
        function step(now) {
            const t = Math.min(1, (now - start) / duration);
            const v = from + (to - from) * t;
            bone.rotation[axis] = v;
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function performProceduralGesture(el, gestureName) {
        try {
            const meshObj = el.getObject3D('mesh');
            if (!meshObj) {
                // final fallback: small rotation
                el.setAttribute('animation', 'property: rotation; to: 0 14 0; dur: 400; easing: easeInOutQuad');
                return;
            }

            // common bone names in this model (mixamorig prefix)
            const LArm = findBone(meshObj, 'mixamorig:LeftArm_09') || findBone(meshObj, 'mixamorig:LeftArm');
            const LFore = findBone(meshObj, 'mixamorig:LeftForeArm_010') || findBone(meshObj, 'mixamorig:LeftForeArm');
            const RArm = findBone(meshObj, 'mixamorig:RightArm') || findBone(meshObj, 'mixamorig:RightArm_??');
            const RFore = findBone(meshObj, 'mixamorig:RightForeArm');
            const Spine = findBone(meshObj, 'mixamorig:Spine1_03') || findBone(meshObj, 'mixamorig:Spine_02');

            console.log('Performing procedural gesture', gestureName, { LArm: !!LArm, LFore: !!LFore, RArm: !!RArm, Spine: !!Spine });

            switch ((gestureName || '').toLowerCase()) {
                case 'apologetic-bow':
                case 'bow':
                    // tilt spine forward
                    if (Spine) animateBone(Spine, 'x', Spine.rotation.x, Spine.rotation.x + -0.35, 600);
                    break;
                case 'open-hands':
                case 'open_hands':
                case 'openhands':
                    // raise both arms outward
                    if (LArm) animateBone(LArm, 'z', LArm.rotation.z, LArm.rotation.z - 1.2, 400);
                    if (RArm) animateBone(RArm, 'z', RArm.rotation.z, RArm.rotation.z + 1.2, 400);
                    break;
                case 'hand-stop':
                case 'set-boundary':
                    // push right arm forward
                    if (RArm) animateBone(RArm, 'x', RArm.rotation.x, RArm.rotation.x - 0.9, 300);
                    break;
                case 'celebration':
                case 'celebrate':
                    if (LArm) animateBone(LArm, 'z', LArm.rotation.z, LArm.rotation.z - 1.4, 400);
                    if (RArm) animateBone(RArm, 'z', RArm.rotation.z, RArm.rotation.z + 1.4, 400);
                    // small hop (adjust entity position)
                    const orig = el.getAttribute('position');
                    if (orig) {
                        const y = orig.y || 0;
                        el.setAttribute('animation__jump', `property: position; to: ${orig.x} ${y+0.06} ${orig.z}; dur: 250; dir: alternate; loop: 1`);
                    }
                    break;
                default:
                    // final fallback: small rotation so user notices something
                    el.setAttribute('animation', 'property: rotation; to: 0 14 0; dur: 400; easing: easeInOutQuad');
                    break;
            }
        } catch (err) {
            console.warn('Procedural gesture failed', err);
            el.setAttribute('animation', 'property: rotation; to: 0 14 0; dur: 400; easing: easeInOutQuad');
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
