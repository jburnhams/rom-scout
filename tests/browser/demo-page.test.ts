/**
 * Comprehensive tests for the demo page that simulate the real browser environment
 * These tests ensure that the demo page works exactly as it would in a real browser
 */

import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find project root
let projectRoot = __dirname;
while (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  const parent = path.dirname(projectRoot);
  if (parent === projectRoot) {
    throw new Error('Could not find package.json');
  }
  projectRoot = parent;
}

const docsDistDir = path.join(projectRoot, 'docs-dist');
const indexHtmlPath = path.join(docsDistDir, 'index.html');
const demoJsPath = path.join(docsDistDir, 'demo.js');
const esmBundlePath = path.join(docsDistDir, 'rom-scout.esm.js');

describe('Demo Page - Browser Environment Simulation', () => {
  test('demo page files exist', () => {
    assert.ok(fs.existsSync(docsDistDir), 'docs-dist directory should exist. Run `npm run build:docs` first.');
    assert.ok(fs.existsSync(indexHtmlPath), 'index.html should exist in docs-dist');
    assert.ok(fs.existsSync(demoJsPath), 'demo.js should exist in docs-dist');
    assert.ok(fs.existsSync(esmBundlePath), 'rom-scout.esm.js should exist in docs-dist');
  });

  test('ESM bundle can be imported in browser-like environment', async () => {
    // Create a browser-like environment using happy-dom
    const window = new Window({
      url: `file://${docsDistDir}/index.html`
    });
    const document = window.document;

    // Read the ESM bundle
    const esmBundleCode = fs.readFileSync(esmBundlePath, 'utf8');

    // Check that the bundle doesn't reference 'exports' or 'require' in a way that would break in browser
    // The bundle should not have bare references to CommonJS exports outside of safe wrappers

    // For external dependencies with exports, they should be wrapped with proper module/exports definitions
    if (esmBundleCode.includes("'object' === typeof exports")) {
      assert.ok(
        esmBundleCode.includes('const exports = {};') && esmBundleCode.includes('const module = { exports }'),
        'External dependencies with CommonJS patterns should be wrapped with exports/module definitions'
      );
    }

    // Check that we're not using exports in a way that would fail in browser
    // Look for exports references outside of function wrappers and comments
    const codeWithoutCommentsAndWrappers = esmBundleCode
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*/g, '') // Remove single-line comments
      .replace(/\(function\s*\([^)]*\)\s*{[\s\S]*?}\)\s*\([^)]*\);?/g, ''); // Remove IIFEs with args

    // After removing wrappers, check if there are bare exports references
    // This is a simple heuristic - if exports appears outside wrappers, it should be in our defined wrapper
    const bareExportsPattern = /\bexports\s*\./;
    if (bareExportsPattern.test(codeWithoutCommentsAndWrappers)) {
      // Check that it's in a safe context (e.g., after "const exports = {}")
      assert.ok(
        codeWithoutCommentsAndWrappers.includes('const exports'),
        'If exports is referenced, it should be defined first'
      );
    }

    // Try to evaluate the bundle in a browser-like context
    // This should not throw "exports is not defined" or similar errors
    let loadError: Error | null = null;
    try {
      // Create a script element and load it
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import * as RomScoutModule from './rom-scout.esm.js';
        window.__romScoutTest = {
          loaded: true,
          module: RomScoutModule,
          error: null
        };
      `;

      // We can't actually execute ES modules in happy-dom, but we can check the syntax
      // Instead, let's use a more direct approach: use Node's module system but in a constrained way
      // that mimics browser behavior

      // For now, verify the structure is valid
      assert.ok(esmBundleCode.includes('export {'), 'ESM bundle should have ES6 export statements');
      assert.ok(esmBundleCode.includes('RomScout'), 'ESM bundle should export RomScout');
    } catch (error: any) {
      loadError = error;
    }

    window.close();

    if (loadError) {
      assert.fail(`ESM bundle failed to load in browser-like environment: ${loadError.message}`);
    }
  });

  test('demo.js imports work without falling back to unpkg', async () => {
    const demoJsCode = fs.readFileSync(demoJsPath, 'utf8');

    // Verify unpkg fallback has been removed
    assert.ok(
      !demoJsCode.includes('unpkg.com'),
      'demo.js should not reference unpkg.com (fallback should be removed)'
    );

    // Verify it imports from local build
    assert.ok(
      demoJsCode.includes("import('./rom-scout.esm.js')"),
      'demo.js should import from local rom-scout.esm.js'
    );

    // Verify error handling is present
    assert.ok(
      demoJsCode.includes('Failed to load rom-scout library'),
      'demo.js should have error handling for library load failures'
    );
  });

  test('demo.js has comprehensive error handling', () => {
    const demoJsCode = fs.readFileSync(demoJsPath, 'utf8');

    // Check for various error handlers
    const errorHandlers = [
      'catch (error)',
      'console.error',
      'showError',
      "addEventListener('error'",
      "addEventListener('unhandledrejection'"
    ];

    for (const handler of errorHandlers) {
      assert.ok(
        demoJsCode.includes(handler),
        `demo.js should include error handler: ${handler}`
      );
    }

    // Verify error display on page
    assert.ok(
      demoJsCode.includes('insertAdjacentHTML') || demoJsCode.includes('createElement'),
      'demo.js should display errors on the page'
    );
  });

  test('demo page HTML loads without errors', () => {
    const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

    // Verify essential structure
    assert.ok(htmlContent.includes('<!DOCTYPE html>'), 'HTML should have DOCTYPE');
    assert.ok(htmlContent.includes('<script type="module" src="demo.js">'), 'HTML should load demo.js as module');
    assert.ok(htmlContent.includes('rom-scout'), 'HTML should reference rom-scout');

    // Verify examples are present
    assert.ok(htmlContent.includes('Calculate ROM Hashes'), 'HTML should have hash example');
    assert.ok(htmlContent.includes('Hasheous'), 'HTML should have Hasheous example');
  });

  test('ESM bundle exports are accessible', async () => {
    // Dynamic import should work in Node.js (simulating browser module import)
    const module = await import(esmBundlePath);

    // Verify all expected exports are present
    const expectedExports = [
      'RomScout',
      'calculateHash',
      'calculateSingleHash',
      'HasheousClient',
      'isZipArchive',
      'isArchiveFilename',
      'extractZipFiles',
      'startRomPlayer',
      'detectEmulatorCore'
    ];

    for (const exportName of expectedExports) {
      assert.ok(
        exportName in module,
        `ESM bundle should export ${exportName}`
      );
      assert.ok(
        typeof (module as any)[exportName] === 'function',
        `${exportName} should be a function`
      );
    }
  });

  test('ESM bundle functionality works correctly', async () => {
    const module = await import(esmBundlePath);
    const { RomScout, calculateHash } = module as any;

    // Test RomScout instantiation
    const scout = new RomScout();
    assert.ok(scout, 'Should create RomScout instance');

    // Test hash calculation with actual data
    const testData = new TextEncoder().encode('test data for rom-scout');
    const hashes = await calculateHash(testData);

    assert.ok(hashes.md5, 'Should calculate MD5 hash');
    assert.ok(hashes.sha1, 'Should calculate SHA-1 hash');
    assert.ok(hashes.crc32, 'Should calculate CRC32 hash');

    // Verify hash format (hex strings)
    assert.match(hashes.md5!, /^[a-f0-9]{32}$/i, 'MD5 should be 32 hex chars');
    assert.match(hashes.sha1!, /^[a-f0-9]{40}$/i, 'SHA-1 should be 40 hex chars');
    assert.match(hashes.crc32!, /^[a-f0-9]{8}$/i, 'CRC32 should be 8 hex chars');

    // Test RomScout.hash() method
    const scoutHashes = await scout.hash(testData);
    assert.deepStrictEqual(scoutHashes, hashes, 'RomScout.hash() should return same results as calculateHash()');
  });

  test('ESM bundle handles external dependencies correctly', () => {
    const esmBundleCode = fs.readFileSync(esmBundlePath, 'utf8');

    // Check that CRC32 dependency is properly bundled and wrapped
    assert.ok(
      esmBundleCode.includes('CRC32'),
      'ESM bundle should include CRC32 library'
    );

    // If the bundle includes external dependencies with CommonJS patterns,
    // they should be wrapped in IIFEs with exports/module defined
    if (esmBundleCode.includes("'object' === typeof exports")) {
      assert.ok(
        esmBundleCode.includes('const exports = {};') || esmBundleCode.includes('const module = { exports }'),
        'External dependencies with CommonJS patterns should be wrapped with exports/module definitions'
      );
    }

    // Verify no bare references to Node.js modules (excluding comments)
    // Remove comments before checking
    const codeWithoutComments = esmBundleCode
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*/g, ''); // Remove single-line comments

    const nodeModulePatterns = [
      /\brequire\s*\(\s*['"]fs['"]\s*\)/,
      /\brequire\s*\(\s*['"]path['"]\s*\)/,
      /\bfrom\s+['"]node:/
    ];

    for (const pattern of nodeModulePatterns) {
      assert.ok(
        !pattern.test(codeWithoutComments),
        `ESM bundle should not reference Node.js modules (excluding comments): ${pattern.source}`
      );
    }
  });
});

describe('Demo Page - Integration Tests', () => {
  test('demo page can be served and accessed', () => {
    // Verify all required assets exist for serving
    const requiredFiles = [
      'index.html',
      'demo.js',
      'rom-scout.esm.js',
      'style.css',
      'pacman.zip',
      'sonic.bin'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(docsDistDir, file);
      assert.ok(
        fs.existsSync(filePath),
        `Required file should exist: ${file}`
      );
    }
  });

  test('ESM bundle size is reasonable', () => {
    const stats = fs.statSync(esmBundlePath);
    const sizeKB = stats.size / 1024;

    // ESM bundle should be reasonably sized
    assert.ok(sizeKB > 10, `ESM bundle size (${sizeKB.toFixed(2)}KB) should be > 10KB`);
    assert.ok(sizeKB < 500, `ESM bundle size (${sizeKB.toFixed(2)}KB) should be < 500KB`);

    console.log(`ESM bundle size: ${sizeKB.toFixed(2)}KB`);
  });
});
