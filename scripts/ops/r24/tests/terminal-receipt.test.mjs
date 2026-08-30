import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceStamp, buildTerminalReceipt } from '../terminal-receipt.mjs';
import { canonicalBytes, verifyStageAdmission } from '../corrective/stage-admission-verifier.mjs';

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

const MODULE_R24_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_REPO_ROOT = path.resolve(MODULE_R24_ROOT, '..', '..', '..');
const WP400_PREFIX = path.join(MODULE_REPO_ROOT, 'docs/OPS/R24');
const WP400_CLOSURE_AVAILABLE = existsSync(path.join(WP400_PREFIX, 'CTR-R24-WP-400-ANCHOR-LINEAGE.json'));
const WP400_EVIDENCE_FILES = [
  'EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-MODEL.json',
  'EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-CONTRACT.json',
  'EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-INTEGRATION.json',
  'EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-MUTANTS.json',
  'EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-EXACT-HEAD.json',
  'EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-POSTMERGE-EXACT-HEAD.json',
  'EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-SURVIVOR-AUDIT.json',
];
const WP400_REQUIRED_CLASSES = [
  'MODEL',
  'CONTRACT',
  'INTEGRATION',
  'IMPLEMENTATION_MUTANTS',
  'INDEPENDENT_EXACT_HEAD',
  'POSTMERGE',
  'SURVIVOR_AUDIT',
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(relativePath, 'utf8'));
}

function digestFile(relativePath) {
  const resolved = path.isAbsolute(relativePath) ? relativePath : path.join(MODULE_REPO_ROOT, relativePath);
  return createHash('sha256').update(readFileSync(resolved)).digest('hex');
}

function requireWp400ClosureCarrier() {
  if (WP400_CLOSURE_AVAILABLE) return true;
  assert.equal(existsSync(path.join(MODULE_R24_ROOT, 'terminal-receipt.mjs')), true, 'module-only mutation copy must retain the compiler under test');
  assert.equal(existsSync(path.join(MODULE_REPO_ROOT, 'docs/OPS/R24')), false, 'module-only mutation copy must not be mistaken for a repository closure checkout');
  return false;
}

