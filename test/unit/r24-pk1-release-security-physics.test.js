'use strict';

// R2.4 PK1 physical/repository proof: evaluate real checked-in package
// security receipts from this exact checkout. No package build, signing,
// notarization, release publication, credential use, or product runtime
// mutation is performed here.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'scripts', 'ops', 'r24', 'release-security-physical-pk1.mjs');

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

test('PK1 repository release security physical posture is classified without distribution overclaim', async () => {
  const module = await loadModule();
  const result = module.evaluateRepositoryReleaseSecurityPhysical({ repoRoot: ROOT });
  const receipt = result.ok ? result.value : result.error.value;

  console.log(`R24_PK1_REPOSITORY_PHYSICAL_RECEIPT=${JSON.stringify({
    pass: receipt.pass,
    stageId: receipt.stageId,
    profileId: receipt.profileId,
    profileVerdictCandidate: receipt.profileVerdictCandidate,
    expectedHeadSha: receipt.evidence.expectedHeadSha,
    staleReceipts: receipt.releaseReadiness.staleReceipts,
    appAsarSha256: receipt.evidence.appAsarSha256,
    blockersHash: receipt.blockersHash,
    productionReleaseReady: receipt.releaseReadiness.productionReleaseReady,
    signingPass: receipt.releaseReadiness.signingPass,
    notarizationPass: receipt.releaseReadiness.notarizationPass,
    fusePass: receipt.releaseReadiness.fusePass,
    hardenedRuntimePass: receipt.releaseReadiness.hardenedRuntimePass,
    runtimeNetworkActivated: receipt.integrity.runtimeNetworkActivated,
  })}`);

  assert.equal(result.ok, true, JSON.stringify(receipt.errors));
  assert.equal(receipt.stageId, 'PK1_RELEASE_SECURITY_PHYSICAL');
  assert.equal(receipt.profileId, 'PACKAGED_RELEASE_SECURITY');
  assert.equal(receipt.profileVerdictCandidate, 'NOT_READY');
  assert.equal(receipt.releaseReadiness.status, 'NOT_READY');
  assert.equal(receipt.releaseReadiness.productionReleaseReady, false);
  assert.equal(receipt.releaseReadiness.physicalEvidenceFreshForCurrentHead, false);
  assert.deepEqual(receipt.releaseReadiness.staleReceipts, ['c01', 'c02', 'c03', 'c04']);
  assert.equal(receipt.blockers.includes('PHYSICAL_RECEIPTS_NOT_CURRENT_HEAD'), true);
  assert.equal(receipt.blockers.includes('DEVELOPER_ID_SIGNATURE_NOT_READY'), true);
  assert.equal(receipt.blockers.includes('APPLE_NOTARIZATION_NOT_READY'), true);
  assert.equal(receipt.blockers.includes('ELECTRON_FUSE_POLICY_NOT_PROVEN'), true);
  assert.equal(receipt.blockers.includes('HARDENED_RUNTIME_NOT_PROVEN_FOR_DISTRIBUTION'), true);
  assert.equal(receipt.integrity.asarBinding, true);
  assert.match(receipt.integrity.appAsarSha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.integrity.atsPolicyPass, true);
  assert.equal(receipt.integrity.criticalJourneyPass, true);
  assert.equal(receipt.integrity.packagedRecoveryPass, true);
  assert.equal(receipt.integrity.genericSastPass, true);
  assert.equal(receipt.integrity.runtimeNetworkActivated, false);
  assert.equal(receipt.releaseReadiness.signingPass, false);
  assert.equal(receipt.releaseReadiness.notarizationPass, false);
  assert.equal(receipt.releaseReadiness.fusePass, false);
  assert.equal(receipt.releaseReadiness.hardenedRuntimePass, false);
  assert.equal(receipt.authority.releasePublication, false);
  assert.equal(receipt.authority.signingCredentialUse, false);
  assert.equal(receipt.authority.notarizationCredentialUse, false);
  assert.equal(receipt.authority.wordOrGoogleClaim, false);
  assert.equal(receipt.authority.programScalarPass, false);
  assert.equal(receipt.targetMatrix.macosProductionDistribution, 'NOT_READY_UNSIGNED_UNNOTARIZED_NO_FUSE_OR_HARDENED_RUNTIME_PROOF');
  assert.equal(receipt.targetMatrix.windows, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
  assert.equal(receipt.targetMatrix.linux, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
  assert.equal(receipt.targetMatrix.web, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
  assert.equal(receipt.targetMatrix.ios, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
  assert.equal(receipt.targetMatrix.android, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
});

test('PK1 repository classifier never treats CI or local unsigned package receipts as release publication', async () => {
  const module = await loadModule();
  const result = module.evaluateRepositoryReleaseSecurityPhysical({ repoRoot: ROOT });
  const receipt = result.ok ? result.value : result.error.value;
  assert.equal(result.ok, true, JSON.stringify(receipt.errors));

  assert.equal(receipt.authority.releaseReadyClaim, false);
  assert.equal(receipt.authority.signingPassClaim, false);
  assert.equal(receipt.authority.notarizationPassClaim, false);
  assert.equal(receipt.authority.fusePassClaim, false);
  assert.equal(receipt.authority.inactivePlatformCertificationClaim, false);
  assert.equal(receipt.authority.programScalarPass, false);
  assert.equal(receipt.releaseReadiness.productionDistributionPublished, false);
  assert.equal(receipt.evidence.statuses.c01, 'PASS_UNSIGNED_LOCAL_ARTIFACT');
  assert.equal(receipt.evidence.statuses.c04, 'PASS_PACKAGED_PERFORMANCE_SECURITY_FINAL_PLATFORM_HANDOFF');
  assert.equal(receipt.evidence.receiptFiles.c01.path, module.PK1_RECEIPT_PATHS.c01);
  assert.equal(receipt.evidence.receiptFiles.c04.path, module.PK1_RECEIPT_PATHS.c04);
});
