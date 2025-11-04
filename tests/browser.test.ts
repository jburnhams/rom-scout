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
    assert.strictEqual(typeof globalApi.hello, 'function', 'Should export hello function');
    assert.strictEqual(typeof globalApi.goodbye, 'function', 'Should export goodbye function');
    assert.strictEqual(typeof globalApi.Greeter, 'function', 'Should export Greeter class');
  });

  test('ESM bundle can be imported directly', async () => {
    assert.ok(fs.existsSync(esmBundlePath), 'ESM bundle should exist. Run `npm run build:docs` first.');

    const moduleUrl = pathToFileURL(esmBundlePath).href;
    const mod = await import(moduleUrl);

    assert.strictEqual(typeof mod.hello, 'function', 'Should export hello function');
    assert.strictEqual(typeof mod.goodbye, 'function', 'Should export goodbye function');
    assert.strictEqual(typeof mod.Greeter, 'function', 'Should export Greeter class');
  });

  test('bundle size is reasonable', () => {
    const stats = fs.statSync(iifeBundlePath);
    const sizeKB = stats.size / 1024;

    // Bundle should be less than 100KB
    assert.ok(sizeKB < 100, `Bundle size (${sizeKB.toFixed(2)}KB) should be less than 100KB`);

    // Bundle should be more than 0.1KB (sanity check)
    assert.ok(sizeKB > 0.1, `Bundle size (${sizeKB.toFixed(2)}KB) seems too small`);
  });
});

describe('Functional Tests - Verify Bundle Works Correctly', () => {
  // Helper to load the bundle and get its exports exactly as the browser does
  async function loadBundleModule() {
    const moduleUrl = pathToFileURL(esmBundlePath);
    return await import(moduleUrl.href);
  }

  test('hello function works in browser bundle', async () => {
    const bundle = await loadBundleModule();

    assert.strictEqual(bundle.hello(), 'Hello, World!');
    assert.strictEqual(bundle.hello('Browser'), 'Hello, Browser!');
  });

  test('goodbye function works in browser bundle', async () => {
    const bundle = await loadBundleModule();

    assert.strictEqual(bundle.goodbye(), 'Goodbye, World!');
    assert.strictEqual(bundle.goodbye('Browser'), 'Goodbye, Browser!');
  });

  test('Greeter class works in browser bundle', async () => {
    const bundle = await loadBundleModule();

    const greeter = new bundle.Greeter('Test');
    assert.strictEqual(greeter.greet(), 'Hello, Test!');
    assert.strictEqual(greeter.farewell(), 'Goodbye, Test!');
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

    // Test hello function
    assert.strictEqual(api.hello(), 'Hello, World!');
    assert.strictEqual(api.hello('IIFE'), 'Hello, IIFE!');

    // Test goodbye function
    assert.strictEqual(api.goodbye(), 'Goodbye, World!');
    assert.strictEqual(api.goodbye('IIFE'), 'Goodbye, IIFE!');

    // Test Greeter class
    const greeter = new api.Greeter('VM');
    assert.strictEqual(greeter.greet(), 'Hello, VM!');
    assert.strictEqual(greeter.farewell(), 'Goodbye, VM!');
  });
});
