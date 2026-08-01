const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const IR_PATH = 'src/io/revisionBridge/reviewTransportIr.mjs';
const CORE_PATH = 'src/io/revisionBridge/reviewTransportCore.mjs';
const ORACLE_PATH = 'src/io/revisionBridge/reviewTransportOracle.mjs';
const ROUND_STORE_PATH = 'src/io/revisionBridge/reviewTransportRoundStore.mjs';
const TEST_PATH = 'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js';
const C4_ALLOWLIST = [
  '.github/workflows/rtk-required.yml',
  'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_CAPABILITY_MATRIX_V1.json',
  'docs/OPS/RTK/GOOGLE_DOCS_SAFE_ROUNDTRIP_G00_DISCOVERY_RECEIPT.json',
  'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json',
  'docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json',
  'docs/OPS/RTK/WORD_SAFETY_REMEDIATION_V1_C4_TEST_GRAPH_CI_TRUTH_RECEIPT.json',
  'docs/OPS/RTK/WORD_FOR_MAC_STAGE_FORMAL_CLOSURE_RECEIPT.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CANONICAL_BINDING_STATUS.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_RECEIPT.json',
  'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json',
  'package.json',
  'scripts/ops/rtk-google-docs-g00-discovery-binding.mjs',
  'scripts/ops/rtk-post-d1-editor-lab-harness.mjs',
  'scripts/ops/rtk-word-p0-modern-comment-replies-typed-limitation.mjs',
  'scripts/ops/rtk-word-p0-modern-comment-resolve-reopen-typed-limitation.mjs',
  'scripts/ops/rtk-word-p0-multi-round-ledger-reconciliation.mjs',
  'scripts/ops/rtk-word-normalized-capability-matrix.mjs',
  'scripts/ops/rtk-word-p0-scale-envelope-terminal-audit.mjs',
  'scripts/ops/rtk-word-p0-safe-formatting-lane-typed-limitation.mjs',
  'scripts/ops/rtk-word-p0-safe-structural-lane-typed-limitation.mjs',
  'scripts/ops/rtk-word-release-audit-p0-multiscene-atomic-comment-state-closure.mjs',
  'scripts/ops/rtk-word-v4-a03-c03-adjacent-range-negative-oracle.mjs',
  'scripts/ops/rtk-word-v4-a03-c04-modern-comment-state.mjs',
  'scripts/ops/rtk-word-v4-a03-c05-non-overlap-product-path.mjs',
  'scripts/ops/rtk-word-v4-a03-c01-comment-shadow-runtime.mjs',
  'scripts/ops/rtk-word-v4-e12-saturation-ledger.mjs',
  'scripts/ops/rtk-word-v4-e12-stability-limitation-audit.mjs',
  'scripts/run-rtk-tests.mjs',
  'test/contracts/rtk-g0b-feasibility.contract.test.js',
  'test/contracts/rtk-google-docs-g00-discovery-binding.contract.test.js',
  'test/contracts/rtk-post-d1-portability-program.contract.test.js',
  'test/contracts/rtk-test-graph-catalog.contract.test.js',
  'test/contracts/rtk-w1-no-write-vertical-slice.contract.test.js',
  'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js',
  'test/contracts/rtk-word-normalized-capability-matrix.contract.test.js',
  'test/contracts/rtk-word-p0-multi-round-ledger-reconciliation.contract.test.js',
  'test/contracts/rtk-word-p0-scale-envelope-terminal-audit.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-500k-terminal-audit.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-controlled-grant-probe.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-format-unicode-structure-stress.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-large-manuscript-stress.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-postmerge-truth-rebind.contract.test.js',
  'test/contracts/rtk-word-release-audit-p0-repeat-high-density-stress.contract.test.js',
  'test/contracts/rtk-word-safety-c1-effect-reservation.contract.test.js',
  'test/contracts/rtk-word-v4-a03-c04-modern-comment-state.contract.test.js',
  'test/contracts/rtk-word-v4-canonical-integration.contract.test.js',
  'test/contracts/rtk-word-v4-e02-locator-stack-survival.contract.test.js',
  'test/contracts/rtk-word-v4-e06-physical-text-certification.contract.test.js',
  'test/contracts/rtk-word-v4-e07-comments-replies-states.contract.test.js',
  'test/contracts/rtk-word-v4-e08-effective-formatting.contract.test.js',
  'test/contracts/rtk-word-v4-e09-typed-structural-edits.contract.test.js',
  'test/contracts/rtk-word-v4-e10-multi-round-replay-conflicts.contract.test.js',
  'test/contracts/rtk-word-v4-e11-multi-scene-atomic-coordinator.contract.test.js',
  'test/contracts/rtk-word-v4-e12-customxml-authority-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-modern-comment-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-modern-comment-native-ui-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-multi-scene-apply-followup.contract.test.js',
  'test/contracts/rtk-word-v4-e12-saturation-ledger.contract.test.js',
];
const ALLOWLIST = [
  'src/io/revisionBridge/reviewTransportContracts.mjs',
  CORE_PATH,
  IR_PATH,
  ORACLE_PATH,
  ROUND_STORE_PATH,
  'src/io/revisionBridge/reviewTransportApplyCore.mjs',
  'src/io/revisionBridge/reviewTransportApplyStore.mjs',
  'src/io/revisionBridge/reviewTransportExactApply.mjs',
  'test/contracts/rtk-g0b-feasibility.contract.test.js',
  'test/contracts/rtk-w1-no-write-vertical-slice.contract.test.js',
  TEST_PATH,
  'test/contracts/rtk-w3-exact-apply-replay.contract.test.js',
  'scripts/ops/sector-m-scope-map.json',
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
  ...C4_ALLOWLIST,
];

