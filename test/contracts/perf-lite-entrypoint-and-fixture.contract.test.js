const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_PATH = path.join(process.cwd(), 'package.json');
const SCRIPT_PATH = path.join(process.cwd(), 'scripts/perf/perf-lite.mjs');
const FIXTURE_DIR = path.join(process.cwd(), 'test/fixtures/perf');
const FIXTURE_PATH = path.join(FIXTURE_DIR, 'long-scene.txt');
const REQUIRED_SET_PATH = path.join(process.cwd(), 'docs/OPS/EXECUTION/REQUIRED_TOKEN_SET.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenTokenValues(input, out = []) {
  if (Array.isArray(input)) {
    input.forEach((item) => flattenTokenValues(item, out));
    return out;
  }
  if (!input || typeof input !== 'object') {
    return out;
  }
  for (const value of Object.values(input)) {
    if (typeof value === 'string') {
      out.push(value);
    } else {
      flattenTokenValues(value, out);
    }
  }
  return out;
}

test('perf-lite contract: package entrypoint and script file exist', () => {
  const pkg = readJson(PACKAGE_PATH);
  assert.ok(pkg && typeof pkg === 'object');
  assert.ok(pkg.scripts && typeof pkg.scripts === 'object');
  assert.equal(typeof pkg.scripts['perf:lite'], 'string');
  assert.match(pkg.scripts['perf:lite'], /scripts\/perf\/perf-lite\.mjs/);
  assert.equal(fs.existsSync(SCRIPT_PATH), true, 'scripts/perf/perf-lite.mjs must exist');
});

test('perf-lite contract: long fixture exists and has deterministic non-trivial size', () => {
  assert.equal(fs.existsSync(FIXTURE_DIR), true, 'test/fixtures/perf must exist');
  assert.equal(fs.existsSync(FIXTURE_PATH), true, 'long perf fixture must exist');
  const stats = fs.statSync(FIXTURE_PATH);
  assert.ok(stats.size >= 250_000, `fixture size must be >= 250KB, got ${stats.size}`);
});

test('perf-lite contract: perf-lite stays outside release required set by default', () => {
  const requiredSet = readJson(REQUIRED_SET_PATH);
  const tokens = flattenTokenValues(requiredSet).map((item) => String(item || '').trim()).filter(Boolean);
  const perfLiteTokens = new Set([
    'PERF_LITE_OK',
    'PERF_LITE_BASELINE_OK',
    'PERF_LITE_ENTRYPOINT_OK',
  ]);
  const collisions = tokens.filter((token) => perfLiteTokens.has(token));
  assert.deepEqual(collisions, []);
});
