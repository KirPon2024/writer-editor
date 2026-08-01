'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function makeCryptoPort() {
  return {
    sha256Text(value) {
      return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
    },
    sha256Json(value) {
      return `sha256:${this.sha256Text(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${crypto.createHmac('sha256', String(secret || '')).update(stableJson(value), 'utf8').digest('hex')}`;
    },
    byteLength(value) {
      return Buffer.byteLength(String(value || ''), 'utf8');
    },
  };
}

function makeSource(deps = {}) {
  const {
    buildFullManuscriptDocxReviewPacketSource,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewPacketSource.js'));
  return buildFullManuscriptDocxReviewPacketSource({
    projectId: 'project-c5v2',
    projectRoot: '/project',
    manifestPath: '/project/manifest.json',
    scenes: [
      {
        sceneId: 'roman/preface.md',
        scenePath: '/project/roman/preface.md',
        text: 'The artist is the creator of beautiful things.\nA critic translates an impression into another mode.',
        order: 0,
      },
      {
        sceneId: 'roman/chapter-01.md',
        scenePath: '/project/roman/chapter-01.md',
        text: 'The studio was filled with the rich odour of roses.\nLord Henry watched the painter carefully.',
        order: 1,
      },
    ],
  }, {
    roundIdHex: '1234567890abcdef1234567890abcdef',
    keyIdHex: 'abcdef1234567890abcdef1234567890',
    hmacSecret: 'local-secret-for-test-only',
    cryptoPort: makeCryptoPort(),
    ...deps,
  });
}

function returnedAuthority(source, overrides = {}) {
  return {
    scope: 'full-manuscript',
    projectId: 'project-c5v2',
    roundId: source.localAuthorityCapsule.roundId,
    exportId: source.localAuthorityCapsule.exportIdentity,
    fullBookRawSha256: source.exportCapsule.fullBookRawSha256,
    orderedSceneIds: source.exportCapsule.orderedSceneIds,
    ...overrides,
  };
}

test('C5V2 full-manuscript authority carrier verifies against local full-book authority', async () => {
  const source = makeSource();
  const {
    buildDocxReviewPacketBuffer,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'docxReviewPacketBuilder.js'));
  const revisionBridge = await import(path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'index.mjs'));
  const bytes = buildDocxReviewPacketBuffer(source);
  const result = revisionBridge.buildDocxReviewTransportAnalysisFromZipBytes({
    bytes,
    hmacSecret: source.forbiddenSecret,
    expectedAuthority: source.localAuthorityCapsule.expectedAuthority,
  }, { cryptoPort: makeCryptoPort() });

  assert.equal(result.ok, true);
  assert.equal(result.authorityCarrier.status, 'verified-baseline-bound');
  assert.equal(result.exactAuthority.validSignedLocator, true);
  assert.equal(result.exactAuthority.rawSha256Unchanged, true);
  assert.equal(result.authorityCarrier.selectedCarrier.payload.scope, 'full-manuscript');
  assert.equal(
    result.authorityCarrier.selectedCarrier.payload.fullBookRawSha256,
    source.localAuthorityCapsule.expectedAuthority.fullBookRawSha256,
  );
});

