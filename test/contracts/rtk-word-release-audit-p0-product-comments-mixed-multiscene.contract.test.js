const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_PRODUCT_COMMENTS_MIXED_MULTI_SCENE_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-product-comments-mixed-multiscene.mjs');
const MAIN_PATH = path.join(REPO_ROOT, 'src', 'main.js');
const CAPABILITY_PROVIDER_PATH = path.join(REPO_ROOT, 'src', 'renderer', 'commands', 'localCapabilityProvider.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function zeroValues(object) {
  return Object.values(object || {}).filter((value) => Number(value) !== 0);
}

test('P0 comments mixed multi-scene receipt verifies bounded product vertical truth', async () => {
  const { evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene({
    receipt,
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.observedCases, 4);
  assert.equal(result.negativeCases, 5);
  assert.equal(result.liveElectronUiClickPass, 1);
  assert.equal(result.rootCommentProductPathPass, 1);
  assert.equal(result.mixedProductLoopPass, 1);
  assert.equal(result.commentDeletePhysicalReadbackPass, 1);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.multiSceneAtomicApplyCertified, false);
  assert.equal(result.wordSaturated, false);
  assert.equal(result.googleDocsOpened, false);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
});

test('P0 comments mixed multi-scene receipt separates runtime capability from physical-only evidence', () => {
  const receipt = readJson(RECEIPT_PATH);
  const rootCase = receipt.physicalCorpus.productCases.find((item) => item.caseId === 'P0CM-001');
  const mixedCase = receipt.physicalCorpus.productCases.find((item) => item.caseId === 'P0CM-002');
  const deleteCase = receipt.physicalCorpus.productCases.find((item) => item.caseId === 'P0CM-003');
  const stateCase = receipt.physicalCorpus.productCases.find((item) => item.caseId === 'P0CM-004');

  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.ok, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.result.clicked, true);
  assert.equal(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.userDocumentsTouched, false);
  assert.deepEqual(receipt.physicalCorpus.liveElectronUiExportSurfaceClick.networkRequests, []);

  assert.equal(rootCase.result, 'PASS');
  assert.equal(rootCase.productLoop.commentShadowCommitted, true);
  assert.equal(rootCase.productLoop.commentShadowReplay, true);
  assert.equal(rootCase.productLoop.commentShadowManuscriptAuthority, false);

  assert.equal(mixedCase.result, 'PASS');
  assert.equal(mixedCase.productLoop.visiblePreviewReady, true);
  assert.equal(mixedCase.productLoop.commandPayloadPreviewConfirmed, true);
  assert.equal(mixedCase.productLoop.explicitUserConfirmedCommandApply, true);
  assert.equal(mixedCase.productLoop.replacementSemanticsVerified, true);
  assert.equal(mixedCase.productLoop.sceneMatchesExpectedAfterApply, true);
  assert.equal(mixedCase.productLoop.projectReopenReadbackMatchesExpected, true);
  assert.equal(mixedCase.productLoop.replayIdempotent, true);

  assert.equal(deleteCase.result, 'PASS');
  assert.equal(deleteCase.physicalWord.physicalDeleteCertified, true);
  assert.equal(receipt.implementedCapability.commentDeleteProductRuntimeWired, false);

  assert.deepEqual(stateCase.typedLimitations.sort(), [
    'MODERN_COMMENT_REPLY_NOT_CERTIFIED_IN_PRODUCT_PATH',
    'MODERN_COMMENT_RESOLVE_REOPEN_NOT_CERTIFIED_IN_PRODUCT_PATH',
  ]);
  assert.equal(receipt.implementedCapability.modernReplyProductRuntimeWired, false);
  assert.equal(receipt.implementedCapability.modernResolveReopenProductRuntimeWired, false);
});

