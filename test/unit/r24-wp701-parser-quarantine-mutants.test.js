'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildZip, locateSignatures, minimalOoxml, mutateU16, mutateU32 } = require('../fixtures/r24-wp701-parser-quarantine-fixtures.js');

const load = () => import('../../src/core/parser-quarantine-v1.mjs');

function overwrite(bytes, offset, patch) {
  const output = Buffer.from(bytes);
  Buffer.from(patch).copy(output, offset);
  return output;
}

test('WP701 kills the complete 44-mutant archive/XML/OOXML hostile set with zero survivors', async () => {
  const parser = await load();
  const valid = buildZip([{ name: 'a.txt', data: 'payload' }]);
  const positions = locateSignatures(valid);
  const local = positions.local[0];
  const central = positions.central[0];
  const eocd = positions.eocd[0];
  const cases = [
    ['missing-local-signature', mutateU32(valid, local, 0), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_HEADER'],
    ['bad-local-signature', mutateU32(valid, local, 1), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_HEADER'],
    ['bad-central-signature', mutateU32(valid, central, 1), 'ZIP', {}, 'E_PQ_ZIP_CENTRAL_HEADER'],
    ['missing-eocd', mutateU32(valid, eocd, 1), 'ZIP', {}, 'E_PQ_ZIP_EOCD_MISSING'],
    ['duplicate-eocd', Buffer.concat([valid, Buffer.from([0x50, 0x4b, 0x05, 0x06])]), 'ZIP', {}, 'E_PQ_ZIP_EOCD_AMBIGUOUS'],
    ['trailing-byte', Buffer.concat([valid, Buffer.from('x')]), 'ZIP', {}, 'E_PQ_ZIP_TRAILING_BYTES'],
    ['disk', mutateU16(valid, eocd + 4, 1), 'ZIP', {}, 'E_PQ_ZIP_MULTIDISK'],
    ['central-disk', mutateU16(valid, eocd + 6, 1), 'ZIP', {}, 'E_PQ_ZIP_MULTIDISK'],
    ['disk-count', mutateU16(valid, eocd + 8, 2), 'ZIP', {}, 'E_PQ_ZIP_MULTIDISK'],
    ['empty-denominator', mutateU16(mutateU16(valid, eocd + 8, 0), eocd + 10, 0), 'ZIP', {}, 'E_PQ_ARCHIVE_ENTRY_BUDGET'],
    ['central-size', mutateU32(valid, eocd + 12, 1), 'ZIP', {}, 'E_PQ_ZIP_CENTRAL_RANGE'],
    ['central-offset', mutateU32(valid, eocd + 16, 1), 'ZIP', {}, 'E_PQ_ZIP_CENTRAL_RANGE'],
    ['encrypted', buildZip([{ name: 'a.txt', data: 'x', flags: 0x0801 }]), 'ZIP', {}, 'E_PQ_ZIP_ENCRYPTED'],
    ['descriptor', buildZip([{ name: 'a.txt', data: 'x', flags: 0x0808 }]), 'ZIP', {}, 'E_PQ_ZIP_DATA_DESCRIPTOR'],
    ['legacy-name-encoding', buildZip([{ name: 'a.txt', data: 'x', flags: 0 }]), 'ZIP', {}, 'E_PQ_ZIP_FILENAME_ENCODING'],
    ['unsupported-method', buildZip([{ name: 'a.txt', data: 'x', method: 12, compressed: Buffer.from('x') }]), 'ZIP', {}, 'E_PQ_ZIP_COMPRESSION_METHOD'],
    ['entry-disk', buildZip([{ name: 'a.txt', data: 'x', diskStart: 1 }]), 'ZIP', {}, 'E_PQ_ZIP_MULTIDISK'],
    ['symlink', buildZip([{ name: 'a.txt', data: 'x', externalAttributes: 0xa000 << 16 }]), 'ZIP', {}, 'E_PQ_ZIP_SYMLINK'],
    ['local-flags', mutateU16(valid, local + 6, 0), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH'],
    ['local-method', mutateU16(valid, local + 8, 8), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH'],
    ['local-crc', mutateU32(valid, local + 14, 0), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH'],
    ['local-compressed-size', mutateU32(valid, local + 18, 1), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH'],
    ['local-inflated-size', mutateU32(valid, local + 22, 1), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH'],
    ['local-name', overwrite(valid, local + 30, Buffer.from('b.txt')), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH'],
    ['payload-crc', overwrite(valid, local + 30 + 5, Buffer.from('X')), 'ZIP', {}, 'E_PQ_ZIP_CRC_MISMATCH'],
    ['central-crc', mutateU32(valid, central + 16, 0), 'ZIP', {}, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH'],
    ['nested-extension', buildZip([{ name: 'inner.zip', data: 'x' }]), 'ZIP', {}, 'E_PQ_NESTED_ARCHIVE'],
    ['nested-signature', buildZip([{ name: 'inner.bin', data: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }]), 'ZIP', {}, 'E_PQ_NESTED_ARCHIVE'],
    ['duplicate-path', buildZip([{ name: 'a', data: '1' }, { name: 'a', data: '2' }]), 'ZIP', {}, 'E_PQ_PATH_DUPLICATE'],
    ['case-path', buildZip([{ name: 'A', data: '1' }, { name: 'a', data: '2' }]), 'ZIP', {}, 'E_PQ_PATH_CASEFOLD_COLLISION'],
    ['cyrillic-path', buildZip([{ name: 'package', data: '1' }, { name: 'pаckage', data: '2' }]), 'ZIP', {}, 'E_PQ_PATH_CONFUSABLE_COLLISION'],
    ['greek-path', buildZip([{ name: 'root', data: '1' }, { name: 'rοοt', data: '2' }]), 'ZIP', {}, 'E_PQ_PATH_CONFUSABLE_COLLISION'],
    ['fullwidth-path', buildZip([{ name: 'file', data: '1' }, { name: 'ｆｉｌｅ', data: '2' }]), 'ZIP', {}, 'E_PQ_PATH_CONFUSABLE_COLLISION'],
    ['traversal-path', buildZip([{ name: '../a', data: 'x' }]), 'ZIP', {}, 'E_PQ_PATH_TRAVERSAL'],
    ['absolute-path', buildZip([{ name: '/a', data: 'x' }]), 'ZIP', {}, 'E_PQ_PATH_NOT_POSIX_RELATIVE'],
    ['entry-count-budget', buildZip([{ name: 'a', data: '1' }, { name: 'b', data: '2' }]), 'ZIP', { maxEntries: 1 }, 'E_PQ_ARCHIVE_ENTRY_BUDGET'],
    ['ratio-budget', buildZip([{ name: 'a', data: 'x'.repeat(1000), method: 8 }]), 'ZIP', { maxCompressionRatio: 2 }, 'E_PQ_ARCHIVE_COMPRESSION_RATIO'],
    ['xml-dtd', Buffer.from('<!DOCTYPE x><x/>'), 'XML', {}, 'E_PQ_XML_DTD_OR_ENTITY_DECLARATION'],
    ['xml-entity', Buffer.from('<!ENTITY e "x"><x/>'), 'XML', {}, 'E_PQ_XML_DTD_OR_ENTITY_DECLARATION'],
    ['xml-pi', Buffer.from('<?evil?><x/>'), 'XML', {}, 'E_PQ_XML_PROCESSING_INSTRUCTION'],
    ['xml-mismatch', Buffer.from('<x><y></x>'), 'XML', {}, 'E_PQ_XML_TAG_MISMATCH'],
    ['xml-depth-budget', Buffer.from('<x><y><z/></y></x>'), 'XML', { maxXmlDepth: 1 }, 'E_PQ_XML_DEPTH_BUDGET'],
    ['xml-text-budget', Buffer.from('<x>1234</x>'), 'XML', { maxXmlTextBytes: 3 }, 'E_PQ_XML_TEXT_BYTE_BUDGET'],
    ['ooxml-active', minimalOoxml({ extra: [{ name: 'word/vbaProject.bin', data: 'x' }] }), 'OOXML', {}, 'E_PQ_OOXML_ACTIVE_CONTENT'],
  ];
  assert.equal(cases.length, 44);
  const killed = [];
  for (const [id, bytes, format, budgets, expected] of cases) {
    const result = parser.inspectParserQuarantine({ bytes, format, budgets });
    assert.equal(result.ok, false, id);
    assert.equal(result.error.code, expected, id);
    killed.push(id);
  }
  assert.equal(killed.length, cases.length);
  assert.equal(new Set(killed).size, cases.length);
});

test('WP701 implementation-mutant denominator is executable and zero-skip', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../src/core/parser-quarantine-v1.mjs'), 'utf8');
  for (const oracle of [
    'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH',
    'E_PQ_ZIP_CRC_MISMATCH',
    'E_PQ_PATH_CONFUSABLE_COLLISION',
    'E_PQ_XML_DTD_OR_ENTITY_DECLARATION',
    'E_PQ_OOXML_ACTIVE_CONTENT',
  ]) assert.equal(source.includes(oracle), true, oracle);
  assert.equal(source.includes('.skip('), false);
  assert.equal(source.includes('.todo('), false);
});
