const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const TEST_PATH = 'test/contracts/revision-bridge-docx-package-boundary.contract.test.js';
const ZIP_INVENTORY_MATERIALIZER_TEST_PATH = 'test/contracts/revision-bridge-docx-zip-inventory-materializer.contract.test.js';
const HOSTILE_FILE_GATE_TEST_PATH = 'test/contracts/revision-bridge-docx-hostile-file-gate.contract.test.js';
const CONTENT_PREVIEW_TEST_PATH = 'test/contracts/revision-bridge-docx-content-preview.contract.test.js';
const IMPORT_PREVIEW_PLAN_TEST_PATH = 'test/contracts/revision-bridge-docx-import-preview-plan.contract.test.js';
const IMPORT_PREVIEW_COMMAND_SURFACE_TEST_PATH = 'test/contracts/revision-bridge-docx-import-preview-command-surface.contract.test.js';
const GOVERNANCE_APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const RELEASE_CANDIDATE_LOCK_PATH = 'docs/OPS/STATUS/RELEASE_CANDIDATE_LOCK.json';
const W5_STATUS_PATH = 'docs/OPS/RTK/W5_RELEASE_HARDENING_CERTIFICATION_STATUS.json';
const W5_VERIFIER_PATH = 'scripts/ops/rtk-w5-release-hardening-certification.mjs';
const W5_TEST_PATH = 'test/contracts/rtk-w5-release-hardening-certification.contract.test.js';
const WORD_EVIDENCE_TEST_PATH = 'test/contracts/revision-bridge-word-evidence-check.contract.test.js';
const ALLOWLIST = [
  MODULE_PATH,
  TEST_PATH,
  ZIP_INVENTORY_MATERIALIZER_TEST_PATH,
  HOSTILE_FILE_GATE_TEST_PATH,
  CONTENT_PREVIEW_TEST_PATH,
  IMPORT_PREVIEW_PLAN_TEST_PATH,
  IMPORT_PREVIEW_COMMAND_SURFACE_TEST_PATH,
  GOVERNANCE_APPROVALS_PATH,
  RELEASE_CANDIDATE_LOCK_PATH,
  W5_STATUS_PATH,
  W5_VERIFIER_PATH,
  W5_TEST_PATH,
  WORD_EVIDENCE_TEST_PATH,
];

async function loadBridge() {
  return import(pathToFileURL(path.join(process.cwd(), MODULE_PATH)).href);
}

function cleanEntry(overrides = {}) {
  return {
    id: 'word-document',
    kind: 'knownPart',
    byteSize: 2048,
    compressedSize: 512,
    story: 'main',
    markers: ['documentPart'],
    ...overrides,
  };
}

function cleanInventory(overrides = {}) {
  return {
    entries: [cleanEntry()],
    ...overrides,
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
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

function findKeys(value, deniedKeys, pathSegments = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findKeys(item, deniedKeys, pathSegments.concat(String(index))));
  }
  if (!value || typeof value !== 'object') return [];

  return Object.keys(value).flatMap((key) => {
    const keyPath = pathSegments.concat(key);
    const nested = findKeys(value[key], deniedKeys, keyPath);
    return deniedKeys.includes(key) ? [keyPath.join('.'), ...nested] : nested;
  });
}

function diagnosticCodes(result) {
  return result.diagnostics.map((item) => item.code);
}

function assertExactOutputShape(result) {
  assert.deepEqual(Object.keys(result), [
    'ok',
    'type',
    'status',
    'code',
    'reason',
    'classification',
    'diagnostics',
    'budgets',
    'eligibility',
  ]);
  assert.deepEqual(Object.keys(result.eligibility), [
    'safe',
    'parserCandidateOnly',
    'canCreateReviewPacket',
    'canPreviewApply',
    'canImportMutate',
    'canWriteStorage',
  ]);
}

function assertSafeEligibility(result, parserCandidateOnly) {
  assert.equal(result.eligibility.safe, true);
  assert.equal(result.eligibility.parserCandidateOnly, parserCandidateOnly);
  assert.equal(result.eligibility.canCreateReviewPacket, false);
  assert.equal(result.eligibility.canPreviewApply, false);
  assert.equal(result.eligibility.canImportMutate, false);
  assert.equal(result.eligibility.canWriteStorage, false);
}

