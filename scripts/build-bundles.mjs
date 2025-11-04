import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');
const libraryName = packageJson.name;
const globalName = toPascalCase(libraryName);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const esmDir = path.join(distDir, 'esm');
const cjsDir = path.join(distDir, 'cjs');
const bundlesDir = path.join(distDir, 'bundles');
const browserDir = path.join(distDir, 'browser');

fs.mkdirSync(bundlesDir, { recursive: true });
fs.mkdirSync(browserDir, { recursive: true });

function toPascalCase(str) {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function renameCjsArtifacts() {
  if (!fs.existsSync(cjsDir)) {
    return;
  }
  for (const file of fs.readdirSync(cjsDir)) {
    if (!file.endsWith('.js')) {
      continue;
    }
    const base = file.slice(0, -3);
    const srcPath = path.join(cjsDir, file);
    const destPath = path.join(cjsDir, `${base}.cjs`);
    fs.renameSync(srcPath, destPath);

    const mapPath = `${srcPath}.map`;
    if (fs.existsSync(mapPath)) {
      const destMap = path.join(cjsDir, `${base}.cjs.map`);
      const raw = fs.readFileSync(mapPath, 'utf8');
      const json = JSON.parse(raw);
      json.file = `${base}.cjs`;
      fs.writeFileSync(destMap, JSON.stringify(json));
      fs.unlinkSync(mapPath);
    }

    let content = fs.readFileSync(destPath, 'utf8');
    content = content.replace(/require\((['"]\.\.?(?:\/[^'"\\]+)*)\.js(['"])\)/g, 'require($1.cjs$2)');
    content = content.replace(/import\((['"]\.\.?(?:\/[^'"\\]+)*)\.js(['"])\)/g, 'import($1.cjs$2)');
    content = content.replace(/\/\/# sourceMappingURL=.*$/gm, `//# sourceMappingURL=${base}.cjs.map`);
    if (!content.endsWith('\n')) {
      content += '\n';
    }
    fs.writeFileSync(destPath, content);
  }
}

const modules = new Map();

function parseExportList(list) {
  return list
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const parts = segment.split(/\s+as\s+/i);
      if (parts.length === 2) {
        return { local: parts[0].trim(), exported: parts[1].trim() };
      }
      return { local: segment.trim(), exported: segment.trim() };
    });
}

function resolveSpecifier(fromPath, spec) {
  if (spec.startsWith('.')) {
    const resolved = path.resolve(path.dirname(fromPath), spec);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    const withJs = `${resolved}.js`;
    if (fs.existsSync(withJs)) {
      return withJs;
    }
    throw new Error(`Unable to resolve ${spec} from ${fromPath}`);
  }
  // For node: imports, return null (will be stripped)
  if (spec.startsWith('node:')) {
    return null;
  }
  // For external dependencies, try to resolve from node_modules
  try {
    const moduleEntry = require.resolve(spec, { paths: [path.dirname(fromPath)] });
    return moduleEntry;
  } catch {
    return null;
  }
}

