'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildZip, locateSignatures, minimalOoxml, mutateU16, mutateU32 } = require('../fixtures/r24-wp701-parser-quarantine-fixtures.js');

const load = () => import('../../src/core/parser-quarantine-v1.mjs');
const inspect = async (bytes, format = 'AUTO', budgets = {}) => (await load()).inspectParserQuarantine({ bytes, format, budgets });

test('WP701 publishes frozen ceilings and a deterministic admitted OOXML report', async () => {
  const parser = await load();
  assert.equal(Object.isFrozen(parser.PARSER_QUARANTINE_LIMITS), true);
  assert.equal(parser.PARSER_QUARANTINE_SCHEMA_VERSION, 'yalken.parser-quarantine.report.v1');
  const bytes = minimalOoxml();
  const first = parser.inspectParserQuarantine({ bytes, format: 'AUTO', budgets: {} });
  const second = parser.inspectParserQuarantine({ bytes: Buffer.from(bytes), format: 'OOXML', budgets: {} });
  assert.equal(first.ok, true);
  assert.equal(first.status, 'ADMITTED');
  assert.equal(first.value.format, 'OOXML');
  assert.equal(first.value.partDenominator, 3);
  assert.equal(first.value.lossLedgerDenominator, 0);
  assert.equal(first.value.semanticProjectionPublished, true);
  assert.equal(Object.isFrozen(first.value), true);
  assert.equal(Object.isFrozen(first.value.parts[0]), true);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.sha256, crypto.createHash('sha256').update(first.bytes).digest('hex'));
  assert.equal(first.bytes.at(-1), 0x0a);
});

test('WP701 validates legitimate NFC Unicode XML and preserves only validated text', async () => {
  const xml = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><root lang="el"><p>Hello, мир — Καλημέρα — café.</p><![CDATA[✓]]></root>');
  const result = await inspect(xml, 'XML');
  assert.equal(result.ok, true);
  assert.equal(result.value.parts[0].mediaKind, 'VALIDATED_XML');
  assert.equal(result.value.parts[0].validatedText.includes('Καλημέρα'), true);
  assert.equal(result.value.parts[0].xml.nodeCount, 2);
  assert.equal(result.value.archive, null);
});

test('WP701 clamps attempts to enlarge ceilings and honors tighter caller budgets', async () => {
  const parser = await load();
  const enlarged = parser.inspectParserQuarantine({
    bytes: Buffer.from('<root/>'),
    format: 'XML',
    budgets: { maxXmlDepth: parser.PARSER_QUARANTINE_LIMITS.maxXmlDepth + 1 },
  });
  assert.equal(enlarged.ok, true);
  assert.deepEqual(enlarged.value.budgets.clamps, [{ key: 'maxXmlDepth', requested: 65, effective: 64 }]);
  const tight = await inspect(Buffer.from('<root><a><b/></a></root>'), 'XML', { maxXmlDepth: 1 });
  assert.equal(tight.error.code, 'E_PQ_XML_DEPTH_BUDGET');
  assert.equal((await inspect(Buffer.from('<root/>'), 'XML', { unknown: 1 })).error.code, 'E_PQ_BUDGET_FIELD');
});

test('WP701 rejects traversal, absolute, directory, case-fold and Unicode-confusable archive names', async () => {
  for (const [name, entries, code] of [
    ['traversal', [{ name: '../word/document.xml', data: '<x/>' }], 'E_PQ_PATH_TRAVERSAL'],
    ['absolute', [{ name: '/word/document.xml', data: '<x/>' }], 'E_PQ_PATH_NOT_POSIX_RELATIVE'],
    ['directory', [{ name: 'word/', data: '' }], 'E_PQ_PATH_TRAVERSAL'],
    ['case', [{ name: 'Foo.xml', data: '<x/>' }, { name: 'foo.xml', data: '<x/>' }], 'E_PQ_PATH_CASEFOLD_COLLISION'],
    ['cyrillic', [{ name: 'package.xml', data: '<x/>' }, { name: 'pаckage.xml', data: '<x/>' }], 'E_PQ_PATH_CONFUSABLE_COLLISION'],
    ['greek', [{ name: 'root.xml', data: '<x/>' }, { name: 'rοοt.xml', data: '<x/>' }], 'E_PQ_PATH_CONFUSABLE_COLLISION'],
    ['fullwidth', [{ name: 'foo.xml', data: '<x/>' }, { name: 'ｆｏｏ.xml', data: '<x/>' }], 'E_PQ_PATH_CONFUSABLE_COLLISION'],
  ]) {
    const result = await inspect(buildZip(entries), 'ZIP');
    assert.equal(result.error.code, code, name);
    assert.equal(result.ok, false, name);
  }
});

