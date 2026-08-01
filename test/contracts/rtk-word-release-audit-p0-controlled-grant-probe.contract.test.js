const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const receiptPath = path.join(
  repoRoot,
  'docs',
  'OPS',
  'RTK',
  'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_CONTROLLED_GRANT_PROBE_RECEIPT.json',
);
const programPath = path.join(repoRoot, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const previousSmokeReceiptPath = path.join(
  repoRoot,
  'docs',
  'OPS',
  'RTK',
  'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE12_RECEIPT.json',
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('controlled grant probe records environment permission without package defect claims', () => {
  const receipt = readJson(receiptPath);
  assert.equal(receipt.status, 'MACOS_WORD_SANDBOX_GRANT_REQUIRED_NOT_PACKAGE_INVALID');
  assert.equal(receipt.probe.syntheticOnly, true);
  assert.equal(receipt.probe.userDocumentsTouched, false);
  assert.equal(receipt.probe.networkRequest, false);
  assert.equal(receipt.probe.googleDocsOpened, false);
  assert.equal(receipt.probe.terminalReason, 'HOST_DIALOG_DID_NOT_OPEN_PICKER_OR_DID_NOT_BIND_SELECTED_ITEM');
  assert.equal(receipt.probe.wordOwnedSaveAsCopy.exists, false);
  assert.equal(receipt.packageComparison.packageInvalidProven, false);
  assert.equal(receipt.packageComparison.exporterOrOoxmlChangedForPrompt, false);
  assert.equal(receipt.packageComparison.rawProductReviewDocxBeforeGrant.sha256, receipt.packageComparison.sameUnchangedShaAfterProbe.sha256);
  assert.equal(receipt.capabilityClaims.physicalWordOpenEditSaveCloseReopenProven, false);
  assert.equal(receipt.capabilityClaims.automaticApplyCertified, false);
  assert.equal(receipt.capabilityClaims.wordSaturated, false);
  assert.equal(receipt.capabilityClaims.releaseReady, false);
  assert.equal(receipt.vetoMetrics.falsePackageInvalidClaim, 0);
});

test('program binds the latest permission probe without replacing smoke-wave receipt truth', () => {
  const program = readJson(programPath);
  const smokeReceipt = readJson(previousSmokeReceiptPath);
  assert.equal(
    program.releaseAuditNight01.latestReceiptPath,
    'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_ORIGINATED_WORD_SMOKE_WAVE12_RECEIPT.json',
  );
  assert.equal(
    program.releaseAuditNight01.latestEnvironmentPermissionProbeReceiptPath,
    'docs/OPS/RTK/WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_CONTROLLED_GRANT_PROBE_RECEIPT.json',
  );
  assert.equal(program.releaseAuditNight01.latestEnvironmentPermissionProbeStatus, 'MACOS_WORD_SANDBOX_GRANT_REQUIRED_NOT_PACKAGE_INVALID');
  assert.equal(program.releaseAuditNight01.macosWordSandboxGrantRequired, smokeReceipt.result !== 'PASS');
  assert.equal(program.releaseAuditNight01.packageInvalidProven, false);
  assert.equal(program.releaseAuditNight01.productOriginatedPhysicalLoopSmokeProven, smokeReceipt.result === 'PASS');
  assert.equal(program.releaseAuditNight01.automaticApplyCertified, false);
  assert.equal(program.releaseAuditNight01.wordSaturated, false);
  assert.equal(smokeReceipt.environmentPermissionBoundary.packageInvalidProven, false);
});
