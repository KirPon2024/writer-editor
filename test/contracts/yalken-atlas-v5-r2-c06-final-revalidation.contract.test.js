const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = process.cwd();

async function loadModule() {
  return import(pathToFileURL(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-r2-c06-final-revalidation.mjs',
  )).href);
}

test('R2 C06: current R2 receipts are sufficient only for E11 revalidation handoff, not Program DoD', async () => {
  const { evaluateR2FinalRevalidation } = await loadModule();
  const result = evaluateR2FinalRevalidation({ repoRoot: ROOT });

  assert.equal(result.pass, true);
  assert.equal(result.status, 'PASS_READY_FOR_E11_REVALIDATION');
  assert.equal(result.programDodVerdict, 'NOT_READY_E11_AND_EFINAL_REVALIDATION_REQUIRED');
  assert.equal(result.negativeAssertions.programDoneClaim, false);
  assert.equal(result.nextContour, 'E11_ACTIVE_PLATFORM_CERTIFICATION_REVALIDATION');
  assert.ok(result.certifiedStageOutcomes.includes('E02_STAGE_02_MANUAL_MAP_GRAPH_WORKBENCH_USER_OUTCOME_BLACK_BOX_CERTIFIED'));
  assert.ok(result.unsatisfiedStageOutcomes.includes('E11_STAGE_11_ACTIVE_MACOS_PACKAGED_ELECTRON_REVALIDATION'));
  assert.ok(result.unsatisfiedStageOutcomes.includes('EFINAL_PROGRAM_DOD_REVALIDATION'));
});

test('R2 C06: false-green and stale final receipts are rejected as readiness tokens', async () => {
  const { evaluateR2FinalRevalidation } = await loadModule();
  const result = evaluateR2FinalRevalidation({ repoRoot: ROOT });

  assert.equal(result.repairedFacts.r2C00FalseGreenInvalidationAnchor, true);
  assert.equal(result.negativeAssertions.completedContourCountCanCertifyProgramDod, false);
  assert.equal(result.negativeAssertions.staleFinalReceiptCanCertifyCurrentHead, false);
  assert.equal(result.staleFinalReceipts.efinal.rejectedAsCurrentReadiness, true);
  assert.notEqual(result.staleFinalReceipts.efinal.receiptHead, result.git.headSha);
});

test('R2 C06: every repaired R2 fact is explicitly bound and black-box acceptance is mandatory', async () => {
  const { evaluateR2FinalRevalidation } = await loadModule();
  const result = evaluateR2FinalRevalidation({ repoRoot: ROOT });

  assert.equal(Object.values(result.repairedFacts).every(Boolean), true);
  assert.equal(result.repairedFacts.r2C01RealGraphWorkbench, true);
  assert.equal(result.repairedFacts.r2C02SafeSemanticInteractions, true);
  assert.equal(result.repairedFacts.r2C03ResponsiveReachability, true);
  assert.equal(result.repairedFacts.r2C04AuthorityRuntimeHygiene, true);
  assert.equal(result.repairedFacts.r2C05HonestBlackBoxAcceptance, true);
  assert.equal(result.negativeAssertions.directIpcJourneyCanSatisfyBlackBoxAcceptance, false);
  assert.equal(result.negativeAssertions.deniedCapabilityCanReachReducerOrPersistence, false);
});

test('R2 C06: missing black-box receipt prevents E11 handoff readiness', async () => {
  const { evaluateR2FinalRevalidation } = await loadModule();
  const base = evaluateR2FinalRevalidation({ repoRoot: ROOT });
  const receipts = {};
  for (const row of base.r2ReceiptReadiness) {
    receipts[row.key] = {
      key: row.key,
      path: row.path,
      proof: { sha256: row.sha256 },
      doc: row.key === 'c05'
        ? { status: 'LOCAL_VALIDATION_PASS_DELIVERY_PENDING', blackBoxAcceptance: { status: 'PENDING', accepted: {} }, deliveredScope: {} }
        : require(path.join(ROOT, row.path)),
    };
  }
  const negative = evaluateR2FinalRevalidation({
    repoRoot: ROOT,
    gitIdentity: base.git,
    staleFinalReceipts: base.staleFinalReceipts,
    receipts,
  });

  assert.equal(negative.pass, false);
  assert.equal(negative.repairedFacts.r2C05HonestBlackBoxAcceptance, false);
  assert.equal(negative.status, 'NOT_READY_R2_FINAL_REVALIDATION_GAP');
});
