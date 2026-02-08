const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIXTURES_ROOT = path.join(process.cwd(), 'test', 'fixtures', 'sector-u');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_ROOT, name), 'utf8'));
}

function validateSectorUStatus(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (doc.schemaVersion !== 'sector-u-status.v1') return false;
  if (typeof doc.status !== 'string' || doc.status.length === 0) return false;
  if (typeof doc.phase !== 'string' || doc.phase.length === 0) return false;
  if (typeof doc.baselineSha !== 'string' || doc.baselineSha.length === 0) return false;
  if (typeof doc.goTag !== 'string') return false;
  if (doc.uiRootPath !== 'src/renderer') return false;
  if (!Number.isInteger(doc.fastMaxDurationMs) || doc.fastMaxDurationMs <= 0) return false;
  if (typeof doc.waiversPath !== 'string' || doc.waiversPath.length === 0) return false;
  return true;
}

test('sector-u status fixture passes schema validation', () => {
  const valid = readFixture('status-valid.json');
  assert.equal(validateSectorUStatus(valid), true);
});

test('sector-u status fixture without phase fails schema validation', () => {
  const invalid = readFixture('status-missing-phase.json');
  assert.equal(validateSectorUStatus(invalid), false);
});
