const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('capability matrix is non-empty and has baseline platforms', () => {
  const matrixPath = path.join(process.cwd(), 'docs', 'OPS', 'CAPABILITIES_MATRIX.json');
  const matrix = readJson(matrixPath);

  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.declaredEmpty, false);
  assert.ok(Array.isArray(matrix.items));
  assert.ok(matrix.items.length >= 3);

  const platformIds = new Set(matrix.items.map((item) => String(item.platformId || '')));
  assert.equal(platformIds.has('node'), true);
  assert.equal(platformIds.has('web'), true);
  assert.equal(platformIds.has('mobile-wrapper'), true);

  for (const item of matrix.items) {
    assert.equal(typeof item.platformId, 'string');
    assert.ok(item.platformId.length > 0);
    assert.equal(typeof item.capabilities, 'object');
    assert.equal(Array.isArray(item.capabilities), false);
    assert.ok(Object.keys(item.capabilities).length > 0);
  }
});
