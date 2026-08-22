const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');

const BRIDGE_PATH = 'src/io/revisionBridge/index.mjs';
const PARSER_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const MAIN_PATH = 'src/main.js';
const WORKER_PATH = 'src/main/rtkDocxReturnIntakeWorker.cjs';
const TEST_PATH = 'test/contracts/rtk-zip01-budget-crc-evidence.contract.test.js';
const CATALOG_PATH = 'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json';
const ALLOWLIST = [
  // ZIP-01 Pass 2c fixture repair (real CRC32 in builder headers).
  '.github/workflows/rtk-required.yml',
  'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
  'test/contracts/revision-bridge-docx-review-preview-session.contract.test.js',
  TEST_PATH,
  'package.json',
  CATALOG_PATH,
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_RECEIPT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_CHECKPOINT.json',
  'docs/OPS/RTK/GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_RELEASE_APPLICABILITY_INVALIDATION_GRAPH_V1_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_RELEASE_CLAIM_PUBLICATION_V1_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_OFFLINE_RELEASE_CLAIM_COMPILER_V0_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_RTK_STREAMING_ORCH_PROCESS_CAPABILITY_REPAIR_V1_RECEIPT.json',
  'docs/OPS/RTK/YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json',
  'docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json',
  'docs/OPS/RTK/YALKEN_INTEROP_TERMINAL_CLAIM_REGISTRY_V1.json',
  'docs/OPS/RTK/YALKEN_INTEROP_MULTI_ROUND_LINEAGE_RECEIPT_V1.json',
  'docs/OPS/RTK/YALKEN_R24_W0_WORD_PHYSICAL_RECERTIFICATION_RECEIPT_V1.json',
  'scripts/ops/google-docs-real-account-e2e-v1.mjs',
  'scripts/ops/google-docs-real-account-whole-book-e2e-v1.mjs',
  'scripts/ops/r24/word-physical-recertification-w0.mjs',
  'scripts/ops/rtk-interop-c1-word-fullbook-route-v1.mjs',
  'scripts/ops/rtk-interop-chain-matrix-v1.mjs',
  'scripts/ops/rtk-release-applicability-invalidation-graph-v1.mjs',
  'scripts/ops/rtk-release-claim-publication-v1.mjs',
  'scripts/ops/rtk-release-claim-compiler-v0.mjs',
  'src/export/docx/fullManuscriptDocxReviewPacketSource.js',
  'src/product/projectLease.mjs',
  'scripts/ops/rtk-word-c5v2-physical-canary.mjs',
  'scripts/ops/rtk-word-c5v2-terminal-orchestrator.mjs',
  'test/contracts/rtk-google-docs-real-account-e2e.contract.test.js',
  'test/contracts/rtk-google-docs-real-account-whole-book-e2e.contract.test.js',
  'test/contracts/rtk-evidence-stale-green-guard.contract.test.js',
  'test/contracts/rtk-release-applicability-invalidation-graph-v1.contract.test.js',
  'test/contracts/rtk-release-claim-publication-v1.contract.test.js',
  'test/contracts/rtk-release-claim-compiler-v0.contract.test.js',
  'test/contracts/rtk-word-c5v2-full-manuscript-product-export.contract.test.js',
  'test/contracts/rtk-word-saturation-c02-authority-carrier.contract.test.js',
  'test/contracts/rtk-interop-c1-word-fullbook-route.contract.test.js',
  'test/contracts/rtk-interop-chain-matrix.contract.test.js',
  'test/contracts/rtk-g0b-feasibility.contract.test.js',
  'test/contracts/rtk-test-graph-catalog.contract.test.js',
  'test/contracts/rtk-w1-no-write-vertical-slice.contract.test.js',
  'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js',
  'test/contracts/rtk-word-c5v2-noop-baseline.contract.test.js',
  'test/contracts/rtk-word-c5v2-comment-lifecycle-return-runtime.contract.test.js',
  'test/contracts/rtk-word-c5v2-pr1414-audit-hold-repair.contract.test.js',
  'test/contracts/rtk-word-c5v2-round-checkpoint.contract.test.js',
  'test/contracts/rtk-word-c5v2-terminal-orchestrator.contract.test.js',
  'test/contracts/yalken-atlas-v5-final-audit-p0-01-future-schema-loss.contract.test.js',
  'test/contracts/yalken-atlas-v6-a4-bounded-repair.contract.test.js',
  'test/unit/r24-w0-word-physical-mutants.test.js',
  'test/unit/r24-w0-word-physical-recertification.test.js',
  // ZIP-01 Pass 2 write-set (7 implementation files + materializer contract).
  'src/io/revisionBridge/reviewTransportZipEvidenceV1.mjs',
  'src/io/revisionBridge/index.mjs',
  'src/io/revisionBridge/reviewTransportPackageParserV2.mjs',
  'src/io/revisionBridge/reviewTransportCore.mjs',
  'src/main.js',
  'src/main/rtkDocxReturnIntakeWorker.cjs',
  'test/contracts/revision-bridge-docx-zip-inventory-materializer.contract.test.js',
  // EVID-01 Pass 2 write-set: packet module + contract test refinement.
  'src/io/revisionBridge/reviewTransportReturnEvidenceV1.mjs',
  'test/contracts/rtk-evid01-return-evidence-packet.contract.test.js',
  'test/contracts/rtk-word-n3-formatting-return.contract.test.js',
  'test/contracts/rtk-word-n4-structural-return.contract.test.js',
  'test/contracts/rtk-zip01-budget-crc-evidence.contract.test.js',
  'src/io/revisionBridge/reviewTransportPackageParserV2.mjs',
  // MULTI-01 Pass 2 write-set: multi-scene scope typed blocked until decisive
  // K-MS SIGKILL crash proof. Runtime seam + claim flip, capability surfaces,
  // router narrative, CONTEXT truth, and the claim-pin amendments that align
  // legacy overclaim pins with the typed blocked runtime.
  'src/io/revisionBridge/reviewTransportMultiSceneNonOverlapTrackedReplacementRuntime.mjs',
  'src/export/docx/fullManuscriptDocxReviewReturnRouter.js',
  'docs/OPS/STATUS/YALKEN_WORD_C5V2_TERMINAL_ACCEPTANCE_MATRIX_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/CONTEXT.md',
  'test/contracts/rtk-multi01-multi-scene-scope-blocked.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-multiscene-atomic-comment-state-closure.contract.test.js',
  'test/contracts/rtk-word-safety-c2-multiscene-command-path.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-postmerge-truth-rebind.contract.test.js',
  'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
  // MULTI-01 Pass 2: closure evaluator accepts the typed blocked profile cell.
  'scripts/ops/rtk-word-release-audit-p0-multiscene-atomic-comment-state-closure.mjs',
];

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ---------------------------------------------------------------------------
// CRC32 (table-based, IEEE polynomial) — port for fixture construction.
// ---------------------------------------------------------------------------
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32Bytes(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function cryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto
        .createHmac('sha256', Buffer.from(String(secret || ''), 'utf8'))
        .update(Buffer.from(stableJson(value), 'utf8'))
        .digest('hex')}`;
    },
    crc32(value) {
      return crc32Bytes(value);
    },
  };
}

// ---------------------------------------------------------------------------
// ZIP fixture builder — writes STORED (method=0) entries with real CRCs in
// both local (offset 14) and central (offset 16) headers. Allows tampering
// CRC fields per-entry to model stale/divergent evidence.
// ---------------------------------------------------------------------------
function zipBytes(entries, options = {}) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(String(entry.content ?? ''), 'utf8');
    const realCrc = crc32Bytes(content);
    const localCrc = Number.isSafeInteger(entry.localCrc) ? entry.localCrc : realCrc;
    const centralCrc = Number.isSafeInteger(entry.centralCrc) ? entry.centralCrc : localCrc;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(localCrc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(centralCrc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  const prefix = options.prefix ?? Buffer.alloc(0);
  return Buffer.concat([...prefix, ...localParts, centralDirectory, end]);
}

function documentXml(body) {
  return `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`;
}

function contentTypesXml() {
  return '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
}

function relsXml() {
  return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
}

// Minimal honest DOCX package (stored, real CRCs).
function honestDocxBytes() {
  return zipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml() },
    { name: '_rels/.rels', content: relsXml() },
    { name: 'word/document.xml', content: documentXml('<w:p><w:r><w:t>body</w:t></w:r></w:p>') },
  ]);
}

async function loadBridge() {
  return import(pathToFileURL(path.join(process.cwd(), BRIDGE_PATH)).href);
}

async function loadParser() {
  return import(pathToFileURL(path.join(process.cwd(), PARSER_PATH)).href);
}

function loadWorker() {
  return require(path.join(process.cwd(), WORKER_PATH));
}

function hasReason(result, code) {
  return (Array.isArray(result?.reasons) ? result.reasons : []).some((reason) => reason.code === code);
}

function reasonCodes(result) {
  return (Array.isArray(result?.reasons) ? result.reasons : []).map((reason) => reason.code);
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

// ===========================================================================
// Z1 — stale actual CRC rejected (content tampered, old CRC fields retained)
// ===========================================================================
test('ZIP01-Z1-stale-actual-crc-rejected', async () => {
  const bridge = await loadBridge();
  const original = Buffer.from(documentXml('<w:p><w:r><w:t>body</w:t></w:r></w:p>'), 'utf8');
  const originalCrc = crc32Bytes(original);

  // Same length, different content → different real CRC, but we keep STALE CRC.
  const tampered = Buffer.from(documentXml('<w:p><w:r><w:t>zody</w:t></w:r></w:p>'), 'utf8');
  assert.equal(tampered.length, original.length, 'fixture keeps equal length');
  assert.notEqual(crc32Bytes(tampered), originalCrc, 'tamper changes real CRC');

  const bytes = zipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml() },
    { name: '_rels/.rels', content: relsXml() },
    { name: 'word/document.xml', content: tampered, localCrc: originalCrc, centralCrc: originalCrc },
  ]);

  const result = bridge.extractDocxReviewTransportPackagePartsFromZipBytes(bytes, {
    cryptoPort: cryptoPort(),
  });

  // CURRENT: stale CRC passes because intake never reads CRC (RED).
  // TARGET: typed rejection of CRC_MISMATCH family.
  assert.equal(
    result.ok,
    false,
    'RED reason: intake does not read central/local CRC; stale CRC is admitted. TARGET: RTK_ZIP_CRC_MISMATCH rejection.',
  );
  assert.equal(
    reasonCodes(result).some((code) => code.includes('CRC')) || /CRC/u.test(result.code || ''),
    true,
    'RED reason: no CRC-family reason code exists. TARGET: RTK_ZIP_CRC_MISMATCH or DOCX_ZIP_*_CRC_MISMATCH.',
  );
});

// ===========================================================================
// Z2 — central/local CRC divergence rejected (content valid, headers disagree)
// ===========================================================================
test('ZIP01-Z2-central-local-crc-divergence-rejected', async () => {
  const bridge = await loadBridge();
  const content = documentXml('<w:p><w:r><w:t>body</w:t></w:r></w:p>');
  const realCrc = crc32Bytes(content);

  const bytes = zipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml() },
    { name: '_rels/.rels', content: relsXml() },
    { name: 'word/document.xml', content, localCrc: realCrc, centralCrc: (realCrc ^ 0xdeadbeef) >>> 0 },
  ]);

  const result = bridge.extractDocxReviewTransportPackagePartsFromZipBytes(bytes, {
    cryptoPort: cryptoPort(),
  });

  // CURRENT: divergence passes because neither parser reads CRC (RED).
  // TARGET: typed LOCAL_CENTRAL_MISMATCH rejection.
  assert.equal(
    result.ok,
    false,
    'RED reason: intake does not compare central vs local CRC. TARGET: RTK_ZIP_LOCAL_CENTRAL_MISMATCH rejection.',
  );
  assert.equal(
    reasonCodes(result).some((code) => /LOCAL_CENTRAL|LOCAL_CENTRAL_CRC/u.test(code))
      || /LOCAL_CENTRAL/u.test(result.code || ''),
    true,
    'RED reason: no local/central CRC mismatch code. TARGET: RTK_ZIP_LOCAL_CENTRAL_MISMATCH family.',
  );
});

// ===========================================================================
// Z3 — missing CRC evidence rejected (legacy-shaped inventory without CRC)
// ===========================================================================
test('ZIP01-Z3-missing-crc-evidence-rejected', async () => {
  const parser = await loadParser();
  // Legacy-shaped inventory exactly like the live intake output today:
  // entries carry name/byteSize/compressedSize/dataStart/dataEnd but NO CRC.
  const legacyInventory = {
    eocdCount: 1,
    entries: [
      {
        name: 'word/document.xml',
        byteSize: 42,
        compressedSize: 42,
        dataStart: 0,
        dataEnd: 42,
      },
    ],
  };
  const parts = baseParts();

  const result = parser.parseReviewTransportPackageV2(
    { parts, zipInventory: legacyInventory },
    { cryptoPort: cryptoPort() },
  );

  // CURRENT: evaluateZipInventory silently skips CRC because entries have no
  // centralCrc32 and cryptoPort.crc32 guard requires centralCrc (RED).
  // TARGET: missing evidence is rejection, not skip.
  const crcMissingReason = hasReason(result, 'RTK_ZIP_CRC_EVIDENCE_MISSING');
  assert.equal(
    crcMissingReason || (/CRC_EVIDENCE_MISSING/u.test(result.code || '')),
    true,
    'RED reason: missing CRC evidence silently skipped. TARGET: RTK_ZIP_CRC_EVIDENCE_MISSING reason/rejection.',
  );
});

// ===========================================================================
// Z4 — caller entry clamp (maxZipEntries honored from caller budgets)
// ===========================================================================
test('ZIP01-Z4-caller-entry-clamp', async () => {
  const parser = await loadParser();
  const inventory = {
    eocdCount: 1,
    entries: [
      entryRecord('word/document.xml'),
      entryRecord('word/comments.xml'),
      entryRecord('word/styles.xml'),
    ],
  };
  const parts = baseParts();

  const result = parser.parseReviewTransportPackageV2(
    { parts, zipInventory: inventory, budgets: { maxZipEntries: 2 } },
    { cryptoPort: cryptoPort() },
  );

  // CURRENT: maxZipEntries frozen at 512; caller 2 is widened by normalizeBudgets.
  // TARGET: caller clamp 2 rejects before any part inflation.
  const budgetExceeded = hasReason(result, 'RTK_BUDGET_EXCEEDED') || result.code === 'RTK_BUDGET_EXCEEDED';
  assert.equal(
    budgetExceeded,
    true,
    'RED reason: normalizeBudgets ignores caller maxZipEntries; frozen 512 admits 3. TARGET: clamp to 2 → budget rejection.',
  );
  if (budgetExceeded) {
    const zipReason = (result.reasons || []).find((reason) => reason.code === 'RTK_BUDGET_EXCEEDED' && /zip/u.test(reason.field || ''));
    assert.ok(
      zipReason,
      'RED reason: rejection should be on zip.entries field from caller clamp. TARGET: field zip.entries, limit 2.',
    );
  }
});

// ===========================================================================
// Z5 — worker accepts transferable bytes (no base64)
// ===========================================================================
test('ZIP01-Z5-worker-accepts-transferable-bytes', async () => {
  const worker = loadWorker();
  const bytes = honestDocxBytes();

  // Case A: Uint8Array bytes directly, no bytesBase64.
  const result = await worker.run({
    bytes: new Uint8Array(bytes),
    requestId: 'req-z5',
  });

  // CURRENT: run() decodes bytesBase64 only; empty bytes → RTK_RETURN_INTAKE_BYTES_REQUIRED.
  // TARGET: accepts bytes directly and works.
  assert.notEqual(
    result.code,
    'RTK_RETURN_INTAKE_BYTES_REQUIRED',
    'RED reason: worker.run rejects transferable bytes; it only decodes bytesBase64. TARGET: accept bytes.',
  );

  // Case B: ArrayBuffer bytes directly, no bytesBase64.
  const resultAb = await worker.run({
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    requestId: 'req-z5-ab',
  });
  assert.notEqual(
    resultAb.code,
    'RTK_RETURN_INTAKE_BYTES_REQUIRED',
    'RED reason: worker.run rejects ArrayBuffer transferable bytes. TARGET: accept ArrayBuffer.',
  );

  // Source pin: main.js must NOT send bytesBase64 to the worker on the live path.
  const mainSource = fs.readFileSync(path.join(process.cwd(), MAIN_PATH), 'utf8');
  assert.equal(
    /bytesBase64/u.test(mainSource),
    false,
    'RED reason: main.js still sends bytesBase64 in postMessage path. TARGET: no bytesBase64 in source.',
  );
});

// ===========================================================================
// Z6 — pre-inflate part budget (effective budget, not 32 MiB host bound)
// ===========================================================================
test('ZIP01-Z6-pre-inflate-part-budget', async () => {
  const bridge = await loadBridge();
  // 11 MiB uncompressed part (> 10 MiB V6 maxInflatedPartBytes, < 32 MiB host bound).
  const bigContent = Buffer.alloc(11 * 1024 * 1024, 0x61);
  // Add minimal XML wrapping so the part is still .xml-extracted; content stays > 10MiB.
  const doc = Buffer.concat([Buffer.from(documentXml(''), 'utf8'), bigContent]);

  const bytes = zipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml() },
    { name: '_rels/.rels', content: relsXml() },
    { name: 'word/document.xml', content: doc },
  ]);

  const result = bridge.extractDocxReviewTransportPackagePartsFromZipBytes(bytes, {
    cryptoPort: cryptoPort(),
  });

  // CURRENT: maxPartBytes defaults to DOCX_REVIEW_PREFLIGHT_BOUNDS.maxTargetPartBytes
  // which equals 32 MiB, so 11 MiB is admitted (RED).
  // TARGET: effective budget maxInflatedPartBytes=10MiB rejects pre-inflate.
  assert.equal(
    result.ok,
    false,
    'RED reason: intake uses 32 MiB host bound, not 10 MiB effective V6 ceiling. TARGET: part-bytes budget rejection.',
  );
  assert.equal(
    reasonCodes(result).some((code) => code.includes('BUDGET'))
      || /BUDGET|PART_BYTES/u.test(result.code || ''),
    true,
    'RED reason: no effective-budget rejection. TARGET: RTK_BUDGET_EXCEEDED part-bytes pre-inflate.',
  );
});

// ===========================================================================
// Z7 — effective budget object + digest (min-clamped, recorded)
// ===========================================================================
test('ZIP01-Z7-effective-budget-object-digest', async () => {
  const parser = await loadParser();
  const parts = baseParts();

  const result = parser.parseReviewTransportPackageV2(
    { parts, budgets: { maxBlocks: 100000 } },
    { cryptoPort: cryptoPort() },
  );

  // CURRENT: normalizeBudgets spreads 100000 over frozen 50000 (silent widen);
  // no effectiveBudgets/effectiveBudgetDigest fields (RED).
  // TARGET: min-clamped effective budget object + sha256 digest + clamp record.
  assert.ok(
    result.effectiveBudgets && typeof result.effectiveBudgets === 'object',
    'RED reason: no effectiveBudgets field on analysis result. TARGET: min-clamped effective budget object.',
  );
  assert.ok(
    typeof result.effectiveBudgetDigest === 'string' && /sha256:/u.test(result.effectiveBudgetDigest),
    'RED reason: no effectiveBudgetDigest field. TARGET: sha256:... digest of effective budget.',
  );
  assert.equal(
    result.effectiveBudgets?.maxBlocks,
    50000,
    'RED reason: normalizeBudgets silently widens caller 100000 to frozen 50000. TARGET: clamp to declared ceiling.',
  );
  const clamps = result.budgetClamps || result.clampedFields || result.effectiveBudgetClamps;
  assert.ok(
    Array.isArray(clamps) && clamps.some((entry) => /maxBlocks/u.test(typeof entry === 'string' ? entry : (entry?.field || JSON.stringify(entry)))),
    'RED reason: clamp fact not recorded. TARGET: budgetClamps/clampedFields records maxBlocks clamp.',
  );
});

// ===========================================================================
// Z8 — CONTROL 50k: caller budgets on formatting extractor stay green
// ===========================================================================
test('ZIP01-Z8-control-50k-formatting-extractor-green', async () => {
  const parser = await loadParser();
  const body = Array.from({ length: 5 }, (_, index) => (
    `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>paragraph ${index + 1}</w:t></w:r></w:p>`
  )).join('');

  const result = parser.extractReviewTransportFormattingRunsV2(documentXml(body), {
    cryptoPort: cryptoPort(),
    budgets: {
      maxBlocks: 50_000,
      maxRevisions: 50_000,
      maxComments: 50_000,
      maxCandidates: 50_000,
    },
  });

  // CONTROL — green now and after implementation.
  assert.equal(result.ok, true);
  assert.equal(result.paragraphs.length, 5);
  assert.equal(result.paragraphs[0].paragraphText, 'paragraph 1');
});

// ===========================================================================
// Z9 — CONTROL honest package: ok + stable digest before/after
// ===========================================================================
test('ZIP01-Z9-control-honest-package-ok-and-stable-digest', async () => {
  const bridge = await loadBridge();
  const bytes = honestDocxBytes();

  const result = bridge.buildDocxReviewTransportAnalysisFromZipBytes(bytes, {
    cryptoPort: cryptoPort(),
  });

  // CONTROL — green now and after implementation.
  assert.equal(result.ok, true, 'honest minimal DOCX must parse ok now and after ZIP-01 implementation');

  // Pin a digest over the byte-exact analysis output (stable across runs).
  const digest = cryptoPort().sha256Json({
    analysisDigest: result.analysisDigest,
    parserProfileDigest: result.parserProfileDigest,
    supportedSemanticDigest: result.supportedSemanticDigest,
    sourceMode: result.sourceMode,
  });

  // Determinism: re-run must yield byte-identical digest.
  const result2 = bridge.buildDocxReviewTransportAnalysisFromZipBytes(bytes, {
    cryptoPort: cryptoPort(),
  });
  const digest2 = cryptoPort().sha256Json({
    analysisDigest: result2.analysisDigest,
    parserProfileDigest: result2.parserProfileDigest,
    supportedSemanticDigest: result2.supportedSemanticDigest,
    sourceMode: result2.sourceMode,
  });
  assert.equal(digest, digest2, 'honest package analysis digest must be deterministic across runs');
  assert.match(digest, /^sha256:[0-9a-f]{64}$/u);
});

// ===========================================================================
// Z10 — zero-CRC-on-non-empty-content bypass rejected (PASS 2b hardening)
//
// PASS 2 left a bypass in evaluateZipCrcEvidence: a zero central CRC was
// treated as a "legacy-fixture sentinel" that skipped the actual recompute,
// so forged {centralCrc32:0, localCrc32:0} on NON-EMPTY tampered content
// passed without a single reason (probe confirmed reasons=[], BYPASS_PRESENT).
// Spec §30.3 forbids an integrity PASS when CRC evidence is absent. This test
// proves the bypass is closed on three levels (unit helper, parser inventory,
// bridge intake analysis) while keeping legit empty parts admissible.
// ===========================================================================
test('ZIP01-Z10-zero-crc-nonempty-bypass-rejected', async () => {
  const { evaluateZipCrcEvidence, crc32 } = await import(pathToFileURL(
    path.join(process.cwd(), 'src/io/revisionBridge/reviewTransportZipEvidenceV1.mjs'),
  ).href);

  // Non-empty tampered content carrying a forged zero central+local CRC.
  const tampered = documentXml('<w:p><w:r><w:t>zody</w:t></w:r></w:p>');
  assert.ok(tampered.length > 0, 'forged content is non-empty');

  // (A) Unit level: the shared helper must emit RTK_ZIP_CRC_EVIDENCE_MISSING.
  const forgedEntry = {
    name: 'word/document.xml',
    centralCrc32: 0,
    localCrc32: 0,
    byteSize: tampered.length,
  };
  const forgedParts = { 'word/document.xml': tampered };
  const unitReasons = evaluateZipCrcEvidence(forgedEntry, forgedParts, crc32);
  assert.equal(
    unitReasons.some((reason) => reason.code === 'RTK_ZIP_CRC_EVIDENCE_MISSING'),
    true,
    'zero central CRC on non-empty content must produce RTK_ZIP_CRC_EVIDENCE_MISSING (no bypass).',
  );

  // (B) Parser inventory level: a forged inventory entry is rejected.
  const parser = await loadParser();
  const parserResult = parser.parseReviewTransportPackageV2(
    { parts: forgedParts, zipInventory: { eocdCount: 1, entries: [forgedEntry] } },
    { cryptoPort: cryptoPort() },
  );
  assert.equal(
    hasReason(parserResult, 'RTK_ZIP_CRC_EVIDENCE_MISSING'),
    true,
    'parser evaluateZipInventory must reject zero-CRC non-empty entry.',
  );

  // (C) Bridge intake analysis level: forged ZIP bytes with zero CRC on the
  // non-empty document part must be rejected (this is the real bypass vector).
  const bridge = await loadBridge();
  const forgedBytes = zipBytes([
    { name: '[Content_Types].xml', content: contentTypesXml() },
    { name: '_rels/.rels', content: relsXml() },
    { name: 'word/document.xml', content: tampered, localCrc: 0, centralCrc: 0 },
  ]);
  const analysis = bridge.buildDocxReviewTransportAnalysisFromZipBytes(forgedBytes, {
    cryptoPort: cryptoPort(),
  });
  assert.equal(
    hasReason(analysis, 'RTK_ZIP_CRC_EVIDENCE_MISSING'),
    true,
    'bridge intake analysis must reject forged zero-CRC non-empty document part.',
  );

  // CONTROL: a genuinely empty part (no bytes, byteSize 0) keeps the legit
  // zero CRC. crc32 of an empty stream is 0, so zero is correct evidence there.
  const emptyEntry = {
    name: 'word/empty.xml',
    centralCrc32: 0,
    localCrc32: 0,
    byteSize: 0,
  };
  const emptyParts = { 'word/empty.xml': '' };
  const emptyReasons = evaluateZipCrcEvidence(emptyEntry, emptyParts, crc32);
  assert.equal(
    emptyReasons.some((reason) => reason.code === 'RTK_ZIP_CRC_EVIDENCE_MISSING'),
    false,
    'legit empty part with zero CRC must stay admissible (control).',
  );
});

// ---------------------------------------------------------------------------
// Boundary guards (scope discipline — no dirty-tree regression).
// ---------------------------------------------------------------------------
test('ZIP01 changed files stay inside the exact task allowlist', () => {
  const changedFiles = changedFilesFromGitStatus(
    execFileSync('git', ['status', '--porcelain', '-uall'], { encoding: 'utf8' }),
  );
  assert.deepEqual(changedFilesOutsideAllowlist(changedFiles), []);
});

test('ZIP01 changed-file allowlist still rejects outside paths', () => {
  assert.deepEqual(changedFilesOutsideAllowlist([]), []);
  assert.deepEqual(changedFilesOutsideAllowlist([TEST_PATH]), []);
  assert.deepEqual(changedFilesOutsideAllowlist(ALLOWLIST), []);
  assert.deepEqual(
    changedFilesOutsideAllowlist([`tmp/${path.basename(TEST_PATH)}`, 'src/io/revisionBridge/exactTextApplyJournal.mjs']),
    [`tmp/${path.basename(TEST_PATH)}`, 'src/io/revisionBridge/exactTextApplyJournal.mjs'],
  );
});

// ---------------------------------------------------------------------------
// Helpers used by multiple scenarios above.
// ---------------------------------------------------------------------------
function entryRecord(name) {
  return { name, byteSize: 10, compressedSize: 10, dataStart: 0, dataEnd: 10 };
}

function baseParts() {
  return {
    '[Content_Types].xml': contentTypesXml(),
    '_rels/.rels': relsXml(),
    'word/document.xml': documentXml('<w:p><w:r><w:t>body</w:t></w:r></w:p>'),
  };
}
