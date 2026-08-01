const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-p0-modern-comment-resolve-reopen-typed-limitation.mjs');
const MATRIX_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-normalized-capability-matrix.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MODERN_COMMENT_RESOLVE_REOPEN_TYPED_LIMITATION_RECEIPT.json');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const COMMENT_SESSION_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs');

const COMMAND_ID = 'cmd.rtk.reviewSession.importComments';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

async function loadMatrixEvaluator() {
  return import(pathToFileURL(MATRIX_SCRIPT_PATH).href);
}

function identity() {
  return {
    authenticated: true,
    projectId: 'project-resolve-reopen-contract',
    sceneId: 'scene-resolve-reopen-contract',
    sceneRevision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    baselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    currentBaselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    roundId: 'round-resolve-reopen-contract',
    exportId: 'export-resolve-reopen-contract',
    exportArtifactId: 'export-artifact-resolve-reopen-contract',
    returnArtifactId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    semanticReturnId: 'semantic-resolve-reopen-contract',
    parserProfileDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    analysisDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  };
}

function reviewIr(binding = identity()) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    roundId: binding.roundId,
    returnArtifactId: binding.returnArtifactId,
    semanticReturnId: binding.semanticReturnId,
    textRevisions: [],
    moveRevisions: [],
    propertyRevisions: [],
    formattingDeltas: [],
    structureChanges: [],
    opaqueUnsupported: [],
    commentPlacements: [],
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'resolved-thread',
        commentId: '77',
        durableId: 'durable-resolved-thread',
        authorPersonIdentity: { author: 'Yalken Synthetic Editor', initials: 'YSE', people: [] },
        date: '2026-08-01T12:20:00.000Z',
        anchorStart: 1,
        anchorEnd: 20,
        quotedAnchorText: 'resolved anchor text',
        body: 'Resolved state must be preserved only as a shadow diagnostic.',
        status: 'RESOLVED',
        placement: {
          outcome: 'RESOLVED',
          anchored: true,
          selectorStack: { exactQuote: 'resolved anchor text', prefix: '', suffix: '', utf16Position: 1 },
        },
        replies: [],
      },
    ],
  };
}

test('P0 modern comment resolve reopen receipt binds typed limitation without apply authority', async () => {
  const { evaluateP0ModernCommentResolveReopenTypedLimitation } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateP0ModernCommentResolveReopenTypedLimitation();

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.implementedCapability.doneTrueStateReadbackPhysicalWordProven, true);
  assert.equal(receipt.implementedCapability.resolvedStateShadowPreservationCertified, true);
  assert.equal(receipt.implementedCapability.reopenTypedLimitationBound, true);
  assert.equal(receipt.implementedCapability.resolveReopenFullLifecycleCertified, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.implementedCapability.userFacingAuthority, 'COMMENT_STATE_SHADOW_PREVIEW_ONLY');
  assert.equal(receipt.productCommandProof.writerCalled, false);
  assert.equal(receipt.productCommandProof.manuscriptApplyAuthority, false);
  assert.equal(receipt.productCommandProof.storageEffects.manuscriptBytesWritten, 0);
  assert.deepEqual(Object.values(receipt.vetoMetrics).map(Number), new Array(Object.keys(receipt.vetoMetrics).length).fill(0));
});

test('comment shadow command preserves RESOLVED state and keeps reopen as typed limitation', async () => {
  const module = await import(pathToFileURL(COMMENT_SESSION_PATH).href);
  const { createCommandSurfaceKernel } = require(path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js'));
  const kernel = createCommandSurfaceKernel({
    [COMMAND_ID]: module.createRtkCommentShadowSessionCommandHandler(),
  });
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-resolve-reopen-contract-'));
  const binding = identity();
  const payload = {
    projectRoot,
    roundId: binding.roundId,
    returnArtifactId: binding.returnArtifactId,
    semanticReturnId: binding.semanticReturnId,
    authenticatedReturnIdentity: binding,
    reviewIr: reviewIr(binding),
  };
  const first = await kernel.dispatch(COMMAND_ID, payload);
  const replay = await kernel.dispatch(COMMAND_ID, payload);

  assert.equal(first.ok, true, JSON.stringify(first.reasons, null, 2));
  assert.equal(first.session.summary.resolved, 1);
  assert.equal(first.session.summary.resolveStateShadowPreserved, 1);
  assert.equal(first.session.summary.reopenStateCertified, 0);
  assert.equal(first.session.threads[0].stateLifecycle.resolvedStatePreserved, true);
  assert.equal(first.session.threads[0].stateLifecycle.reopenedStateCertified, false);
  assert.equal(first.session.threads[0].stateLifecycle.resolveReopenLifecycleCertified, false);
  assert.ok(first.session.threads[0].stateLifecycle.reasonCodes.includes('RTK_COMMENT_RESOLVE_STATE_SHADOW_PRESERVED'));
  assert.ok(first.session.threads[0].stateLifecycle.reasonCodes.includes('RTK_COMMENT_REOPEN_TYPED_LIMITATION'));
  assert.equal(first.writerCalled, false);
  assert.equal(first.manuscriptApplyAuthority, false);
  assert.equal(first.storageEffects.manuscriptBytesWritten, 0);
  assert.equal(replay.ok, true);
  assert.equal(replay.status, 'replay');
});

test('normalized matrix keeps resolve reopen typed limitation closed through later formatting successor', async () => {
  const { evaluateNormalizedCapabilityMatrix } = await loadMatrixEvaluator();
  const matrix = readJson(MATRIX_PATH);
  const profile = readJson(PROFILE_PATH);
  const result = evaluateNormalizedCapabilityMatrix({ matrix, profile });
  const byId = new Map(matrix.rows.map((row) => [row.cellId, row]));
  const stateCell = byId.get('rtk.word.v4.modernCommentStateReadbackGate');
  const formattingCell = byId.get('rtk.word.v4.effectiveFormattingDiagnostics');
  const structuralCell = byId.get('rtk.word.v4.typedStructuralDiagnostics');

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(stateCell.blocksWordSaturation, false);
  assert.equal(stateCell.reasonCode, 'RTK_NORM_RESOLVE_REOPEN_TYPED_LIMITATION_BOUND');
  assert.equal(stateCell.requiredNextContour, 'NONE_RESOLVE_REOPEN_TYPED_LIMITATION_BOUND');
  assert.equal(formattingCell.blocksWordSaturation, false);
  assert.equal(formattingCell.reasonCode, 'RTK_NORM_FORMATTING_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(structuralCell.blocksWordSaturation, false);
  assert.equal(structuralCell.reasonCode, 'RTK_NORM_STRUCTURAL_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(byId.get('rtk.word.v4.multiRoundReplayStaleConflictGuards').blocksWordSaturation, false);
  assert.equal(byId.get('rtk.word.v4.multiRoundReplayStaleConflictGuards').reasonCode, 'RTK_NORM_MULTI_ROUND_REPLAY_GUARDS_RECONCILED');
  assert.equal(matrix.counts.blocksWordSaturation, 0);
  assert.equal(matrix.nextEngineeringOrder[0].contour, 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT');
});
