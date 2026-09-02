'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const MODULE = '../../src/core/interchange-ir-v1.mjs';
const load = () => import(MODULE);

function identity(overrides = {}) {
  return { entityId: 'scene', generation: 1, projectId: 'project', sourceRevision: 'r1', ...overrides };
}

function input(overrides = {}) {
  return { familyId: 'DOCUMENT', identity: identity(), payload: { blocks: [{ id: 'b1', text: 'hello' }] }, ...overrides };
}

function values(keys, level) {
  return Object.fromEntries(keys.map((key) => [key, level]));
}

test('WP700 kills envelope identity, version, digest and unknown-field mutants', async () => {
  const ir = await load();
  const made = ir.createInterchangeIrEnvelope(input());
  assert.equal(made.ok, true);
  const mutants = [];

  const missingBody = structuredClone(made.value);
  delete missingBody.body;
  mutants.push(['missing-body', missingBody]);
  const extraEnvelopeField = structuredClone(made.value);
  extraEnvelopeField.future = true;
  mutants.push(['extra-envelope-field', extraEnvelopeField]);
  const digestShape = structuredClone(made.value);
  digestShape.bodySha256 = '0'.repeat(63);
  mutants.push(['digest-shape', digestShape]);
  const digestMismatch = structuredClone(made.value);
  digestMismatch.bodySha256 = '0'.repeat(64);
  mutants.push(['digest-mismatch', digestMismatch]);
  const familyMismatch = structuredClone(made.value);
  familyMismatch.body.familyId = 'PROJECT';
  mutants.push(['family-version-mismatch', familyMismatch]);
  const unknownBody = structuredClone(made.value);
  unknownBody.body.future = true;
  mutants.push(['unknown-body-field', unknownBody]);
  const negativeGeneration = structuredClone(made.value);
  negativeGeneration.body.identity.generation = -1;
  mutants.push(['negative-generation', negativeGeneration]);
  const controlIdentity = structuredClone(made.value);
  controlIdentity.body.identity.entityId = 'bad\nidentity';
  mutants.push(['control-identity', controlIdentity]);

  for (const [name, mutant] of mutants) {
    assert.equal(ir.validateInterchangeIrEnvelope(mutant).ok, false, name);
  }
  assert.equal(mutants.length, 8);
});

test('WP700 kills hostile physical-byte mutants', async () => {
  const ir = await load();
  const made = ir.createInterchangeIrEnvelope(input());
  const withoutLf = made.bytes.subarray(0, made.bytes.length - 1);
  const crlf = Buffer.concat([withoutLf, Buffer.from('\r\n')]);
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), made.bytes]);
  const invalidUtf8 = Buffer.from([0xc3, 0x28]);
  const trailing = Buffer.concat([made.bytes, Buffer.from(' ')]);
  const duplicate = Buffer.from('{"body":{},"body":{},"bodySha256":"0000000000000000000000000000000000000000000000000000000000000000","schemaVersion":"yalken.interchange.ir-envelope.v1"}\n');
  for (const [name, mutant] of [
    ['missing-lf', withoutLf],
    ['crlf', crlf],
    ['bom', bom],
    ['invalid-utf8', invalidUtf8],
    ['trailing-space', trailing],
    ['duplicate-key', duplicate],
  ]) assert.equal(ir.parseInterchangeIrEnvelope(mutant).ok, false, name);
});

test('WP700 kills exotic-object, cycle, hidden-property and node-budget mutants', async () => {
  const ir = await load();
  const nullPrototype = Object.create(null);
  nullPrototype.safe = true;
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: nullPrototype })).ok, false, 'null-prototype');
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: { date: new Date(0) } })).ok, false, 'date-object');

  const cycle = {};
  cycle.self = cycle;
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: cycle })).error.code, 'E_INTERCHANGE_CYCLE');

  const hidden = { visible: true };
  Object.defineProperty(hidden, 'hidden', { value: true, enumerable: false });
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: hidden })).error.code, 'E_INTERCHANGE_ACCESSOR_OR_HIDDEN_KEY');

  const extended = ['safe'];
  extended.extra = true;
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: extended })).error.code, 'E_INTERCHANGE_SPARSE_OR_EXTENDED_ARRAY');

  const tooMany = Array.from({ length: ir.INTERCHANGE_IR_LIMITS.maxNodes }, () => null);
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: tooMany })).error.code, 'E_INTERCHANGE_NODE_BUDGET');
});

test('WP700 kills capability optimism, missing-cell and duplicate-profile mutants', async () => {
  const ir = await load();
  const full = values(ir.INTERCHANGE_CAPABILITY_OPERATIONS, 'FULL');
  const denied = { ...full, EXPORT_LOCAL: 'DENIED' };
  assert.equal(ir.composeInterchangeCapabilities([
    { profileId: 'source', values: full },
    { profileId: 'target', values: denied },
  ], ['EXPORT_LOCAL']).level, 'DENIED', 'optimistic-maximum');

  const missing = { ...full };
  delete missing.PROVIDER_SYNC;
  assert.equal(ir.composeInterchangeCapabilities([{ profileId: 'missing', values: missing }]).ok, false, 'missing-cell');
  assert.equal(ir.composeInterchangeCapabilities([
    { profileId: 'same', values: full },
    { profileId: 'same', values: full },
  ]).ok, false, 'duplicate-profile');
  assert.equal(ir.composeInterchangeCapabilities([{ profileId: 'source', values: full }], []).ok, false, 'zero-required-operations');
  assert.equal(ir.composeInterchangeCapabilities([{ profileId: 'source', values: full }], ['PARSE', 'FUTURE']).ok, false, 'unknown-required-operation');
});

test('WP700 kills fidelity optimism, partial denominator and duplicate-report mutants', async () => {
  const ir = await load();
  const exact = values(ir.INTERCHANGE_FIDELITY_DIMENSIONS, 'EXACT');
  const lossy = { ...exact, CONTENT: 'LOSSY' };
  assert.equal(ir.composeInterchangeFidelity([
    { reportId: 'source', values: exact },
    { reportId: 'target', values: lossy },
  ]).level, 'LOSSY', 'optimistic-maximum');

  const missing = { ...exact };
  delete missing.UNKNOWN_FIELDS;
  assert.equal(ir.composeInterchangeFidelity([{ reportId: 'missing', values: missing }]).ok, false, 'partial-denominator');
  assert.equal(ir.composeInterchangeFidelity([
    { reportId: 'same', values: exact },
    { reportId: 'same', values: exact },
  ]).ok, false, 'duplicate-report');
  assert.equal(ir.composeInterchangeFidelity([]).ok, false, 'zero-reports');
});
