const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const TEST_PATH = 'test/contracts/revision-bridge-docx-zip-inventory-materializer.contract.test.js';
const PACKAGE_BOUNDARY_TEST_PATH = 'test/contracts/revision-bridge-docx-package-boundary.contract.test.js';
const HOSTILE_FILE_GATE_TEST_PATH = 'test/contracts/revision-bridge-docx-hostile-file-gate.contract.test.js';
const CONTENT_PREVIEW_TEST_PATH = 'test/contracts/revision-bridge-docx-content-preview.contract.test.js';
const IMPORT_PREVIEW_PLAN_TEST_PATH = 'test/contracts/revision-bridge-docx-import-preview-plan.contract.test.js';
const IMPORT_PREVIEW_COMMAND_SURFACE_TEST_PATH = 'test/contracts/revision-bridge-docx-import-preview-command-surface.contract.test.js';
const ALLOWLIST = [
  MODULE_PATH,
  TEST_PATH,
  PACKAGE_BOUNDARY_TEST_PATH,
  HOSTILE_FILE_GATE_TEST_PATH,
  CONTENT_PREVIEW_TEST_PATH,
  IMPORT_PREVIEW_PLAN_TEST_PATH,
  IMPORT_PREVIEW_COMMAND_SURFACE_TEST_PATH,
];

async function loadBridge() {
  return import(pathToFileURL(path.join(process.cwd(), MODULE_PATH)).href);
}

function textBytes(value) {
  return Buffer.from(value, 'ascii');
}

function localRecord(entry, offset) {
  const name = textBytes(entry.name);
  const body = Buffer.alloc(entry.bodySize ?? entry.compressedSize ?? 0, 0x61);
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.flags ?? 0, 6);
  header.writeUInt16LE(entry.method ?? 0, 8);
  header.writeUInt32LE(entry.crc ?? 0, 14);
  header.writeUInt32LE(entry.compressedSize ?? body.length, 18);
  header.writeUInt32LE(entry.byteSize ?? body.length, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return {
    offset,
    bytes: Buffer.concat([header, body]),
  };
}

function centralRecord(entry, localOffset) {
  const name = textBytes(entry.name);
  const extra = Buffer.alloc(entry.extraSize ?? 0);
  const comment = Buffer.alloc(entry.commentSize ?? 0);
  const header = Buffer.alloc(46 + name.length + extra.length + comment.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags ?? 0, 8);
  header.writeUInt16LE(entry.method ?? 0, 10);
  header.writeUInt32LE(entry.crc ?? 0, 16);
  header.writeUInt32LE(entry.centralCompressedSize ?? entry.compressedSize ?? entry.bodySize ?? 0, 20);
  header.writeUInt32LE(entry.centralByteSize ?? entry.byteSize ?? entry.bodySize ?? 0, 24);
  header.writeUInt16LE(entry.centralNameSize ?? name.length, 28);
  header.writeUInt16LE(extra.length, 30);
  header.writeUInt16LE(comment.length, 32);
  header.writeUInt16LE(entry.diskStart ?? 0, 34);
  header.writeUInt32LE(entry.centralOffset ?? localOffset, 42);
  name.copy(header, 46);
  extra.copy(header, 46 + name.length);
  comment.copy(header, 46 + name.length + extra.length);
  return header;
}

function zipFixture(entries, options = {}) {
  const locals = [];
  let cursor = 0;
  for (const entry of entries) {
    const local = localRecord(entry, cursor);
    locals.push(local);
    cursor += local.bytes.length;
  }

  const centralRecords = entries.map((entry, index) => centralRecord(entry, locals[index].offset));
  const central = Buffer.concat(centralRecords);
  const centralOffset = options.centralOffset ?? cursor;
  const centralSize = options.centralSize ?? central.length;
  const entryCount = options.entryCount ?? entries.length;
  const end = Buffer.alloc(22 + (options.commentSize ?? 0));
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.diskIndex ?? 0, 4);
  end.writeUInt16LE(options.centralDiskIndex ?? 0, 6);
  end.writeUInt16LE(options.diskEntryCount ?? entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(options.commentSize ?? 0, 20);

  const prefix = options.prefix ?? Buffer.concat(locals.map((local) => local.bytes));
  return Buffer.concat([prefix, central, options.beforeEnd ?? Buffer.alloc(0), end]);
}

