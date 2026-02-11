const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(mjs|cjs|js|ts)$/u.test(entry.name)) continue;
      out.push(fullPath);
    }
  }
  return out.sort();
}

test('core has no platform wiring imports/usages', () => {
  const root = process.cwd();
  const coreRoot = path.join(root, 'src', 'core');
  const files = walkFiles(coreRoot);

  const forbidden = [
    /\bipcRenderer\b/u,
    /\bipcMain\b/u,
    /\bBrowserWindow\b/u,
    /\bwindow\./u,
    /\bdocument\./u,
    /\bnavigator\./u,
    /from\s+['"]electron['"]/u,
    /require\(['"]electron['"]\)/u,
    /@electron\//u,
  ];

  const violations = [];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const re of forbidden) {
      if (re.test(text)) {
        violations.push({
          file: path.relative(root, filePath),
          pattern: re.source,
        });
      }
    }
  }

  assert.deepEqual(violations, []);
});

