'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { identity, legitimateUnicode, markdown, parseInput } = require('../fixtures/r24-wp702-text-formats-fixtures.js');

const load = () => import('../../src/core/text-formats-v1.mjs');

test('WP702 publishes two frozen bounded text profiles and complete capability/fidelity denominators', async () => {
  const textFormats = await load();
  assert.deepEqual(textFormats.TEXT_FORMAT_PROFILE_IDS, ['MARKDOWN_BOUNDED_V1', 'TXT_UTF8_NFC_V1']);
  assert.equal(Object.isFrozen(textFormats.TEXT_FORMAT_PROFILE_IDS), true);
  assert.equal(Object.isFrozen(textFormats.TEXT_FORMAT_LIMITS), true);
  assert.equal(textFormats.TEXT_FORMATS_SCHEMA_VERSION, 'yalken.text-formats.v1');
  const composition = textFormats.evaluateTextFormatComposition();
  assert.equal(composition.ok, true);
  assert.equal(composition.capabilityDenominator, 16);
  assert.equal(composition.capabilities.evaluatedCellCount, 16);
  assert.equal(composition.fidelityDenominator, 16);
  assert.equal(composition.fidelity.evaluatedCellCount, 16);
});

test('WP702 TXT parses legitimate NFC Unicode into immutable WP700 DOCUMENT IR', async () => {
  const textFormats = await load();
  const result = textFormats.parseTextFormat(parseInput('TXT_UTF8_NFC_V1', legitimateUnicode));
  assert.equal(result.ok, true);
  assert.equal(result.value.body.familyId, 'DOCUMENT');
  assert.equal(result.value.body.payload.profileId, 'TXT_UTF8_NFC_V1');
  assert.equal(result.value.body.payload.scene.blocks[0].text, legitimateUnicode.trimEnd());
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.body.payload.scene.blocks[0]), true);
  assert.equal(result.sha256, crypto.createHash('sha256').update(result.bytes).digest('hex'));
  assert.equal(result.bytes.at(-1), 0x0a);
});

test('WP702 canonical TXT bytes roundtrip exactly and preserve identity', async () => {
  const textFormats = await load();
  const input = parseInput('TXT_UTF8_NFC_V1', 'one\ntwo\n');
  const parsed = textFormats.parseTextFormat(input);
  const output = textFormats.serializeTextFormat({ envelope: parsed.value, expectedIdentity: identity(), profileId: 'TXT_UTF8_NFC_V1' });
  assert.equal(output.ok, true);
  assert.deepEqual(output.bytes, input.bytes);
  assert.equal(output.lossLedger.itemCount, 0);
});

test('WP702 records BOM, CRLF and terminal-LF normalization without raw content in loss evidence', async () => {
  const textFormats = await load();
  const bytes = Buffer.from('\ufeffsecret-value\r\nsecond-line', 'utf8');
  const result = textFormats.parseTextFormat({ bytes, identity: identity(), profileId: 'TXT_UTF8_NFC_V1' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.lossLedger.items.map((item) => item.code), ['NEWLINE_TO_LF', 'TERMINAL_LF_ADDED', 'UTF8_BOM_REMOVED']);
  assert.equal(result.lossLedger.evaluatedBoundaryCount, 6);
  assert.equal(result.lossLedger.itemCount, 3);
  assert.equal(JSON.stringify(result.lossLedger).includes('secret-value'), false);
});

test('WP702 bounded Markdown parses and deterministically serializes supported structure', async () => {
  const textFormats = await load();
  const parsed = textFormats.parseTextFormat(parseInput('MARKDOWN_BOUNDED_V1', markdown));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.body.payload.scene.blocks.map((block) => block.type), ['heading', 'paragraph', 'list']);
  const output = textFormats.serializeTextFormat({ envelope: parsed.value, expectedIdentity: identity(), profileId: 'MARKDOWN_BOUNDED_V1' });
  assert.equal(output.ok, true);
  const replay = textFormats.parseTextFormat({ bytes: output.bytes, identity: identity(), profileId: 'MARKDOWN_BOUNDED_V1' });
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.value.body.payload.scene.blocks, parsed.value.body.payload.scene.blocks);
});

