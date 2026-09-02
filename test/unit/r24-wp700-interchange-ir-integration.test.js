'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MODULE = '../../src/core/interchange-ir-v1.mjs';
const load = () => import(MODULE);
const ROOT = path.resolve(__dirname, '..', '..');

function allValues(keys, value) {
  return Object.fromEntries(keys.map((key) => [key, value]));
}

test('WP700 capability composition uses the weakest required operation across every profile', async () => {
  const ir = await load();
  const local = allValues(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'FULL');
  const provider = allValues(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'FULL');
  provider.PROVIDER_SYNC = 'READ_ONLY';
  provider.REVIEW_APPLY = 'LOSSY_WRITE';
  const result = ir.composeInterchangeCapabilities([
    { profileId: 'provider', values: provider },
    { profileId: 'local', values: local },
  ], ['REVIEW_APPLY', 'PARSE', 'PROVIDER_SYNC']);
  assert.deepEqual(result, {
    ok: true,
    level: 'READ_ONLY',
    requiredOperations: ['PARSE', 'PROVIDER_SYNC', 'REVIEW_APPLY'],
    profileCount: 2,
    evaluatedCellCount: 6,
    witnesses: [{ operation: 'PROVIDER_SYNC', profileId: 'provider', level: 'READ_ONLY' }],
  });
});

test('WP700 capability meet is deterministic, commutative and idempotent by value', async () => {
  const ir = await load();
  const full = allValues(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'FULL');
  const limited = allValues(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'FULL');
  limited.ROUND_TRIP = 'LOSSY_WRITE';
  const left = ir.composeInterchangeCapabilities([
    { profileId: 'a', values: full },
    { profileId: 'b', values: limited },
  ], ['ROUND_TRIP']);
  const right = ir.composeInterchangeCapabilities([
    { profileId: 'b', values: limited },
    { profileId: 'a', values: full },
  ], ['ROUND_TRIP']);
  const repeatedValue = ir.composeInterchangeCapabilities([
    { profileId: 'a', values: limited },
    { profileId: 'b', values: limited },
  ], ['ROUND_TRIP']);
  assert.deepEqual(left, right);
  assert.equal(left.level, 'LOSSY_WRITE');
  assert.equal(repeatedValue.level, 'LOSSY_WRITE');
});

test('WP700 capability profiles require a complete closed denominator', async () => {
  const ir = await load();
  const missing = allValues(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'FULL');
  delete missing.PARSE;
  assert.equal(ir.composeInterchangeCapabilities([{ profileId: 'missing', values: missing }]).error.code, 'E_INTERCHANGE_CAPABILITY_DENOMINATOR');
  const extra = allValues(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'FULL');
  extra.FUTURE = 'FULL';
  assert.equal(ir.composeInterchangeCapabilities([{ profileId: 'extra', values: extra }]).error.code, 'E_INTERCHANGE_CAPABILITY_DENOMINATOR');
  assert.equal(ir.composeInterchangeCapabilities([]).error.code, 'E_INTERCHANGE_CAPABILITY_ROWS');
  assert.equal(ir.composeInterchangeCapabilities([{ profileId: 'bad', values: allValues(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'MAYBE') }]).error.code, 'E_INTERCHANGE_CAPABILITY_LEVEL');
});

test('WP700 fidelity composition preserves every dimension and reports the weakest complete dimension', async () => {
  const ir = await load();
  const source = allValues(ir.INTERCHANGE_FIDELITY_DIMENSIONS, 'EXACT');
  source.LAYOUT = 'BOUNDED';
  const target = allValues(ir.INTERCHANGE_FIDELITY_DIMENSIONS, 'EXACT');
  target.COMMENTS = 'LOSSY';
  target.LAYOUT = 'LOSSY';
  const result = ir.composeInterchangeFidelity([
    { reportId: 'source', values: source },
    { reportId: 'target', values: target },
  ]);
  assert.equal(result.level, 'LOSSY');
  assert.equal(result.dimensions.COMMENTS, 'LOSSY');
  assert.equal(result.dimensions.LAYOUT, 'LOSSY');
  assert.equal(result.dimensions.CONTENT, 'EXACT');
  assert.equal(Object.keys(result.dimensions).length, ir.INTERCHANGE_FIDELITY_DIMENSIONS.length);
  assert.equal(result.evaluatedCellCount, 16);
  assert.deepEqual(result.witnesses, [
    { dimension: 'COMMENTS', level: 'LOSSY', reportId: 'target' },
    { dimension: 'LAYOUT', level: 'LOSSY', reportId: 'target' },
  ]);
});

test('WP700 fidelity meet is deterministic and rejects incomplete or invented claims', async () => {
  const ir = await load();
  const exact = allValues(ir.INTERCHANGE_FIDELITY_DIMENSIONS, 'EXACT');
  const bounded = allValues(ir.INTERCHANGE_FIDELITY_DIMENSIONS, 'BOUNDED');
  const left = ir.composeInterchangeFidelity([
    { reportId: 'exact', values: exact },
    { reportId: 'bounded', values: bounded },
  ]);
  const right = ir.composeInterchangeFidelity([
    { reportId: 'bounded', values: bounded },
    { reportId: 'exact', values: exact },
  ]);
  assert.deepEqual(left, right);
  const partial = { ...exact };
  delete partial.REVISIONS;
  assert.equal(ir.composeInterchangeFidelity([{ reportId: 'partial', values: partial }]).error.code, 'E_INTERCHANGE_FIDELITY_DENOMINATOR');
  const invented = { ...exact, CONTENT: 'PERFECT' };
  assert.equal(ir.composeInterchangeFidelity([{ reportId: 'invented', values: invented }]).error.code, 'E_INTERCHANGE_FIDELITY_LEVEL');
});

test('WP700 hostile large corpus remains deterministic and within the declared byte bound', async () => {
  const ir = await load();
  const payload = {
    blocks: Array.from({ length: 2_000 }, (_, index) => ({
      id: `block-${String(index).padStart(4, '0')}`,
      ordinal: index,
      text: `Sentence ${index}: Привет — Καλημέρα — こんにちは.`,
    })),
  };
  const input = {
    familyId: 'DOCUMENT',
    identity: { entityId: 'large', generation: 1, projectId: 'corpus', sourceRevision: 'r1' },
    payload,
  };
  const first = ir.createInterchangeIrEnvelope(input);
  const second = ir.createInterchangeIrEnvelope(input);
  assert.equal(first.ok, true);
  assert.equal(first.byteLength < ir.INTERCHANGE_IR_LIMITS.maxBytes, true);
  assert.equal(first.payloadNodeCount <= ir.INTERCHANGE_IR_LIMITS.maxNodes, true);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(ir.parseInterchangeIrEnvelope(first.bytes).ok, true);
});

test('WP700 core module has no IO, mutation, renderer, provider or network authority', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'core', 'interchange-ir-v1.mjs'), 'utf8');
  for (const forbidden of [
    "from 'node:fs'",
    "from 'node:net'",
    "from 'node:http'",
    "from 'node:https'",
    "from 'node:child_process'",
    'fetch(',
    'XMLHttpRequest',
    'ipcRenderer',
    'ipcMain',
    'writeFile',
    'renameSync',
    'projectStore',
    'localStorage',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(source.includes("from 'node:crypto'"), true);
});
