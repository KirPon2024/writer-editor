import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceStamp, buildTerminalReceipt } from '../terminal-receipt.mjs';

const HEAD = '7b4c89de155567371e1f0a0003b74e3be3abc223';
const TREE = '715f2660a59b543dc85cc50c9d2137c294517ee0';

function stampInput(overrides = {}) {
  return {
    stampId: 'ES-TEST-1',
    missionId: 'M1',
    contourId: 'C1',
    attemptId: 'ATTEMPT-1',
    authorityEpoch: 'e'.repeat(64),
    profileId: 'SHARED_ASSURANCE_BOOTSTRAP',
    repo: {
      canonicalPath: '/repo',
      originUrl: 'https://github.com/KirPonomarev/writer-editor.git',
      headSha: HEAD,
      treeSha: TREE,
    },
    claim: { type: 'TEST', ceiling: 'NODE_ONLY', verdict: 'PASS' },
    test: { oracleId: 'ORACLE', evidenceClass: 'UNIT', denominator: 3, passed: 3, failed: 0, skipped: 0, exitCode: 0 },
    causal: { parentStampIds: [], predecessorReceiptDigest: null },
    createdAt: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

test('valid evidence stamp compiles', () => {
  const stamp = buildEvidenceStamp(stampInput());
  assert.equal(stamp.schemaVersion, 'EvidenceStampV2');
});

test('zero denominator fails closed', () => {
  const input = stampInput();
  input.test.denominator = 0;
  input.test.passed = 0;
  assert.throws(() => buildEvidenceStamp(input), (e) => e.code === 'E_EVIDENCE_STAMP_SCHEMA' || e.code === 'E_ZERO_DENOMINATOR');
});

test('skipped required evidence fails closed', () => {
  const input = stampInput();
  input.claim.verdict = 'BLOCKED_TYPED';
  input.test = { oracleId: 'ORACLE', evidenceClass: 'CONTRACT', denominator: 3, passed: 2, failed: 0, skipped: 1, exitCode: 0 };
  assert.throws(() => buildEvidenceStamp(input), (e) => e.code === 'E_SKIPPED_REQUIRED_EVIDENCE');
});

test('denominator arithmetic mismatch fails closed', () => {
  const input = stampInput();
  input.test.denominator = 5;
  assert.throws(() => buildEvidenceStamp(input), (e) => e.code === 'E_DENOMINATOR_ARITHMETIC');
});

test('PASS verdict beyond evidence fails closed', () => {
  const input = stampInput();
  input.test.failed = 1;
  input.test.passed = 2;
  input.claim.verdict = 'PASS';
  assert.throws(() => buildEvidenceStamp(input), (e) => e.code === 'E_PASS_BEYOND_EVIDENCE');
  const exit = stampInput();
  exit.test.exitCode = 1;
  assert.throws(() => buildEvidenceStamp(exit), (e) => e.code === 'E_PASS_WITH_NONZERO_EXIT');
});

test('unnamed identity and malformed head fail closed', () => {
  const noId = stampInput();
  noId.stampId = '';
  assert.throws(() => buildEvidenceStamp(noId), (e) => e.code === 'E_EVIDENCE_STAMP_SCHEMA' || e.code === 'E_EVIDENCE_UNNAMED');
  const badHead = stampInput();
  badHead.repo = { ...badHead.repo, headSha: 'not-a-sha' };
  assert.throws(() => buildEvidenceStamp(badHead), (e) => e.code === 'E_EVIDENCE_STAMP_SCHEMA' || e.code === 'E_EVIDENCE_HEAD_SHAPE');
});

test('non-PASS verdict with partial evidence is admitted honestly', () => {
  const input = stampInput();
  input.claim.verdict = 'BLOCKED_TYPED';
  input.test = { oracleId: 'ORACLE', evidenceClass: 'CONTRACT', denominator: 3, passed: 2, failed: 1, skipped: 0, exitCode: 1 };
  const stamp = buildEvidenceStamp(input);
  assert.equal(stamp.claim.verdict, 'BLOCKED_TYPED');
});

function receiptInput(overrides = {}) {
  return {
    receiptId: 'CTR-TEST-1',
    missionId: 'M1',
    contourId: 'C1',
    attemptId: 'ATTEMPT-1',
    authorityEpoch: 'e'.repeat(64),
    exactHeadSha: HEAD,
    mergeState: 'MERGED',
    postmergeState: 'PASS',
    survivorState: 'PASS',
    evidenceStampIds: ['ES-TEST-1'],
    nextContourId: null,
    ...overrides,
  };
}

test('terminal receipt compiles and enforces merge/postmerge/survivor coherence', () => {
  const receipt = buildTerminalReceipt(receiptInput());
  assert.equal(receipt.schemaVersion, 'ContourTerminalReceiptV2');
  assert.throws(() => buildTerminalReceipt(receiptInput({ postmergeState: 'PENDING' })), (e) => e.code === 'E_TERMINAL_POSTMERGE_NOT_PASS');
  assert.throws(() => buildTerminalReceipt(receiptInput({ survivorState: 'FAIL' })), (e) => e.code === 'E_TERMINAL_SURVIVOR_NOT_PASS');
  assert.throws(() => buildTerminalReceipt(receiptInput({ evidenceStampIds: [] })), (e) => e.code === 'E_TERMINAL_RECEIPT_NO_EVIDENCE');
  assert.throws(() => buildTerminalReceipt(receiptInput({ mergeState: 'BOGUS' })), (e) => e.code === 'E_TERMINAL_RECEIPT_SCHEMA');
});