function malformedCentralZip(entries) {
  const valid = zipFixture(entries);
  return valid.subarray(0, valid.length - 30);
}

function diagnosticCodes(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function assertSuccessShape(result) {
  assert.deepEqual(Object.keys(result), [
    'ok',
    'type',
    'status',
    'code',
    'reason',
    'inventory',
    'inspection',
    'diagnostics',
    'bounds',
  ]);
}

function assertFailureShape(result) {
  assert.deepEqual(Object.keys(result), [
    'ok',
    'type',
    'status',
    'code',
    'reason',
    'diagnostics',
    'bounds',
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'inventory'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'inspection'), false);
}

function changedFilesFromGitStatus(statusText) {
  return statusText
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.slice(3).replace(/^"|"$/gu, ''));
}

function changedFilesOutsideAllowlist(changedFiles) {
  const allowedPaths = new Set(ALLOWLIST);
  return changedFiles.filter((filePath) => !allowedPaths.has(filePath));
}

test('RB-06 exports materializer and materializes minimal DOCX inventory for RB-05 inspection', async () => {
  const bridge = await loadBridge();
  const input = zipFixture([
    { name: 'word/document.xml', bodySize: 12 },
  ]);

  assert.equal(typeof bridge.materializeDocxPackageInventoryFromZipBytes, 'function');
  const result = bridge.materializeDocxPackageInventoryFromZipBytes(input);

  assertSuccessShape(result);
  assert.equal(result.ok, true);
  assert.equal(result.type, 'docxZipInventoryMaterialization');
  assert.equal(result.status, 'materialized');
  assert.equal(result.code, 'DOCX_ZIP_INVENTORY_MATERIALIZED');
  assert.equal(result.reason, 'DOCX_ZIP_INVENTORY_MATERIALIZED');
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.inventory, {
    entries: [
      {
        id: 'word/document.xml',
        kind: 'knownPart',
        byteSize: 12,
        compressedSize: 12,
        story: 'main',
        markers: ['documentPart'],
      },
    ],
  });
  assert.deepEqual(result.inspection, bridge.inspectDocxPackageInventory(result.inventory));
  assert.equal(result.inspection.classification, 'clean');
  assert.equal(result.bounds.MAX_INPUT_BYTES, 52428800);
  assert.equal(result.bounds.MAX_EOCD_SEARCH_BYTES, 65557);
  assert.equal(result.bounds.MAX_CENTRAL_DIRECTORY_BYTES, 2097152);
});

