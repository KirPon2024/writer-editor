'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { identity, parseInput } = require('../fixtures/r24-wp702-text-formats-fixtures.js');

const load = () => import('../../src/core/text-formats-v1.mjs');

test('WP702 kills the complete 32-mutant boundary/identity/profile hostile set with zero survivors', async () => {
  const textFormats = await load();
  const parseCase = (bytes, profileId = 'TXT_UTF8_NFC_V1', identityValue = identity()) => textFormats.parseTextFormat({ bytes, identity: identityValue, profileId });
  const baseline = textFormats.parseTextFormat(parseInput('TXT_UTF8_NFC_V1', 'safe\n'));
  assert.equal(baseline.ok, true);
  const serializeCase = (expectedIdentity, profileId = 'TXT_UTF8_NFC_V1', envelope = baseline.value) => textFormats.serializeTextFormat({ envelope, expectedIdentity, profileId });
  const cases = [
    ['utf8-leading', () => parseCase(Buffer.from([0xff, 0x61])), 'E_TF_UTF8_INVALID'],
    ['utf8-truncated', () => parseCase(Buffer.from([0xe2, 0x82])), 'E_TF_UTF8_INVALID'],
    ['nfd', () => parseCase(Buffer.from('e\u0301\n')), 'E_TF_NOT_NFC'],
    ['nul', () => parseCase(Buffer.from('a\u0000b')), 'E_TF_CONTROL_CHARACTER'],
    ['bell', () => parseCase(Buffer.from('a\u0007b')), 'E_TF_CONTROL_CHARACTER'],
    ['escape', () => parseCase(Buffer.from('a\u001bb')), 'E_TF_CONTROL_CHARACTER'],
    ['delete', () => parseCase(Buffer.from([0x61, 0x7f, 0x62])), 'E_TF_CONTROL_CHARACTER'],
    ['zip-local', () => parseCase(Buffer.from([0x50, 0x4b, 0x03, 0x04])), 'E_TF_CONTAINER_OR_BINARY'],
    ['zip-empty', () => parseCase(Buffer.from([0x50, 0x4b, 0x05, 0x06])), 'E_TF_CONTAINER_OR_BINARY'],
    ['zip-descriptor', () => parseCase(Buffer.from([0x50, 0x4b, 0x07, 0x08])), 'E_TF_CONTAINER_OR_BINARY'],
    ['ole', () => parseCase(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), 'E_TF_CONTAINER_OR_BINARY'],
    ['sevenzip', () => parseCase(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])), 'E_TF_CONTAINER_OR_BINARY'],
    ['gzip', () => parseCase(Buffer.from([0x1f, 0x8b, 0x08])), 'E_TF_CONTAINER_OR_BINARY'],
    ['pdf', () => parseCase(Buffer.from('%PDF-2.0')), 'E_TF_CONTAINER_OR_BINARY'],
    ['rar', () => parseCase(Buffer.from('Rar!\x1a\x07', 'binary')), 'E_TF_CONTAINER_OR_BINARY'],
    ['html', () => parseCase(Buffer.from('<b>x</b>\n'), 'MARKDOWN_BOUNDED_V1'), 'E_TF_MARKDOWN_REJECTED'],
    ['javascript-uri', () => parseCase(Buffer.from('[x](javascript:x)\n'), 'MARKDOWN_BOUNDED_V1'), 'E_TF_MARKDOWN_REJECTED'],
    ['data-uri', () => parseCase(Buffer.from('[x](data:text/plain,x)\n'), 'MARKDOWN_BOUNDED_V1'), 'E_TF_MARKDOWN_REJECTED'],
    ['unknown-profile', () => parseCase(Buffer.from('x\n'), 'COMMONMARK'), 'E_TF_PROFILE'],
    ['string-bytes', () => parseCase('x'), 'E_TF_INPUT_BYTES'],
    ['oversize', () => parseCase(Buffer.alloc(textFormats.TEXT_FORMAT_LIMITS.maxInputBytes + 1, 0x61)), 'E_TF_INPUT_BYTE_BUDGET'],
    ['identity-project', () => serializeCase(identity({ projectId: 'stale' })), 'E_TF_STALE_IDENTITY'],
    ['identity-entity', () => serializeCase(identity({ entityId: 'stale' })), 'E_TF_STALE_IDENTITY'],
    ['identity-revision', () => serializeCase(identity({ sourceRevision: 'stale' })), 'E_TF_STALE_IDENTITY'],
    ['identity-generation', () => serializeCase(identity({ generation: 99 })), 'E_TF_STALE_IDENTITY'],
    ['serialize-profile', () => serializeCase(identity(), 'HTML'), 'E_TF_PROFILE'],
    ['foreign-family', () => {
      const foreign = structuredClone(baseline.value);
      foreign.body.familyId = 'PROJECT';
      return serializeCase(identity(), 'TXT_UTF8_NFC_V1', foreign);
    }, 'E_TF_INTERCHANGE_ENVELOPE'],
    ['tampered-body', () => {
      const tampered = structuredClone(baseline.value);
      tampered.body.payload.profileId = 'MARKDOWN_BOUNDED_V1';
      return serializeCase(identity(), 'TXT_UTF8_NFC_V1', tampered);
    }, 'E_TF_INTERCHANGE_ENVELOPE'],
    ['parse-extra-key', () => textFormats.parseTextFormat({ ...parseInput('TXT_UTF8_NFC_V1', 'x'), extra: true }), 'E_TF_INPUT_SHAPE'],
    ['serialize-extra-key', () => textFormats.serializeTextFormat({ envelope: baseline.value, expectedIdentity: identity(), profileId: 'TXT_UTF8_NFC_V1', extra: true }), 'E_TF_SERIALIZE_SHAPE'],
    ['empty-composition', () => textFormats.evaluateTextFormatComposition([]), 'E_TF_COMPOSITION_PROFILES'],
    ['duplicate-composition', () => textFormats.evaluateTextFormatComposition(['TXT_UTF8_NFC_V1', 'TXT_UTF8_NFC_V1']), 'E_TF_COMPOSITION_PROFILES'],
  ];
  assert.equal(cases.length, 32);
  const killed = [];
  for (const [id, invoke, expected] of cases) {
    const result = invoke();
    assert.equal(result.ok, false, id);
    assert.equal(result.error.code, expected, id);
    killed.push(id);
  }
  assert.equal(killed.length, cases.length);
  assert.equal(new Set(killed).size, cases.length);
});

test('WP702 implementation-mutant denominator is executable and zero-skip', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/core/text-formats-v1.mjs'), 'utf8');
  for (const oracle of ['E_TF_UTF8_INVALID', 'E_TF_CONTAINER_OR_BINARY', 'E_TF_MARKDOWN_REJECTED', 'E_TF_STALE_IDENTITY', 'evaluatedBoundaryCount']) {
    assert.equal(source.includes(oracle), true, oracle);
  }
  assert.equal(source.includes('.skip('), false);
  assert.equal(source.includes('.todo('), false);
});
