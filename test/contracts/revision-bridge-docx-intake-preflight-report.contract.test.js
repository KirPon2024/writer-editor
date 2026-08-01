const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const SECTION_START = '// RB_10_DOCX_INTAKE_PREFLIGHT_REPORT_START';
const SECTION_END = '// RB_10_DOCX_INTAKE_PREFLIGHT_REPORT_END';

async function loadBridge() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function readBridgeSource() {
  return fs.readFileSync(MODULE_PATH, 'utf8');
}

function extractMarkedSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  assert.ok(end > start, `marker order invalid: ${startMarker}`);
  return text.slice(start, end + endMarker.length);
}

function asciiBytes(value) {
  return Buffer.from(value, 'ascii');
}

function utf8Bytes(value) {
  return Buffer.from(value, 'utf8');
}

function normalizeEntry(entry) {
  const body = Buffer.isBuffer(entry.body)
    ? entry.body
    : utf8Bytes(typeof entry.body === 'string' ? entry.body : '');
  const method = entry.method ?? 0;
  const compressedBody = method === 8 ? deflateRawSync(body) : body;
  return {
    name: entry.name,
    method,
    body,
    compressedBody,
    byteSize: entry.byteSize ?? body.length,
    compressedSize: entry.compressedSize ?? compressedBody.length,
  };
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = asciiBytes(normalized.name);
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.flags ?? 0, 6);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return {
    ...normalized,
    offset,
    bytes: Buffer.concat([header, normalized.compressedBody]),
  };
}

function centralRecord(entry) {
  const name = asciiBytes(entry.name);
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags ?? 0, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt32LE(entry.offset, 42);
  name.copy(header, 46);
  return header;
}

function zipFixture(entries) {
  const locals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localRecord(entry, offset);
    locals.push(local);
    offset += local.bytes.length;
  }
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function cleanDocxZip(extraEntries = []) {
  return zipFixture([
    {
      name: 'word/document.xml',
      method: 8,
      body: '<w:document><w:body><w:p/></w:body></w:document>',
    },
    ...extraEntries,
  ]);
}

function collectKeys(value, pathParts = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectKeys(item, pathParts.concat(String(index))));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).flatMap((key) => (
    [pathParts.concat(key).join('.')].concat(collectKeys(value[key], pathParts.concat(key)))
  ));
}

function assertPreParseReport(result) {
  assert.equal(result.schemaVersion, 'revision-bridge.docx-intake-preflight-report.v1');
  assert.equal(result.type, 'docxIntakePreflightReport');
  assert.equal(result.semanticParseNotRun, true);
  assert.equal(result.parse.attempted, false);
  assert.equal(result.parse.semanticAllowed, false);
  assert.equal(result.preflightSummary.semanticParseNotRun, true);
  assert.equal(result.preflightSummary.eligibility.canCreateReviewPacket, false);
  assert.equal(result.preflightSummary.eligibility.canPreviewApply, false);
  assert.equal(result.preflightSummary.eligibility.canImportMutate, false);
  assert.equal(result.preflightSummary.eligibility.canWriteStorage, false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'reviewPacket'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'reviewSurface'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'applyOps'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'inventory'), false);
}

test('DOCX intake preflight report: clean minimal package is parser-candidate only', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip());

  assertPreParseReport(result);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.decision, 'accepted');
  assert.equal(result.code, 'DOCX_PART_POLICY_ACCEPTED');
  assert.equal(result.gatePass, true);
  assert.equal(result.gate.code, 'STAGE02_GATE_PASS');
  assert.equal(result.packageInspection.classification, 'clean');
  assert.equal(result.partPolicy.decision, 'accepted');
  assert.equal(result.preflightSummary.eligibility.safe, true);
  assert.equal(result.preflightSummary.eligibility.parserCandidateOnly, true);
  assert.deepEqual(result.preflightSummary.inventory.categoryCounts.mainDocumentPart, 1);
});