test('P0 comments mixed multi-scene receipt proves negative gates without expanding authority', () => {
  const receipt = readJson(RECEIPT_PATH);
  const negatives = new Map(receipt.physicalCorpus.negativeCases.map((item) => [item.caseId, item]));

  assert.equal(negatives.get('P0CM-N01').result, 'PASS');
  assert.equal(negatives.get('P0CM-N01').writerCalls, 0);
  assert.equal(negatives.get('P0CM-N02').reason, 'RTK_RETURN_INTAKE_WRONG_SCENE_ID');
  assert.equal(negatives.get('P0CM-N03').reason, 'RTK_RETURN_INTAKE_AUTHORITY_CARRIER_INVALID');
  assert.equal(negatives.get('P0CM-N04').previewSummary.exactPreviewReady, false);
  assert.equal(negatives.get('P0CM-N04').writerCalls, 0);
  assert.equal(negatives.get('P0CM-N05').result, 'PASS');
  assert.equal(negatives.get('P0CM-N05').reason, 'REVIEW_EXACT_TEXT_APPLY_BATCH_SINGLE_SCENE_REQUIRED');
  assert.equal(negatives.get('P0CM-N05').sceneAUnchanged, true);
  assert.equal(negatives.get('P0CM-N05').sceneBUnchanged, true);
  assert.equal(receipt.implementedCapability.multiSceneCorrectlyBlockedBeforeWriter, true);
  assert.equal(receipt.implementedCapability.multiSceneAtomicApplyCertified, false);
});

test('P0 comments mixed multi-scene evaluator rejects overclaim and no-op drift', async () => {
  const { evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene } = await loadEvaluator();
  const base = {
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  };

  const overclaimed = clone(base.receipt);
  overclaimed.implementedCapability.automaticApplyCertified = true;
  overclaimed.implementedCapability.wordSaturated = true;
  assert.equal(evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene({
    ...base,
    receipt: overclaimed,
  }).ok, false);

  const missingUi = clone(base.receipt);
  missingUi.physicalCorpus.liveElectronUiExportSurfaceClick.ok = false;
  assert.equal(evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene({
    ...base,
    receipt: missingUi,
  }).ok, false);

  const missingMixedReplay = clone(base.receipt);
  const mixedCase = missingMixedReplay.physicalCorpus.productCases.find((item) => item.caseId === 'P0CM-002');
  mixedCase.productLoop.replayIdempotent = false;
  assert.equal(evaluateWordReleaseAuditP0ProductCommentsMixedMultiScene({
    ...base,
    receipt: missingMixedReplay,
  }).ok, false);
});

test('P0 comments mixed multi-scene contour keeps export reachable but apply guarded', async () => {
  const provider = await import(pathToFileURL(CAPABILITY_PROVIDER_PATH).href);
  const exportEntitlement = provider.resolveCommandEntitlement('cmd.project.review.exportDocxReviewPacket', { entitlementTier: 'free' });
  const applyEntitlement = provider.resolveCommandEntitlement('cmd.project.review.applyExactTextChange', { entitlementTier: 'free' });
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  const guardStart = mainSource.indexOf('const MAIN_FREE_PRO_COMPLEXITY_COMMAND_IDS = new Set([');
  const guardEnd = mainSource.indexOf(']);', guardStart);
  const mainFreeProGuard = mainSource.slice(guardStart, guardEnd);

  assert.equal(exportEntitlement.available, true);
  assert.equal(exportEntitlement.visible, true);
  assert.equal(applyEntitlement.available, false);
  assert.equal(mainFreeProGuard.includes("'cmd.project.review.exportDocxReviewPacket'"), false);
  assert.equal(mainFreeProGuard.includes("'cmd.project.review.applyExactTextChange'"), true);
  assert.equal(mainFreeProGuard.includes("'cmd.project.review.applyExactTextChangesBatch'"), false);
});

test('P0 comments mixed multi-scene runner uses product and Word paths without later-editor execution', () => {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

  assert.match(source, /runElectronUiExportClickProof/u);
  assert.match(source, /review-export-docx-review-packet/u);
  assert.match(source, /handleDocxReviewPreviewSessionActivationCommandSurface/u);
  assert.match(source, /handleReviewSurfaceApplyExactTextChangeCommandSurface/u);
  assert.match(source, /handleReviewSurfaceApplyExactTextChangesBatchCommandSurface/u);
  assert.match(source, /cmd\.rtk\.reviewSession\.importComments/u);
  assert.doesNotMatch(source, /openGoogle|docs\.google|LibreOffice|ONLYOFFICE|Apple Pages|WPS/u);
});
