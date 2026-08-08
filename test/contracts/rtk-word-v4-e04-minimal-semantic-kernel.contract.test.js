const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const KERNEL_PATH = 'src/io/revisionBridge/reviewTransportWordSemanticKernelV4.mjs';
const INDEX_PATH = 'src/io/revisionBridge/index.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E04_MINIMAL_SEMANTIC_KERNEL_RECEIPT.json';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
};

async function loadKernel() {
  return import(pathToFileURL(path.join(REPO_ROOT, KERNEL_PATH)).href);
}

function fullAuthority(overrides = {}) {
  return {
    validSignedLocator: true,
    sceneRevisionUnchanged: true,
    rawSha256Unchanged: true,
    uniqueTarget: true,
    nonOverlapping: true,
    allRelevantXmlSemanticsAccounted: true,
    ...overrides,
  };
}

function yrtk2(overrides = {}) {
  return {
    ok: true,
    coreManifestDigest: `sha256:${'a'.repeat(64)}`,
    ...overrides,
  };
}

function reviewIr(overrides = {}) {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    textRevisions: [
      {
        kind: 'TextRevision',
        operation: 'delete',
        nativeRevisionId: 'del-e04',
        textDigest: `sha256:${'b'.repeat(64)}`,
        replacementGroupId: 'replace-e04',
      },
      {
        kind: 'TextRevision',
        operation: 'insert',
        nativeRevisionId: 'ins-e04',
        textDigest: `sha256:${'c'.repeat(64)}`,
        replacementGroupId: 'replace-e04',
      },
    ],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    formattingDeltas: [],
    commentThreads: [
      {
        kind: 'CommentThread',
        commentId: '7',
        threadId: 'thread-7',
        status: 'ANCHORED',
      },
    ],
    opaqueUnsupported: [],
    ...overrides,
  };
}

test('V4 E04 certifies minimal tracked text semantics only with YRTK2 and all guards', async () => {
  const kernel = await loadKernel();
  const result = kernel.evaluateWordV4MinimalSemanticKernel({
    reviewIr: reviewIr(),
    exactAuthority: fullAuthority(),
    yrtk2Verification: yrtk2(),
  }, { cryptoPort });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'semantic-kernel-ready');
  // E04 is analysis-only: it never restates caller booleans as a write-ready
  // exactSemanticReady flag. The field must be absent and analysisOnly declared.
  assert.equal(result.exactSemanticReady, undefined);
  assert.equal(result.analysisOnly, true);
  assert.equal(result.canApply, false);
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.summary.supportedTextRevisions, 2);
  assert.equal(result.summary.supportedReplacementPairs, 1);
  assert.equal(result.summary.commentShadowThreads, 1);
  assert.equal(result.conservation.commentsIndependentFromText, true);
});

test('V4 E04 comments remain shadow-supported when text is manual or blocked', async () => {
  const kernel = await loadKernel();
  const result = kernel.evaluateWordV4MinimalSemanticKernel({
    reviewIr: reviewIr(),
    exactAuthority: fullAuthority({ uniqueTarget: false }),
    yrtk2Verification: yrtk2(),
  }, { cryptoPort });

  assert.equal(result.status, 'semantic-kernel-manual-or-blocked');
  assert.equal(result.exactSemanticReady, undefined);
  assert.equal(result.analysisOnly, true);
  assert.equal(result.semantics.comments[0].semanticSupport, 'COMMENT_SHADOW_SUPPORTED');
  assert.equal(result.semantics.comments[0].reviewSessionMutationAllowed, false);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_KERNEL_AMBIGUOUS_OR_OVERLAPPING_TEXT'), true);
});

test('V4 E04 blocks moves structure and opaque unsupported from exact semantics', async () => {
  const kernel = await loadKernel();
  const result = kernel.evaluateWordV4MinimalSemanticKernel({
    reviewIr: reviewIr({
      moveRevisions: [{ kind: 'MoveRevision', nativeRevisionId: 'move-e04' }],
      structureChanges: [{ kind: 'StructureChange', structureKind: 'tableBoundary', changeId: 'table-e04' }],
      opaqueUnsupported: [{ kind: 'unknown-part', partName: 'word/unknown.xml' }],
    }),
    exactAuthority: fullAuthority(),
    yrtk2Verification: yrtk2(),
  }, { cryptoPort });

  // analysis-only: the kernel never emits exactSemanticReady, even when the
  // analysis classification is manual-or-blocked due to moves/structure/opaque.
  assert.equal(result.exactSemanticReady, undefined);
  assert.equal(result.analysisOnly, true);
  assert.equal(result.status, 'semantic-kernel-manual-or-blocked');
  assert.equal(result.summary.blockedMoves, 1);
  assert.equal(result.summary.manualStructure, 1);
  assert.equal(result.summary.opaqueUnsupported, 1);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_KERNEL_MOVE_REVISION_BLOCKED'), true);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_KERNEL_STRUCTURE_MANUAL'), true);
  assert.equal(result.reasons.some((item) => item.code === 'RTK_V4_KERNEL_OPAQUE_UNSUPPORTED'), true);
});

test('V4 E04 rejects invalid parser result missing YRTK2 stale baseline and missing CryptoPort', async () => {
  const kernel = await loadKernel();
  const blocked = kernel.evaluateWordV4MinimalSemanticKernel({
    parserResult: { ok: false },
    reviewIr: reviewIr(),
    exactAuthority: fullAuthority({ sceneRevisionUnchanged: false }),
    yrtk2Verification: { ok: false },
  }, { cryptoPort });
  const missingCrypto = kernel.evaluateWordV4MinimalSemanticKernel({
    reviewIr: reviewIr(),
    exactAuthority: fullAuthority(),
    yrtk2Verification: yrtk2(),
  }, {});

  // analysis-only contract: blocked analysis never restates as write authority.
  assert.equal(blocked.exactSemanticReady, undefined);
  assert.equal(blocked.analysisOnly, true);
  assert.equal(blocked.status, 'semantic-kernel-manual-or-blocked');
  assert.equal(blocked.reasons.some((item) => item.code === 'RTK_V4_KERNEL_PACKAGE_REJECT'), true);
  assert.equal(blocked.reasons.some((item) => item.code === 'RTK_V4_KERNEL_YRTK2_REQUIRED'), true);
  assert.equal(blocked.reasons.some((item) => item.code === 'RTK_V4_KERNEL_STALE_SCENE_REVISION'), true);
  assert.equal(missingCrypto.ok, false);
  assert.equal(missingCrypto.code, 'RTK_V4_KERNEL_CRYPTO_PORT_REQUIRED');
});

test('V4 E04 public barrel receipt and source boundaries remain non-writer and platform-neutral', async () => {
  const bridge = await import(pathToFileURL(path.join(REPO_ROOT, INDEX_PATH)).href);
  const receipt = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, RECEIPT_PATH), 'utf8'));
  const source = fs.readFileSync(path.join(REPO_ROOT, KERNEL_PATH), 'utf8');

  assert.equal(typeof bridge.evaluateWordV4MinimalSemanticKernel, 'function');
  assert.equal(bridge.RTK_WORD_V4_MINIMAL_SEMANTIC_KERNEL_PROFILE, 'word-v4-minimal-semantic-kernel-e04');
  assert.equal(receipt.status, 'LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN');
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  for (const forbidden of ['node:', 'Buffer', 'child_process', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
