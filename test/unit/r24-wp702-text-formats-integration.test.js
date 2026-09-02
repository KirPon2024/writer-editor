'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { identity, legitimateUnicode, markdown, parseInput } = require('../fixtures/r24-wp702-text-formats-fixtures.js');

const loadText = () => import('../../src/core/text-formats-v1.mjs');
const loadIr = () => import('../../src/core/interchange-ir-v1.mjs');

test('WP702 canonical text projection replays through WP700 immutable envelope bytes', async () => {
  const textFormats = await loadText();
  const ir = await loadIr();
  for (const [profileId, source] of [['TXT_UTF8_NFC_V1', legitimateUnicode], ['MARKDOWN_BOUNDED_V1', markdown]]) {
    const parsed = textFormats.parseTextFormat(parseInput(profileId, source));
    assert.equal(parsed.ok, true, profileId);
    const replay = ir.parseInterchangeIrEnvelope(parsed.bytes);
    assert.equal(replay.ok, true, profileId);
    assert.deepEqual(replay.value, parsed.value, profileId);
    assert.equal(replay.value.body.payload.formatSchemaVersion, textFormats.TEXT_FORMATS_SCHEMA_VERSION);
  }
});

test('WP702 physical local-file bytes roundtrip without granting production file authority', async () => {
  const textFormats = await loadText();
  const source = Buffer.from(markdown, 'utf8');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp702-'));
  const file = path.join(directory, 'bounded.md');
  try {
    fs.writeFileSync(file, source, { flag: 'wx' });
    const physical = fs.readFileSync(file);
    assert.deepEqual(physical, source);
    const parsed = textFormats.parseTextFormat({ bytes: physical, identity: identity(), profileId: 'MARKDOWN_BOUNDED_V1' });
    const output = textFormats.serializeTextFormat({ envelope: parsed.value, expectedIdentity: identity(), profileId: 'MARKDOWN_BOUNDED_V1' });
    assert.equal(output.ok, true);
    assert.deepEqual(output.bytes, source);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  const sourceText = fs.readFileSync(path.resolve(__dirname, '../../src/core/text-formats-v1.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'fetch(', 'http.request', 'https.request', 'child_process', 'electron', 'projectStore', 'commandKernel']) {
    assert.equal(sourceText.includes(forbidden), false, forbidden);
  }
});

test('WP702 rejects container bytes before publishing any semantic projection', async () => {
  const textFormats = await loadText();
  const containerCorpus = [
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
    Buffer.from([0x1f, 0x8b, 0x08]),
  ];
  for (const bytes of containerCorpus) {
    const result = textFormats.parseTextFormat({ bytes, identity: identity(), profileId: 'TXT_UTF8_NFC_V1' });
    assert.equal(result.error.code, 'E_TF_CONTAINER_OR_BINARY');
    assert.equal(Object.hasOwn(result, 'value'), false);
  }
});

test('WP702 two-profile roundtrip composition remains complete and deterministic', async () => {
  const textFormats = await loadText();
  const compositionA = textFormats.evaluateTextFormatComposition(['TXT_UTF8_NFC_V1', 'MARKDOWN_BOUNDED_V1']);
  const compositionB = textFormats.evaluateTextFormatComposition(['MARKDOWN_BOUNDED_V1', 'TXT_UTF8_NFC_V1']);
  assert.equal(compositionA.ok, true);
  assert.equal(compositionB.ok, true);
  assert.deepEqual(compositionA, compositionB);
  assert.equal(compositionA.capabilities.level, 'DENIED');
  assert.equal(compositionA.fidelity.level, 'NONE');
  assert.equal(compositionA.profileIds.length, 2);
});

test('WP702 has exactly the bounded query/projection export surface', async () => {
  const textFormats = await loadText();
  assert.deepEqual(Object.keys(textFormats).sort(), [
    'TEXT_FORMATS_SCHEMA_VERSION',
    'TEXT_FORMAT_LIMITS',
    'TEXT_FORMAT_PROFILE_IDS',
    'evaluateTextFormatComposition',
    'parseTextFormat',
    'serializeTextFormat',
  ]);
});
