'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE = '../../src/core/interchange-ir-v1.mjs';
const load = () => import(MODULE);

function identity(overrides = {}) {
  return {
    entityId: 'scene-001',
    generation: 7,
    projectId: 'project-001',
    sourceRevision: 'revision-019',
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    familyId: 'DOCUMENT',
    identity: identity(),
    payload: {
      blocks: [
        { id: 'block-1', kind: 'paragraph', text: 'Hello, мир.' },
        { id: 'block-2', kind: 'paragraph', text: 'Line one\nLine two' },
      ],
      metadata: { language: 'en', ordinal: 1 },
    },
    ...overrides,
  };
}

test('WP700 exposes exactly four independently versioned IR families', async () => {
  const ir = await load();
  assert.deepEqual(ir.INTERCHANGE_IR_FAMILIES, {
    DOCUMENT: 'yalken.interchange.document-ir.v1',
    EVIDENCE: 'yalken.interchange.evidence-ir.v1',
    PROJECT: 'yalken.interchange.project-ir.v1',
    REVIEW: 'yalken.interchange.review-ir.v1',
  });
  assert.equal(Object.isFrozen(ir.INTERCHANGE_IR_FAMILIES), true);
  for (const familyId of Object.keys(ir.INTERCHANGE_IR_FAMILIES)) {
    const made = ir.createInterchangeIrEnvelope(input({ familyId }));
    assert.equal(made.ok, true, familyId);
    assert.equal(made.value.body.familySchemaVersion, ir.INTERCHANGE_IR_FAMILIES[familyId]);
  }
  assert.equal(ir.createInterchangeIrEnvelope(input({ familyId: 'UNKNOWN' })).error.code, 'E_INTERCHANGE_FAMILY_ID');
});

test('WP700 binds family, immutable identity, payload and body digest in canonical bytes', async () => {
  const ir = await load();
  const first = ir.createInterchangeIrEnvelope(input());
  const second = ir.createInterchangeIrEnvelope(input({
    payload: {
      metadata: { ordinal: 1, language: 'en' },
      blocks: input().payload.blocks,
    },
  }));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.sha256, crypto.createHash('sha256').update(first.bytes).digest('hex'));
  assert.equal(first.value.bodySha256, crypto.createHash('sha256').update(Buffer.from(`${JSON.stringify({
    familyId: first.value.body.familyId,
    familySchemaVersion: first.value.body.familySchemaVersion,
    identity: first.value.body.identity,
    payload: first.value.body.payload,
  })}\n`)).digest('hex'));
  assert.equal(first.bytes.at(-1), 0x0a);
  assert.equal(Object.isFrozen(first.value), true);
  assert.equal(Object.isFrozen(first.value.body.payload.blocks[0]), true);
});

test('WP700 physical UTF-8 bytes survive exact local-file round trip', async () => {
  const ir = await load();
  const made = ir.createInterchangeIrEnvelope(input());
  assert.equal(made.ok, true);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp700-'));
  const file = path.join(directory, 'document-ir.json');
  try {
    fs.writeFileSync(file, made.bytes, { flag: 'wx' });
    const physical = fs.readFileSync(file);
    assert.deepEqual(physical, made.bytes);
    const parsed = ir.parseInterchangeIrEnvelope(physical);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.sha256, made.sha256);
    assert.deepEqual(parsed.value, made.value);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('WP700 rejects envelope tamper, unknown schema and noncanonical physical bytes', async () => {
  const ir = await load();
  const made = ir.createInterchangeIrEnvelope(input());
  const tampered = structuredClone(made.value);
  tampered.body.payload.blocks[0].text = 'Changed';
  assert.equal(ir.validateInterchangeIrEnvelope(tampered).error.code, 'E_INTERCHANGE_BODY_DIGEST_MISMATCH');

  const unknown = structuredClone(made.value);
  unknown.schemaVersion = 'yalken.interchange.ir-envelope.v2';
  assert.equal(ir.validateInterchangeIrEnvelope(unknown).error.code, 'E_INTERCHANGE_ENVELOPE_VERSION');

  const pretty = `${JSON.stringify(made.value, null, 2)}\n`;
  assert.equal(ir.parseInterchangeIrEnvelope(pretty).error.code, 'E_INTERCHANGE_NON_CANONICAL_BYTES');
  assert.equal(ir.parseInterchangeIrEnvelope(Buffer.from('{"x":1,"x":2}\n')).ok, false);
});

test('WP700 fails closed on incomplete identity and stale family-version substitution', async () => {
  const ir = await load();
  const partial = input();
  delete partial.identity.sourceRevision;
  assert.equal(ir.createInterchangeIrEnvelope(partial).error.code, 'E_INTERCHANGE_IDENTITY_SHAPE');

  const made = ir.createInterchangeIrEnvelope(input());
  const stale = structuredClone(made.value);
  stale.body.familySchemaVersion = 'yalken.interchange.document-ir.v0';
  assert.equal(ir.validateInterchangeIrEnvelope(stale).error.code, 'E_INTERCHANGE_FAMILY_VERSION');
});

test('WP700 rejects partial accessors, symbols, sparse arrays and unsafe keys without reading accessors', async () => {
  const ir = await load();
  let getterReads = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'secret', { enumerable: true, get() { getterReads += 1; return 'no'; } });
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: accessor })).error.code, 'E_INTERCHANGE_ACCESSOR_OR_HIDDEN_KEY');
  assert.equal(getterReads, 0);

  const symbol = { safe: true };
  symbol[Symbol('hidden')] = true;
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: symbol })).error.code, 'E_INTERCHANGE_SYMBOL_KEY');

  const sparse = [];
  sparse[1] = 'value';
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: sparse })).error.code, 'E_INTERCHANGE_SPARSE_OR_EXTENDED_ARRAY');

  const unsafe = JSON.parse('{"nested":{"__proto__":{"polluted":true}}}');
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: unsafe })).error.code, 'E_INTERCHANGE_UNSAFE_KEY');
  assert.equal({}.polluted, undefined);
});

test('WP700 enforces finite canonical JSON, NFC and resource limits', async () => {
  const ir = await load();
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: { value: Number.NaN } })).error.code, 'E_INTERCHANGE_NUMBER_INVALID');
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: { value: -0 } })).error.code, 'E_INTERCHANGE_NUMBER_INVALID');
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: { text: 'e\u0301' } })).error.code, 'E_INTERCHANGE_STRING_NOT_NFC');
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: { text: 'x'.repeat(ir.INTERCHANGE_IR_LIMITS.maxStringBytes + 1) } })).error.code, 'E_INTERCHANGE_STRING_BUDGET');

  let deep = { leaf: true };
  for (let index = 0; index < ir.INTERCHANGE_IR_LIMITS.maxDepth + 1; index += 1) deep = { child: deep };
  assert.equal(ir.createInterchangeIrEnvelope(input({ payload: deep })).error.code, 'E_INTERCHANGE_DEPTH_BUDGET');
});
