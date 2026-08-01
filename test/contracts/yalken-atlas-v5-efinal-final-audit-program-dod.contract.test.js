const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');

const ROOT = process.cwd();

async function loadModule() {
  return import(pathToFileURL(path.join(
    ROOT,
    'scripts',
    'ops',
    'yalken-atlas-v5-efinal-final-audit-program-dod.mjs',
  )).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256File(relativePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, relativePath)))
    .digest('hex');
}

function machineReadyInput() {
  const sha = '84f10f656bcd3352a406b06bf1b3f87d545d1c14';
  const c01Path = 'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C01_INDEPENDENT_FINAL_RERUN/physical-r3-c05-rerun/c01-atlas-entity-relation/r3-c01-atlas-entity-relation-ui-journeys-report.json';
  const c02Path = 'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C01_INDEPENDENT_FINAL_RERUN/physical-r3-c05-rerun/c02-temporal-continuity-saved-query/r3-c02-temporal-continuity-saved-query-journeys-report.json';
  const c03Path = 'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C01_INDEPENDENT_FINAL_RERUN/physical-r3-c05-rerun/c03-manual-map-portability/r3-c03-manual-map-attachments-portals-templates-report.json';
  const c04Path = 'docs/OPS/EVIDENCE/YALKEN_ATLAS_V5_NIGHT01_C01_INDEPENDENT_FINAL_RERUN/physical-r3-c05-rerun/c04-multilingual-worker-stress/r3-c04-multilingual-worker-stress-report.json';
  return {
    repoRoot: ROOT,
    identity: {
      branch: 'main',
      headSha: sha,
      originMainSha: sha,
      headEqualsOriginMain: true,
      localDirtyFileCount: 0,
      remoteBranchExists: false,
    },
    sourceDeltaFiles: [],
    repairQueue: [
      {
        id: 'REPAIR_MACHINE_READY_FIXTURE',
        receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_FINAL_AUDIT_P0_01_FUTURE_SCHEMA_LOSS_RECEIPT.json',
        requiredAcceptance: ['futureSchemaLossFixed'],
      },
    ],
    r3Report: {
      pass: true,
      git: { headSha: sha, originMainSha: sha },
      journeys: {
        c01: {
          pass: true,
          reportPath: c01Path,
          reportSha256: sha256File(c01Path),
        },
        c02: {
          pass: true,
          reportPath: c02Path,
          reportSha256: sha256File(c02Path),
        },
        c03: {
          pass: true,
          reportPath: c03Path,
          reportSha256: sha256File(c03Path),
        },
        c04: {
          pass: true,
          reportPath: c04Path,
          reportSha256: sha256File(c04Path),
        },
      },
    },
  };
}

test('EFINAL: current repo is NOT_READY when physical capability proof is stale or P0 queue remains open', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const result = evaluateFinalAudit({ repoRoot: ROOT });

  assert.equal(result.pass, false);
  assert.equal(result.status, 'NOT_READY_EFINAL_MACHINE_CAPABILITY_GAPS');
  assert.equal(result.finalProgramDoDClaim, false);
  assert.equal(result.legacyReceiptStatusCanCertifyProgramDoD, false);
  assert.equal(result.falseReadinessGuards.receiptPassDoneDeliveredStatusAcceptedAsProof, false);
  assert.ok(result.failures.some((failure) => failure.code === 'MACHINE_SOURCE_BINDING_FAILED'));
  assert.ok(result.failures.some((failure) => failure.code === 'FINAL_AUDIT_REPAIR_QUEUE_OPEN'));
});