test('RB-06 classifies relationship, unknown, directory, media, and unsupported story entries', async () => {
  const bridge = await loadBridge();
  const result = bridge.materializeDocxPackageInventoryFromZipBytes(zipFixture([
    { name: 'word/document.xml', bodySize: 1 },
    { name: 'word/_rels/document.xml.rels', bodySize: 2 },
    { name: 'custom/item.bin', bodySize: 3 },
    { name: 'word/media/image1.png', bodySize: 4 },
    { name: 'word/comments.xml', bodySize: 5 },
    { name: 'word/commentsExtended.xml', bodySize: 5 },
    { name: 'word/commentsIds.xml', bodySize: 5 },
    { name: 'word/commentsExtensible.xml', bodySize: 5 },
    { name: 'word/webSettings.xml', bodySize: 5 },
    { name: 'word/people.xml', bodySize: 5 },
    { name: 'word/stylesWithEffects.xml', bodySize: 5 },
    { name: 'docProps/thumbnail.jpeg', bodySize: 5 },
    { name: 'customXml/item1.xml', bodySize: 5 },
    { name: 'customXml/itemProps1.xml', bodySize: 5 },
    { name: 'word/header1.xml', bodySize: 5 },
    { name: 'folder/', bodySize: 0 },
  ]));

  assertSuccessShape(result);
  assert.deepEqual(result.inventory.entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    story: entry.story,
    markers: entry.markers,
  })), [
    { id: 'word/document.xml', kind: 'knownPart', story: 'main', markers: ['documentPart'] },
    { id: 'word/_rels/document.xml.rels', kind: 'relationshipPart', story: undefined, markers: ['relationship'] },
    { id: 'custom/item.bin', kind: 'unknownPart', story: undefined, markers: undefined },
    { id: 'word/media/image1.png', kind: 'knownPart', story: undefined, markers: ['mediaPart'] },
    { id: 'word/comments.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'word/commentsExtended.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'word/commentsIds.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'word/commentsExtensible.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'word/webSettings.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'word/people.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'word/stylesWithEffects.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'docProps/thumbnail.jpeg', kind: 'knownPart', story: undefined, markers: ['mediaPart'] },
    { id: 'customXml/item1.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'customXml/itemProps1.xml', kind: 'knownPart', story: undefined, markers: undefined },
    { id: 'word/header1.xml', kind: 'knownPart', story: 'unsupported', markers: ['unsupportedStory'] },
    { id: 'folder/', kind: 'directory', story: undefined, markers: undefined },
  ]);
  assert.equal(result.inspection.classification, 'suspicious');
  assert.equal(diagnosticCodes(result.inspection).includes('DOCX_RELATIONSHIP_PART_PRESENT'), true);
  assert.equal(diagnosticCodes(result.inspection).includes('DOCX_UNKNOWN_PART_PRESENT'), true);
  assert.equal(diagnosticCodes(result.inspection).includes('DOCX_DIRECTORY_ENTRY_PRESENT'), true);
  assert.equal(diagnosticCodes(result.inspection).includes('DOCX_UNSUPPORTED_STORY_MARKER_PRESENT'), true);
});

test('RB-06 rejects invalid input types and preserves RB-05 direct binary rejection', async () => {
  const bridge = await loadBridge();
  const invalidCases = [
    null,
    undefined,
    'review.docx',
    { filePath: 'review.docx' },
    { path: 'review.docx' },
    { bytes: [1, 2, 3] },
    { arrayBuffer() {}, name: 'review.docx' },
    { stream() {} },
    { pipe() {} },
    { getReader() {} },
    { entries: [] },
  ];

  for (const input of invalidCases) {
    const result = bridge.materializeDocxPackageInventoryFromZipBytes(input);
    assertFailureShape(result);
    assert.equal(result.code, 'DOCX_ZIP_BYTES_INPUT_INVALID');
  }

  const bytes = zipFixture([{ name: 'word/document.xml', bodySize: 1 }]);
  assert.equal(
    diagnosticCodes(bridge.inspectDocxPackageInventory(bytes)).includes('DOCX_INVENTORY_BINARY_INPUT_REJECTED'),
    true,
  );
});

test('RB-06 accepts Buffer, Uint8Array, ArrayBuffer, and DataView without mutating input', async () => {
  const bridge = await loadBridge();
  const buffer = zipFixture([{ name: 'word/document.xml', bodySize: 1 }]);
  const uint8 = new Uint8Array(buffer);
  const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
  const view = new DataView(arrayBuffer);
  const before = Array.from(uint8);

  const results = [
    bridge.materializeDocxPackageInventoryFromZipBytes(buffer),
    bridge.materializeDocxPackageInventoryFromZipBytes(uint8),
    bridge.materializeDocxPackageInventoryFromZipBytes(arrayBuffer),
    bridge.materializeDocxPackageInventoryFromZipBytes(view),
  ];

  for (const result of results) {
    assert.equal(result.ok, true);
    assert.equal(result.inspection.classification, 'clean');
  }
  assert.deepEqual(Array.from(uint8), before);
  assert.deepEqual(results[0], bridge.materializeDocxPackageInventoryFromZipBytes(buffer));
});

