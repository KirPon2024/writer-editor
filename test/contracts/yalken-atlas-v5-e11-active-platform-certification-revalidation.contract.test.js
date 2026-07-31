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
    'yalken-atlas-v5-e11-active-platform-certification-revalidation.mjs',
  )).href);
}

test('E11 revalidation: current C01-C04 receipts certify active macOS only and hand off to EFINAL', async () => {
  const { evaluateE11ActivePlatformCertificationRevalidation } = await loadModule();
  const result = evaluateE11ActivePlatformCertificationRevalidation({ repoRoot: ROOT });

  assert.equal(result.pass, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, 'PASS_READY_FOR_EFINAL_REVALIDATION');
  assert.equal(result.activePlatformScope.macosPackagedElectron, 'CERTIFIED_FOR_LOCAL_UNSIGNED_PACKAGED_PROOF');
  assert.equal(result.activePlatformScope.windows, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
  assert.equal(result.certifiedFacts.c02PackageBoundCriticalJourney, true);
  assert.equal(result.certifiedFacts.c04PerformanceSecurityHandoff, true);
  assert.equal(result.negativeAssertions.programDoneClaim, false);
  assert.equal(result.nextContour, 'EFINAL_FINAL_AUDIT_AND_PROGRAM_DOD_REVALIDATION');
});

test('E11 revalidation: missing package binding or SAST timeout prevents certification', async () => {
  const { evaluateE11ActivePlatformCertificationRevalidation } = await loadModule();
  const base = evaluateE11ActivePlatformCertificationRevalidation({ repoRoot: ROOT });
  const receipts = {};
  for (const row of base.e11ReceiptReadiness) {
    receipts[row.key] = {
      key: row.key,
      path: row.path,
      proof: { sha256: row.sha256 },
      doc: require(path.join(ROOT, row.path)),
    };
  }
  receipts.c02.doc = JSON.parse(JSON.stringify(receipts.c02.doc));
  receipts.c04.doc = JSON.parse(JSON.stringify(receipts.c04.doc));
  receipts.c02.doc.packageBinding.packageBound = false;
  receipts.c04.doc.securityEvidence.genericSast.timeouts = 1;

  const negative = evaluateE11ActivePlatformCertificationRevalidation({
    repoRoot: ROOT,
    gitIdentity: base.git,
    receipts,
  });

  assert.equal(negative.pass, false);
  assert.equal(negative.certifiedFacts.c02PackageBoundCriticalJourney, false);
  assert.equal(negative.certifiedFacts.c04PerformanceSecurityHandoff, false);
  assert.equal(negative.status, 'NOT_READY_E11_REVALIDATION_GAP');
});

test('E11 revalidation: inactive platform PASS or Program DoD claim is rejected', async () => {
  const { evaluateE11ActivePlatformCertificationRevalidation } = await loadModule();
  const base = evaluateE11ActivePlatformCertificationRevalidation({ repoRoot: ROOT });
  const receipts = {};
  for (const row of base.e11ReceiptReadiness) {
    receipts[row.key] = {
      key: row.key,
      path: row.path,
      proof: { sha256: row.sha256 },
      doc: require(path.join(ROOT, row.path)),
    };
  }
  receipts.c04.doc = JSON.parse(JSON.stringify(receipts.c04.doc));
  receipts.c04.doc.inactivePlatformScope.windows = 'CERTIFIED';
  receipts.c04.doc.handoffBinding.programDoneClaim = 'DONE';

  const negative = evaluateE11ActivePlatformCertificationRevalidation({
    repoRoot: ROOT,
    gitIdentity: base.git,
    receipts,
  });

  assert.equal(negative.pass, false);
  assert.equal(negative.certifiedFacts.inactivePlatformScopeHonest, false);
  assert.equal(negative.certifiedFacts.programDoDNotClaimed, false);
});
