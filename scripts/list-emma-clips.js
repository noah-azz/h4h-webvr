const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'site', 'emma.gltf');
if (!fs.existsSync(file)) {
  console.error('emma.gltf not found at', file);
  process.exit(1);
}

const data = fs.readFileSync(file, 'utf8');
let json;
try {
  json = JSON.parse(data);
} catch (e) {
  console.error('Failed to parse emma.gltf JSON:', e.message);
  process.exit(1);
}

const animations = json.animations || [];
if (!animations.length) {
  console.log('No animations array found in emma.gltf');
  process.exit(0);
}

console.log('Found', animations.length, 'animations. Listing names:');
animations.forEach((a, i) => {
  console.log(i + 1 + '.', a.name || '(unnamed)');
});

// Also try to detect unique clip names from nodes' names if available
if (json.nodes) {
  const names = json.nodes.map((n, idx) => ({ idx, name: n.name || `(node_${idx})` }));
  console.log('\nFirst 30 node names (for reference):');
  names.slice(0,30).forEach(n => console.log(n.idx, n.name));
}
