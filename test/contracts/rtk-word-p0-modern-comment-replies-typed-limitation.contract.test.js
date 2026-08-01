const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-p0-modern-comment-replies-typed-limitation.mjs');
const COMMENT_SESSION_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs');
const COMMAND_KERNEL_PATH = path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_MODERN_COMMENT_REPLY_TYPED_LIMITATION_RECEIPT.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_NORMALIZED_CAPABILITY_MATRIX_V1.json');
const COMMAND_ID = 'cmd.rtk.reviewSession.importComments';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function zeroValues(object) {
  return Object.values(object || {}).filter((value) => Number(value) !== 0);
}

async function loadEvaluator() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

async function loadCommentSession() {
  return import(pathToFileURL(COMMENT_SESSION_PATH).href);
}

function reviewIrWithReply() {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    roundId: 'round-reply-contract',
    returnArtifactId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    semanticReturnId: 'semantic-reply-contract',
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'thread-root',
        commentId: '1',
        durableId: 'durable-root',
        body: 'Root comment survives.',
        status: 'ANCHORED',
        quotedAnchorText: 'Root',
        authorPersonIdentity: { author: 'Root Author', initials: 'RA', people: [] },
        replies: [
          {
            rawId: 'reply-1',
            body: 'Reply body must be preserved as typed limitation.',
            author: 'Reply Author',
            initials: 'RPA',
          },
        ],
        placement: {
          outcome: 'ANCHORED',
          anchored: true,
          selectorStack: { exactQuote: 'Root', prefix: '', suffix: '', utf16Position: 1 },
        },
      },
    ],
  };
}

function authenticatedIdentity() {
  return {
    authenticated: true,
    projectId: 'project-reply-contract',
    sceneId: 'roman/imported/reply-contract.txt',
    sceneRevision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    baselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    currentBaselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    roundId: 'round-reply-contract',
    exportId: 'export-reply-contract',
    exportArtifactId: 'export-artifact-reply-contract',
    returnArtifactId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    semanticReturnId: 'semantic-reply-contract',
    parserProfileDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    analysisDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  };
}

test('P0 modern comment replies receipt binds typed limitation without reply authority', async () => {
  const { evaluateP0ModernCommentRepliesTypedLimitation } = await loadEvaluator();
  const receipt = readJson(RECEIPT_PATH);
  const result = evaluateP0ModernCommentRepliesTypedLimitation({
    receipt,
    profile: readJson(PROFILE_PATH),
    program: readJson(PROGRAM_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(receipt.implementedCapability.replyTypedLimitationBound, true);
  assert.equal(receipt.implementedCapability.replyBodyShadowPreservationCertified, true);
  assert.equal(receipt.implementedCapability.replyGraphAuthorityCertified, false);
  assert.equal(receipt.implementedCapability.automaticApplyCertified, false);
  assert.equal(receipt.productCommandProof.unsupportedReplyCount, 1);
  assert.equal(receipt.productCommandProof.replyCountPromoted, 0);
  assert.equal(receipt.productCommandProof.idempotentReplay, true);
  assert.deepEqual(zeroValues(receipt.vetoMetrics), []);
});

test('comment shadow Command Kernel preserves reply body as unsupported diagnostic only', async () => {
  const mod = await loadCommentSession();
  const { createCommandSurfaceKernel } = require(COMMAND_KERNEL_PATH);
  const kernel = createCommandSurfaceKernel({
    [COMMAND_ID]: mod.createRtkCommentShadowSessionCommandHandler(),
  });
  const identity = authenticatedIdentity();
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-reply-contract-'));
  const result = await kernel.dispatch(COMMAND_ID, {
    projectRoot,
    roundId: identity.roundId,
    returnArtifactId: identity.returnArtifactId,
    semanticReturnId: identity.semanticReturnId,
    authenticatedReturnIdentity: identity,
    reviewIr: reviewIrWithReply(),
  });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.writerCalled, false);
  assert.equal(result.manuscriptApplyAuthority, false);
  assert.equal(result.session.summary.threadCount, 1);
  assert.equal(result.session.summary.unsupportedReplyCount, 1);
  assert.equal(result.session.summary.replyCountPromoted, 0);
  assert.equal(result.session.invariants.modernRepliesPromoted, false);
  assert.equal(result.session.invariants.modernRepliesPreservedAsTypedLimitation, true);
  assert.equal(result.session.threads[0].unsupportedReplies[0].body, 'Reply body must be preserved as typed limitation.');
  assert.equal(result.session.threads[0].unsupportedReplies[0].authorPersonIdentity.initials, 'RPA');
  assert.equal(result.receipt.vetoMetrics.replyPromotion, 0);
  assert.equal(result.receipt.vetoMetrics.silentCommentLoss, 0);
});

test('self-standing reply thread cannot forge root shadow authority', async () => {
  const mod = await loadCommentSession();
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-reply-forge-'));
  const identity = authenticatedIdentity();
  const reviewIr = reviewIrWithReply();
  reviewIr.commentThreads[0].parentThreadId = 'thread-root';

  const result = await mod.importRtkCommentShadowSession({
    projectRoot,
    roundId: identity.roundId,
    returnArtifactId: identity.returnArtifactId,
    semanticReturnId: identity.semanticReturnId,
    authenticatedReturnIdentity: identity,
    reviewIr,
  });

  assert.equal(result.ok, false);
  assert.equal(result.writerCalled, false);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_COMMENT_UNSUPPORTED'), true);
});

test('normalized matrix keeps reply typed limitation closed through later resolve reopen successor', () => {
  const matrix = readJson(MATRIX_PATH);
  const byId = new Map(matrix.rows.map((row) => [row.cellId, row]));

  assert.equal(byId.get('rtk.word.v4.commentsShadowAnalysis').blocksWordSaturation, false);
  assert.equal(byId.get('rtk.word.v4.commentsShadowAnalysis').requiredNextContour, 'NONE_REPLY_TYPED_LIMITATION_BOUND');
  assert.equal(byId.get('rtk.word.v4.commentsShadowAnalysis').reasonCode, 'RTK_NORM_MODERN_REPLY_TYPED_LIMITATION_BOUND');
  assert.equal(byId.get('rtk.word.v4.modernCommentStateReadbackGate').blocksWordSaturation, false);
  assert.equal(byId.get('rtk.word.v4.modernCommentStateReadbackGate').reasonCode, 'RTK_NORM_RESOLVE_REOPEN_TYPED_LIMITATION_BOUND');
  assert.equal(byId.get('rtk.word.v4.effectiveFormattingDiagnostics').blocksWordSaturation, false);
  assert.equal(byId.get('rtk.word.v4.effectiveFormattingDiagnostics').reasonCode, 'RTK_NORM_FORMATTING_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(byId.get('rtk.word.v4.typedStructuralDiagnostics').blocksWordSaturation, false);
  assert.equal(byId.get('rtk.word.v4.typedStructuralDiagnostics').reasonCode, 'RTK_NORM_STRUCTURAL_APPLY_TYPED_LIMITATION_BOUND');
  assert.equal(byId.get('rtk.word.v4.multiRoundReplayStaleConflictGuards').blocksWordSaturation, false);
  assert.equal(byId.get('rtk.word.v4.multiRoundReplayStaleConflictGuards').reasonCode, 'RTK_NORM_MULTI_ROUND_REPLAY_GUARDS_RECONCILED');
  assert.equal(matrix.counts.blocksWordSaturation, 0);
  assert.equal(matrix.nextEngineeringOrder[0].contour, 'READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT');
  assert.equal(matrix.counts.automaticApplyCertified, 0);
});
