import { readdir, unlink, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Recursively rename .js files to .cjs and update imports in the CJS build output
 * TypeScript doesn't automatically handle nested directory extensions for CJS
 */
async function fixCjsExtensions(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively process subdirectories
      await fixCjsExtensions(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.cjs')) {
      // Read the file and update require statements
      let content = await readFile(fullPath, 'utf-8');
      // Replace .js with .cjs in all require() statements
      content = content.replace(/\.js(["']\))/g, '.cjs$1');

      // Write to .cjs file
      const newPath = fullPath.replace(/\.js$/, '.cjs');
      await writeFile(newPath, content);

      // Delete the old .js file
      await unlink(fullPath);

      console.log(`Fixed: ${entry.name} -> ${entry.name.replace(/\.js$/, '.cjs')}`);
    } else if (entry.isFile() && entry.name.endsWith('.js.map') && !entry.name.endsWith('.cjs.map')) {
      // Read map file and update references
      let content = await readFile(fullPath, 'utf-8');
      content = content.replace(/\.js"/g, '.cjs"');

      // Write to .cjs.map file
      const newPath = fullPath.replace(/\.js\.map$/, '.cjs.map');
      await writeFile(newPath, content);

      // Delete the old .js.map file
      await unlink(fullPath);
    }
  }
}

const cjsDir = join(process.cwd(), 'dist', 'cjs');
await fixCjsExtensions(cjsDir);
console.log('✓ Fixed CJS extensions');