test('WP702 rejects raw HTML, javascript/data URIs and Markdown resource exhaustion', async () => {
  const textFormats = await load();
  for (const [value, detail] of [
    ['<script>alert(1)</script>\n', 'E_MD_SECURITY_RAW_HTML'],
    ['[x](javascript:alert(1))\n', 'E_MD_SECURITY_URI_SCHEME_DENIED'],
    ['[x](data:text/plain,secret)\n', 'E_MD_SECURITY_URI_SCHEME_DENIED'],
  ]) {
    const result = textFormats.parseTextFormat(parseInput('MARKDOWN_BOUNDED_V1', value));
    assert.equal(result.error.code, 'E_TF_MARKDOWN_REJECTED');
    assert.equal(result.error.detail, detail);
  }
  const oversized = Buffer.alloc(textFormats.TEXT_FORMAT_LIMITS.maxInputBytes + 1, 0x61);
  assert.equal(textFormats.parseTextFormat({ bytes: oversized, identity: identity(), profileId: 'MARKDOWN_BOUNDED_V1' }).error.code, 'E_TF_INPUT_BYTE_BUDGET');
});

test('WP702 rejects invalid UTF-8, non-NFC, forbidden controls and known binary containers before projection', async () => {
  const textFormats = await load();
  const cases = [
    [Buffer.from([0xff, 0xfe, 0x61]), 'E_TF_UTF8_INVALID'],
    [Buffer.from('cafe\u0301\n'), 'E_TF_NOT_NFC'],
    [Buffer.from('a\u0000b\n'), 'E_TF_CONTROL_CHARACTER'],
    [Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), 'E_TF_CONTAINER_OR_BINARY'],
    [Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'E_TF_CONTAINER_OR_BINARY'],
    [Buffer.from('%PDF-1.7'), 'E_TF_CONTAINER_OR_BINARY'],
  ];
  for (const [bytes, code] of cases) {
    const result = textFormats.parseTextFormat({ bytes, identity: identity(), profileId: 'TXT_UTF8_NFC_V1' });
    assert.equal(result.ok, false, code);
    assert.equal(result.error.code, code);
    assert.equal(Object.hasOwn(result, 'value'), false);
  }
});

test('WP702 rejects malformed caller shapes without reading accessors', async () => {
  const textFormats = await load();
  let reads = 0;
  const input = {};
  Object.defineProperty(input, 'bytes', { enumerable: true, get() { reads += 1; return Buffer.from('x\n'); } });
  input.identity = identity();
  input.profileId = 'TXT_UTF8_NFC_V1';
  assert.equal(textFormats.parseTextFormat(input).error.code, 'E_TF_INPUT_SHAPE');
  assert.equal(reads, 0);
  assert.equal(textFormats.parseTextFormat({ bytes: 'x', identity: identity(), profileId: 'TXT_UTF8_NFC_V1' }).error.code, 'E_TF_INPUT_BYTES');
  assert.equal(textFormats.parseTextFormat({ bytes: Buffer.from('x'), identity: identity(), profileId: 'HTML' }).error.code, 'E_TF_PROFILE');
});

test('WP702 revalidates complete identity and envelope integrity before every serialization', async () => {
  const textFormats = await load();
  const parsed = textFormats.parseTextFormat(parseInput('TXT_UTF8_NFC_V1', 'content\n'));
  for (const [field, value] of [['projectId', 'other'], ['entityId', 'other'], ['sourceRevision', 'other'], ['generation', 13]]) {
    const stale = textFormats.serializeTextFormat({ envelope: parsed.value, expectedIdentity: identity({ [field]: value }), profileId: 'TXT_UTF8_NFC_V1' });
    assert.equal(stale.error.code, 'E_TF_STALE_IDENTITY', field);
  }
  const tampered = structuredClone(parsed.value);
  tampered.body.payload.scene.blocks[0].text = 'changed';
  assert.equal(textFormats.serializeTextFormat({ envelope: tampered, expectedIdentity: identity(), profileId: 'TXT_UTF8_NFC_V1' }).error.code, 'E_TF_INTERCHANGE_ENVELOPE');
});

test('WP702 cross-profile conversion is explicit and reports bounded fidelity loss', async () => {
  const textFormats = await load();
  const parsed = textFormats.parseTextFormat(parseInput('MARKDOWN_BOUNDED_V1', '# Heading\n\nParagraph.\n'));
  const output = textFormats.serializeTextFormat({ envelope: parsed.value, expectedIdentity: identity(), profileId: 'TXT_UTF8_NFC_V1' });
  assert.equal(output.ok, true);
  assert.equal(output.bytes.toString('utf8'), 'Heading\n\nParagraph.\n');
  assert.equal(output.lossLedger.items.some((item) => item.code === 'TEXTV1_BLOCK_FORMAT_DOWNGRADED'), true);
});
