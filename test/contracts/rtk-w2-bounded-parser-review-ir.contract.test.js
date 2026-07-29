const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const IR_PATH = 'src/io/revisionBridge/reviewTransportIr.mjs';
const ORACLE_PATH = 'src/io/revisionBridge/reviewTransportOracle.mjs';
const ROUND_STORE_PATH = 'src/io/revisionBridge/reviewTransportRoundStore.mjs';
const TEST_PATH = 'test/contracts/rtk-w2-bounded-parser-review-ir.contract.test.js';
const ALLOWLIST = [
  IR_PATH,
  ORACLE_PATH,
  ROUND_STORE_PATH,
  TEST_PATH,
  'scripts/ops/sector-m-scope-map.json',
  'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
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
  assert.equal(blocked.reasons.some((reason) => reason.code === 'W2_WORKER_PATH_AUTHORITY_BLOCKED'), true);
  assert.equal(blocked.reasons.some((reason) => reason.code === 'W2_WORKER_WRITER_AUTHORITY_BLOCKED'), true);
  assert.equal(blocked.reasons.some((reason) => reason.code === 'W2_WORKER_NETWORK_AUTHORITY_BLOCKED'), true);
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
  assert.equal(result.reasons.some((reason) => reason.code === 'W2_PACKAGE_FAKE_EOCD'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'W2_PACKAGE_LOCAL_CENTRAL_MISMATCH'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'W2_PACKAGE_CRC_MISMATCH'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'W2_PACKAGE_ENTRY_OVERLAP'), true);
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

test('W2 CLEAN and MIXED outcomes conserve comments independently from text lane', async () => {
  const ir = await loadIr();
  const clean = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:r><w:t>Clean body</w:t></w:r></w:p>'),
    },
  });
  const mixed = ir.buildW2ReviewIr({
    parts: {
      'word/document.xml': documentXml('<w:p><w:commentReference w:id="7"/><w:ins><w:r><w:t>New</w:t></w:r></w:ins></w:p>'),
      'word/comments.xml': commentsXml('Keep me'),
      'word/commentsExtended.xml': '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:commentEx w15:paraId="abc" w15:done="1"/></w15:commentsEx>',
    },
  });

  assert.equal(clean.ok, true);
  assert.equal(clean.sourceMode, 'CLEAN');
  assert.equal(clean.reasons.some((reason) => reason.code === 'W2_CLEAN_MANUAL_OUTCOME'), true);
  assert.equal(mixed.ok, true);
  assert.equal(mixed.sourceMode, 'MIXED');
  assert.equal(mixed.reviewIr.comments.length, 1);
  assert.equal(mixed.reviewIr.comments[0].bodyExcerpt, 'Keep me');
  assert.equal(mixed.reviewIr.modernCommentMetadata.length, 1);
  assert.equal(mixed.reviewIr.modernCommentMetadata[0].done, true);
  assert.equal(mixed.reasons.some((reason) => reason.code === 'W2_COMMENTS_CONSERVED'), true);
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
  assert.equal(result.reviewIr.changes[0].reasonCode, 'W2_MOVE_REVISION_STRUCTURAL');
  assert.equal(result.reasons.some((reason) => reason.code === 'W2_PARAGRAPH_MARK_STRUCTURAL'), true);
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
    analysisKey: 'same-docx',
    ...base,
    reviewIr: base.reviewIr,
  });
  const reused = await store.commitW2AnalysisBranch(storeRoot, {
    roundId: 'round-w2',
    analysisKey: 'same-docx',
    ...base,
    reviewIr: base.reviewIr,
  });
  const nextProfile = await store.commitW2AnalysisBranch(storeRoot, {
    roundId: 'round-w2',
    analysisKey: 'same-docx',
    ...widerBudget,
    reviewIr: widerBudget.reviewIr,
  });

  assert.equal(first.status, 'committed');
  assert.equal(reused.status, 'reused');
  assert.notEqual(first.record.recordChecksum, first.record.analysisDigest);
  assert.equal(nextProfile.status, 'committed');
  assert.notEqual(first.branchId, nextProfile.branchId);
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
