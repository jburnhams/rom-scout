import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const libraryName = packageJson.name;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const bundlePath = path.join(projectRoot, 'dist', 'browser', `${libraryName}.min.js`);
const esmPath = path.join(projectRoot, 'dist', 'bundles', `${libraryName}.esm.js`);

const BUNDLE_LIMIT = 100 * 1024;
const GZIP_LIMIT = 50 * 1024;
const ESM_LIMIT = 200 * 1024;

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function checkFile(targetPath, limit, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing artifact at ${targetPath}. Did the build succeed?`);
  }

  const size = fs.statSync(targetPath).size;
  if (size > limit) {
    throw new Error(`${label} exceeds limit: ${formatSize(size)} > ${formatSize(limit)}`);
  }

  console.log(`${label}: ${formatSize(size)} (limit ${formatSize(limit)})`);
}

function checkGzip(targetPath, limit, label) {
  const contents = fs.readFileSync(targetPath);
  const gzipped = zlib.gzipSync(contents);
  const size = gzipped.length;
  if (size > limit) {
    throw new Error(`${label} gzip size exceeds limit: ${formatSize(size)} > ${formatSize(limit)}`);
  }
  console.log(`${label} gzip: ${formatSize(size)} (limit ${formatSize(limit)})`);
}

checkFile(bundlePath, BUNDLE_LIMIT, 'Browser bundle');
checkGzip(bundlePath, GZIP_LIMIT, 'Browser bundle');
checkFile(esmPath, ESM_LIMIT, 'ESM bundle');

console.log('Bundle size checks passed');
