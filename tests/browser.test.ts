import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root by looking for package.json
let projectRoot = __dirname;
while (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  const parent = path.dirname(projectRoot);
  if (parent === projectRoot) {
    throw new Error('Could not find package.json');
  }
  projectRoot = parent;
}

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const libraryName = packageJson.name;
const globalName = toPascalCase(libraryName);

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// Path to the generated docs
const docsDistDir = path.join(projectRoot, 'docs-dist');
const iifeBundlePath = path.join(docsDistDir, `${libraryName}.min.js`);
const esmBundlePath = path.join(docsDistDir, `${libraryName}.esm.js`);

describe('Browser Bundle Tests', () => {
  test('IIFE bundle attaches global namespace', () => {
    assert.ok(fs.existsSync(iifeBundlePath), 'Minified bundle should exist. Run `npm run build:docs` first.');

    const bundleCode = fs.readFileSync(iifeBundlePath, 'utf8');
    const context: Record<string, any> = { window: {}, globalThis: {} };
    vm.createContext(context);

    assert.doesNotThrow(() => {
      vm.runInContext(bundleCode, context);
    });

    const globalApi = context.window[globalName] ?? context.globalThis[globalName];
    assert.ok(globalApi, `Global ${globalName} namespace should exist`);
    assert.strictEqual(typeof globalApi.RomScout, 'function', 'Should export RomScout class');
    assert.strictEqual(typeof globalApi.calculateHash, 'function', 'Should export calculateHash function');
    assert.strictEqual(typeof globalApi.HasheousClient, 'function', 'Should export HasheousClient class');
    assert.strictEqual(typeof globalApi.IGDBClient, 'function', 'Should export IGDBClient class');
    assert.strictEqual(typeof globalApi.ScreenScraperClient, 'function', 'Should export ScreenScraperClient class');
  });

  test('ESM bundle can be imported directly', async () => {
    assert.ok(fs.existsSync(esmBundlePath), 'ESM bundle should exist. Run `npm run build:docs` first.');

    const moduleUrl = pathToFileURL(esmBundlePath).href;
    const mod = await import(moduleUrl);

    assert.strictEqual(typeof mod.RomScout, 'function', 'Should export RomScout class');
    assert.strictEqual(typeof mod.calculateHash, 'function', 'Should export calculateHash function');
    assert.strictEqual(typeof mod.HasheousClient, 'function', 'Should export HasheousClient class');
    assert.strictEqual(typeof mod.IGDBClient, 'function', 'Should export IGDBClient class');
    assert.strictEqual(typeof mod.ScreenScraperClient, 'function', 'Should export ScreenScraperClient class');
  });

  test('bundle size is reasonable', () => {
    const stats = fs.statSync(iifeBundlePath);
    const sizeKB = stats.size / 1024;

    // Bundle should be less than 150KB (rom-scout has hash implementations)
    assert.ok(sizeKB < 150, `Bundle size (${sizeKB.toFixed(2)}KB) should be less than 150KB`);

    // Bundle should be more than 1KB (sanity check - has substantial hash code)
    assert.ok(sizeKB > 1, `Bundle size (${sizeKB.toFixed(2)}KB) seems too small`);
  });
});

describe('Functional Tests - Verify Bundle Works Correctly', () => {
  // Helper to load the bundle and get its exports exactly as the browser does
  async function loadBundleModule() {
    const moduleUrl = pathToFileURL(esmBundlePath);
    return await import(moduleUrl.href);
  }

  test('RomScout class works in browser bundle', async () => {
    const bundle = await loadBundleModule();

    const scout = new bundle.RomScout();
    assert.ok(scout, 'Should create RomScout instance');
  });

  test('calculateHash works in browser bundle', async () => {
    const bundle = await loadBundleModule();

    const data = new TextEncoder().encode('Test data');
    const hashes = await bundle.calculateHash(data);

    assert.ok(hashes.md5, 'MD5 should be calculated');
    assert.ok(hashes.sha1, 'SHA-1 should be calculated');
    assert.ok(hashes.crc32, 'CRC32 should be calculated');
  });

  test('RomScout.hash() method works in browser bundle', async () => {
    const bundle = await loadBundleModule();

    const scout = new bundle.RomScout();
    const data = new TextEncoder().encode('Browser test');

    const hashes = await scout.hash(data);

    assert.ok(hashes.md5, 'Should calculate MD5');
    assert.ok(hashes.sha1, 'Should calculate SHA-1');
    assert.ok(hashes.crc32, 'Should calculate CRC32');
  });

  test('IIFE bundle exports work correctly', () => {
    const bundleCode = fs.readFileSync(iifeBundlePath, 'utf8');
    const context: Record<string, any> = {
      window: {},
      globalThis: {},
      console: console // Allow console for debugging
    };
    vm.createContext(context);
    vm.runInContext(bundleCode, context);

    const api = context.window[globalName] ?? context.globalThis[globalName];

    // Test RomScout class
    const scout = new api.RomScout();
    assert.ok(scout, 'Should create RomScout instance in IIFE bundle');

    // Test calculateHash is available
    assert.strictEqual(typeof api.calculateHash, 'function', 'calculateHash should be a function');

    // Test API clients are available
    assert.strictEqual(typeof api.HasheousClient, 'function', 'HasheousClient should be a constructor');
    assert.strictEqual(typeof api.IGDBClient, 'function', 'IGDBClient should be a constructor');
    assert.strictEqual(typeof api.ScreenScraperClient, 'function', 'ScreenScraperClient should be a constructor');
  });
});
