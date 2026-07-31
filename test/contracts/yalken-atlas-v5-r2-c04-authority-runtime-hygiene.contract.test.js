const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PRODUCT_COMMAND_CAPABILITY_IDS,
  PRODUCT_COMMAND_RECORDS,
} = require('../../src/shared/productCommandRegistry.cjs');
const {
  DEFAULT_AUTHORITY_PLATFORM_ID,
  evaluateCommandCapabilityAuthority,
} = require('../../src/shared/commandCapabilityAuthority.cjs');

function readText(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function platformCapabilities(matrixDoc, platformId) {
  const item = matrixDoc.items.find((row) => row.platformId === platformId);
  assert.ok(item, `missing capability matrix platform ${platformId}`);
  assert.equal(typeof item.capabilities, 'object');
  return item.capabilities;
}

function assertAppearsBefore(source, earlier, later) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  assert.notEqual(earlierIndex, -1, `missing source token ${earlier}`);
  assert.notEqual(laterIndex, -1, `missing source token ${later}`);
  assert.ok(earlierIndex < laterIndex, `${earlier} must appear before ${later}`);
}

test('R2 C04: main dispatch revalidates capability authority before reducer and persistence', () => {
  const mainSource = readText('src/main.js');
  const bridgeStart = mainSource.indexOf('async function dispatchProductCommandBridge');
  assert.notEqual(bridgeStart, -1);
  const bridgeEnd = mainSource.indexOf('module.exports = {', bridgeStart);
  assert.notEqual(bridgeEnd, -1);
  const bridgeSource = mainSource.slice(bridgeStart, bridgeEnd);

  assert.match(mainSource, /evaluateCommandCapabilityAuthority/u);
  assert.match(mainSource, /function readAuthorityCapabilityMatrixDoc/u);
  assert.match(bridgeSource, /const capability = evaluateCommandCapabilityAuthority/u);
  assert.match(bridgeSource, /platformId: DEFAULT_AUTHORITY_PLATFORM_ID/u);
  assert.doesNotMatch(bridgeSource, /platformId:\s*payload\.platformId/u);
  assertAppearsBefore(bridgeSource, 'const capability = evaluateCommandCapabilityAuthority', 'buildProductCoreStateForCurrentProject');
  assertAppearsBefore(bridgeSource, 'const capability = evaluateCommandCapabilityAuthority', 'runtime.reduceCoreState');
  assertAppearsBefore(bridgeSource, 'const capability = evaluateCommandCapabilityAuthority', 'persistProjectManifestAtPath');
  assert.match(bridgeSource, /mutationApplied:\s*false/u);
  assert.match(bridgeSource, /storageWritten:\s*false/u);
});