test('DOCX intake preflight report: media stays degraded diagnostics only', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    { name: 'word/media/image1.png', body: 'png' },
  ]));

  assertPreParseReport(result);
  assert.equal(result.ok, true);
  assert.equal(result.gatePass, true);
  assert.equal(result.status, 'degraded');
  assert.equal(result.decision, 'degraded');
  assert.equal(result.code, 'DOCX_PART_POLICY_MEDIA_DIAGNOSTICS_ONLY');
  assert.equal(result.partPolicy.eligibility.parserCandidateOnly, true);
  assert.equal(result.preflightSummary.eligibility.parserCandidateOnly, true);
  assert.equal(result.diagnostics.some((item) => (
    item.source === 'partPolicy' && item.code === 'DOCX_PART_POLICY_MEDIA_DIAGNOSTICS_ONLY'
  )), true);
});

test('DOCX intake preflight report: bounded degraded parts become content-only candidates', async () => {
  const bridge = await loadBridge();
  const relationship = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    { name: 'word/_rels/document.xml.rels', body: '<Relationships/>' },
  ]));
  const customProperties = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    {
      name: 'docProps/custom.xml',
      body: '<Properties><property name="YRTK_C01_AUTH"><vt:lpwstr>YRTK1.synthetic</vt:lpwstr></property></Properties>',
    },
  ]));
  const unknown = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    { name: 'custom/item.bin', body: 'x' },
  ]));
  const unsupportedStory = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    { name: 'word/header1.xml', body: '<w:hdr/>' },
  ]));
  const externalRelationship = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    {
      name: 'word/_rels/document.xml.rels',
      body: '<Relationships><Relationship Target="https://example.invalid" TargetMode="External"/></Relationships>',
    },
  ]));
  const missingMainDocument = bridge.buildDocxIntakePreflightReportFromZipBytes(zipFixture([
    { name: 'word/styles.xml', body: '<w:styles/>' },
  ]));

  for (const result of [relationship, unsupportedStory]) {
    assertPreParseReport(result);
    assert.equal(result.ok, true);
    assert.equal(result.gatePass, true);
    assert.equal(result.status, 'degraded');
    assert.equal(result.preflightSummary.eligibility.parserCandidateOnly, true);
    assert.equal(result.preflightSummary.eligibility.canImportMutate, false);
    assert.equal(result.preflightSummary.eligibility.canWriteStorage, false);
  }
  for (const result of [externalRelationship, unknown, missingMainDocument]) {
    assertPreParseReport(result);
    assert.equal(result.ok, false);
    assert.equal(result.gatePass, false);
    assert.equal(result.preflightSummary.eligibility.parserCandidateOnly, false);
    assert.equal(result.preflightSummary.eligibility.canImportMutate, false);
    assert.equal(result.preflightSummary.eligibility.canWriteStorage, false);
  }
  assert.equal(relationship.code, 'DOCX_PART_POLICY_RELATIONSHIP_DIAGNOSTICS_ONLY');
  assert.equal(customProperties.ok, true);
  assert.equal(customProperties.gatePass, true);
  assert.equal(customProperties.partPolicy.categories.knownSupportPart.entryIds.includes('docProps/custom.xml'), true);
  assert.equal(customProperties.preflightSummary.eligibility.parserCandidateOnly, true);
  assert.equal(externalRelationship.code, 'STAGE02_EXTERNAL_RELATIONSHIP_PRESENT');
  assert.equal(unknown.code, 'STAGE02_PACKAGE_QUARANTINED');
  assert.equal(unsupportedStory.code, 'DOCX_PART_POLICY_UNSUPPORTED_STORY_DIAGNOSTICS_ONLY');
  assert.equal(missingMainDocument.code, 'STAGE02_PACKAGE_QUARANTINED');
});

