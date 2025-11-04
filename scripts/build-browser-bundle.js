#!/usr/bin/env node

/**
 * Build the documentation site assets.
 *
 * Copies the static docs and freshly built browser bundles
 * into docs-dist/ for local previews and browser integration tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const libraryName = packageJson.name;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const browserDistDir = path.join(distDir, 'browser');
const docsSourceDir = path.join(projectRoot, 'docs');
const docsDistDir = path.join(projectRoot, 'docs-dist');

function assertExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

assertExists(distDir, 'Run `npm run build` before packaging docs.');
assertExists(browserDistDir, 'Browser bundles not found. Did `npm run build` succeed?');

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDocs() {
  if (!fs.existsSync(docsSourceDir)) {
    console.log('No docs directory found, skipping...');
    fs.mkdirSync(docsDistDir, { recursive: true });
    return;
  }
  console.log('Copying docs source files...');
  fs.rmSync(docsDistDir, { recursive: true, force: true });
  copyRecursive(docsSourceDir, docsDistDir);
}

function copyBrowserBundles() {
  console.log('Copying browser bundles...');
  const outputs = [
    `${libraryName}.js`,
    `${libraryName}.js.map`,
    `${libraryName}.min.js`,
    `${libraryName}.min.js.map`
  ];

  for (const file of outputs) {
    const srcPath = path.join(browserDistDir, file);
    assertExists(srcPath, `Missing browser artifact: ${file}`);
    const destPath = path.join(docsDistDir, file);
    fs.copyFileSync(srcPath, destPath);
  }
}

function copyEsmBundle() {
  console.log('Copying ESM bundle for documentation...');
  const esmBundle = path.join(distDir, 'bundles', `${libraryName}.esm.js`);
  if (!fs.existsSync(esmBundle)) {
    console.warn('ESM bundle not found; skipping.');
    return;
  }

  const dest = path.join(docsDistDir, `${libraryName}.esm.js`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(esmBundle, dest);

  const mapSrc = `${esmBundle}.map`;
  if (fs.existsSync(mapSrc)) {
    fs.copyFileSync(mapSrc, `${dest}.map`);
  }
}

copyDocs();
copyBrowserBundles();
copyEsmBundle();

console.log('Documentation assets ready in docs-dist/.');
