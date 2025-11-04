const path = require('node:path');
const assert = require('node:assert');

const cjsPath = path.join(__dirname, '..', 'dist', 'cjs', 'index.cjs');
const mod = require(cjsPath);

// Update these assertions to match your library's exports
assert.strictEqual(typeof mod.RomScout, 'function', 'CJS build should export RomScout');
assert.strictEqual(typeof mod.calculateHash, 'function', 'CJS build should export calculateHash');
assert.strictEqual(typeof mod.HasheousClient, 'function', 'CJS build should export HasheousClient');
assert.strictEqual(typeof mod.IGDBClient, 'function', 'CJS build should export IGDBClient');
assert.strictEqual(typeof mod.ScreenScraperClient, 'function', 'CJS build should export ScreenScraperClient');

console.log('✓ CJS smoke test passed');
