const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = process.cwd();

async function importAudit() {
  return import(pathToFileURL(path.join(REPO_ROOT, 'scripts/ops/yalken-atlas-v5-r3-c00-saturation-audit.mjs')).href);
}

function makePhysicalReport(overrides = {}) {
  const inputEvents = [
    ...Array.from({ length: 8 }, (_, index) => ({ type: 'mouseDown', x: index + 1, y: index + 2 })),
    ...Array.from({ length: 4 }, (_, index) => ({ type: 'char', keyCode: String(index) })),
  ];
  return {
    pass: true,
    status: 'PASS_VISIBLE_UI_BLACK_BOX_ACCEPTANCE',
    accepted: {
      visibleInputRuntime: true,
      pointerAndKeyboardUsed: true,
      createRenameConnectMoveSearchDelete: true,
      cancelNoop: true,
      hitTestableNonblankGraph: true,
      listKeyboardParity: true,
      saveQuitReopenRecovery: true,
      exportRepeatImport: true,
      noNetworkNoDialogs: true,
      noWrongTargetOrViewStatePersistence: true,
      noOverflow: true,
    },
    negativeAssertions: {
      directIpcAcceptedJourney: false,
      proofByScreenshotByteSizeOnly: false,
    },
    runtime: {
      first: {
        runtimeKind: 'production-electron-visible-input-black-box',
        result: { rendererProbe: { inputEvents } },
      },
      second: {
        runtimeKind: 'production-electron-visible-input-black-box',
      },
    },
    ...overrides,
  };
}

const sourceReachability = {
  atlasMutationCommandsPresent: true,
  manualMapCommandsPresent: true,
  atlasReadQueriesPresent: true,
  commandRegistryProof: { exists: true, bytes: 100, sha256: 'command-sha' },
  queryRegistryProof: { exists: true, bytes: 100, sha256: 'query-sha' },
};

test('R3 C00: fresh physical UI proof compiles a repair queue without claiming Program DONE', async () => {
  const audit = await importAudit();
  const report = audit.evaluateSaturationAudit({
    physicalProof: { exists: true, bytes: 100, sha256: 'physical-sha' },
    physicalReportDoc: makePhysicalReport(),
    sourceReachability,
    gitIdentity: { branch: 'test', headSha: 'h', originMainSha: 'h', headEqualsOriginMain: true, dirtyFileCount: 0 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.status, 'PASS_AUDIT_READY_FOR_R3_REPAIR_QUEUE');
  assert.equal(report.programDodVerdict, 'NOT_DONE_R3_SATURATION_REPAIRS_REQUIRED');
  assert.equal(report.releaseVetoes.programDoneClaim, false);
  assert.deepEqual(report.certifiedByThisContour, ['manual-map-core-visible-journey-fresh-r3-proof']);
  assert.ok(report.notCertifiedByThisContour.includes('atlas-entity-alias-mention-evidence-journey'));
  assert.ok(report.nextContours.includes('R3_C01_ATLAS_ENTITY_RELATION_UI_JOURNEYS'));
  assert.equal(report.designToolRouter.lazywebAdvisory.runtimeReadinessToken, false);
});

test('R3 C00: generated-only or screenshot-byte proof cannot pass as physical saturation evidence', async () => {
  const audit = await importAudit();
  const report = audit.evaluateSaturationAudit({
    physicalProof: { exists: true, bytes: 100, sha256: 'physical-sha' },
    physicalReportDoc: makePhysicalReport({
      negativeAssertions: {
        directIpcAcceptedJourney: false,
        proofByScreenshotByteSizeOnly: true,
      },
    }),
    sourceReachability,
    gitIdentity: { branch: 'test', headSha: 'h', originMainSha: 'h', headEqualsOriginMain: true, dirtyFileCount: 0 },
  });

  assert.equal(report.pass, false);
  assert.equal(report.physicalEvidence.acceptedAsCapabilityEvidence, false);
  assert.equal(report.releaseVetoes.generatedArtifactsAloneAccepted, false);
  assert.equal(report.releaseVetoes.screenshotsAloneAccepted, false);
});

test('R3 C00: source reachability does not certify Atlas UI journeys without physical proof', async () => {
  const audit = await importAudit();
  const report = audit.evaluateSaturationAudit({
    physicalProof: { exists: true, bytes: 100, sha256: 'physical-sha' },
    physicalReportDoc: makePhysicalReport(),
    sourceReachability,
    gitIdentity: { branch: 'test', headSha: 'h', originMainSha: 'h', headEqualsOriginMain: true, dirtyFileCount: 0 },
  });

  const atlasEntity = report.capabilityRows.find((row) => row.id === 'atlas-entity-alias-mention-evidence-journey');
  assert.equal(atlasEntity.status, 'SOURCE_REACHABLE_REQUIRES_R3_PHYSICAL_JOURNEY');
  assert.ok(report.notCertifiedByThisContour.includes(atlasEntity.id));
});