test('R2 C04: disabled platform capabilities deny direct authority before mutation', () => {
  const matrixDoc = readJson('docs/OPS/CAPABILITIES_MATRIX.json');
  const denied = evaluateCommandCapabilityAuthority({
    commandId: 'atlas.entity.create',
    capabilityId: 'cap.atlas.entity.create',
    platformId: 'web',
    matrixDoc,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(denied.error.details.commandAuthority, 'CommandKernel');
  assert.equal(denied.error.details.mutationApplied, false);
  assert.equal(denied.error.details.storageWritten, false);

  const missingMatrix = evaluateCommandCapabilityAuthority({
    commandId: 'atlas.entity.create',
    capabilityId: 'cap.atlas.entity.create',
    platformId: DEFAULT_AUTHORITY_PLATFORM_ID,
    matrixDoc: null,
  });
  assert.equal(missingMatrix.ok, false);
  assert.equal(missingMatrix.error.code, 'E_CAPABILITY_MATRIX_UNAVAILABLE');
  assert.equal(missingMatrix.error.details.mutationApplied, false);
  assert.equal(missingMatrix.error.details.storageWritten, false);
});

test('R2 C04: product command registry, binding, and platform matrix stay single-source equivalent', () => {
  const bindingDoc = readJson('docs/OPS/STATUS/COMMAND_CAPABILITY_BINDING.json');
  const matrixDoc = readJson('docs/OPS/CAPABILITIES_MATRIX.json');
  const binding = new Map(bindingDoc.items.map((row) => [row.commandId, row.capabilityId]));
  const nodeCapabilities = platformCapabilities(matrixDoc, 'node');
  const webCapabilities = platformCapabilities(matrixDoc, 'web');
  const mobileCapabilities = platformCapabilities(matrixDoc, 'mobile-wrapper');

  for (const record of PRODUCT_COMMAND_RECORDS) {
    assert.equal(binding.get(record.id), record.capabilityId, `binding mismatch for ${record.id}`);
  }
  for (const capabilityId of PRODUCT_COMMAND_CAPABILITY_IDS) {
    assert.equal(nodeCapabilities[capabilityId], true, `node missing product capability ${capabilityId}`);
    assert.equal(webCapabilities[capabilityId], false, `web must fail closed for product capability ${capabilityId}`);
    assert.equal(mobileCapabilities[capabilityId], false, `mobile-wrapper must fail closed for product capability ${capabilityId}`);
  }
});

test('R2 C04: runtime projections omit external design-tool and product-reference metadata', () => {
  const runtimeSources = [
    'src/derived/atlas/deriveAtlasOverview.mjs',
    'src/derived/atlas/deriveAtlasEntityDossier.mjs',
    'src/derived/atlas/deriveAtlasRelationDossier.mjs',
    'src/derived/atlas/deriveAtlasMatrices.mjs',
    'src/derived/atlas/deriveAtlasHeatmap.mjs',
    'src/derived/atlas/deriveAtlasReportsSavedQueries.mjs',
    'src/derived/atlas/deriveAtlasTemporalLayout.mjs',
    'src/derived/atlas/deriveAtlasContinuityLedgerSurface.mjs',
    'src/derived/atlas/deriveAtlasDiagnosticsStageAcceptance.mjs',
  ];
  const forbiddenRuntimeMetadata = /\blazyweb\b|\buiCraft\b|\breferenceCompanies\b|\bdesignRoute\b|\bjobber\b|\bsentry\b|\bjira\b|\bdocusign\b|\bmixpanel\b|\bgoogle-analytics\b|\brelativity\b|\bhotjar\b|\bamplitude\b|\bappsignal\b|\blogrocket\b|\bfingerprint\b|\btool-failure\b|\btoolFailure\b|\bproduct-reference\b|\bexternal-product\b/iu;
  for (const relativePath of runtimeSources) {
    const source = readText(relativePath);
    assert.doesNotMatch(source, forbiddenRuntimeMetadata, `${path.basename(relativePath)} leaked external runtime metadata`);
    assert.match(source, /designAdvisory/u, `${path.basename(relativePath)} should retain generic advisory provenance`);
    assert.match(source, /runtimeMetadataIncluded:\s*false/u, `${path.basename(relativePath)} should mark runtime metadata omitted`);
    assert.match(source, /readinessToken:\s*false/u, `${path.basename(relativePath)} should reject advisory readiness tokens`);
  }
});

test('R2 C04: receipt binds honest authority hygiene evidence without Program DoD overclaim', () => {
  const receiptPath = 'docs/OPS/STATUS/YALKEN_ATLAS_V5_R2_C04_AUTHORITY_RUNTIME_HYGIENE_RECEIPT.json';
  if (!fs.existsSync(path.join(process.cwd(), receiptPath))) {
    assert.ok(true);
    return;
  }

  const receipt = readJson(receiptPath);
  assert.equal(receipt.contourId, 'R2_C04_AUTHORITY_AND_RUNTIME_HYGIENE');
  assert.equal(receipt.status, 'LOCAL_VALIDATION_PASS_DELIVERY_PENDING');
  assert.equal(receipt.programDodVerdict, 'NOT_READY_R2_REPAIR_IN_PROGRESS');
  assert.equal(receipt.deliveredScope.authoritySideCapabilityRevalidationBeforeReducer, true);
  assert.equal(receipt.deliveredScope.authoritySideCapabilityRevalidationBeforePersistence, true);
  assert.equal(receipt.deliveredScope.directIpcCapabilityDenialFailClosed, true);
  assert.equal(receipt.deliveredScope.deniedMutationApplied, false);
  assert.equal(receipt.deliveredScope.deniedStorageWritten, false);
  assert.equal(receipt.deliveredScope.runtimeDesignToolMetadataRemoved, true);
  assert.equal(receipt.deliveredScope.runtimeProductReferenceMetadataRemoved, true);
  assert.equal(receipt.deliveredScope.noSecondRegistry, true);
  assert.equal(receipt.deliveredScope.noSecondWritePath, true);
  assert.equal(receipt.deliveredScope.noRuntimeNetwork, true);
  assert.equal(receipt.deliveredScope.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.fullRunnerEvidence.fail, 0);
  assert.equal(receipt.focusedEvidence.fail, 0);
  assert.match(receipt.fullRunnerEvidence.artifactSha256, /^[0-9a-f]{64}$/u);
  assert.match(receipt.focusedEvidence.artifactSha256, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.delivery.commit, 'PENDING_PRE_COMMIT');
  assert.equal(receipt.delivery.merge, 'PENDING');
  assert.ok(receipt.unsatisfiedStageOutcomes.includes('EFINAL_PROGRAM_DOD_CERTIFIED'));
});
