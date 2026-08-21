'use strict';

// R2.4 K1 import boundary invariant (I07 reverse-import class).
// The product plane never depends on the interface or platform planes:
//   src/core and src/shared must not import electron, src/main, src/renderer
//   or src/preload; the renderer must not import the main process; the
//   preload bridge must not import the renderer.
// The scan is exhaustive over the live source tree and fail-closed on a
// zero denominator.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const SOURCE_RE = /\.(?:cjs|mjs|js)$/u;
const SPECIFIER_RE = /(?:require\(|from\s+|import\s*(?!\w)[(]?\s*)['"]([^'"]+)['"]/gu;

function listSourceFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        stack.push(full);
      } else if (entry.isFile() && SOURCE_RE.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function specifiersOf(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const found = [];
  for (const match of source.matchAll(SPECIFIER_RE)) {
    found.push(match[1]);
  }
  return found;
}

function resolveSpecifier(filePath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(filePath), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return base;
}

const INVARIANTS = [
  {
    id: 'core-never-imports-interface-or-platform',
    scope: path.join(SRC, 'core'),
    forbidden: (specifier, resolved) => (
      specifier === 'electron'
      || (resolved !== null && (
        resolved.startsWith(path.join(SRC, 'renderer') + path.sep)
        || resolved.startsWith(path.join(SRC, 'preload') + path.sep)
        || resolved === path.join(SRC, 'main.js')
        || resolved.startsWith(path.join(SRC, 'main') + path.sep)
      ))
    ),
  },
  {
    id: 'shared-never-imports-interface-or-platform',
    scope: path.join(SRC, 'shared'),
    forbidden: (specifier, resolved) => (
      specifier === 'electron'
      || (resolved !== null && (
        resolved.startsWith(path.join(SRC, 'renderer') + path.sep)
        || resolved.startsWith(path.join(SRC, 'preload') + path.sep)
        || resolved === path.join(SRC, 'main.js')
        || resolved.startsWith(path.join(SRC, 'main') + path.sep)
      ))
    ),
  },
  {
    id: 'renderer-never-imports-main-process',
    scope: path.join(SRC, 'renderer'),
    forbidden: (specifier, resolved) => (
      resolved !== null && (
        resolved === path.join(SRC, 'main.js')
        || resolved.startsWith(path.join(SRC, 'main') + path.sep)
      )
    ),
  },
  {
    id: 'preload-never-imports-renderer',
    scope: SRC,
    include: (filePath) => path.basename(filePath) === 'preload.js',
    forbidden: (specifier, resolved) => (
      resolved !== null && resolved.startsWith(path.join(SRC, 'renderer') + path.sep)
    ),
  },
];

test('K1 import boundary: no reverse imports or platform effects across the live tree', () => {
  const violations = [];
  let scannedFiles = 0;
  let scannedSpecifiers = 0;
  for (const invariant of INVARIANTS) {
    const files = listSourceFiles(invariant.scope)
      .filter((filePath) => (invariant.include ? invariant.include(filePath) : true));
    for (const filePath of files) {
      scannedFiles += 1;
      for (const specifier of specifiersOf(filePath)) {
        scannedSpecifiers += 1;
        const resolved = resolveSpecifier(filePath, specifier);
        if (invariant.forbidden(specifier, resolved)) {
          violations.push({
            invariant: invariant.id,
            file: path.relative(ROOT, filePath),
            specifier,
          });
        }
      }
    }
  }
  console.log(`R24_K1_BOUNDARY_SCAN=${JSON.stringify({ files: scannedFiles, specifiers: scannedSpecifiers, violations: violations.length })}`);
  assert.equal(scannedFiles > 50, true, `boundary scan denominator must be meaningful, scanned ${scannedFiles} files`);
  assert.equal(scannedSpecifiers > 0, true, 'zero specifier denominator forbidden');
  assert.deepEqual(violations, []);
});

test('K1 import boundary: the renderer dynamic-import adapter cannot reach the main process', () => {
  // The two computed import() targets in the live tree are renderer-internal
  // constructions (fixed src/renderer/commands subpaths); this pins that no
  // dynamic construction names the main process.
  const adapter = fs.readFileSync(path.join(SRC, 'renderer', 'design-os', 'repoDesignOsAdapter.mjs'), 'utf8');
  for (const match of adapter.matchAll(/import\(/gu)) {
    const tail = adapter.slice(match.index, match.index + 220);
    assert.equal(tail.includes("'main'"), false, 'dynamic import must not construct main-process paths');
    assert.equal(tail.includes('main.js'), false, 'dynamic import must not name main.js');
  }
  assert.ok(adapter.includes("path.join(repoRoot, 'src', 'renderer', 'commands'"));
});
