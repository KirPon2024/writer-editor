const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DERIVED_DIR = path.join(process.cwd(), 'src', 'derived');
const REQUIRED = [
  'deriveCache.mjs',
  'deriveView.mjs',
  'index.mjs',
  'referenceOutline.mjs',
];
const FORBIDDEN_PATTERNS = [
  /from\s+['"]node:fs['"]/u,
  /from\s+['"]node:child_process['"]/u,
  /from\s+['"]node:http['"]/u,
  /from\s+['"]node:https['"]/u,
  /from\s+['"]node:net['"]/u,
  /from\s+['"]electron['"]/u,
  /\bipcMain\b/u,
  /\bipcRenderer\b/u,
  /\bBrowserWindow\b/u,
  /\bfetch\s*\(/u,
  /from\s+['"].*\/adapters\//u,
];

function listDerivedFiles() {
  return fs.readdirSync(DERIVED_DIR)
    .filter((entry) => entry.endsWith('.mjs'))
    .sort();
}

test('derived views contract: pure module set exists', () => {
  const files = listDerivedFiles();
  assert.deepEqual(files, REQUIRED);
});

test('derived views contract: pure layer has no platform/network wiring', () => {
  for (const fileName of listDerivedFiles()) {
    const filePath = path.join(DERIVED_DIR, fileName);
    const text = fs.readFileSync(filePath, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.equal(
        pattern.test(text),
        false,
        `forbidden pure pattern in ${fileName}: ${pattern.source}`,
      );
    }
  }
});
