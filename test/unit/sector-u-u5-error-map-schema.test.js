const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function validateUiErrorMapShape(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (doc.schemaVersion !== 'ui-error-map.v1') return false;
  if (typeof doc.defaultUserMessage !== 'string' || doc.defaultUserMessage.trim().length === 0) return false;
  if (!Array.isArray(doc.map)) return false;

  const seenCodes = new Set();
  for (const entry of doc.map) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    if (typeof entry.code !== 'string' || entry.code.trim().length === 0) return false;
    if (typeof entry.userMessage !== 'string' || entry.userMessage.trim().length === 0) return false;
    if (entry.severity !== 'ERROR' && entry.severity !== 'WARN') return false;
    if (seenCodes.has(entry.code)) return false;
    seenCodes.add(entry.code);
  }
  return true;
}

test('u5 error map schema: repo SoT is valid', () => {
  const doc = readJson('docs/OPS/STATUS/UI_ERROR_MAP.json');
  assert.equal(validateUiErrorMapShape(doc), true);
});

test('u5 error map schema: valid fixture passes', () => {
  const doc = readJson('test/fixtures/sector-u/u5/error-map-valid.json');
  assert.equal(validateUiErrorMapShape(doc), true);
});

test('u5 error map schema: duplicate code fixture fails', () => {
  const doc = readJson('test/fixtures/sector-u/u5/error-map-dup.json');
  assert.equal(validateUiErrorMapShape(doc), false);
});
