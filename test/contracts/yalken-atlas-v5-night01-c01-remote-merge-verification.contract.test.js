const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RECEIPT_PATH = path.join(
  process.cwd(),
  'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C01_REMOTE_MERGE_VERIFICATION_RECEIPT.json',
);

test('Night01 C01 remote verification binds merged origin/main exact-head rerun without Program DONE claim', () => {
  const receipt = JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'));
  assert.equal(receipt.status, 'PASS_NIGHT01_C01_REMOTE_MERGE_AND_EXACT_HEAD_RERUN_VERIFIED');
  assert.equal(receipt.pass, true);
  assert.equal(receipt.programDoneClaim, false);
  assert.equal(receipt.independentAuditNoOpenP0, true);
  assert.equal(receipt.delivery.prNumber, 1344);
  assert.equal(receipt.delivery.mergeCommitSha, receipt.delivery.verifiedOriginMainSha);
  assert.equal(receipt.postMergeChecks.headSha, receipt.delivery.mergeCommitSha);
  assert.equal(receipt.postMergeChecks.originMainSha, receipt.delivery.mergeCommitSha);
  assert.equal(receipt.postMergeChecks.tempExactHeadIndependentRerun.pass, true);
  assert.deepEqual(receipt.postMergeChecks.tempExactHeadIndependentRerun.runtimeDirtyFiles, []);
  assert.deepEqual(receipt.postMergeChecks.tempExactHeadIndependentRerun.openFindings, []);
  assert.equal(receipt.releaseTruth.legacyEfinalAggregationAcceptedAsProgramDone, false);
  assert.equal(receipt.releaseTruth.generatedScreenshotsAcceptedAlone, false);
});