test('RB-06 rejects malformed end marker and truncated central directory', async () => {
  const bridge = await loadBridge();
  const noEnd = Buffer.alloc(30, 0x20);
  const tooShort = Buffer.from([0x50, 0x4b]);
  const badComment = zipFixture([{ name: 'word/document.xml', bodySize: 1 }], { commentSize: 5 }).subarray(0, -2);
  const truncatedCentral = zipFixture([{ name: 'word/document.xml', bodySize: 1 }], { centralSize: 1000 });

  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(noEnd).code, 'DOCX_ZIP_EOCD_NOT_FOUND');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(tooShort).code, 'DOCX_ZIP_EOCD_TRUNCATED');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(badComment).code, 'DOCX_ZIP_EOCD_TRUNCATED');
  assert.equal(
    bridge.materializeDocxPackageInventoryFromZipBytes(truncatedCentral).code,
    'DOCX_ZIP_CENTRAL_DIRECTORY_TRUNCATED',
  );
});

test('RB-06 rejects ZIP64, encrypted entries, multidisk archives, and invalid offsets', async () => {
  const bridge = await loadBridge();
  const zip64 = zipFixture([{ name: 'word/document.xml', bodySize: 1, centralByteSize: 0xffffffff }]);
  const encrypted = zipFixture([{ name: 'word/document.xml', bodySize: 1, flags: 1 }]);
  const multidiskEnd = zipFixture([{ name: 'word/document.xml', bodySize: 1 }], { diskIndex: 1 });
  const multidiskEntry = zipFixture([{ name: 'word/document.xml', bodySize: 1, diskStart: 1 }]);
  const badOffset = zipFixture([{ name: 'word/document.xml', bodySize: 1, centralOffset: 0xffffffff - 1 }]);

  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(zip64).code, 'DOCX_ZIP64_UNSUPPORTED');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(encrypted).code, 'DOCX_ZIP_ENTRY_ENCRYPTED_UNSUPPORTED');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(multidiskEnd).code, 'DOCX_ZIP_MULTI_DISK_UNSUPPORTED');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(multidiskEntry).code, 'DOCX_ZIP_MULTI_DISK_UNSUPPORTED');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(badOffset).code, 'DOCX_ZIP_ENTRY_OFFSET_INVALID');
});

test('RB-06 enforces bounded input and central-directory limits', async () => {
  const bridge = await loadBridge();
  const oversizedInput = Buffer.alloc(52428801);
  const tooLargeCentral = zipFixture([{ name: 'word/document.xml', bodySize: 1 }], { centralSize: 2097153 });
  const tooManyEntries = zipFixture([{ name: 'word/document.xml', bodySize: 1 }], { entryCount: 513 });

  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(oversizedInput).code, 'DOCX_ZIP_BYTES_INPUT_TOO_LARGE');
  assert.equal(
    bridge.materializeDocxPackageInventoryFromZipBytes(tooLargeCentral).code,
    'DOCX_ZIP_CENTRAL_DIRECTORY_TOO_LARGE',
  );
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(tooManyEntries).code, 'DOCX_ZIP_ENTRY_COUNT_EXCEEDED');
});

test('RB-06 enforces entry field and uncompressed-size limits', async () => {
  const bridge = await loadBridge();
  const longName = `${'a'.repeat(1025)}.xml`;
  const nameTooLarge = zipFixture([{ name: longName, bodySize: 1 }]);
  const extraTooLarge = zipFixture([{ name: 'word/document.xml', bodySize: 1, extraSize: 4097 }]);
  const commentTooLarge = zipFixture([{ name: 'word/document.xml', bodySize: 1, commentSize: 4097 }]);
  const singleTooLarge = zipFixture([{ name: 'word/document.xml', bodySize: 0, centralByteSize: 33554433 }]);
  const totalTooLarge = zipFixture(Array.from({ length: 6 }, (_, index) => ({
    name: `word/document${index}.xml`,
    bodySize: 0,
    centralByteSize: 12 * 1024 * 1024,
  })));
  const invalidName = zipFixture([{ name: '../word/document.xml', bodySize: 1 }]);

  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(nameTooLarge).code, 'DOCX_ZIP_ENTRY_NAME_TOO_LARGE');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(extraTooLarge).code, 'DOCX_ZIP_ENTRY_EXTRA_TOO_LARGE');
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(commentTooLarge).code, 'DOCX_ZIP_ENTRY_COMMENT_TOO_LARGE');
  assert.equal(
    bridge.materializeDocxPackageInventoryFromZipBytes(singleTooLarge).code,
    'DOCX_ZIP_ENTRY_UNCOMPRESSED_SIZE_EXCEEDED',
  );
  assert.equal(
    bridge.materializeDocxPackageInventoryFromZipBytes(totalTooLarge).code,
    'DOCX_ZIP_TOTAL_UNCOMPRESSED_SIZE_EXCEEDED',
  );
  assert.equal(bridge.materializeDocxPackageInventoryFromZipBytes(invalidName).code, 'DOCX_ZIP_ENTRY_NAME_INVALID');
});