function failWp400(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validateWp400Closure({ receipt, stamps, effective }) {
  const classes = new Set(stamps.map((stamp) => stamp.test.evidenceClass));
  for (const evidenceClass of WP400_REQUIRED_CLASSES) {
    if (!classes.has(evidenceClass)) failWp400('E_WP400_REQUIRED_EVIDENCE_CLASS_MISSING');
  }
  if (stamps.some((stamp) => stamp.contourId !== 'WP-400_ANCHOR_LINEAGE')) {
    failWp400('E_WP400_CROSS_CONTOUR_EVIDENCE');
  }
  if (receipt.nextContourId !== null || effective.nextGraphSelection !== false) {
    failWp400('E_WP400_GRAPH_ADVANCE_FORBIDDEN');
  }
  if (effective.programDone !== false) failWp400('E_WP400_PROGRAM_DONE_FORBIDDEN');
  if (effective.rawState.planStateBytesDigest !== digestFile(`${WP400_PREFIX}/PLAN_STATE_R24.json`)) {
    failWp400('E_WP400_RAW_PLAN_STATE_DRIFT');
  }
  if (effective.rawState.c9EffectiveStateBytesDigest !== digestFile(`${WP400_PREFIX}/CORRECTIVE/C9_EFFECTIVE_STATE_V1.json`)) {
    failWp400('E_WP400_RAW_C9_STATE_DRIFT');
  }
  const correction = effective.appendOnlyCorrections?.[0];
  if (correction?.nodeId !== 'WP-400_ANCHOR_LINEAGE' || correction?.from !== 'PENDING' || correction?.to !== 'DONE') {
    failWp400('E_WP400_EFFECTIVE_TRANSITION_INVALID');
  }
  if (effective.effectiveState?.wp400State !== 'DONE') failWp400('E_WP400_EFFECTIVE_DONE_MISSING');
  return true;
}

test('committed WP-400 closure compiles under native evidence and terminal schemas', () => {
  if (!requireWp400ClosureCarrier()) return;
  const receipt = readJson(`${WP400_PREFIX}/CTR-R24-WP-400-ANCHOR-LINEAGE.json`);
  const stamps = WP400_EVIDENCE_FILES.map((relativePath) => readJson(`${WP400_PREFIX}/${relativePath}`));
  const effective = readJson(`${WP400_PREFIX}/CORRECTIVE/WP400_TERMINAL_CLOSURE_EFFECTIVE_STATE_V1.json`);
  assert.deepEqual(buildTerminalReceipt(receipt), receipt);
  for (const stamp of stamps) assert.deepEqual(buildEvidenceStamp(stamp), stamp);
  assert.equal(validateWp400Closure({ receipt, stamps, effective }), true);
  assert.equal(receipt.exactHeadSha, 'f1f0aae213a98e3943f4775e3041b5731c23781f');
  assert.equal(receipt.mergeState, 'MERGED');
  assert.equal(receipt.postmergeState, 'PASS');
  assert.equal(receipt.survivorState, 'PASS');
});

test('committed WP-400 successor admission is exact and independently reproducible', () => {
  if (!requireWp400ClosureCarrier()) return;
  const instancePath = `${WP400_PREFIX}/CORRECTIVE/WP400_TERMINAL_CLOSURE_STAGE_INSTANCE_V1.json`;
  const registryPath = `${WP400_PREFIX}/CORRECTIVE/WP400_TERMINAL_CLOSURE_STAGE_REGISTRY_V1.json`;
  const programPath = `${WP400_PREFIX}/CORRECTIVE/WP400_TERMINAL_CLOSURE_EXACT_HEAD_AMENDMENT_V1.json`;
  const admissionPath = `${WP400_PREFIX}/CORRECTIVE/WP400_TERMINAL_CLOSURE_STAGE_ADMISSION_ATTESTATION_V1.json`;
  const instanceBytes = readFileSync(instancePath);
  const registryBytes = readFileSync(registryPath);
  const programBytes = readFileSync(programPath);
  const actual = verifyStageAdmission({
    instanceBytes,
    instance: JSON.parse(instanceBytes),
    registryBytes,
    registry: JSON.parse(registryBytes),
    programBytes,
    program: JSON.parse(programBytes),
  });
  assert.deepEqual(actual, readJson(admissionPath));
  assert.equal(createHash('sha256').update(canonicalBytes(actual)).digest('hex'), 'e2f3b88f5ba2d7766e281b33da636a48b058ee98622b1f993a9a13c75109945c');
  assert.equal(actual.writeSetDigest, '6cc53581b928857ae486c1042da73028aefb6bd93730f3769302dd601f21ba69');
});

test('committed WP-400 terminal attestation and claim bindings are exact-byte bound', () => {
  if (!requireWp400ClosureCarrier()) return;
  const attestationPath = `${WP400_PREFIX}/CORRECTIVE/WP400_TERMINAL_ATTESTATION_V1.json`;
  const attestation = readJson(attestationPath);
  assert.equal(digestFile(attestationPath), '533c11f13d52f39e65e7e1aa906064140dc3c38ef67e456b65beb24166511c3c');
  assert.equal(attestation.workflowRunId, 33308014728);
  assert.equal(attestation.evaluationSha, 'f1f0aae213a98e3943f4775e3041b5731c23781f');
  assert.equal(attestation.evaluationTreeSha, '4e1124ef010ef7dd7fb21acf8f53e569d09450ab');
  assert.equal(attestation.result, 'PASS');
  const claim = readJson(`${WP400_PREFIX}/EVIDENCE/ES-R24-WP-400-ANCHOR-LINEAGE-CLAIM-BINDINGS.json`);
  for (const binding of claim.claimBindings) assert.equal(digestFile(binding.filePath), binding.sha256, binding.filePath);
});

test('WP-400 closure mutants fail closed on missing class, cross-contour evidence, raw drift, graph advance and PROGRAM_DONE', () => {
  if (!requireWp400ClosureCarrier()) return;
  const receipt = readJson(`${WP400_PREFIX}/CTR-R24-WP-400-ANCHOR-LINEAGE.json`);
  const stamps = WP400_EVIDENCE_FILES.map((relativePath) => readJson(`${WP400_PREFIX}/${relativePath}`));
  const effective = readJson(`${WP400_PREFIX}/CORRECTIVE/WP400_TERMINAL_CLOSURE_EFFECTIVE_STATE_V1.json`);
  assert.throws(() => validateWp400Closure({ receipt, stamps: stamps.filter((stamp) => stamp.test.evidenceClass !== 'CONTRACT'), effective }), (error) => error.code === 'E_WP400_REQUIRED_EVIDENCE_CLASS_MISSING');
  const crossContour = structuredClone(stamps);
  crossContour[0].contourId = 'AUDIT_R2_COMPLETE_CHAIN';
  assert.throws(() => validateWp400Closure({ receipt, stamps: crossContour, effective }), (error) => error.code === 'E_WP400_CROSS_CONTOUR_EVIDENCE');
  const rawDrift = structuredClone(effective);
  rawDrift.rawState.planStateBytesDigest = '0'.repeat(64);
  assert.throws(() => validateWp400Closure({ receipt, stamps, effective: rawDrift }), (error) => error.code === 'E_WP400_RAW_PLAN_STATE_DRIFT');
  const graphAdvance = structuredClone(effective);
  graphAdvance.nextGraphSelection = true;
  assert.throws(() => validateWp400Closure({ receipt, stamps, effective: graphAdvance }), (error) => error.code === 'E_WP400_GRAPH_ADVANCE_FORBIDDEN');
  const programDone = structuredClone(effective);
  programDone.programDone = true;
  assert.throws(() => validateWp400Closure({ receipt, stamps, effective: programDone }), (error) => error.code === 'E_WP400_PROGRAM_DONE_FORBIDDEN');
});