async function loadIr() {
  return import(pathToFileURL(path.join(process.cwd(), IR_PATH)).href);
}

async function loadOracle() {
  return import(pathToFileURL(path.join(process.cwd(), ORACLE_PATH)).href);
}

async function loadRoundStore() {
  return import(pathToFileURL(path.join(process.cwd(), ROUND_STORE_PATH)).href);
}

function makeTempStore() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-w2-analysis-store-'));
}

function documentXml(body) {
  return `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

function commentsXml(body = 'Review note') {
  return `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="7"><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:comment></w:comments>`;
}

test('W2 worker adapter is desktop-only and rejects path writer or network authority', async () => {
  const ir = await loadIr();
  const ready = ir.buildW2WorkerCapabilityAdapter({ timeoutMs: 77 });
  const blocked = ir.buildW2WorkerCapabilityAdapter({
    pathAuthority: true,
    writerAuthority: true,
    networkAuthority: true,
  });

  assert.equal(ready.ok, true);
  assert.equal(ready.canReceivePaths, false);
  assert.equal(ready.canWriteManuscript, false);
  assert.equal(ready.canApply, false);
  assert.equal(ready.networkAccess, false);
  assert.equal(ready.cancellation, 'kill-restart');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reasons.some((reason) => reason.code === 'RTK_WORKER_AUTHORITY_BLOCKED'), true);
  assert.equal(blocked.reasons.some((reason) => reason.code === 'RTK_WORKER_AUTHORITY_BLOCKED'), true);
  assert.equal(blocked.reasons.some((reason) => reason.code === 'RTK_WORKER_AUTHORITY_BLOCKED'), true);
});

test('W2 normative ReviewIR core is platform-neutral and does not use regex XML parsing', () => {
  const coreText = fs.readFileSync(path.join(process.cwd(), CORE_PATH), 'utf8');
  assert.equal(coreText.includes('node:'), false);
  assert.equal(coreText.includes('Buffer'), false);
  assert.equal(coreText.includes('matchAll'), false);
  assert.equal(coreText.includes('new RegExp'), false);
  assert.equal(coreText.includes('namespace-aware-bounded-regex'), false);
});

test('W2 hostile package gates block CRC mismatch local-central mismatch overlap and fake EOCD', async () => {
  const ir = await loadIr();
  const doc = documentXml('<w:p><w:r><w:t>Clean body</w:t></w:r></w:p>');
  const result = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': doc },
    zipInventory: {
      eocdCount: 2,
      entries: [
        {
          name: 'word/document.xml',
          centralCrc32: 1,
          localCrc32: 2,
          dataStart: 10,
          dataEnd: 40,
        },
        {
          name: 'word/comments.xml',
          centralCrc32: ir.w2Crc32('x'),
          localCrc32: ir.w2Crc32('x'),
          dataStart: 35,
          dataEnd: 50,
        },
      ],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canApply, false);
  assert.equal(result.reasons.some((reason) => reason.code === 'RTK_ZIP_FAKE_EOCD'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'RTK_ZIP_LOCAL_CENTRAL_MISMATCH'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'RTK_ZIP_CRC_MISMATCH'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'RTK_ZIP_REGION_OVERLAP'), true);
});

test('W2 malformed XML and duplicate comments hit production parser path with typed blocked outcomes', async () => {
  const ir = await loadIr();
  const malformed = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': documentXml('<w:p><w:ins><w:t>Broken</w:t></w:p>') },
  });
  const duplicateComments = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:commentReference w:id="7"/></w:p>'),
      'word/comments.xml': '<w:comments xmlns:w="urn"><w:comment w:id="7"><w:p><w:r><w:t>First</w:t></w:r></w:p></w:comment><w:comment w:id="7"><w:p><w:r><w:t>Duplicate</w:t></w:r></w:p></w:comment></w:comments>',
    },
  });

  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'RTK_XML_MALFORMED_BLOCKED');
  assert.equal(duplicateComments.ok, true);
  assert.equal(duplicateComments.reviewIr.comments.length, 2);
  assert.equal(duplicateComments.reviewIr.comments[1].status, 'UNSUPPORTED_BLOCKED');
  assert.equal(duplicateComments.reasons.some((reason) => reason.code === 'RTK_COMMENT_UNSUPPORTED'), true);
});

test('W2 parser is namespace and attribute-order stable across chunk boundaries', async () => {
  const ir = await loadIr();
  const a = documentXml('<w:p><w:ins w:id="1" w:author="A"><w:r><w:t>Hello</w:t></w:r></w:ins></w:p>');
  const b = documentXml('<x:p><x:ins x:author="A" x:id="1"><x:r><x:t>Hello</x:t></x:r></x:ins></x:p>');
  const first = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': [a.slice(0, 31), a.slice(31)] },
  });
  const second = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': b },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.sourceMode, 'TRACKED');
  assert.equal(first.supportedSemanticDigest, second.supportedSemanticDigest);
  assert.equal(first.analysisDigest, second.analysisDigest);
  assert.equal(first.reviewIr.changes.length, 1);
});

test('W2 source modes follow V6 and comments stay independent from text lane', async () => {
  const ir = await loadIr();
  const clean = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:r><w:t>Clean body</w:t></w:r></w:p>'),
    },
  });
  const trackedWithComments = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:commentReference w:id="7"/><w:ins><w:r><w:t>New</w:t></w:r></w:ins></w:p>'),
      'word/comments.xml': commentsXml('Keep me'),
      'word/commentsExtended.xml': '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:commentEx w15:paraId="abc" w15:done="1"/></w15:commentsEx>',
    },
  });
  const mixed = ir.buildW2ReviewIr({
    untrackedDrift: true,
    parts: {
      'word/document.xml': documentXml('<w:p><w:commentReference w:id="7"/><w:ins><w:r><w:t>New</w:t></w:r></w:ins></w:p>'),
      'word/comments.xml': commentsXml('Keep me'),
    },
  });

  assert.equal(clean.ok, true);
  assert.equal(clean.sourceMode, 'CLEAN');
  assert.equal(clean.reasons.some((reason) => reason.code === 'RTK_MANUAL_CLEAN_RETURN'), true);
  assert.equal(trackedWithComments.ok, true);
  assert.equal(trackedWithComments.sourceMode, 'TRACKED');
  assert.equal(trackedWithComments.reviewIr.comments.length, 1);
  assert.equal(trackedWithComments.reviewIr.comments[0].bodyExcerpt, 'Keep me');
  assert.equal(trackedWithComments.reviewIr.modernCommentMetadata.length, 1);
  assert.equal(trackedWithComments.reviewIr.modernCommentMetadata[0].done, true);
  assert.equal(trackedWithComments.reviewIr.comments[0].status, 'RESOLVED');
  assert.equal(trackedWithComments.reasons.some((reason) => reason.code === 'RTK_COMMENT_RESOLVED'), true);
  assert.equal(mixed.ok, true);
  assert.equal(mixed.sourceMode, 'MIXED');
  assert.equal(mixed.reasons.some((reason) => reason.code === 'RTK_MANUAL_MIXED_RETURN'), true);
});

test('W2 paragraph marks and move revisions are structural and never lower to operations', async () => {
  const ir = await loadIr();
  const result = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:pPr><w:pPrChange w:id="3"/></w:pPr><w:moveFrom><w:r><w:t>Moved</w:t></w:r></w:moveFrom></w:p>'),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.reviewIr.changes[0].classification, 'STRUCTURAL_BLOCKED');
  assert.equal(result.reviewIr.changes[0].reasonCode, 'RTK_BLOCKED_MOVE_REVISION');
  assert.equal(result.reasons.some((reason) => reason.code === 'RTK_STRUCTURAL_PARAGRAPH_MARK_INSERTED'), true);
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canApply, false);
});

test('W2 analysis branch store reuses same key and creates new branch for parser profile changes', async () => {
  const ir = await loadIr();
  const store = await loadRoundStore();
  const storeRoot = makeTempStore();
  const base = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': documentXml('<w:p><w:ins><w:t>A</w:t></w:ins></w:p>') },
  });
  const widerBudget = ir.buildW2ReviewIr({
    parts: { 'word/document.xml': documentXml('<w:p><w:ins><w:t>A</w:t></w:ins></w:p>') },
    budgets: { maxChanges: 64 },
  });

  const first = await store.commitW2AnalysisBranch(storeRoot, {
    roundId: 'round-w2',
    ...base,
    reviewIr: base.reviewIr,
  });
  const reused = await store.commitW2AnalysisBranch(storeRoot, {
    roundId: 'round-w2',
    ...base,
    reviewIr: base.reviewIr,
  });
  const nextProfile = await store.commitW2AnalysisBranch(storeRoot, {
    roundId: 'round-w2',
    ...widerBudget,
    reviewIr: widerBudget.reviewIr,
  });

  assert.equal(first.status, 'committed');
  assert.equal(reused.status, 'reused');
  assert.match(first.branchId, /^profile-[a-f0-9]{64}$/u);
  assert.match(first.analysisKey, /^[a-f0-9]{64}$/u);
  assert.match(first.recordWrite.sha256, /^[a-f0-9]{64}$/u);
  assert.notEqual(first.record.recordChecksum, first.record.analysisDigest);
  assert.equal(nextProfile.status, 'committed');
  assert.notEqual(first.branchId, nextProfile.branchId);
});

test('W2 parser bake-off rejects regex XML parser and selects bounded scanner without dependency', async () => {
  const contracts = await import(pathToFileURL(path.join(process.cwd(), 'src/io/revisionBridge/reviewTransportContracts.mjs')).href);
  const result = contracts.compareParserCandidates([
    {
      id: 'regex-tokenizer',
      correctness: 'pass',
      boundedAuditability: true,
      regexXmlParser: true,
      namespaceAware: true,
      chunkBoundaryInvariant: true,
    },
    {
      id: 'bounded-scanner-no-regex-v2',
      correctness: 'pass',
      boundedAuditability: true,
      regexXmlParser: false,
      generalXmlPlatform: false,
      namespaceAware: true,
      chunkBoundaryInvariant: true,
    },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.selected, 'bounded-scanner-no-regex-v2');
  assert.equal(result.ownerDecisionRequired, false);
});

test('W2 redacted package rewrite report stores full text only for changed blocks', async () => {
  const ir = await loadIr();
  const report = ir.buildW2RedactedPackageRewriteReport({
    changedBlocks: [{ blockId: 'changed', originalText: 'old', finalText: 'new' }],
    unchangedBlocks: [{ blockId: 'same', text: 'unchanged text that must not be stored in full' }],
  });

  assert.equal(report.canWriteManuscript, false);
  assert.equal(report.canApply, false);
  assert.equal(report.changedBlocks[0].originalText, 'old');
  assert.equal(report.changedBlocks[0].finalText, 'new');
  assert.equal(Object.hasOwn(report.unchangedBlocks[0], 'text'), false);
  assert.equal(report.unchangedBlocks[0].excerpt.includes('unchanged'), true);
  assert.ok(report.unchangedBlocks[0].textDigest.startsWith('sha256:'));
});

test('W2 oracle exports review IR without write or apply authority', async () => {
  const oracle = await loadOracle();
  const result = oracle.runW2ReviewIrOracle({
    parts: { 'word/document.xml': documentXml('<w:p><w:r><w:t>Clean body</w:t></w:r></w:p>') },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.canApply, false);
  assert.equal(result.reviewIr.status, 'review-ir-ready');
});

test('W2 stage scope stays inside the frozen allowlist', () => {
  const status = require('node:child_process').execFileSync('git', ['status', '--short'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const changed = status.split('\n').filter(Boolean).map((line) => line.slice(3));
  for (const file of changed) {
    assert.equal(ALLOWLIST.includes(file), true, file);
  }
});