test('WP701 rejects encrypted, descriptor, symlink, nested archive and unsupported compression entries', async () => {
  const cases = [
    [buildZip([{ name: 'a.txt', data: 'x', flags: 0x0801 }]), 'E_PQ_ZIP_ENCRYPTED'],
    [buildZip([{ name: 'a.txt', data: 'x', flags: 0x0808 }]), 'E_PQ_ZIP_DATA_DESCRIPTOR'],
    [buildZip([{ name: 'a.txt', data: 'x', externalAttributes: 0xa000 << 16 }]), 'E_PQ_ZIP_SYMLINK'],
    [buildZip([{ name: 'inner.zip', data: 'not-even-a-zip' }]), 'E_PQ_NESTED_ARCHIVE'],
    [buildZip([{ name: 'a.txt', data: 'x', method: 12, compressed: Buffer.from('x') }]), 'E_PQ_ZIP_COMPRESSION_METHOD'],
  ];
  for (const [bytes, code] of cases) assert.equal((await inspect(bytes, 'ZIP')).error.code, code);
});

test('WP701 binds local and central metadata, CRC, sizes and exact ranges', async () => {
  const valid = buildZip([{ name: 'a.txt', data: 'content', method: 8 }]);
  const positions = locateSignatures(valid);
  assert.equal((await inspect(mutateU16(valid, positions.local[0] + 8, 0), 'ZIP')).error.code, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH');
  assert.equal((await inspect(mutateU32(valid, positions.local[0] + 14, 0), 'ZIP')).error.code, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH');
  assert.equal((await inspect(mutateU32(valid, positions.central[0] + 16, 0), 'ZIP')).error.code, 'E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH');
  assert.equal((await inspect(mutateU32(valid, positions.eocd[0] + 16, 1), 'ZIP')).error.code, 'E_PQ_ZIP_CENTRAL_RANGE');
  const damaged = Buffer.from(valid);
  damaged[positions.local[0] + 30 + Buffer.byteLength('a.txt')] ^= 0xff;
  assert.equal((await inspect(damaged, 'ZIP')).error.code, 'E_PQ_ZIP_INFLATE');
});

test('WP701 rejects fake EOCD, trailing bytes, multidisk and central denominator mismatch', async () => {
  const valid = buildZip([{ name: 'a.txt', data: 'x' }]);
  assert.equal((await inspect(Buffer.concat([valid, Buffer.from([0x50, 0x4b, 0x05, 0x06])]), 'ZIP')).error.code, 'E_PQ_ZIP_EOCD_AMBIGUOUS');
  assert.equal((await inspect(buildZip([{ name: 'a.txt', data: 'x' }], { trailing: Buffer.from('x') }), 'ZIP')).error.code, 'E_PQ_ZIP_TRAILING_BYTES');
  assert.equal((await inspect(buildZip([{ name: 'a.txt', data: 'x' }], { disk: 1 }), 'ZIP')).error.code, 'E_PQ_ZIP_MULTIDISK');
  assert.equal((await inspect(buildZip([{ name: 'a.txt', data: 'x' }], { entryCount: 2, diskEntries: 2 }), 'ZIP')).error.code, 'E_PQ_ZIP_CENTRAL_HEADER');
});

test('WP701 fails closed on archive entry, compressed, inflated, total and ratio budgets', async () => {
  assert.equal((await inspect(buildZip([{ name: 'a', data: '1' }, { name: 'b', data: '2' }]), 'ZIP', { maxEntries: 1 })).error.code, 'E_PQ_ARCHIVE_ENTRY_BUDGET');
  assert.equal((await inspect(buildZip([{ name: 'a', data: '1234' }]), 'ZIP', { maxEntryCompressedBytes: 3 })).error.code, 'E_PQ_ARCHIVE_ENTRY_BYTE_BUDGET');
  assert.equal((await inspect(buildZip([{ name: 'a', data: '1234' }]), 'ZIP', { maxEntryInflatedBytes: 3 })).error.code, 'E_PQ_ARCHIVE_ENTRY_BYTE_BUDGET');
  assert.equal((await inspect(buildZip([{ name: 'a', data: '123' }, { name: 'b', data: '456' }]), 'ZIP', { maxTotalInflatedBytes: 5 })).error.code, 'E_PQ_ARCHIVE_TOTAL_BYTE_BUDGET');
  assert.equal((await inspect(buildZip([{ name: 'a', data: 'x'.repeat(2000), method: 8 }]), 'ZIP', { maxCompressionRatio: 2 })).error.code, 'E_PQ_ARCHIVE_COMPRESSION_RATIO');
});

test('WP701 rejects malformed XML, DTD, entity declarations and processing instructions', async () => {
  for (const [xml, code] of [
    ['<root><x></root>', 'E_PQ_XML_TAG_MISMATCH'],
    ['<!DOCTYPE root><root/>', 'E_PQ_XML_DTD_OR_ENTITY_DECLARATION'],
    ['<!ENTITY x "boom"><root/>', 'E_PQ_XML_DTD_OR_ENTITY_DECLARATION'],
    ['<?evil data?><root/>', 'E_PQ_XML_PROCESSING_INSTRUCTION'],
    ['<root><?evil data?></root>', 'E_PQ_XML_PROCESSING_INSTRUCTION'],
    ['<root>&external;</root>', 'E_PQ_XML_ENTITY_REFERENCE'],
    ['<root a="1" a="2"/>', 'E_PQ_XML_ATTRIBUTE_DUPLICATE'],
    ['before<root/>', 'E_PQ_XML_TEXT_OUTSIDE_ROOT'],
    ['<a/><b/>', 'E_PQ_XML_ROOT_OR_CLOSURE'],
  ]) assert.equal((await inspect(Buffer.from(xml), 'XML')).error.code, code, xml);
  assert.equal((await inspect(Buffer.from([0xff, 0xfe, 0x3c, 0x78, 0x2f, 0x3e]), 'XML')).error.code, 'E_PQ_XML_UTF8');
  assert.equal((await inspect(Buffer.from('<root>e\u0301</root>'), 'XML')).error.code, 'E_PQ_XML_NOT_NFC');
});

test('WP701 enforces XML byte, depth, node, attribute and text budgets', async () => {
  assert.equal((await inspect(Buffer.from('<root/>'), 'XML', { maxXmlBytes: 2 })).error.code, 'E_PQ_XML_BYTE_BUDGET');
  assert.equal((await inspect(Buffer.from('<root><a/></root>'), 'XML', { maxXmlNodes: 1 })).error.code, 'E_PQ_XML_NODE_BUDGET');
  assert.equal((await inspect(Buffer.from('<root a="1" b="2"/>'), 'XML', { maxXmlAttributes: 1 })).error.code, 'E_PQ_XML_ATTRIBUTE_COUNT_BUDGET');
  assert.equal((await inspect(Buffer.from('<root a="1234"/>'), 'XML', { maxXmlAttributeBytes: 3 })).error.code, 'E_PQ_XML_ATTRIBUTE_BYTE_BUDGET');
  assert.equal((await inspect(Buffer.from('<root>1234</root>'), 'XML', { maxXmlTextBytes: 3 })).error.code, 'E_PQ_XML_TEXT_BYTE_BUDGET');
});

test('WP701 quarantines external relationships and active OOXML without leaking targets or partial parts', async () => {
  const external = minimalOoxml({
    rootRels: '<?xml version="1.0"?><Relationships><Relationship Id="r1" Type="hyperlink" Target="https://secret.example/private" TargetMode="External"/></Relationships>',
  });
  const result = await inspect(external, 'OOXML');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'QUARANTINED');
  assert.equal(result.error.code, 'E_PQ_OOXML_ACTIVE_CONTENT');
  assert.equal(result.report.semanticProjectionPublished, false);
  assert.equal(Object.hasOwn(result.report, 'parts'), false);
  assert.equal(result.report.lossLedgerDenominator, 1);
  assert.equal(JSON.stringify(result).includes('secret.example'), false);

  const macro = await inspect(minimalOoxml({ extra: [{ name: 'word/vbaProject.bin', data: 'macro' }] }), 'OOXML');
  assert.equal(macro.status, 'QUARANTINED');
  assert.equal(macro.report.lossLedger[0].code, 'ACTIVE_BINARY_PART');
});

test('WP701 requires complete OOXML root parts and complete XML-part denominator', async () => {
  const incomplete = buildZip([{ name: '[Content_Types].xml', data: '<Types/>' }]);
  assert.equal((await inspect(incomplete, 'OOXML')).error.code, 'E_PQ_OOXML_REQUIRED_PART');
  const tooMany = buildZip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: '_rels/.rels', data: '<Relationships/>' },
    { name: 'a.xml', data: '<a/>' },
  ]);
  assert.equal((await inspect(tooMany, 'OOXML', { maxXmlParts: 2 })).error.code, 'E_PQ_XML_PART_BUDGET');
});

test('WP701 rejects malformed caller shapes without reading accessor payloads', async () => {
  const parser = await load();
  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'bytes', { enumerable: true, get() { reads += 1; return Buffer.from('<x/>'); } });
  accessor.format = 'XML';
  accessor.budgets = {};
  assert.equal(parser.inspectParserQuarantine(accessor).error.code, 'E_PQ_INPUT_SHAPE');
  assert.equal(reads, 0);
  assert.equal(parser.inspectParserQuarantine({ bytes: '<x/>', format: 'XML', budgets: {} }).error.code, 'E_PQ_INPUT_BYTES');
  assert.equal(parser.inspectParserQuarantine({ bytes: Buffer.from('<x/>'), format: 'HTML', budgets: {} }).error.code, 'E_PQ_FORMAT');
});
