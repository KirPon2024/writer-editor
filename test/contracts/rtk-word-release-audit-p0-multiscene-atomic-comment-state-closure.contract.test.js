const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MULTI_SCENE_ATOMIC_COMMENT_STATE_CLOSURE_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-multiscene-atomic-comment-state-closure.mjs');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const BRIDGE_INDEX_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const MULTI_RUNTIME_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportMultiSceneNonOverlapTrackedReplacementRuntime.mjs');
const COMMENT_SHADOW_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function zeroValues(object) {
  return Object.values(object || {}).filter((value) => Number(value) !== 0);
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('P0 multi-scene atomic comment-state receipt verifies terminal product truth', async () => {
  const { evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.observedCases, 3);
  assert.equal(result.negativeCases, 4);
  assert.equal(result.multiSceneAtomicApplyCertified, true);
  assert.equal(result.commentDeleteProductRuntimeWired, true);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);
  assert.equal(result.googleDocsOpened, false);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
});

test('P0 multi-scene product loop uses one coordinated command and all scenes replay', () => {
  const receipt = readJson(RECEIPT_PATH);
  const multi = receipt.physicalCorpus.productCases.find((item) => item.caseId === 'P0MS-001');

  assert.equal(multi.result, 'PASS');
  assert.equal(multi.sceneCount, 2);
  assert.equal(multi.multiSceneCommandDispatched, true);
  assert.equal(multi.commandKernelCommandIds.includes('cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements'), true);
  assert.equal(multi.applyStatus, 'applied');
  assert.equal(multi.replayStatus, 'replay');
  assert.equal(multi.multiSceneAtomicApplyCertified, true);
  assert.equal(multi.automaticApplyCertified, false);
  assert.equal(multi.scenes.every((scene) => scene.productLoop.authenticatedV2Intake === true), true);
  assert.equal(multi.scenes.every((scene) => scene.productLoop.visiblePreviewReady === true), true);
  assert.equal(multi.scenes.every((scene) => scene.productLoop.manuscriptMutationDuringAnalysisOrPreview === false), true);
  assert.equal(multi.scenes.every((scene) => scene.productLoop.correctSceneRouted === true), true);
  assert.equal(multi.scenes.every((scene) => scene.productLoop.replayIdempotent === true), true);
});

test('P0 comment delete is product state, while reply and resolve remain typed limitations', () => {
  const receipt = readJson(RECEIPT_PATH);
  const commentDelete = receipt.physicalCorpus.productCases.find((item) => item.caseId === 'P0CS-001');
  const replyResolve = receipt.physicalCorpus.productCases.find((item) => item.caseId === 'P0CS-002');

  assert.equal(commentDelete.result, 'PASS');
  assert.equal(commentDelete.physicalWord.physicalDeleteCertified, true);
  assert.equal(commentDelete.productLoop.commandId, 'cmd.rtk.reviewSession.importComments');
  assert.equal(commentDelete.productLoop.commentDeleteProductRuntimeWired, true);
  assert.equal(commentDelete.productLoop.outcomeCounts.deleted, 1);
  assert.equal(commentDelete.productLoop.manuscriptMutation, false);
  assert.equal(receipt.implementedCapability.commentDeleteProductRuntimeWired, true);

  assert.equal(replyResolve.result, 'PASS');
  assert.deepEqual(replyResolve.typedLimitations.sort(), [
    'MODERN_COMMENT_REPLY_NOT_CERTIFIED_IN_PRODUCT_PATH',
    'MODERN_COMMENT_RESOLVE_REOPEN_NOT_CERTIFIED_IN_PRODUCT_PATH',
  ]);
  assert.equal(receipt.implementedCapability.modernReplyProductRuntimeWired, false);
  assert.equal(receipt.implementedCapability.modernResolveReopenProductRuntimeWired, false);
});

test('P0 negatives block before writer and overclaims fail evaluator', async () => {
  const { evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure } = await loadEvaluator();
  const base = {
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  };
  const negatives = new Map(base.receipt.physicalCorpus.negativeCases.map((item) => [item.caseId, item]));

  assert.equal(negatives.get('P0MS-N01').reason, 'RTK_MULTI_SCENE_STALE_SCENE');
  assert.equal(negatives.get('P0MS-N01').writerCalls, 0);
  assert.equal(negatives.get('P0MS-N02').reason, 'RTK_MULTI_SCENE_WRONG_SCENE_ROUTE');
  assert.equal(negatives.get('P0MS-N02').writerCalls, 0);
  assert.equal(negatives.get('P0MS-N03').writerCalls, 0);
  assert.equal(negatives.get('P0MS-N04').reason, 'RTK_MULTI_SCENE_SIMULATED_SCENE_FAILURE_ROLLED_BACK');
  assert.equal(negatives.get('P0MS-N04').rollbackOk, true);
  assert.equal(negatives.get('P0MS-N04').allScenesRestored, true);

  const overclaimed = clone(base.receipt);
  overclaimed.implementedCapability.automaticApplyCertified = true;
  assert.equal(evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure({ ...base, receipt: overclaimed }).ok, false);

  const noCommentState = clone(base.receipt);
  noCommentState.implementedCapability.commentDeleteProductRuntimeWired = false;
  assert.equal(evaluateWordReleaseAuditP0MultiSceneAtomicCommentStateClosure({ ...base, receipt: noCommentState }).ok, false);
});

test('P0 implementation is command-kernel wired and does not open later editors', () => {
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  const bridgeSource = fs.readFileSync(BRIDGE_INDEX_PATH, 'utf8');
  const runtimeSource = fs.readFileSync(MULTI_RUNTIME_PATH, 'utf8');
  const commentSource = fs.readFileSync(COMMENT_SHADOW_PATH, 'utf8');
  const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf8');

  assert.match(mainSource, /RTK_REVIEW_APPLY_MULTI_SCENE_NON_OVERLAP_TRACKED_REPLACEMENTS/u);
  assert.match(mainSource, /handleRtkMultiSceneNonOverlapTrackedReplacementCommandSurface/u);
  assert.match(bridgeSource, /reviewTransportMultiSceneNonOverlapTrackedReplacementRuntime/u);
  assert.match(runtimeSource, /buildRtkWordV4MultiSceneAtomicPrepare/u);
  assert.match(runtimeSource, /buildRtkWordV4MultiSceneAtomicCommit/u);
  assert.match(runtimeSource, /RTK_MULTI_SCENE_PARTIAL_REPLAY_BLOCKED/u);
  assert.match(commentSource, /DELETED/u);
  assert.match(scriptSource, /runElectronUiExportClickProof/u);
  assert.doesNotMatch(scriptSource, /openGoogle|docs\.google|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
});