test('C5V2 return router lowers eligible full-manuscript tracked replacements to existing atomic multi-scene command', () => {
  const {
    buildFullManuscriptReviewReturnApplyPlan,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewReturnRouter.js'));
  const source = makeSource();
  const plan = buildFullManuscriptReviewReturnApplyPlan({
    projectId: 'project-c5v2',
    localAuthorityCapsule: source.localAuthorityCapsule,
    returnedAuthority: returnedAuthority(source),
    operations: [
      {
        id: 'op-preface-replace',
        family: 'tracked_text_edit',
        sceneId: 'roman/preface.md',
        anchor: {
          sceneId: 'roman/preface.md',
          selectedText: 'beautiful things',
        },
        semanticIntent: {
          kind: 'replace',
          replacementText: 'luminous forms',
        },
      },
      {
        id: 'op-chapter-replace',
        family: 'tracked_text_edit',
        sceneId: 'roman/chapter-01.md',
        anchor: {
          sceneId: 'roman/chapter-01.md',
          selectedText: 'rich odour of roses',
        },
        semanticIntent: {
          kind: 'replace',
          replacementText: 'quiet scent of roses',
        },
      },
      {
        id: 'op-comment-root',
        family: 'root_comment',
        sceneId: 'roman/preface.md',
        anchor: {
          sceneId: 'roman/preface.md',
          selectedText: 'critic translates',
        },
        semanticIntent: {
          kind: 'root-comment',
        },
      },
    ],
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.commandId, 'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements');
  assert.equal(plan.atomicity.partialCanonicalWriteForbidden, true);
  assert.equal(plan.sceneCommands.length, 2);
  assert.deepEqual(plan.sceneCommands.map((sceneCommand) => sceneCommand.sceneId), [
    'roman/preface.md',
    'roman/chapter-01.md',
  ]);
  assert.equal(plan.sceneCommands[0].input.commandId, 'cmd.rtk.review.applyNonOverlapTrackedReplacements');
  assert.equal(plan.sceneCommands[0].input.writerInput.reviewItems[0].targetScope.id, 'roman/preface.md');
  assert.equal(plan.sceneCommands[0].input.writerInput.reviewItems[0].match.quote, 'beautiful things');
  assert.equal(Object.prototype.hasOwnProperty.call(plan.sceneCommands[0].input.writerInput.reviewItems[0].match, 'blockRange'), false);
  assert.deepEqual(plan.typedOperations, [
    {
      operationId: 'op-comment-root',
      family: 'root_comment',
      typedOutcome: 'MANUAL_COMMENT_LIFECYCLE_PENDING_PRODUCT_APPLY_LANE',
    },
  ]);
});

test('C5V2 return router rejects wrong scene, missing scene, stale baseline and order tamper before apply planning', () => {
  const {
    buildFullManuscriptReviewReturnApplyPlan,
  } = require(path.join(REPO_ROOT, 'src', 'export', 'docx', 'fullManuscriptDocxReviewReturnRouter.js'));
  const source = makeSource();

  assert.equal(buildFullManuscriptReviewReturnApplyPlan({
    localAuthorityCapsule: source.localAuthorityCapsule,
    returnedAuthority: returnedAuthority(source, {
      orderedSceneIds: ['roman/chapter-01.md', 'roman/preface.md'],
    }),
    operations: [],
  }).code, 'FULL_MANUSCRIPT_RETURN_SCENE_ORDER_MISMATCH');

  assert.equal(buildFullManuscriptReviewReturnApplyPlan({
    localAuthorityCapsule: source.localAuthorityCapsule,
    returnedAuthority: returnedAuthority(source, {
      fullBookRawSha256: 'sha256:tampered',
    }),
    operations: [],
  }).code, 'FULL_MANUSCRIPT_RETURN_BASELINE_STALE_OR_TAMPERED');

  const missing = structuredClone(source.localAuthorityCapsule);
  delete missing.scenePathBySceneId['roman/chapter-01.md'];
  assert.equal(buildFullManuscriptReviewReturnApplyPlan({
    localAuthorityCapsule: missing,
    returnedAuthority: returnedAuthority(source),
    operations: [],
  }).code, 'FULL_MANUSCRIPT_LOCAL_AUTHORITY_SCENE_MISSING');

  assert.equal(buildFullManuscriptReviewReturnApplyPlan({
    localAuthorityCapsule: source.localAuthorityCapsule,
    returnedAuthority: returnedAuthority(source),
    operations: [
      {
        id: 'op-wrong-scene',
        family: 'tracked_text_edit',
        sceneId: 'roman/chapter-99.md',
        anchor: { sceneId: 'roman/chapter-99.md', selectedText: 'ghost' },
        semanticIntent: { kind: 'replace', replacementText: 'blocked' },
      },
    ],
  }).code, 'FULL_MANUSCRIPT_OPERATION_WRONG_SCENE');
});