function parseModule(modulePath) {
  const absolute = path.resolve(modulePath);
  if (modules.has(absolute)) {
    return modules.get(absolute);
  }

  let code = fs.readFileSync(absolute, 'utf8');
  const imports = new Set();
  const localExports = [];
  const exportFrom = [];
  const exportAll = [];

  const importRegex = /^import\s+(.+?)\s+from\s+['\"](.+?)['\"];?\s*$/gm;
  code = code.replace(importRegex, (match, clause, spec) => {
    const resolved = resolveSpecifier(absolute, spec);
    if (resolved) {
      imports.add(resolved);
    }
    return '';
  });

  const exportFromRegex = /^export\s+{([^}]+)}\s+from\s+['\"](.+?)['\"];?\s*$/gm;
  code = code.replace(exportFromRegex, (match, names, spec) => {
    const resolved = resolveSpecifier(absolute, spec);
    if (resolved) {
      imports.add(resolved);
      exportFrom.push({ module: resolved, names: parseExportList(names) });
    }
    return '';
  });

  const exportAllRegex = /^export\s+\*\s+from\s+['\"](.+?)['\"];?\s*$/gm;
  code = code.replace(exportAllRegex, (match, spec) => {
    const resolved = resolveSpecifier(absolute, spec);
    if (resolved) {
      imports.add(resolved);
      exportAll.push(resolved);
    }
    return '';
  });

  const declarationExportRegex = /^export\s+(async\s+)?(const|let|var|function\*?|class)\s+([A-Za-z0-9_$]+)/gm;
  code = code.replace(declarationExportRegex, (match, asyncKeyword, kind, name) => {
    localExports.push({ local: name, exported: name });
    const prefix = asyncKeyword ? `${asyncKeyword}${kind}` : kind;
    return `${prefix} ${name}`;
  });

  const listExportRegex = /^export\s*{([^}]+)};?\s*$/gm;
  code = code.replace(listExportRegex, (match, list) => {
    localExports.push(...parseExportList(list));
    return '';
  });

  code = code.replace(/\/\/# sourceMappingURL=.*$/gm, '');
  code = code.trimEnd() + '\n';

  const info = {
    path: absolute,
    code,
    imports: Array.from(imports),
    localExports,
    exportFrom,
    exportAll
  };

  modules.set(absolute, info);
  return info;
}

function collectModules(entryPath) {
  const order = [];
  const visited = new Set();
  function visit(modulePath) {
    const info = parseModule(modulePath);
    if (visited.has(info.path)) {
      return;
    }
    visited.add(info.path);
    for (const dep of info.imports) {
      visit(dep);
    }
    order.push(info);
  }
  visit(entryPath);
  return order;
}

function formatRelative(modulePath) {
  return path.relative(projectRoot, modulePath).replace(/\\/g, '/');
}

function generateIdentityMap(code, fileName, sourceLabel = fileName, sourceContent = code) {
  const lines = code.split('\n');
  const mappings = lines.map(() => 'AAAA').join(';');
  return JSON.stringify({
    version: 3,
    file: fileName,
    sources: [sourceLabel],
    sourcesContent: [sourceContent],
    names: [],
    mappings
  });
}

function buildBundles() {
  const entryPath = path.join(esmDir, 'index.js');
  const order = collectModules(entryPath);
  if (order.length === 0) {
    throw new Error('No modules found. Did the ESM build succeed?');
  }

  const entryInfo = order[order.length - 1];
  const exportMap = new Map();
  const exportNameMap = new Map();

  function addExport(modulePath, local, exported) {
    const resolvedPath = path.resolve(modulePath);
    let resolvedLocal = local;

    const targetModule = modules.get(resolvedPath);
    if (targetModule) {
      const alias = targetModule.localExports.find((pair) => pair.exported === local);
      if (alias) {
        resolvedLocal = alias.local;
      }
    }

    if (!exportMap.has(resolvedPath)) {
      exportMap.set(resolvedPath, new Map());
    }
    const moduleExports = exportMap.get(resolvedPath);
    moduleExports.set(exported, resolvedLocal);
    exportNameMap.set(exported, resolvedLocal);
  }

  // Add local exports from the entry file itself
  for (const pair of entryInfo.localExports) {
    if (pair.exported !== 'default') {
      addExport(entryInfo.path, pair.local, pair.exported);
    }
  }

  for (const record of entryInfo.exportFrom) {
    for (const pair of record.names) {
      addExport(record.module, pair.local, pair.exported);
    }
  }

  for (const spec of entryInfo.exportAll) {
    const target = modules.get(path.resolve(spec));
    if (!target) {
      continue;
    }
    for (const pair of target.localExports) {
      if (pair.exported !== 'default') {
        addExport(target.path, pair.local, pair.exported);
      }
    }
  }

  const chunks = [];
  for (let i = 0; i < order.length; i++) {
    const info = order[i];
    // Include all modules with code, including the entry point
    if (info.code.trim()) {
      const banner = `// ===== ${formatRelative(info.path)} =====`;
      chunks.push(`${banner}\n${info.code}`);
    }
  }

  const exportStatements = [];
  for (const [modulePath, names] of exportMap.entries()) {
    const parts = [];
    for (const [exported, local] of names.entries()) {
      parts.push(local === exported ? local : `${local} as ${exported}`);
    }
    if (parts.length > 0) {
      exportStatements.push(`export { ${parts.join(', ')} };`);
    }
  }

  const header = `/**
 * ${libraryName} bundle
 * Generated on ${new Date().toISOString()}
 */\n`;
  const esmBundle = `${header}${chunks.join('\n')}\n${exportStatements.join('\n')}\n`;
  const esmPath = path.join(bundlesDir, `${libraryName}.esm.js`);
  fs.writeFileSync(esmPath, `${esmBundle}\n//# sourceMappingURL=${libraryName}.esm.js.map\n`);
  fs.writeFileSync(`${esmPath}.map`, generateIdentityMap(esmBundle, `${libraryName}.esm.js`));

  const iifeBody = `${chunks.join('\n')}\n`;
  const assignments = [];
  for (const [exported, local] of exportNameMap.entries()) {
    assignments.push(`${JSON.stringify(exported)}: ${local}`);
  }
  const globalInit = `const api = {\n  ${assignments.join(',\n  ')}\n};\n`;
  const assignment = `global.${globalName} = api;\n  if (typeof globalThis !== 'undefined') {\n    globalThis.${globalName} = api;\n  }\n  if (global.window) {\n    global.window.${globalName} = api;\n  }\n  if (typeof window !== 'undefined') {\n    window.${globalName} = api;\n  }`;
  const targetGlobal = "typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)";
  const iifeSource = `${header}(function (global) {\n  'use strict';\n${indent(iifeBody)}\n${indent(globalInit)}${indent(assignment)}\n})(${targetGlobal});\n`;
  const iifePath = path.join(browserDir, `${libraryName}.js`);
  fs.writeFileSync(iifePath, `${iifeSource}\n//# sourceMappingURL=${libraryName}.js.map\n`);
  fs.writeFileSync(`${iifePath}.map`, generateIdentityMap(iifeSource, `${libraryName}.js`));

  const minSource = minify(iifeSource);
  const minPath = path.join(browserDir, `${libraryName}.min.js`);
  fs.writeFileSync(minPath, `${minSource}\n//# sourceMappingURL=${libraryName}.min.js.map\n`);
  fs.writeFileSync(`${minPath}.map`, generateIdentityMap(minSource, `${libraryName}.min.js`, `${libraryName}.js`, iifeSource));
}

function indent(code, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line ? pad + line : line))
    .join('\n');
}

function minify(code) {
  const lines = code.split('\n');
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('//#')) {
      continue;
    }
    if (trimmed.startsWith('//') && !trimmed.startsWith('//!')) {
      continue;
    }
    result.push(trimmed);
  }
  return result.join('\n');
}

renameCjsArtifacts();
buildBundles();

console.log('ESM and browser bundles generated.');