test('RB-05 exports DOCX package boundary API and constants', async () => {
  const bridge = await loadBridge();

  assert.equal(typeof bridge.inspectDocxPackageInventory, 'function');
  assert.deepEqual(bridge.DOCX_PACKAGE_BOUNDARY_BUDGETS, {
    maxEntries: 512,
    maxTotalBytes: 67108864,
    maxEntryBytes: 33554432,
    maxRelationshipEntries: 64,
    maxUnsupportedStoryEntries: 32,
  });
  assert.equal(
    bridge.DOCX_PACKAGE_BOUNDARY_DIAGNOSTIC_CODES.INVENTORY_BINARY_INPUT_REJECTED,
    'DOCX_INVENTORY_BINARY_INPUT_REJECTED',
  );
});

test('RB-05 accepts only clean inventory as parser candidate', async () => {
  const bridge = await loadBridge();
  const result = bridge.inspectDocxPackageInventory(cleanInventory());

  assertExactOutputShape(result);
  assert.equal(result.ok, true);
  assert.equal(result.type, 'docxPackageInventoryInspection');
  assert.equal(result.status, 'accepted');
  assert.equal(result.code, 'DOCX_PACKAGE_CLEAN');
  assert.equal(result.reason, 'DOCX_PACKAGE_CLEAN');
  assert.equal(result.classification, 'clean');
  assert.deepEqual(result.diagnostics, []);
  assertSafeEligibility(result, true);
});

test('RB-05 classifies suspicious inventory without parser eligibility', async () => {
  const bridge = await loadBridge();
  const cases = [
    [cleanEntry({ id: 'unknown', kind: 'unknownPart' }), 'DOCX_UNKNOWN_PART_PRESENT'],
    [cleanEntry({ id: 'dir', kind: 'directory' }), 'DOCX_DIRECTORY_ENTRY_PRESENT'],
    [cleanEntry({ id: 'rels', kind: 'relationshipPart' }), 'DOCX_RELATIONSHIP_PART_PRESENT'],
    [cleanEntry({ id: 'rels-marker', markers: ['relationship'] }), 'DOCX_RELATIONSHIP_PART_PRESENT'],
    [cleanEntry({ id: 'unsupported-story', story: 'unsupported' }), 'DOCX_UNSUPPORTED_STORY_MARKER_PRESENT'],
    [cleanEntry({ id: 'unsupported-marker', markers: ['unsupportedStory'] }), 'DOCX_UNSUPPORTED_STORY_MARKER_PRESENT'],
  ];

  for (const [entry, code] of cases) {
    const result = bridge.inspectDocxPackageInventory(cleanInventory({ entries: [entry] }));
    assert.equal(result.ok, false);
    assert.equal(result.status, 'degraded');
    assert.equal(result.classification, 'suspicious');
    assert.equal(result.diagnostics[0].severity, 'warning');
    assert.equal(diagnosticCodes(result).includes(code), true);
    assertSafeEligibility(result, false);
  }
});

