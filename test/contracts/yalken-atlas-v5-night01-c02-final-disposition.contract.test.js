const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  return import(pathToFileURL(path.join(
    process.cwd(),
    'scripts/ops/yalken-atlas-v5-night01-c02-final-disposition.mjs',
  )).href);
}

function passingInput() {
  const sha = '84f10f656bcd3352a406b06bf1b3f87d545d1c14';
  return {
    identity: {
      branch: 'codex/yalken-atlas-v5-night01-c02-final-disposition',
      headSha: sha,
      originMainSha: sha,
      headEqualsOriginMain: true,
      dirtyFiles: [],
    },
    c01Receipt: {
      pass: true,
      independentAuditNoOpenP0: true,
      postMergeChecks: {
        tempExactHeadIndependentRerun: {
          headSha: 'e2cb9389c38f17da2dd3481443bcfdb21af47c31',
        },
      },
      releaseTruth: {
        noOpenNight01P0OnMergedRemoteHead: true,
        legacyEfinalAggregationAcceptedAsProgramDone: false,
        generatedScreenshotsAcceptedAlone: false,
      },
    },
    finalAuditReport: {
      pass: true,
      finalProgramDoDClaim: true,
      status: 'PASS_EFINAL_READY_FOR_DELIVERY',
      gitIdentity: {
        headSha: sha,
        originMainSha: sha,
      },
      failures: [],
    },
    runtimeDeltaFiles: [
      'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json',
      'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C01_REMOTE_MERGE_VERIFICATION_RECEIPT.json',
      'test/contracts/yalken-atlas-v5-night01-c01-remote-merge-verification.contract.test.js',
    ],
  };
}

test('Night01 C02: final disposition can claim readiness only with executable no-P0 proof and no runtime delta', async () => {
  const mod = await loadModule();
  const report = mod.buildNight01C02Report(passingInput());
  assert.equal(report.status, 'PASS_NIGHT01_C02_PROGRAM_DOD_READY_FOR_FINAL_REMOTE_VERIFICATION');
  assert.equal(report.pass, true);
  assert.equal(report.programDoneClaim, true);
  assert.equal(report.runtimeDeltaSinceExactPhysicalRerun.productRuntimeChangedFiles.length, 0);
  assert.equal(report.checks.executableRerunSupersedesLegacyAggregation, true);
});

test('Night01 C02: product runtime delta after exact physical rerun blocks final disposition', async () => {
  const mod = await loadModule();
  const input = passingInput();
  input.runtimeDeltaFiles = ['src/main.js'];
  const report = mod.buildNight01C02Report(input);
  assert.equal(report.pass, false);
  assert.ok(report.openFindings.includes('noProductRuntimeDeltaSinceExactPhysicalRerun'));
  assert.deepEqual(report.runtimeDeltaSinceExactPhysicalRerun.productRuntimeChangedFiles, ['src/main.js']);
});

test('Night01 C02: legacy EFINAL pass alone cannot replace the Night01 executable no-P0 receipt', async () => {
  const mod = await loadModule();
  const input = passingInput();
  input.c01Receipt.independentAuditNoOpenP0 = false;
  const report = mod.buildNight01C02Report(input);
  assert.equal(report.pass, false);
  assert.ok(report.openFindings.includes('c01RemoteVerifiedNoOpenP0'));
});
