const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportCommentShadowSession.mjs');
const COMMAND_KERNEL_PATH = path.join(REPO_ROOT, 'src', 'command', 'commandSurfaceKernel.js');
const COMMAND_ID = 'cmd.rtk.reviewSession.importComments';

function makeProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-a03-c01-'));
}

async function loadModule() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function loadCommandKernel() {
  return require(COMMAND_KERNEL_PATH);
}

function reviewIrFixture(extraThread = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    roundId: 'round-a03-c01',
    returnArtifactId: 'return-a03-c01',
    semanticReturnId: 'semantic-a03-c01',
    textRevisions: [],
    moveRevisions: [],
    propertyRevisions: [],
    formattingDeltas: [],
    structureChanges: [],
    opaqueUnsupported: [],
    commentThreads: [
      {
        kind: 'CommentThread',
        threadId: 'rtk-comment-root-1',
        commentId: '1',
        durableId: 'durable-root-1',
        parentThreadId: '',
        replies: [],
        doneResolvedReopenedState: 'active',
        authorPersonIdentity: {
          author: 'Yalken Synthetic Editor',
          initials: 'YSE',
          people: [{ id: 'person-yse', displayName: 'Yalken Synthetic Editor' }],
        },
        date: '2026-07-31T16:45:00.000Z',
        anchorStart: 12,
        anchorEnd: 28,
        quotedAnchorText: 'portable sentence',
        body: 'Root modern comment body RU EN Unicode e\u0301 emoji \u{1f600}',
        bodyExcerpt: 'Root modern comment body RU EN Unicode e\u0301 emoji \u{1f600}',
        orderingKey: 1,
        status: 'ANCHORED',
        placement: {
          outcome: 'ANCHORED',
          anchored: true,
          selectorStack: {
            exactQuote: 'portable sentence',
            prefix: 'before',
            suffix: 'after',
            utf16Position: 12,
          },
        },
        reasonCodes: ['RTK_COMMENT_ANCHORED'],
        sourceXmlProvenance: { part: 'word/comments.xml', tokenIndex: 1 },
        ...extraThread,
      },
      {
        kind: 'CommentThread',
        threadId: 'rtk-comment-root-2',
        commentId: '2',
        durableId: 'durable-root-2',
        parentThreadId: '',
        replies: [],
        authorPersonIdentity: { author: 'Yalken Synthetic Editor', initials: 'YSE', people: [] },
        date: '2026-07-31T16:46:00.000Z',
        quotedAnchorText: '',
        body: 'Orphan but preserved comment body',
        orderingKey: 2,
        status: 'ORPHAN',
        placement: {
          outcome: 'ORPHAN',
          anchored: false,
          selectorStack: { exactQuote: '', prefix: '', suffix: '', utf16Position: null },
        },
        reasonCodes: ['RTK_COMMENT_ORPHAN'],
      },
    ],
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function authenticatedReturnIdentity(overrides = {}) {
  return {
    schemaVersion: 'yalken.rtk.comment-shadow-authenticated-return-binding.v1',
    authenticated: true,
    projectId: 'project-a03-c01',
    sceneId: 'roman/imported/scene-1.txt',
    sceneRevision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rawSha256: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    baselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    currentBaselineHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    roundId: 'round-a03-c01',
    exportId: 'export-a03-c01',
    exportArtifactId: 'export-artifact-a03-c01',
    returnArtifactId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    semanticReturnId: 'semantic-a03-c01',
    parserProfileDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    analysisDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    ...overrides,
  };
}

function authenticatedPayload(projectRoot, overrides = {}) {
  const identity = authenticatedReturnIdentity(overrides.authenticatedReturnIdentity);
  const reviewIr = reviewIrFixture();
  reviewIr.roundId = identity.roundId;
  reviewIr.returnArtifactId = identity.returnArtifactId;
  reviewIr.semanticReturnId = identity.semanticReturnId;
  return {
    projectRoot,
    roundId: identity.roundId,
    returnArtifactId: identity.returnArtifactId,
    semanticReturnId: identity.semanticReturnId,
    authenticatedReturnIdentity: identity,
    reviewIr,
    ...overrides.payload,
  };
}

test('A03 C01 imports root modern comments through Command Kernel into a shadow session only', async () => {
  const projectRoot = makeProjectRoot();
  const mod = await loadModule();
  const { createCommandSurfaceKernel } = loadCommandKernel();
  const kernel = createCommandSurfaceKernel({
    [COMMAND_ID]: mod.createRtkCommentShadowSessionCommandHandler(),
  });

  const result = await kernel.dispatch(COMMAND_ID, {
    projectRoot,
    roundId: 'round-a03-c01',
    returnArtifactId: 'return-a03-c01',
    semanticReturnId: 'semantic-a03-c01',
    reviewIr: reviewIrFixture(),
  });

  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.status, 'committed');
  assert.equal(result.writerCalled, false);
  assert.equal(result.manuscriptApplyAuthority, false);
  assert.equal(result.session.authorityLevel.productRuntimeWired, true);
  assert.equal(result.session.authorityLevel.automaticApplyCertified, false);
  assert.equal(result.session.summary.threadCount, 2);
  assert.equal(result.session.summary.anchored, 1);
  assert.equal(result.session.summary.orphan, 1);
  assert.equal(result.session.threads[0].body.includes('Unicode'), true);
  assert.equal(result.session.threads[0].authorPersonIdentity.initials, 'YSE');
  assert.equal(result.session.threads[0].anchor.quotedAnchorText, 'portable sentence');
  assert.equal(result.session.threads[1].orphanOutcome, true);
  assert.equal(fs.existsSync(result.sessionPath), true);
  assert.equal(fs.existsSync(result.receiptPath), true);
  assert.equal(result.storageEffects.sessionRecordCreated, true);
  assert.equal(result.storageEffects.receiptCreated, true);
  assert.equal(result.storageEffects.manuscriptBytesWritten, 0);

  const receipt = readJson(result.receiptPath);
  assert.equal(receipt.schemaVersion, mod.RTK_COMMENT_SHADOW_SESSION_RECEIPT_V1_SCHEMA);
  assert.equal(receipt.vetoMetrics.manuscriptMutation, 0);
  assert.equal(receipt.vetoMetrics.silentCommentLoss, 0);
  assert.equal(receipt.vetoMetrics.replyPromotion, 0);
  assert.equal(receipt.vetoMetrics.resolveReopenPromotion, 0);
});

