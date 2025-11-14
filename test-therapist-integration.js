#!/usr/bin/env node
// Quick test script to verify the therapist UI integration
// Run with: node test-therapist-integration.js

const http = require('http');

function testEndpoint() {
    const payload = JSON.stringify({
        transcript: "I understand your feelings completely",
        systemPrompt: "Be empathetic, caring, and supportive. The child is anxious.",
        personality: "empathetic",
        events: ["agent-apologises", "validate-emotion"],
        source: "test"
    });

    // Try localhost first
    const hosts = ['127.0.0.1', 'localhost', '[::1]'];
    let hostIndex = 0;
    
    function tryHost() {
        const hostname = hosts[hostIndex];
        const options = {
            hostname: hostname,
            port: 5173,
            path: '/events',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log('\n✓ POST /events Response:\n');
                console.log(JSON.stringify(JSON.parse(data), null, 2));
                
                // Highlight key fields
                const response = JSON.parse(data);
                console.log('\n📊 Key Information:');
                console.log(`   Personality: ${response.anim?.original?.personality}`);
                console.log(`   Events: ${response.anim?.original?.events?.join(', ') || 'none'}`);
                console.log(`   Animation Commands: ${response.anim?.commands?.length || 0}`);
                
                console.log('\n🎬 Animation Commands Generated:');
                response.anim?.commands?.forEach((cmd, idx) => {
                    console.log(`   [${idx}] Type: ${cmd.type}, Target: ${cmd.target}`);
                    if (cmd.gesture) console.log(`        Gesture: ${cmd.gesture}`);
                    if (cmd.emotion) console.log(`        Emotion: ${cmd.emotion} (intensity: ${cmd.intensity})`);
                });
                
                console.log('\n✅ Integration test successful!\n');
                process.exit(0);
            });
        });

        req.on('error', (e) => {
            if (hostIndex < hosts.length - 1) {
                console.log(`   Trying ${hosts[hostIndex + 1]}...`);
                hostIndex++;
                tryHost();
            } else {
                console.error(`❌ Error: ${e.message}`);
                console.error(`   Code: ${e.code}`);
                console.log('\nMake sure the server is running:');
                console.log('  cd c:\\Users\\Gilbert\\IdeaProjects\\H4H\\h4h-webvr');
                console.log('  node server.js');
                process.exit(1);
            }
        });

        console.log(`📤 Trying ${hostname}:5173...`);
        req.write(payload);
        req.end();
    }

    console.log('📤 Sending test POST request to http://localhost:5173/events');
    console.log('   Personality: empathetic');
    console.log('   Events: agent-apologises, validate-emotion');
    tryHost();
}

testEndpoint();