test('RB-06 failure output shape is exact', async () => {
  const bridge = await loadBridge();
  const result = bridge.materializeDocxPackageInventoryFromZipBytes(null);

  assertFailureShape(result);
  assert.equal(result.ok, false);
  assert.equal(result.type, 'docxZipInventoryMaterialization');
  assert.equal(result.status, 'rejected');
  assert.equal(result.code, 'DOCX_ZIP_BYTES_INPUT_INVALID');
  assert.equal(result.reason, 'DOCX_ZIP_BYTES_INPUT_INVALID');
  assert.deepEqual(diagnosticCodes(result), ['DOCX_ZIP_BYTES_INPUT_INVALID']);
  assert.equal(result.bounds.MAX_RELATIONSHIP_ENTRIES, 64);
  assert.equal(result.bounds.MAX_UNSUPPORTED_STORY_ENTRIES, 32);
});

test('RB-06 implementation section has only allowed binary materializer tokens', () => {
  const text = fs.readFileSync(MODULE_PATH, 'utf8');
  const sectionStart = text.indexOf('RB_06_DOCX_ZIP_INVENTORY_MATERIALIZER_START');
  const sectionEnd = text.indexOf('RB_06_DOCX_ZIP_INVENTORY_MATERIALIZER_END');
  const section = text.slice(sectionStart, sectionEnd);
  const forbiddenPatterns = [
    /\bfs\b/u,
    /\breadFile\b/u,
    /\bwriteFile\b/u,
    /\bcreateReadStream\b/u,
    /\bpath\b/u,
    /\bipc\b/u,
    /\belectron\b/u,
    /\bfetch\b/u,
    /\bhttp\b/u,
    /\bhttps\b/u,
    /\bJSZip\b/u,
    /\byauzl\b/u,
    /\badmzip\b/u,
    /\bunzip\b/u,
    /\binflate\b/u,
    /\bdeflate\b/u,
    /\bDOMParser\b/u,
    /\bXMLParser\b/u,
    /\bxmldom\b/u,
    /\bsax\b/u,
    /\bfast-xml-parser\b/u,
    /\breviewPacket\b/u,
    /\bpreviewInput\b/u,
    /\brevisionBridgePreviewResult\b/u,
    /\bcanApply\b/u,
    /\bapplyPlan\b/u,
  ];

  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1);
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(section), false, `forbidden RB-06 pattern: ${pattern.source}`);
  }
  assert.equal(/\bBuffer\b/u.test(section), true);
  assert.equal(/\bUint8Array\b/u.test(section), true);
  assert.equal(/\bArrayBuffer\b/u.test(section), true);
  assert.equal(/\bDataView\b/u.test(section), true);
});

test('RB-06 changed files stay inside the exact task allowlist', () => {
  const changedFiles = changedFilesFromGitStatus(
    execFileSync('git', ['status', '--porcelain', '-uall'], { encoding: 'utf8' }),
  );

  assert.deepEqual(changedFilesOutsideAllowlist(changedFiles), []);
});

test('RB-06 changed-file allowlist still rejects outside paths', () => {
  assert.deepEqual(changedFilesOutsideAllowlist([]), []);
  assert.deepEqual(changedFilesOutsideAllowlist([TEST_PATH]), []);
  assert.deepEqual(changedFilesOutsideAllowlist(ALLOWLIST), []);
  assert.deepEqual(
    changedFilesOutsideAllowlist([
      `tmp/${path.basename(TEST_PATH)}`,
      'tmp/rb06-probe-unique.js',
    ]),
    [
      `tmp/${path.basename(TEST_PATH)}`,
      'tmp/rb06-probe-unique.js',
    ],
  );
});