test('A03 C01 authenticated return identity binds project scene baseline storage keys and blocks forged mismatches', async () => {
  const projectRoot = makeProjectRoot();
  const mod = await loadModule();
  const first = await mod.importRtkCommentShadowSession(authenticatedPayload(projectRoot));
  const second = await mod.importRtkCommentShadowSession(authenticatedPayload(projectRoot, {
    authenticatedReturnIdentity: {
      sceneId: 'roman/imported/scene-2.txt',
      sceneRevision: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      rawSha256: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      baselineHash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      currentBaselineHash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    },
  }));

  assert.equal(first.ok, true, JSON.stringify(first, null, 2));
  assert.equal(second.ok, true, JSON.stringify(second, null, 2));
  assert.equal(first.session.authenticatedReturnIdentity.authenticated, true);
  assert.equal(first.session.authenticatedReturnIdentity.bindingLevel, 'authenticated-product-return');
  assert.equal(first.session.authenticatedReturnIdentity.projectId, 'project-a03-c01');
  assert.equal(first.session.authenticatedReturnIdentity.sceneId, 'roman/imported/scene-1.txt');
  assert.equal(first.receipt.authenticatedReturnIdentityDigest, first.session.authenticatedReturnIdentity.bindingDigest);
  assert.notEqual(first.session.requestKey, second.session.requestKey);
  assert.notEqual(first.session.effectKey, second.session.effectKey);
  assert.equal(first.storageEffects.manuscriptBytesWritten, 0);

  const blockedRoot = makeProjectRoot();
  const blocked = await mod.importRtkCommentShadowSession(authenticatedPayload(blockedRoot, {
    payload: { roundId: 'caller-forged-round' },
  }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.writerCalled, false);
  assert.equal(blocked.reasons.some((item) => item.code === 'RTK_COMMENT_SHADOW_AUTHORITY_MISMATCH'), true);
  assert.equal(fs.existsSync(path.join(blockedRoot, 'backups', 'revision-bridge-rtk-comment-shadow-sessions')), false);
});

test('A03 C01 repeated import is idempotent and does not rewrite a committed shadow session', async () => {
  const projectRoot = makeProjectRoot();
  const mod = await loadModule();
  const payload = {
    projectRoot,
    roundId: 'round-a03-c01',
    returnArtifactId: 'return-a03-c01',
    semanticReturnId: 'semantic-a03-c01',
    reviewIr: reviewIrFixture(),
  };

  const first = await mod.importRtkCommentShadowSession(payload);
  const firstStat = fs.statSync(first.sessionPath);
  const second = await mod.importRtkCommentShadowSession(payload);
  const secondStat = fs.statSync(second.sessionPath);

  assert.equal(first.status, 'committed');
  assert.equal(second.status, 'replay');
  assert.equal(second.code, 'RTK_ALREADY_ANALYZED');
  assert.equal(second.writerCalled, false);
  assert.equal(second.session.requestKey, first.session.requestKey);
  assert.equal(secondStat.mtimeMs, firstStat.mtimeMs);
});

test('A03 C01 preserves replies as typed limitations while duplicate ids still write no shadow files', async () => {
  const projectRoot = makeProjectRoot();
  const mod = await loadModule();
  const withReply = reviewIrFixture({
    replies: [{
      rawId: 'reply-1',
      body: 'reply must remain limitation',
      author: 'Synthetic Reply Author',
      initials: 'SRA',
    }],
  });
  const replyResult = await mod.importRtkCommentShadowSession({
    projectRoot,
    roundId: 'round-a03-c01',
    semanticReturnId: 'semantic-a03-c01-reply',
    reviewIr: withReply,
  });

  assert.equal(replyResult.ok, true, JSON.stringify(replyResult, null, 2));
  assert.equal(replyResult.writerCalled, false);
  assert.equal(replyResult.manuscriptApplyAuthority, false);
  assert.equal(replyResult.session.summary.replyCountPromoted, 0);
  assert.equal(replyResult.session.summary.unsupportedReplyCount, 1);
  assert.equal(replyResult.session.invariants.modernRepliesPromoted, false);
  assert.equal(replyResult.session.invariants.modernRepliesPreservedAsTypedLimitation, true);
  assert.equal(replyResult.session.threads[0].unsupportedReplies[0].body, 'reply must remain limitation');
  assert.equal(replyResult.session.threads[0].unsupportedReplies[0].authorPersonIdentity.initials, 'SRA');
  assert.equal(replyResult.session.threads[0].unsupportedReplies[0].reasonCodes.includes('RTK_COMMENT_REPLY_TYPED_LIMITATION_PRESERVED'), true);
  assert.equal(replyResult.receipt.vetoMetrics.replyPromotion, 0);
  assert.equal(replyResult.receipt.vetoMetrics.silentCommentLoss, 0);

  const duplicate = reviewIrFixture();
  duplicate.commentThreads[1].commentId = '1';
  const duplicateResult = await mod.importRtkCommentShadowSession({
    projectRoot,
    roundId: 'round-a03-c01',
    semanticReturnId: 'semantic-a03-c01-duplicate',
    reviewIr: duplicate,
  });

  assert.equal(duplicateResult.ok, false);
  assert.equal(duplicateResult.reasons.some((item) => item.code === 'RTK_BLOCKED_DUPLICATE_TOKEN'), true);
});

test('A03 C01 recovers a missing receipt after a crash window without double applying', async () => {
  const projectRoot = makeProjectRoot();
  const mod = await loadModule();
  const payload = {
    projectRoot,
    roundId: 'round-a03-c01',
    semanticReturnId: 'semantic-a03-c01-recovery',
    reviewIr: reviewIrFixture(),
  };

  const crashed = await mod.importRtkCommentShadowSession(payload, {
    simulateCrashAfterReceiptTempWrite: true,
  });
  assert.equal(crashed.ok, false);
  assert.equal(crashed.code, 'RTK_RECOVERY_REQUIRED');
  assert.equal(fs.existsSync(crashed.sessionPath), true);
  assert.equal(fs.existsSync(crashed.receiptPath), false);

  const recovered = await mod.importRtkCommentShadowSession(payload);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.status, 'recovered-replay-receipt');
  assert.equal(recovered.writerCalled, false);
  assert.equal(fs.existsSync(recovered.receiptPath), true);
  const receipt = readJson(recovered.receiptPath);
  assert.equal(receipt.status, 'recovered-replay-receipt');
  assert.equal(receipt.recoveredReceipt, true);
  assert.equal(receipt.vetoMetrics.replayFailure, 0);
});

test('A03 C01 command path rejects non-kernel command ids and never calls a manuscript writer', async () => {
  const mod = await loadModule();
  const { createCommandSurfaceKernel } = loadCommandKernel();
  const kernel = createCommandSurfaceKernel({
    [COMMAND_ID]: async () => ({ ok: true, writerCalled: true }),
  });

  const disallowed = await kernel.dispatch('rtk.reviewSession.importComments', {});
  assert.equal(disallowed.ok, false);
  assert.equal(disallowed.error.code, 'E_COMMAND_ID_NOT_ALLOWED');

  const preview = mod.buildRtkCommentShadowSessionPreview({
    roundId: 'round-a03-c01',
    semanticReturnId: 'semantic-a03-c01-preview',
    reviewIr: reviewIrFixture(),
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.session.invariants.canWriteManuscript, false);
  assert.equal(preview.session.invariants.modernRepliesPromoted, false);
  assert.equal(preview.session.summary.unsupportedReplyCount, 0);
});
