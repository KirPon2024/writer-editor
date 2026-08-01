const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  return import(pathToFileURL(path.join(
    process.cwd(),
    'scripts/ops/yalken-atlas-v5-night01-c01-independent-final-rerun.mjs',
  )).href);
}

function passingInput() {
  return {
    identity: {
      branch: 'codex/yalken-atlas-v5-night01-c01-final-rerun',
      headSha: 'sha',
      originMainSha: 'sha',
      headEqualsOriginMain: true,
      dirtyFiles: ['scripts/ops/yalken-atlas-v5-night01-c01-independent-final-rerun.mjs'],
      runtimeDirtyFiles: [],
      runtimeCleanForIndependentRerun: true,
    },
    r3Result: {
      status: 'PASS_R3_C05_RELEASE_SATURATION_REVALIDATED',
      pass: true,
      reportPath: path.join(process.cwd(), 'docs/OPS/EVIDENCE/fake/report.json'),
      reportSha256: 'r3-report-sha',
      receiptPath: path.join(process.cwd(), 'docs/OPS/EVIDENCE/fake/receipt.json'),
      receiptSha256: 'r3-receipt-sha',
      p0Rows: [
        { id: 'NIGHT01_P0_01_EXECUTABLE_DOD_ROWS', status: 'CLOSED_BY_EXECUTABLE_R3_ROWS' },
      ],
      openP0: [],
    },
    finalAudit: {
      schemaVersion: 'yalken.atlas.v5.efinal.finalAuditProgramDod.v1',
      status: 'PASS_EFINAL_READY_FOR_DELIVERY',
      pass: true,
    },
  };
}

test('Night01 C01: physical rerun pass is required and legacy EFINAL aggregation remains advisory', async () => {
  const mod = await loadModule();
  const report = mod.buildNight01C01Report(passingInput());
  assert.equal(report.status, 'PASS_NIGHT01_C01_INDEPENDENT_FINAL_RERUN_NO_OPEN_P0');
  assert.equal(report.pass, true);
  assert.equal(report.independentAuditNoOpenP0, true);
  assert.equal(report.programDoneClaim, false);
  assert.equal(report.legacyFinalAudit.advisoryOnly, true);
  assert.equal(report.legacyFinalAudit.acceptedAsProgramDoneToken, false);
});

test('Night01 C01: runtime dirty files prevent exact independent rerun certification', async () => {
  const mod = await loadModule();
  const input = passingInput();
  input.identity.runtimeDirtyFiles = ['src/main.js'];
  input.identity.runtimeCleanForIndependentRerun = false;
  const report = mod.buildNight01C01Report(input);
  assert.equal(report.pass, false);
  assert.ok(report.openFindings.includes('productRuntimeClean'));
});

test('Night01 C01: skipped or failed physical rows keep P0 open', async () => {
  const mod = await loadModule();
  const input = passingInput();
  input.r3Result.pass = false;
  input.r3Result.status = 'NOT_READY_R3_C05_OPEN_P0';
  input.r3Result.openP0 = [{ id: 'NIGHT01_P0_01_EXECUTABLE_DOD_ROWS' }];
  const report = mod.buildNight01C01Report(input);
  assert.equal(report.pass, false);
  assert.ok(report.openFindings.includes('executablePhysicalRowsPass'));
  assert.ok(report.openFindings.includes('noOpenNight01P0'));
});