test('RB-05 reports malformed inventory and entry diagnostics', async () => {
  const bridge = await loadBridge();
  const malformedCases = [
    [null, 'DOCX_INVENTORY_NOT_PLAIN_OBJECT'],
    [[], 'DOCX_INVENTORY_NOT_PLAIN_OBJECT'],
    [{}, 'DOCX_INVENTORY_ENTRIES_MISSING'],
    [{ entries: 'bad' }, 'DOCX_INVENTORY_ENTRIES_INVALID'],
    [{ entries: [null] }, 'DOCX_ENTRY_NOT_OBJECT'],
    [{ entries: [cleanEntry({ id: '' })] }, 'DOCX_ENTRY_ID_INVALID'],
    [{ entries: [cleanEntry({ kind: 'bad' })] }, 'DOCX_ENTRY_KIND_INVALID'],
    [{ entries: [cleanEntry({ byteSize: 1.2 })] }, 'DOCX_ENTRY_BYTE_SIZE_INVALID'],
    [{ entries: [cleanEntry({ compressedSize: -1 })] }, 'DOCX_ENTRY_COMPRESSED_SIZE_INVALID'],
    [{ entries: [cleanEntry({ markers: 'bad' })] }, 'DOCX_ENTRY_MARKERS_INVALID'],
    [{ entries: [cleanEntry({ markers: ['bad'] })] }, 'DOCX_ENTRY_MARKER_INVALID'],
    [{ entries: [cleanEntry({ story: 'bad' })] }, 'DOCX_ENTRY_STORY_INVALID'],
    [{ entries: [cleanEntry({ size: 2 })] }, 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT'],
    [{ entries: [cleanEntry({ bytes: 2 })] }, 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT'],
    [{ entries: [cleanEntry({ length: 2 })] }, 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT'],
    [{ entries: [cleanEntry({ uncompressedSize: 2 })] }, 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT'],
    [{ entries: [cleanEntry({ compressedByteSize: 2 })] }, 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT'],
    [{ entries: [cleanEntry({ rawSize: 2 })] }, 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT'],
    [{ entries: [cleanEntry({ fileSize: 2 })] }, 'DOCX_UNKNOWN_SIZE_FIELD_PRESENT'],
  ];

  for (const [input, code] of malformedCases) {
    const result = bridge.inspectDocxPackageInventory(input);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'rejected');
    assert.equal(result.classification, 'malformed');
    assert.equal(result.diagnostics[0].severity, 'error');
    assert.equal(diagnosticCodes(result).includes(code), true);
    assertSafeEligibility(result, false);
  }
});

test('RB-05 rejects path and binary-like inventory inputs', async () => {
  const bridge = await loadBridge();
  const binaryKey = 'b' + 'ytes';
  const binaryStoreKey = 'b' + 'uffer';
  const filePathKey = 'file' + 'P' + 'ath';
  const pathKey = 'p' + 'ath';
  const cases = [
    ['review.docx', 'DOCX_INVENTORY_PATH_INPUT_REJECTED'],
    [{ [pathKey]: 'review.docx', entries: [] }, 'DOCX_INVENTORY_PATH_INPUT_REJECTED'],
    [{ [filePathKey]: 'review.docx', entries: [] }, 'DOCX_INVENTORY_PATH_INPUT_REJECTED'],
    [{ [binaryKey]: [1, 2, 3], entries: [] }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
    [{ [binaryStoreKey]: [1, 2, 3], entries: [] }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
    [{ byteLength: 3, slice() {} }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
    [{ byteLength: 3, subarray() {} }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
    [{ arrayBuffer() {}, name: 'review.docx' }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
    [{ stream() {} }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
    [{ pipe() {} }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
    [{ getReader() {} }, 'DOCX_INVENTORY_BINARY_INPUT_REJECTED'],
  ];

  for (const [input, code] of cases) {
    const result = bridge.inspectDocxPackageInventory(input);
    assert.equal(result.classification, 'malformed');
    assert.equal(diagnosticCodes(result).includes(code), true);
  }
});

test('RB-05 enforces quarantine budgets using byteSize only', async () => {
  const bridge = await loadBridge();
  const budgets = bridge.DOCX_PACKAGE_BOUNDARY_BUDGETS;
  const manyEntries = Array.from({ length: budgets.maxEntries + 1 }, (_, index) => (
    cleanEntry({ id: `entry-${index}`, byteSize: 1 })
  ));
  const totalEntries = Array.from({ length: 6 }, (_, index) => (
    cleanEntry({ id: `big-${index}`, byteSize: 12 * 1024 * 1024, compressedSize: 1 })
  ));
  const relationshipEntries = Array.from({ length: budgets.maxRelationshipEntries + 1 }, (_, index) => (
    cleanEntry({ id: `rel-${index}`, kind: 'relationshipPart', byteSize: 1 })
  ));
  const unsupportedEntries = Array.from({ length: budgets.maxUnsupportedStoryEntries + 1 }, (_, index) => (
    cleanEntry({ id: `unsupported-${index}`, story: 'unsupported', byteSize: 1 })
  ));
  const cases = [
    [{ entries: manyEntries }, 'DOCX_ENTRY_COUNT_BUDGET_EXCEEDED'],
    [{ entries: totalEntries }, 'DOCX_TOTAL_UNCOMPRESSED_BUDGET_EXCEEDED'],
    [{ entries: [cleanEntry({ id: 'single-big', byteSize: budgets.maxEntryBytes + 1 })] }, 'DOCX_SINGLE_ENTRY_UNCOMPRESSED_BUDGET_EXCEEDED'],
    [{ entries: relationshipEntries }, 'DOCX_RELATIONSHIP_ENTRY_COUNT_BUDGET_EXCEEDED'],
    [{ entries: unsupportedEntries }, 'DOCX_UNSUPPORTED_STORY_COUNT_BUDGET_EXCEEDED'],
  ];

  for (const [input, code] of cases) {
    const result = bridge.inspectDocxPackageInventory(input);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'rejected');
    assert.equal(result.classification, 'quarantined');
    assert.equal(result.diagnostics[0].severity, 'error');
    assert.equal(diagnosticCodes(result).includes(code), true);
    assertSafeEligibility(result, false);
  }

  const compressedOnlyHuge = bridge.inspectDocxPackageInventory(cleanInventory({
    entries: [cleanEntry({ compressedSize: Number.MAX_SAFE_INTEGER })],
  }));
  assert.equal(compressedOnlyHuge.classification, 'clean');
});

test('RB-05 classification precedence is deterministic', async () => {
  const bridge = await loadBridge();
  const malformedQuarantinedSuspicious = bridge.inspectDocxPackageInventory({
    entries: Array.from({ length: bridge.DOCX_PACKAGE_BOUNDARY_BUDGETS.maxEntries + 1 }, (_, index) => (
      cleanEntry({ id: index === 0 ? '' : `entry-${index}`, kind: 'unknownPart', byteSize: 1 })
    )),
  });
  assert.equal(malformedQuarantinedSuspicious.classification, 'malformed');
  assert.equal(malformedQuarantinedSuspicious.diagnostics[0].code, 'DOCX_ENTRY_ID_INVALID');

  const quarantinedSuspicious = bridge.inspectDocxPackageInventory({
    entries: Array.from({ length: bridge.DOCX_PACKAGE_BOUNDARY_BUDGETS.maxEntries + 1 }, (_, index) => (
      cleanEntry({ id: `entry-${index}`, kind: 'unknownPart', byteSize: 1 })
    )),
  });
  assert.equal(quarantinedSuspicious.classification, 'quarantined');
  assert.equal(quarantinedSuspicious.diagnostics[0].code, 'DOCX_ENTRY_COUNT_BUDGET_EXCEEDED');
});

test('RB-05 output shape excludes forbidden transport and parser fields', async () => {
  const bridge = await loadBridge();
  const result = bridge.inspectDocxPackageInventory(cleanInventory());

  assertExactOutputShape(result);
  assert.deepEqual(findKeys(result, [
    'path',
    'paths',
    'zip',
    'xml',
    'document',
    'styles',
    'scenes',
    'assets',
    'content',
    'bytes',
    'buffer',
    'raw',
    'reviewPacket',
    'previewInput',
    'revisionBridgePreviewResult',
    'canApply',
    'apply',
    'applyPlan',
  ]), []);
});

test('RB-05 is deterministic and does not mutate caller input', async () => {
  const bridge = await loadBridge();
  const input = cleanInventory({
    metadata: {
      source: 'unit-test',
    },
  });
  const before = deepClone(input);

  const first = bridge.inspectDocxPackageInventory(input);
  const second = bridge.inspectDocxPackageInventory(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
});

test('RB-05 implementation section has no forbidden side-effect or parser tokens', () => {
  const text = fs.readFileSync(MODULE_PATH, 'utf8');
  const sectionStart = text.indexOf('export const DOCX_PACKAGE_BOUNDARY_BUDGETS');
  const sectionEnd = text.indexOf('function collectForbiddenFieldReasons');
  const section = text.slice(sectionStart, sectionEnd);
  const forbiddenPatterns = [
    /\bfs\b/u,
    /\bpath\b/u,
    /\bBuffer\b/u,
    /\bArrayBuffer\b/u,
    /\bUint8Array\b/u,
    /\bBlob\b/u,
    /\bFile\b/u,
    /\bstream\b/u,
    /\bJSZip\b/u,
    /\bzip\b/u,
    /\bunzip\b/u,
    /\bXMLParser\b/u,
    /\bDOMParser\b/u,
    /\bxmldom\b/u,
    /\bipc\b/u,
    /\belectron\b/u,
    /\bfetch\b/u,
    /\bhttp\b/u,
    /\bhttps\b/u,
    /\breviewPacket\b/u,
    /\bpreviewInput\b/u,
    /\brevisionBridgePreviewResult\b/u,
    /\bcanApply\b/u,
    /\bapplyPlan\b/u,
  ];

  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1);
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(section), false, `forbidden RB-05 pattern: ${pattern.source}`);
  }
});

test('RB-05 changed files stay inside the exact task allowlist', () => {
  const changedFiles = changedFilesFromGitStatus(
    execFileSync('git', ['status', '--porcelain', '-uall'], { encoding: 'utf8' }),
  );

  assert.deepEqual(changedFilesOutsideAllowlist(changedFiles), []);
});

test('RB-05 changed-file allowlist still rejects outside paths', () => {
  assert.deepEqual(changedFilesOutsideAllowlist([]), []);
  assert.deepEqual(changedFilesOutsideAllowlist([TEST_PATH]), []);
  assert.deepEqual(changedFilesOutsideAllowlist(ALLOWLIST), []);
  assert.deepEqual(
    changedFilesOutsideAllowlist([
      `tmp/${path.basename(TEST_PATH)}`,
      'tmp/rb05-probe-unique.js',
    ]),
    [
      `tmp/${path.basename(TEST_PATH)}`,
      'tmp/rb05-probe-unique.js',
    ],
  );
});