test('EFINAL: status-only receipts cannot satisfy Program DoD', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const input = machineReadyInput();
  input.repairQueue = [
    {
      id: 'STATUS_ONLY_RECEIPT',
      receiptPath: 'docs/OPS/STATUS/YALKEN_ATLAS_V5_NIGHT01_C02_FINAL_DISPOSITION_RECEIPT.json',
      requiredAcceptance: ['machineCapabilityGateInstalled'],
    },
  ];
  const result = evaluateFinalAudit(input);

  assert.equal(result.pass, false);
  assert.equal(result.finalProgramDoDClaim, false);
  assert.ok(result.failures.some((failure) => failure.code === 'FINAL_AUDIT_REPAIR_QUEUE_OPEN'));
  assert.equal(result.legacyReceiptStatusCanCertifyProgramDoD, false);
});

test('EFINAL: exact sourceBinding is mandatory even when capability reports say PASS', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const input = machineReadyInput();
  input.r3Report.git.headSha = '1111111111111111111111111111111111111111';
  input.sourceDeltaFiles = ['src/main.js'];
  const result = evaluateFinalAudit(input);

  assert.equal(result.pass, false);
  assert.equal(result.finalProgramDoDClaim, false);
  assert.ok(result.failures.some((failure) => failure.code === 'MACHINE_SOURCE_BINDING_FAILED' && failure.id === 'exactHeadBinding'));
  assert.ok(result.failures.some((failure) => failure.code === 'MACHINE_SOURCE_BINDING_FAILED' && failure.id === 'noProductRuntimeDeltaSincePhysicalProof'));
});

test('EFINAL: negative controls are required, not screenshots or receipt flags', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const input = machineReadyInput();
  const c01Path = path.join(ROOT, input.r3Report.journeys.c01.reportPath);
  const c01Report = clone(JSON.parse(fs.readFileSync(c01Path, 'utf8')));
  c01Report.negativeAssertions.directIpcAcceptedJourney = true;
  const tempDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'yalken-efinal-p0-02-'));
  const tempC01 = path.join(tempDir, 'c01.json');
  fs.writeFileSync(tempC01, `${JSON.stringify(c01Report, null, 2)}\n`);
  input.r3Report.journeys.c01.reportPath = tempC01;
  input.r3Report.journeys.c01.reportSha256 = require('node:crypto')
    .createHash('sha256')
    .update(fs.readFileSync(tempC01))
    .digest('hex');

  const result = evaluateFinalAudit(input);
  assert.equal(result.pass, false);
  assert.equal(result.finalProgramDoDClaim, false);
  assert.ok(result.machineCapabilityGate.capabilities.atlasEntityRelationUi.checks.some((check) => (
    check.key === 'directIpcAcceptedJourney' && check.pass === false
  )));
});

test('EFINAL: machine-ready fixture can pass only with exact source, persisted/reopen proof, negative controls, and closed repair queue', async () => {
  const { evaluateFinalAudit } = await loadModule();
  const result = evaluateFinalAudit(machineReadyInput());

  assert.equal(result.pass, true);
  assert.equal(result.finalProgramDoDClaim, true);
  assert.equal(result.programDodEvidenceMap.length, 20);
  assert.equal(result.programDodEvidenceMap.every((row) => row.pass), true);
  assert.equal(result.machineCapabilityGate.sourceBinding.pass, true);
  assert.equal(result.activePlatformScope.windows, 'NOT_ACTIVATED_NO_PASS_NO_HOLD');
});

test('EFINAL: final audit source keeps legacy receipt statuses diagnostic-only', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'scripts', 'ops', 'yalken-atlas-v5-efinal-final-audit-program-dod.mjs'),
    'utf8',
  );

  assert.match(source, /LEGACY_RECEIPT_STATUS_IS_DIAGNOSTIC_ONLY/u);
  assert.match(source, /receiptPassDoneDeliveredStatusAcceptedAsProof: false/u);
  assert.doesNotMatch(source, /status\.includes\\('PASS'\\)/u);
  assert.doesNotMatch(source, /status\.includes\\('DELIVERED'\\)/u);
  assert.doesNotMatch(source, /status\.includes\\('DONE'\\)/u);
});
