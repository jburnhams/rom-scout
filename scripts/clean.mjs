import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const targets = ['dist', 'build', 'docs-dist'];

for (const target of targets) {
  const fullPath = path.join(projectRoot, target);
  fs.rmSync(fullPath, { recursive: true, force: true });
}

console.log('Cleaned build artifacts.');
