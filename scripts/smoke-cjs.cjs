const path = require('node:path');
const assert = require('node:assert');

const cjsPath = path.join(__dirname, '..', 'dist', 'cjs', 'index.cjs');
const mod = require(cjsPath);

// Update these assertions to match your library's exports
assert.strictEqual(typeof mod.hello, 'function', 'CJS build should export hello');

console.log('cjs smoke test passed');
