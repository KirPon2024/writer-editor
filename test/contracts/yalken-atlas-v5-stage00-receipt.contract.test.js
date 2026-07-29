const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const RECEIPT_PATH = 'docs/OPS/STATUS/YALKEN_ATLAS_V5_STAGE_00_BINDING_AND_CALIBRATION_RECEIPT.json';
const EXPECTED_CONTRACT_SHA = '4f0a9daf49541abf26f314c0a3d0720e4639ba4d765e87753a6465b34048d217';
const EXPECTED_BASE_SHA = '3c4e791b9ee41e8c3d586f18f62a9430c336e9bf';

function readReceipt() {
  return JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'));
}

test('Yalken Atlas V5 Stage 00 receipt binds the immutable contract and remote base', () => {
  const receipt = readReceipt();

  assert.equal(receipt.planId, 'YALKEN_ATLAS_MINDMAP_AUTONOMOUS_MASTER_PLAN_V5');
  assert.equal(receipt.contourId, 'STAGE_00_BINDING_AND_CALIBRATION');
  assert.equal(receipt.immutableContract.boundSha256, EXPECTED_CONTRACT_SHA);
  assert.equal(receipt.immutableContract.observedSha256, EXPECTED_CONTRACT_SHA);
  assert.equal(receipt.immutableContract.match, true);
  assert.equal(receipt.projectAndMutationOwnerBinding.defaultBranch, 'main');
  assert.equal(receipt.projectAndMutationOwnerBinding.bindingBaseSha, EXPECTED_BASE_SHA);
  assert.equal(receipt.projectAndMutationOwnerBinding.expectedTargetHead, EXPECTED_BASE_SHA);
  assert.equal(receipt.projectAndMutationOwnerBinding.activeBranch, 'codex/yalken-atlas-v5-e00');
  assert.equal(receipt.projectAndMutationOwnerBinding.canonicalCheckoutTouched, false);
});

test('Yalken Atlas V5 Stage 00 receipt separates live runtime from target-only Atlas claims', () => {
  const receipt = readReceipt();

  assert.ok(receipt.currentRealityMap.liveRuntime.includes('tiptap_oss_editor_surface'));
  assert.ok(receipt.currentRealityMap.notLiveRuntime.includes('automatic_atlas_domain'));
  assert.ok(receipt.currentRealityMap.notLiveRuntime.includes('graph_workbench_runtime'));
  assert.equal(receipt.stage00Acceptance.noTargetOnlyClaimMarkedLive, true);
  assert.equal(receipt.featureIntegrationManifestStage01.currentReality, 'TARGET_ONLY_UNTIL_STAGE01_RUNTIME_CONTOURS_MERGE');
});

test('Yalken Atlas V5 Stage 00 receipt maps gates without creating a second registry', () => {
  const receipt = readReceipt();
  const families = new Set(receipt.atlasGateFamilyMap.map((item) => item.family));

  assert.equal(receipt.gateModeAdapterMap.secondRegistryCreated, false);
  assert.equal(receipt.stage00Acceptance.secondTokenRegistryCreated, false);
  assert.equal(families.size, 7);
  assert.ok(families.has('AUTHOR_DATA_DURABILITY_OK'));
  assert.ok(families.has('PACKAGED_CRITICAL_JOURNEY_OK'));
  assert.ok(families.has('CANONICAL_MUTATION_BOUNDARY_OK'));
  assert.ok(families.has('DERIVED_ISOLATION_AND_PUBLICATION_OK'));
  assert.ok(families.has('NARRATIVE_EVIDENCE_AND_LANGUAGE_TRUTH_OK'));
  assert.ok(families.has('INTERACTION_BUDGET_OK'));
  assert.ok(families.has('OFFLINE_SECURITY_AND_ACTIVE_PLATFORM_OK'));
});

test('Yalken Atlas V5 Stage 00 receipt compiles a linear Stage 01 queue with no dependency addition', () => {
  const receipt = readReceipt();

  assert.deepEqual(receipt.dependencyDecisionRegistry.newDependenciesAdded, []);
  assert.equal(receipt.dependencyDecisionRegistry.stage00Decision, 'NO_NEW_DEPENDENCY');
  assert.equal(receipt.stage01ContourQueue.length, 4);
  assert.deepEqual(
    receipt.stage01ContourQueue.map((item) => item.contourId),
    [
      'E01_C01_ATLAS_AUTHOR_DATA_AND_COMMAND_BOUNDARY',
      'E01_C02_EXACT_MENTION_ANALYZER_AND_EVIDENCE_ANCHORS',
      'E01_C03_CURRENT_SCENE_ATLAS_PROJECTION_AND_DOSSIER_SURFACE',
      'E01_C04_EXACT_ATLAS_RECOVERY_EXPORT_AND_PACKAGED_JOURNEY',
    ],
  );
  assert.equal(receipt.stage00Acceptance.linearStage01OrderExists, true);
  assert.equal(receipt.stage00Acceptance.productRuntimeChanged, false);
});
