import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const esmPath = path.join(__dirname, '..', 'dist', 'esm', 'index.js');
const mod = await import(pathToFileURL(esmPath).href);

// Update these assertions to match your library's exports
assert.strictEqual(typeof mod.hello, 'function', 'ESM build should export hello');

console.log('esm smoke test passed');