test('DOCX intake preflight report: hostile containers stay blocked before semantic parse', async () => {
  const bridge = await loadBridge();
  const duplicate = bridge.buildDocxIntakePreflightReportFromZipBytes(zipFixture([
    { name: 'word/document.xml', body: '<root/>' },
    { name: 'WORD/DOCUMENT.XML', body: '<root/>' },
  ]));
  const traversal = bridge.buildDocxIntakePreflightReportFromZipBytes(zipFixture([
    { name: 'word\\document.xml', body: '<root/>' },
  ]));
  const dtd = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    { name: 'word/styles.xml', body: '<?xml version="1.0"?><!DOCTYPE root><root/>' },
  ]));
  const entity = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    { name: 'word/styles.xml', body: '<?xml version="1.0"?><!ENTITY stage02 "x"><root/>' },
  ]));
  const bomb = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip([
    {
      name: 'word/styles.xml',
      method: 8,
      body: `<root>${'a'.repeat(20000)}</root>`,
    },
  ]));

  const expected = [
    [duplicate, 'STAGE02_DUPLICATE_ENTRY_NAME'],
    [traversal, 'STAGE02_PATH_TRAVERSAL_DETECTED'],
    [dtd, 'STAGE02_XML_DTD_DECLARATION_PRESENT'],
    [entity, 'STAGE02_XML_ENTITY_DECLARATION_PRESENT'],
    [bomb, 'STAGE02_COMPRESSION_RATIO_EXCEEDED'],
  ];

  for (const [result, code] of expected) {
    assertPreParseReport(result);
    assert.equal(result.ok, false);
    assert.equal(result.gatePass, false);
    assert.equal(result.code, code);
    assert.equal(result.gate.parse.attempted, false);
    assert.equal(result.preflightSummary.eligibility.parserCandidateOnly, false);
  }
});

test('DOCX intake preflight report: malformed input returns bounded report without throwing', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxIntakePreflightReportFromZipBytes('review.docx');

  assertPreParseReport(result);
  assert.equal(result.ok, false);
  assert.equal(result.gatePass, false);
  assert.equal(result.status, 'rejected');
  assert.equal(result.decision, 'quarantined');
  assert.equal(result.code, 'STAGE02_PACKAGE_MALFORMED');
  assert.equal(result.packageInspection, null);
  assert.equal(result.partPolicy, null);
  assert.equal(result.preflightSummary.inventory.entryCount, 0);
});

test('DOCX intake preflight report: output is deterministic and input is not mutated', async () => {
  const bridge = await loadBridge();
  const input = cleanDocxZip();
  const before = Buffer.from(input);
  const first = bridge.buildDocxIntakePreflightReportFromZipBytes(input);
  const second = bridge.buildDocxIntakePreflightReportFromZipBytes(input);

  assert.deepEqual(first, second);
  assert.equal(input.equals(before), true);
});

test('DOCX intake preflight report: result and implementation stay out of parser import storage layers', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxIntakePreflightReportFromZipBytes(cleanDocxZip());
  const resultKeys = collectKeys(result);
  const forbiddenResultKeys = [
    'reviewPacket',
    'reviewSurface',
    'applyOps',
    'canApply',
    'writeReceipt',
    'exportReceipt',
    'entries',
  ];

  for (const forbidden of forbiddenResultKeys) {
    assert.equal(resultKeys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)), false, forbidden);
  }

  const section = extractMarkedSection(readBridgeSource(), SECTION_START, SECTION_END);
  const forbiddenRuntimeMarkers = [
    'fs.',
    'readFile',
    'writeFile',
    'ipc',
    'electron',
    'fetch',
    'http',
    'https',
    'DOMParser',
    'XMLParser',
    'xmldom',
    'fast-xml-parser',
    'buildRevisionPacketPreview',
    'adaptParsedReviewSurfaceToReviewPacketPreviewInput',
    'handleReviewSurfaceImportPacketCommandSurface',
    'exactTextMinSafeWrite',
    'buildDocxMinBuffer',
    'reviewSurface',
    'reviewPacket',
    'applyOps',
    'canApply: true',
  ];

  for (const marker of forbiddenRuntimeMarkers) {
    assert.equal(section.includes(marker), false, `${marker} must stay out of preflight report contour`);
  }
});
