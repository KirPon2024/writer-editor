const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = 'src/io/revisionBridge/reviewTransportMultiSceneAtomicCoordinatorV4.mjs';
const BARREL_PATH = 'src/io/revisionBridge/index.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E11_MULTI_SCENE_ATOMIC_COORDINATOR_RECEIPT.json';
const PROFILE_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json';
const PROGRAM_PATH = 'docs/OPS/RTK/POST_D1_PORTABILITY_PROGRAM_V1.json';

const cryptoPort = {
  sha256Json(value) {
    const stable = stableJson(value);
    return `sha256:${crypto.createHash('sha256').update(Buffer.from(stable, 'utf8')).digest('hex')}`;
  },
};

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function h(label) {
  return `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

async function loadModule() {
  return import(pathToFileURL(path.join(REPO_ROOT, MODULE_PATH)).href);
}

function validInput(overrides = {}) {
  return {
    commitProtocol: 'single-root-pointer',
    projectId: 'project-yalken-e11',
    roundId: 'round-e11',
    baseRootPointer: h('root-before'),
    currentRootPointer: h('root-before'),
    sceneIntents: [
      {
        sceneId: 'scene-b',
        sceneRevision: 'rev-b',
        beforeSha256: h('scene-b-before'),
        afterSha256: h('scene-b-after'),
        requestKey: h('request-b'),
        effectKey: h('effect-b'),
        commandEnvelopeDigest: h('envelope-b'),
        writerPlanDigest: h('plan-b'),
      },
      {
        sceneId: 'scene-a',
        sceneRevision: 'rev-a',
        beforeSha256: h('scene-a-before'),
        afterSha256: h('scene-a-after'),
        requestKey: h('request-a'),
        effectKey: h('effect-a'),
        commandEnvelopeDigest: h('envelope-a'),
        writerPlanDigest: h('plan-a'),
      },
    ],
    ...overrides,
  };
}

function receiptsFromPrepare(prepareRecord, overridesByScene = {}) {
  return prepareRecord.sceneIntents.map((intent) => ({
    sceneId: intent.sceneId,
    requestKey: intent.requestKey,
    effectKey: intent.effectKey,
    beforeSha256: intent.beforeSha256,
    afterSha256: intent.afterSha256,
    stagedOnly: true,
    canonicalSceneWritten: false,
    ...(overridesByScene[intent.sceneId] || {}),
  }));
}

test('V4 E11 prepares deterministic multi-scene single-root-pointer records without writer authority', async () => {
  const mod = await loadModule();
  const first = mod.buildRtkWordV4MultiSceneAtomicPrepare(validInput(), { cryptoPort });
  const second = mod.buildRtkWordV4MultiSceneAtomicPrepare(validInput({
    sceneIntents: validInput().sceneIntents.slice().reverse(),
  }), { cryptoPort });

  assert.equal(first.status, 'prepared');
  assert.equal(first.canWrite, false);
  assert.equal(first.runtimeApplyAuthorityGranted, false);
  assert.equal(first.prepareRecord.schemaVersion, mod.RTK_WORD_V4_MULTI_SCENE_ATOMIC_PREPARE_SCHEMA);
  assert.deepEqual(first.prepareRecord.sceneIntents.map((item) => item.sceneId), ['scene-a', 'scene-b']);
  assert.equal(first.prepareRecord.prepareDigest, second.prepareRecord.prepareDigest);
});

test('V4 E11 builds a shadow-only commit record only after all staged scene receipts match', async () => {
  const mod = await loadModule();
  const prepared = mod.buildRtkWordV4MultiSceneAtomicPrepare(validInput(), { cryptoPort }).prepareRecord;
  const commit = mod.buildRtkWordV4MultiSceneAtomicCommit({
    prepareRecord: prepared,
    currentRootPointer: h('root-before'),
    proposedRootPointer: h('root-after'),
    sceneReceipts: receiptsFromPrepare(prepared),
  }, { cryptoPort });

  assert.equal(commit.status, 'ready');
  assert.equal(commit.code, 'RTK_V4_E11_SINGLE_ROOT_POINTER_COMMIT_READY_SHADOW_ONLY');
  assert.equal(commit.canWrite, false);
  assert.equal(commit.runtimeApplyAuthorityGranted, false);
  assert.equal(commit.commitRecord.schemaVersion, mod.RTK_WORD_V4_MULTI_SCENE_ATOMIC_COMMIT_SCHEMA);
  assert.equal(commit.commitRecord.rootPointerCommitRequired, true);
});

test('V4 E11 rejects stale root duplicate scenes duplicate authority and single-scene false greens', async () => {
  const mod = await loadModule();

  assert.equal(
    mod.buildRtkWordV4MultiSceneAtomicPrepare(validInput({ currentRootPointer: h('other-root') }), { cryptoPort }).code,
    'RTK_V4_E11_STALE_ROOT_POINTER',
  );
  assert.equal(
    mod.buildRtkWordV4MultiSceneAtomicPrepare(validInput({ sceneIntents: [validInput().sceneIntents[0]] }), { cryptoPort }).code,
    'RTK_V4_E11_MULTI_SCENE_REQUIRED',
  );

  const duplicateScene = validInput();
  duplicateScene.sceneIntents[1].sceneId = duplicateScene.sceneIntents[0].sceneId;
  assert.equal(
    mod.buildRtkWordV4MultiSceneAtomicPrepare(duplicateScene, { cryptoPort }).reasons.some((item) => item.code === 'RTK_V4_E11_DUPLICATE_SCENE'),
    true,
  );

  const duplicateEffect = validInput();
  duplicateEffect.sceneIntents[1].effectKey = duplicateEffect.sceneIntents[0].effectKey;
  duplicateEffect.sceneIntents[1].requestKey = duplicateEffect.sceneIntents[0].requestKey;
  const result = mod.buildRtkWordV4MultiSceneAtomicPrepare(duplicateEffect, { cryptoPort });
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E11_DUPLICATE_EFFECT'), true);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_E11_DUPLICATE_REQUEST'), true);
});

test('V4 E11 rejects receipt mismatch and canonical scene write before root pointer commit', async () => {
  const mod = await loadModule();
  const prepared = mod.buildRtkWordV4MultiSceneAtomicPrepare(validInput(), { cryptoPort }).prepareRecord;

  const mismatch = mod.buildRtkWordV4MultiSceneAtomicCommit({
    prepareRecord: prepared,
    currentRootPointer: h('root-before'),
    proposedRootPointer: h('root-after'),
    sceneReceipts: receiptsFromPrepare(prepared, { 'scene-a': { afterSha256: h('tampered-after') } }),
  }, { cryptoPort });
  assert.equal(mismatch.code, 'RTK_V4_E11_RECEIPT_MISMATCH');

  const canonicalWrite = mod.buildRtkWordV4MultiSceneAtomicCommit({
    prepareRecord: prepared,
    currentRootPointer: h('root-before'),
    proposedRootPointer: h('root-after'),
    sceneReceipts: receiptsFromPrepare(prepared, { 'scene-b': { stagedOnly: false, canonicalSceneWritten: true } }),
  }, { cryptoPort });
  assert.equal(canonicalWrite.code, 'RTK_V4_E11_CANONICAL_WRITE_BEFORE_ROOT_POINTER');
});

test('V4 E11 recovery classifies safe abort committed root and partial canonical write states', async () => {
  const mod = await loadModule();
  const prepared = mod.buildRtkWordV4MultiSceneAtomicPrepare(validInput(), { cryptoPort }).prepareRecord;

  const abortSafe = mod.reconcileRtkWordV4MultiSceneAtomicRecovery({
    prepareRecord: prepared,
    observedRootPointer: h('root-before'),
    expectedCommittedRootPointer: h('root-after'),
    sceneReceipts: [],
  }, { cryptoPort });
  assert.equal(abortSafe.status, 'reconciled');
  assert.equal(abortSafe.recoveryRecord.outcome, 'ABORT_SAFE_NO_CANONICAL_WRITES');

  const committed = mod.reconcileRtkWordV4MultiSceneAtomicRecovery({
    prepareRecord: prepared,
    observedRootPointer: h('root-after'),
    expectedCommittedRootPointer: h('root-after'),
    sceneReceipts: receiptsFromPrepare(prepared),
  }, { cryptoPort });
  assert.equal(committed.status, 'reconciled');
  assert.equal(committed.recoveryRecord.outcome, 'COMMITTED_BY_ROOT_POINTER');

  const partialCanonical = mod.reconcileRtkWordV4MultiSceneAtomicRecovery({
    prepareRecord: prepared,
    observedRootPointer: h('root-before'),
    expectedCommittedRootPointer: h('root-after'),
    sceneReceipts: receiptsFromPrepare(prepared, { 'scene-a': { stagedOnly: false, canonicalSceneWritten: true } }),
  }, { cryptoPort });
  assert.equal(partialCanonical.status, 'blocked');
  assert.equal(partialCanonical.recoveryRecord.outcome, 'BLOCKED_CANONICAL_WRITE_BEFORE_ROOT_POINTER');
});

test('V4 E11 coordinator stays platform-neutral and is exported through the existing RTK barrel', async () => {
  const mod = await loadModule();
  const barrel = await import(pathToFileURL(path.join(REPO_ROOT, BARREL_PATH)).href);
  const source = fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8');

  assert.equal(mod.assertRtkWordV4MultiSceneCoordinatorPlatformNeutral().ok, true);
  assert.equal(/from ['"]node:/u.test(source), false);
  for (const token of ['electron', 'ipcRenderer', 'BrowserWindow', 'fetch(', 'XMLHttpRequest', 'localStorage']) {
    assert.equal(source.includes(token), false);
  }
  assert.equal(typeof barrel.buildRtkWordV4MultiSceneAtomicPrepare, 'function');
  assert.equal(typeof barrel.buildRtkWordV4MultiSceneAtomicCommit, 'function');
  assert.equal(typeof barrel.reconcileRtkWordV4MultiSceneAtomicRecovery, 'function');
});

test('V4 E11 receipt profile and program state stay shadow-only without runtime apply authority', async () => {
  const receipt = readJson(RECEIPT_PATH);
  const profile = readJson(PROFILE_PATH);
  const program = readJson(PROGRAM_PATH);
  const verifier = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/ops/rtk-word-v4-e11-multi-scene-atomic-coordinator.mjs')).href);
  const result = verifier.evaluateWordV4E11MultiSceneAtomicCoordinator({ receipt, requireSource: true });
  const cell = profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.multiSceneAtomicCoordinator');

  assert.equal(result.status, 'PASS');
  assert.equal(receipt.componentProof.focusedContractTests, 7);
  assert.equal(receipt.componentProof.runtimeApplyAuthorityGranted, false);
  assert.equal(receipt.runtimeClaims.automaticMultiSceneApplyAdded, false);
  assert.equal(receipt.vetoMetrics.partialCanonicalWriteAllowed, 0);
  assert.equal(cell.state, 'COMPONENT_PROVEN');
  assert.equal(cell.currentCapability, 'MULTI_SCENE_ATOMIC_COORDINATOR_COMPONENT_SHADOW_ONLY');
  assert.equal(cell.physicalWordEvidence, false);
  assert.match(program.v4ExecutionState.status, /^EXECUTION_(11_LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN|12_(?:LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVES|WAVE40_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_100|WAVE100_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_300|WAVE300_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_LIMITATION_AUDIT|STABILITY_LIMITATION_AUDIT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_STABILITY_WAVE|STABILITY_WAVE300_REPEAT_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_LIMITATION_FOLLOWUP|WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_CONTINUE_REMAINING_WORD_LIMITATIONS|MODERN_COMMENT_APPLESCRIPT_LIMITATION_CONFIRMED_CONTINUE_CUSTOM_XML_AUTHORITY|CUSTOM_XML_AUTHORITY_REROUTED_CONTINUE_MULTI_SCENE_APPLY_CERTIFICATION|MULTI_SCENE_APPLY_TYPED_LIMITATION_CONFIRMED_CONTINUE_MODERN_COMMENT_NATIVE_UI|MODERN_COMMENT_NATIVE_UI_BLOCKED_EXTERNAL_ACCESSIBILITY_WAITING))$/u);
  assert.match(program.v4ExecutionState.currentStage, /^EXECUTION_(11_MULTI_SCENE_ATOMIC_COORDINATOR_CRASH_PROOF|12_UNICODE_HOSTILE_PERFORMANCE_CRASH_REPLAY_ESCALATING_WORD_WAVES|12_WORD_STABILITY_LIMITATION_AUDIT|12_NEXT_PHYSICAL_STABILITY_WAVE_300_REPEAT|12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES|12_WORD_LIMITATION_FOLLOWUP_REMAINING_TYPED_LIMITATIONS|12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY|12_WORD_LIMITATION_FOLLOWUP_MULTI_SCENE_APPLY_CERTIFICATION|12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION)$/u);
  assert.match(program.v4ExecutionState.nextStage, /^EXECUTION_(12_UNICODE_HOSTILE_PERFORMANCE_CRASH_REPLAY_ESCALATING_WORD_WAVES|12_NEXT_PHYSICAL_WAVE_(40|100|300)|12_WORD_STABILITY_LIMITATION_AUDIT|12_NEXT_PHYSICAL_STABILITY_WAVE_300_REPEAT|12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES|12_WORD_LIMITATION_FOLLOWUP_REMAINING_TYPED_LIMITATIONS|12_WORD_LIMITATION_FOLLOWUP_CUSTOM_XML_MUTATION_AUTHORITY|12_WORD_LIMITATION_FOLLOWUP_MULTI_SCENE_APPLY_CERTIFICATION|12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION)$/u);
  assert.equal(program.v4ExecutionState.runtimeApplyAuthorityGranted, false);
});
