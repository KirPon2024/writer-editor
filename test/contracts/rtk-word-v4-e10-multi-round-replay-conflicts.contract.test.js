const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = 'scripts/ops/rtk-word-v4-e10-multi-round-replay-conflicts.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E10_MULTI_ROUND_REPLAY_CONFLICTS_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

async function loadVerifier() {
  return import(pathToFileURL(path.join(REPO_ROOT, SCRIPT_PATH)).href);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

test('V4 E10 certifies replay stale conflict guards without expanding apply authority', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const result = verifier.evaluateWordV4E10MultiRoundReplayConflicts({ receipt });

  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.issues, []);
  assert.equal(receipt.wordProfile.versionByBundle, '16.111.2');
  assert.equal(receipt.multiRoundTotals.physicalGuardCases, 5);
  assert.equal(receipt.multiRoundTotals.staleTamperedStrippedCases, 1);
  assert.equal(receipt.multiRoundTotals.replayIdempotenceCases, 1);
  assert.equal(receipt.multiRoundTotals.noEditConservationCases, 1);
  assert.equal(receipt.multiRoundTotals.reExportNoEditOracleCases, 1);
  assert.equal(receipt.multiRoundTotals.hostilePackageBlockedCases, 1);
  assert.equal(receipt.multiRoundTotals.automaticReplayApplyCertified, 0);
  assert.equal(receipt.multiRoundTotals.divergentRoundAutoMergeCertified, 0);
  assert.equal(receipt.multiRoundTotals.destructiveConflictWriteAdded, 0);
});

test('V4 E10 binds stale tamper replay no-edit re-export and hostile physical cases', () => {
  const receipt = readJson(RECEIPT_PATH);
  const byId = new Map(receipt.guardCertificationCases.map((item) => [item.caseId, item]));

  for (const caseId of ['WL2-022', 'WL2-023', 'WL2-029', 'WL2-030', 'WL2-031']) {
    const item = byId.get(caseId);
    assert.equal(item.wordStatus, 'PASS');
    assert.ok(['PASS', 'BLOCKED'].includes(item.parserStatus));
    assert.equal(item.classificationAuthority, 'MANUAL_OR_BLOCKED_ONLY');
    assert.equal(item.exactAutomaticCandidateCount, 0);
    assert.match(item.sourceDocxSha256, /^sha256:[0-9a-f]{64}$/u);
    assert.match(item.returnedDocxSha256, /^sha256:[0-9a-f]{64}$/u);
  }

  assert.equal(byId.get('WL2-022').guardKinds.includes('staleBaselineBlocked'), true);
  assert.equal(byId.get('WL2-022').guardKinds.includes('tamperedManifestBlocked'), true);
  assert.equal(byId.get('WL2-022').guardKinds.includes('strippedLocatorBlocked'), true);
  assert.equal(byId.get('WL2-023').guardOutcome, 'ALREADY_ANALYZED_OR_ALREADY_APPLIED_NOT_SECOND_MUTATION');
  assert.equal(byId.get('WL2-029').guardKinds.includes('noEditConservationOracle'), true);
  assert.equal(byId.get('WL2-029').reviewIrSummary.textRevisions, 0);
  assert.equal(byId.get('WL2-030').guardKinds.includes('reExportNoEditOracleBlockedWithoutSignedLocator'), true);
  assert.equal(byId.get('WL2-031').parserStatus, 'BLOCKED');
  assert.equal(byId.get('WL2-031').guardKinds.includes('hostilePackageBlocked'), true);
});

test('V4 E10 rejects replay false-green and destructive conflict mutations', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const mutated = JSON.parse(JSON.stringify(receipt));
  mutated.multiRoundTotals.automaticReplayApplyCertified = 1;
  mutated.multiRoundTotals.divergentRoundAutoMergeCertified = 1;
  mutated.multiRoundTotals.destructiveConflictWriteAdded = 1;
  mutated.runtimeClaims.automaticReplayApplyAdded = true;
  mutated.runtimeClaims.divergentRoundAutoMergeAdded = true;
  mutated.vetoMetrics.replayFailure = 1;
  mutated.guardCertificationCases.find((item) => item.caseId === 'WL2-023').guardOutcome = 'SECOND_MUTATION';
  mutated.typedLimitations = mutated.typedLimitations.filter((item) => item !== 'REPLAY_SECOND_MUTATION_NOT_CERTIFIED_IN_E10');

  const result = verifier.evaluateWordV4E10MultiRoundReplayConflicts({ receipt: mutated });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E10_AUTHORITY_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E10_RUNTIME_SCOPE_OVERCLAIM'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E10_VETO_NONZERO'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E10_REPLAY_GUARD_MISSING'), true);
  assert.equal(result.issues.some((item) => item.code === 'RTK_V4_E10_TYPED_LIMITATION_MISSING'), true);
});

test('V4 E10 optional external evidence check verifies local T7 receipt only when present', async () => {
  const verifier = await loadVerifier();
  const receipt = readJson(RECEIPT_PATH);
  const externalPath = receipt.externalEvidence.externalReceiptPath;

  if (!fs.existsSync(externalPath)) {
    assert.equal(receipt.externalEvidence.externalFileAvailableAtReceiptCreation, true);
    return;
  }

  const result = verifier.evaluateWordV4E10MultiRoundReplayConflicts({ receipt, requireExternal: true });
  assert.equal(result.status, 'PASS');
});

test('V4 E10 updates capability profile and program state without runtime changes', () => {
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.multiRoundReplayStaleConflictGuards');

  assert.equal(cell.state, 'PHYSICAL_WORD_PROVEN');
  assert.equal(cell.currentCapability, 'REPLAY_STALE_CONFLICT_GUARD_DIAGNOSTICS_WITH_TYPED_LIMITATIONS');
  assert.equal(cell.physicalWordEvidence, true);
  assert.equal(cell.acceptanceTest, 'test/contracts/rtk-word-v4-e10-multi-round-replay-conflicts.contract.test.js');
  assert.equal(cell.physicalTotals.physicalGuardCases, 5);
  assert.equal(cell.physicalTotals.automaticReplayApplyCertified, 0);
  assert.match(program.v4ExecutionState.status, /^EXECUTION_(1[01]_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN|12_(?:LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVES|WAVE40_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_100|WAVE100_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_300))$/u);
  assert.equal(typeof program.v4ExecutionState.currentStage, 'string');
  assert.equal(typeof program.v4ExecutionState.nextStage, 'string');
  assert.equal(program.v4ExecutionState.multiRoundReplayConflictGuardsCertified, true);
  assert.equal(program.v4ExecutionState.automaticReplayApplyCertified, 0);
  assert.equal(program.v4ExecutionState.divergentRoundAutoMergeCertified, 0);
  assert.equal(program.v4ExecutionState.runtimeApplyAuthorityGranted, false);
  assert.equal(program.v4ExecutionState.googleDocsOpened, false);
});
