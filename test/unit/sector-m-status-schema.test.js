const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('SECTOR_M.json has required M0 schema fields', () => {
  const filePath = path.join(process.cwd(), 'docs', 'OPS', 'STATUS', 'SECTOR_M.json');
  assert.equal(fs.existsSync(filePath), true, 'SECTOR_M.json must exist');

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(parsed.schemaVersion, 'sector-m-status.v1');
  assert.equal(parsed.status, 'NOT_STARTED');
  assert.equal(parsed.phase, 'M0');
  assert.equal(parsed.goTag, '');
  assert.match(String(parsed.baselineSha || ''), /^[0-9a-f]{7,}$/i);
});
