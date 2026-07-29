const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function read(parts) {
  return fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
}

function loadReviewSurfaceHelpers() {
  const source = read(['src', 'renderer', 'editor.js']);
  const startMarker = '// REVIEW_SURFACE_PRESENTATION_START';
  const endMarker = '// REVIEW_SURFACE_PRESENTATION_END';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notEqual(start, -1, 'review surface start marker must exist');
  assert.notEqual(end, -1, 'review surface end marker must exist');
  const snippet = `${source.slice(start, end + endMarker.length)}
this.__reviewSurfaceExports = {
  REVIEW_SURFACE_RECEIPT_SCHEMA,
  REVIEW_SURFACE_EXACT_TEXT_APPLY_COMMAND_ID,
  REVIEW_SURFACE_EXACT_TEXT_APPLY_BATCH_COMMAND_ID,
  REVIEW_SURFACE_RELOAD_RECONCILED_SCENE_COMMAND_ID,
  REVIEW_SURFACE_CANCEL_OPERATION_COMMAND_ID,
  reviewSurfaceBuildExactTextApplyPayload,
  reviewSurfaceBuildExactTextApplyBatchPayload,
  reviewSurfaceNormalizeState,
  buildReviewSurfaceViewModel,
  renderReviewSurfaceMarkup,
};
`;
  const sandbox = {};
  vm.runInNewContext(snippet, sandbox, {
    filename: 'review-surface-ui.editor-snippet.js',
  });
  return sandbox.__reviewSurfaceExports;
}

function loadReviewSurfaceClickHarness(bridgeResult) {
  const source = read(['src', 'renderer', 'editor.js']);
  const presentationStart = source.indexOf('// REVIEW_SURFACE_PRESENTATION_START');
  const presentationEnd = source.indexOf('// REVIEW_SURFACE_PRESENTATION_END');
  const runtimeStart = source.indexOf('function setReviewSurfaceExactTextApplyTransientState');
  const runtimeEnd = source.indexOf('function initializeReviewSurface()', runtimeStart);
  assert.notEqual(presentationStart, -1, 'review surface presentation start marker must exist');
  assert.notEqual(presentationEnd, -1, 'review surface presentation end marker must exist');
  assert.ok(presentationEnd > presentationStart, 'review surface presentation markers must be ordered');
  assert.notEqual(runtimeStart, -1, 'review surface apply runtime start must exist');
  assert.ok(runtimeEnd > runtimeStart, 'review surface apply runtime block must be bounded');

  const snippet = `${source.slice(presentationStart, presentationEnd)}
let reviewSurfaceExactTextApplyTransientState = null;
let renderCount = 0;
const bridgeCalls = [];
const dispatchCalls = [];
const stateCalls = [];
const statusCalls = [];

class FakeElement extends Element {
  closest() {
    return null;
  }
}
class FakeHTMLElement extends HTMLElement {}
class FakeButton extends HTMLButtonElement {
  constructor(dataset, closestSelector) {
    super();
    this.dataset = dataset;
    this.closestSelector = closestSelector;
    this.disabled = false;
  }
  closest(selector) {
    return selector === this.closestSelector ? this : null;
  }
}

const fakeButton = new FakeButton({ changeId: 'change-1' }, '[data-review-apply-exact-change]');
const fakeBatchButton = new FakeButton(
  { changeIds: 'change-1,change-2' },
  '[data-review-apply-exact-batch]',
);
const fakeReloadButton = new FakeButton(
  { operationId: 'op_reconcile_1' },
  '[data-review-reload-reconciled-scene]',
);
const fakeCancelButton = new FakeButton(
  { operationId: 'review-operation-1' },
  '[data-review-cancel-operation]',
);
const reviewSurfaceHost = new FakeHTMLElement();
reviewSurfaceHost.contains = (node) => (
  node === fakeButton || node === fakeBatchButton || node === fakeReloadButton || node === fakeCancelButton
);
reviewSurfaceHost.addEventListener = () => {};

function renderReviewSurface() {
  renderCount += 1;
}
function setReviewSurfaceState(nextState = {}, options = {}) {
  stateCalls.push({ nextState, options });
  return nextState;
}
async function loadReviewSurfaceFromQuery() {
  stateCalls.push({ query: true });
  return {};
}
async function invokePreloadUiCommandBridge(commandId, payload) {
  bridgeCalls.push({ commandId, payload });
  return __bridgeResult;
}
async function dispatchUiCommand(commandId, payload) {
  dispatchCalls.push({ commandId, payload });
  return handleReviewCancelOperation(payload);
}
function updateStatusText(text) {
  statusCalls.push(text);
}

${source.slice(runtimeStart, runtimeEnd)}

this.__reviewSurfaceClickHarness = {
  fakeButton,
  fakeBatchButton,
  fakeReloadButton,
  fakeCancelButton,
  bridgeCalls,
  dispatchCalls,
  stateCalls,
  statusCalls,
  getTransientState: () => reviewSurfaceExactTextApplyTransientState,
  getRenderCount: () => renderCount,
  click: () => handleReviewSurfaceExactTextApplyClick({ target: fakeButton }),
  clickBatch: () => handleReviewSurfaceExactTextApplyClick({ target: fakeBatchButton }),
  clickReload: () => handleReviewSurfaceExactTextApplyClick({ target: fakeReloadButton }),
  clickCancel: () => handleReviewSurfaceExactTextApplyClick({ target: fakeCancelButton }),
};
`;
  const sandbox = {
    __bridgeResult: bridgeResult,
    Element: null,
    HTMLElement: null,
    HTMLButtonElement: null,
  };
  vm.runInNewContext(
    `class Element {}
class HTMLElement extends Element {}
class HTMLButtonElement extends HTMLElement {}
this.Element = Element;
this.HTMLElement = HTMLElement;
this.HTMLButtonElement = HTMLButtonElement;
${snippet}`,
    sandbox,
    { filename: 'review-surface-click-harness.editor-snippet.js' },
  );
  return sandbox.__reviewSurfaceClickHarness;
}

function createReviewSurfaceState() {
  return {
    revisionSession: {
      projectId: 'project-1',
      sessionId: 'session-1',
      baselineHash: 'baseline-1',
      status: 'open',
      reviewGraph: {
        textChanges: [
          {
            changeId: 'change-1',
            targetScope: { type: 'scene', id: 'scene-1' },
            match: { kind: 'exact', quote: 'beta' },
            replacementText: 'delta',
          },
        ],
        structuralChanges: [
          {
            structuralChangeId: 'structural-1',
            kind: 'moveBlock',
            summary: 'Move block.',
          },
        ],
        commentThreads: [
          {
            threadId: 'thread-1',
            messages: [{ body: 'Keep this orphan text visible.' }],
          },
        ],
        commentPlacements: [
          {
            placementId: 'placement-1',
            threadId: 'thread-1',
          },
        ],
        diagnosticItems: [],
        decisionStates: [],
      },
    },
    exactTextPlanPreview: {
      status: 'ready',
      plan: {
        projectId: 'project-1',
        sessionId: 'session-1',
        baselineHash: 'baseline-1',
        applyOps: [
          {
            opId: 'rbop-1',
            sceneId: 'scene-1',
            changeId: 'change-1',
            from: 6,
            to: 10,
            expectedText: 'beta',
            replacementText: 'delta',
          },
        ],
      },
      reasons: [],
    },
    structuralManualReviewPreview: {
      items: [
        {
          itemId: 'item-1',
          structuralChangeId: 'structural-1',
          structuralKind: 'moveBlock',
          summary: 'Move block.',
          manualOnlyReason: 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY',
          reasonCodes: ['REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY'],
        },
      ],
      unsupportedObservations: [
        {
          itemId: 'unsupported-1',
          structuralKind: 'copyBlock',
          reason: 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND',
        },
      ],
      summary: {
        totalStructuralChanges: 1,
      },
    },
    commentSurvivalPreview: {
      totalThreads: 1,
      totalPlacements: 1,
      preservedThreads: [
        {
          threadId: 'thread-1',
          messages: [{ body: 'Keep this orphan text visible.' }],
        },
      ],
      placementResults: [
        {
          placementId: 'placement-1',
          threadId: 'thread-1',
          status: 'unplaced',
          evaluation: {
            reasonCodes: ['REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN'],
          },
        },
      ],
      diagnostics: [],
    },
  };
}

function createReadyExactOnlyReviewSurfaceState() {
  const state = createReviewSurfaceState();
  state.revisionSession.reviewGraph.structuralChanges = [];
  state.revisionSession.reviewGraph.commentThreads = [];
  state.revisionSession.reviewGraph.commentPlacements = [];
  state.structuralManualReviewPreview = {
    items: [],
    unsupportedObservations: [],
    summary: {
      totalStructuralChanges: 0,
    },
  };
  state.commentSurvivalPreview = {
    totalThreads: 0,
    totalPlacements: 0,
    preservedThreads: [],
    placementResults: [],
    diagnostics: [],
  };
  return state;
}

function createValidReviewSurfaceReceipt(schemaVersion) {
  return {
    schemaVersion,
    projectId: 'project-1',
    sessionId: 'session-1',
    sceneId: 'scene-1',
    changeId: 'change-1',
    baselineHashBefore: 'baseline-1',
    operationKind: 'replaceExactText',
    writeStatus: 'applied',
    backupId: '1700000000000',
    writtenAt: '2023-11-14T22:13:20.000Z',
    transactionId: 'tx_123',
    inputHash: 'a'.repeat(64),
    outputHash: 'b'.repeat(64),
    bytesWritten: 18,
    reason: 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_APPLIED',
    recovery: {
      snapshotCreated: true,
      snapshotReadable: true,
      snapshotHashMatchesInput: true,
      snapshotPath: 'scene-1.recovery.bak.1700000000000',
      recoveryAction: 'OPEN_SNAPSHOT_OR_ABORT',
    },
  };
}

function createW4ReviewSurfaceState() {
  const state = createReadyExactOnlyReviewSurfaceState();
  state.sourceMode = 'MIXED';
  state.lifecycleState = 'RETURN_ANALYZED';
  state.returnArtifactSha256 = 'a'.repeat(64);
  state.manifestDigest = 'b'.repeat(64);
  state.parserProfileDigest = 'sha256:' + 'c'.repeat(64);
  state.analysisDigest = 'sha256:' + 'd'.repeat(64);
  state.commentSurvivalPreview = {
    totalThreads: 1,
    totalPlacements: 1,
    preservedThreads: [
      {
        threadId: 'thread-w4-1',
        author: 'Reviewer',
        createdAt: '2026-07-29T10:00:00.000Z',
        messages: [
          { body: 'Comment body stays independent.', author: 'Reviewer', createdAt: '2026-07-29T10:00:00.000Z' },
          { body: 'Reply stays ordered.', author: 'Editor', createdAt: '2026-07-29T10:02:00.000Z' },
        ],
      },
    ],
    placementResults: [
      {
        placementId: 'placement-w4-1',
        threadId: 'thread-w4-1',
        status: 'orphan',
        evaluation: {
          reasonCodes: ['RTK_COMMENT_ORPHAN'],
        },
      },
    ],
    diagnostics: [],
  };
  state.packageRewriteReport = {
    schemaVersion: 'yalken.rtk.package-rewrite-report.v2',
    reportId: 'e'.repeat(64),
    canWriteManuscript: false,
    canApply: false,
    changedBlocks: [
      {
        blockId: 'block-1',
        originalText: 'Original private paragraph that must only appear as a bounded redacted excerpt.',
        finalText: 'Final private paragraph that must only appear as a bounded redacted excerpt.',
        originalDigest: 'sha256:' + 'f'.repeat(64),
        finalDigest: 'sha256:' + '1'.repeat(64),
      },
    ],
    unchangedBlocks: [],
  };
  state.reviewProgress = {
    active: true,
    state: 'running',
    label: 'Applying exact candidate',
    operationId: 'review-operation-1',
    percent: 64,
    cancellable: true,
  };
  return state;
}

function createCanonicalAdapterPayload() {
  const reviewPacket = {
    textChanges: [
      {
        changeId: 'change-1',
        targetScope: { type: 'scene', id: 'scene-1' },
        match: { kind: 'exact', quote: 'beta' },
        replacementText: 'delta',
      },
    ],
    structuralChanges: [
      {
        structuralChangeId: 'structural-1',
        kind: 'moveBlock',
        summary: 'Move block.',
        manualOnlyReason: 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY',
        reasonCodes: ['REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY'],
      },
    ],
    commentThreads: [
      {
        threadId: 'thread-1',
        messages: [{ body: 'Keep this orphan text visible.' }],
      },
    ],
    commentPlacements: [
      {
        placementId: 'placement-1',
        threadId: 'thread-1',
        status: 'unplaced',
        evaluation: {
          reasonCodes: ['REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN'],
        },
      },
    ],
    diagnosticItems: [],
    decisionStates: [],
  };

  return {
    reviewPacket,
    previewInput: {
      projectId: 'project-1',
      sessionId: 'session-1',
      baselineHash: 'baseline-1',
      reviewPacket,
    },
    revisionBridgePreviewResult: {
      session: {
        projectId: 'project-1',
        sessionId: 'session-1',
        baselineHash: 'baseline-1',
        status: 'preview',
        reviewGraph: reviewPacket,
      },
    },
    structuralManualReviewPreview: {
      items: [
        {
          itemId: 'item-1',
          structuralChangeId: 'structural-1',
          structuralKind: 'moveBlock',
          summary: 'Move block.',
          manualOnlyReason: 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY',
          reasonCodes: ['REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY'],
        },
      ],
      unsupportedObservations: [],
      summary: {
        totalStructuralChanges: 1,
      },
    },
  };
}

test('review surface ui: comments rail keeps bounded review host and removes demo comment cards', () => {
  const html = read(['src', 'renderer', 'index.html']);

  assert.ok(html.includes('data-right-tab="inspector"'));
  assert.ok(html.includes('data-right-tab="comments"'));
  assert.ok(html.includes('data-right-tab="history"'));
  assert.ok(html.includes('data-right-panel-history'));
  assert.ok(html.includes('data-review-surface-host'));
  assert.equal(html.includes('right-rail-comment-card'), false);
  assert.equal(html.includes('data-comments-placeholder'), false);
});

test('review surface ui: comments tab routes through review command instead of direct bypass', () => {
  const source = read(['src', 'renderer', 'editor.js']);

  assert.ok(source.includes("if (tab === 'comments') {"));
  assert.ok(source.includes('void dispatchUiCommand(EXTRA_COMMAND_IDS.REVIEW_OPEN_COMMENTS);'));
  assert.equal(source.includes('__setYalkenReviewSurfaceState'), false);
  assert.equal(source.includes('__getYalkenReviewSurfaceState'), false);
  assert.equal(source.includes('__YALKEN_REVIEW_SURFACE_STATE__'), false);
  assert.equal(source.includes("if (tab === 'inspector' || tab === 'comments' || tab === 'history') {\n      applyRightTab(tab);"), false);
});

test('review surface ui: canonical adapter payload populates review surface from existing kernel output only', () => {
  const helpers = loadReviewSurfaceHelpers();
  const viewModel = helpers.buildReviewSurfaceViewModel(createCanonicalAdapterPayload());
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.status, 'ready');
  assert.equal(viewModel.importSummary.projectId, 'project-1');
  assert.equal(viewModel.importSummary.sessionId, 'session-1');
  assert.equal(viewModel.importSummary.baselineHash, 'baseline-1');
  assert.equal(viewModel.importSummary.sessionStatus, 'preview');
  assert.equal(viewModel.reviewItems[0].title, 'Текстовая правка change-1');
  assert.equal(viewModel.manualOnlyReasons.includes('REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_MOVE_MANUAL_ONLY'), true);
  assert.equal(viewModel.orphanComments[0].body, 'Keep this orphan text visible.');
  assert.equal(viewModel.orphanComments[0].reasonCodes.includes('REVISION_BRIDGE_ANCHOR_CONFIDENCE_ORPHAN'), true);
  assert.equal(viewModel.exactTextPreview.state, 'empty');
  assert.equal(viewModel.receipt, null);
  assert.ok(markup.includes('Keep this orphan text visible.'));
  assert.ok(markup.includes('Только вручную'));
  assert.ok(markup.includes('Текстовая правка change-1'));
  assert.ok(markup.includes('Структура moveBlock'));
  assert.ok(markup.includes('Нет точного текстового предпросмотра.'));
});

test('review surface ui: diagnostic items render as read-only review evidence', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = {
    revisionSession: {
      projectId: 'project-1',
      sessionId: 'docx-diagnostic-session-1',
      baselineHash: 'baseline-1',
      reviewGraph: {
        textChanges: [],
        structuralChanges: [],
        commentThreads: [],
        commentPlacements: [],
        diagnosticItems: [
          {
            diagnosticId: 'docx-review-tracked-insertCount',
            severity: 'warning',
            message: 'DOCX tracked-change insertions detected (1) and kept diagnostic-only.',
            targetScope: { type: 'docx', id: 'word/document.xml' },
          },
        ],
        decisionStates: [],
      },
    },
  };
  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.status, 'ready');
  assert.equal(viewModel.importSummary.diagnosticCount, 1);
  assert.equal(viewModel.importSummary.textChangeCount, 0);
  assert.equal(viewModel.reviewItems.length, 1);
  assert.equal(viewModel.reviewItems[0].title, 'Диагностика docx-review-tracked-insertCount');
  assert.equal(viewModel.reviewItems[0].tone, 'readonly');
  assert.equal(viewModel.exactTextPreview.state, 'empty');
  assert.ok(markup.includes('DOCX tracked-change insertions detected (1) and kept diagnostic-only.'));
  assert.ok(markup.includes('Только чтение'));
  assert.equal(markup.includes('data-review-apply-exact-change'), false);
});

test('review surface ui: unsupported observations still render only from explicit preview payload', () => {
  const helpers = loadReviewSurfaceHelpers();
  const viewModel = helpers.buildReviewSurfaceViewModel(createReviewSurfaceState());
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.unsupportedObservations[0].reason, 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND');
  assert.ok(markup.includes('Только чтение'));
  assert.ok(markup.includes('Безопасная проверка'));
  assert.ok(markup.includes('Запись в проект идет только через подтвержденный путь.'));
});

test('review surface ui: canonical adapter payload preserves unsupported observations from explicit structural preview', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createCanonicalAdapterPayload();
  state.structuralManualReviewPreview = {
    items: [],
    unsupportedObservations: [
      {
        itemId: 'unsupported-1',
        structuralKind: 'copyBlock',
        reason: 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND',
      },
    ],
    summary: {
      totalStructuralChanges: 1,
    },
  };

  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.reviewItems.length > 0 && viewModel.reviewItems[0].title === 'Структура copyBlock', false);
  assert.equal(viewModel.unsupportedObservations[0].reason, 'REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND');
  assert.ok(markup.includes('Только чтение'));
  assert.ok(markup.includes('REVISION_BRIDGE_STRUCTURAL_MANUAL_REVIEW_UNSUPPORTED_KIND'));
});

test('review surface ui: exact-text preview and receipt render only when supported by existing schema', () => {
  const helpers = loadReviewSurfaceHelpers();
  const validState = createReviewSurfaceState();
  validState.receipt = createValidReviewSurfaceReceipt(helpers.REVIEW_SURFACE_RECEIPT_SCHEMA);

  const validViewModel = helpers.buildReviewSurfaceViewModel(validState);
  const validMarkup = helpers.renderReviewSurfaceMarkup(validViewModel);
  assert.equal(validViewModel.receipt.baselineHashBefore, 'baseline-1');
  assert.equal(validViewModel.receipt.operationKind, 'replaceExactText');
  assert.equal(validViewModel.receipt.writeStatus, 'applied');
  assert.equal(validViewModel.receipt.backupId, '1700000000000');
  assert.equal(validViewModel.receipt.writtenAt, '2023-11-14T22:13:20.000Z');
  assert.equal(validViewModel.exactTextPreview.ops[0].applyState, 'applied');
  assert.ok(validMarkup.includes('data-review-apply-exact-change'));
  assert.ok(validMarkup.includes('disabled aria-disabled="true"'));
  assert.ok(validMarkup.includes('&quot;beta&quot; -&gt; &quot;delta&quot;'));
  assert.ok(validMarkup.includes('baseline-1'));
  assert.ok(validMarkup.includes('replaceExactText'));
  assert.ok(validMarkup.includes('применено'));
  assert.ok(validMarkup.includes('1700000000000'));
  assert.ok(validMarkup.includes('2023-11-14T22:13:20.000Z'));
  assert.ok(validMarkup.includes('tx_123'));

  const blockedState = createReviewSurfaceState();
  blockedState.exactTextPlanPreview = {
    status: 'blocked',
    reasons: [{ code: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_DUPLICATE_MATCH' }],
    plan: { applyOps: [] },
  };
  blockedState.receipt = {
    schemaVersion: helpers.REVIEW_SURFACE_RECEIPT_SCHEMA,
    projectId: 'project-1',
    sessionId: 'session-1',
    sceneId: 'scene-1',
    changeId: 'change-1',
    baselineHashBefore: 'baseline-1',
    operationKind: 'rewriteEverything',
    writeStatus: 'applied',
    backupId: 'not-a-real-backup-id',
    writtenAt: 'not-iso',
    transactionId: 'tx_invalid',
    inputHash: 'a'.repeat(64),
    outputHash: 'b'.repeat(64),
    recovery: {
      snapshotCreated: true,
      snapshotReadable: true,
      snapshotHashMatchesInput: true,
      snapshotPath: 'scene-1.recovery.bak.1700000000001',
      recoveryAction: 'OPEN_SNAPSHOT_OR_ABORT',
    },
  };
  const blockedViewModel = helpers.buildReviewSurfaceViewModel(blockedState);
  const blockedMarkup = helpers.renderReviewSurfaceMarkup(blockedViewModel);
  assert.equal(blockedViewModel.receipt, null);
  assert.ok(blockedMarkup.includes('Предпросмотр заблокирован'));
  assert.equal(blockedMarkup.includes('data-review-apply-exact-change'), false);
  assert.ok(blockedMarkup.includes('REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_DUPLICATE_MATCH'));
  assert.equal(blockedMarkup.includes('tx_invalid'), false);
});

test('review surface ui: ready exact-text preview exposes one visible apply action without authority payload', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createReadyExactOnlyReviewSurfaceState();
  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(helpers.REVIEW_SURFACE_EXACT_TEXT_APPLY_COMMAND_ID, 'cmd.project.review.applyExactTextChange');
  assert.equal(viewModel.exactTextPreview.state, 'ready');
  assert.equal(viewModel.exactTextPreview.ops.length, 1);
  assert.equal(viewModel.exactTextPreview.ops[0].applyState, 'ready');
  assert.equal(viewModel.exactTextPreview.ops[0].applyLabel, 'Применить');
  assert.equal(viewModel.exactTextPreview.ops[0].applyDisabled, false);
  assert.ok(markup.includes('data-review-apply-exact-change'));
  assert.ok(markup.includes('data-change-id="change-1"'));
  assert.ok(markup.includes('>Применить</button>'));
  assert.equal(markup.includes('disabled aria-disabled="true"'), false);

  assert.equal(
    JSON.stringify(helpers.reviewSurfaceBuildExactTextApplyPayload('request-1', 'change-1')),
    JSON.stringify({ requestId: 'request-1', changeId: 'change-1' }),
  );
  assert.equal(
    JSON.stringify(helpers.reviewSurfaceBuildExactTextApplyPayload('', 'change-1')),
    JSON.stringify({ changeId: 'change-1' }),
  );
});

test('review surface ui: applied exact-text preview disables repeat apply from main receipt evidence', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createReadyExactOnlyReviewSurfaceState();
  state.receipt = createValidReviewSurfaceReceipt(helpers.REVIEW_SURFACE_RECEIPT_SCHEMA);

  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.exactTextPreview.ops.length, 1);
  assert.equal(viewModel.exactTextPreview.ops[0].applyState, 'applied');
  assert.equal(viewModel.exactTextPreview.ops[0].applyLabel, 'применено');
  assert.equal(viewModel.exactTextPreview.ops[0].applyDisabled, true);
  assert.ok(markup.includes('>применено</button>'));
  assert.ok(markup.includes('disabled aria-disabled="true"'));
});

test('review surface ui: batch applied evidence disables all matching exact ops', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createReadyExactOnlyReviewSurfaceState();
  state.exactTextPlanPreview.plan.applyOps.push({
    opId: 'rbop-2',
    sceneId: 'scene-1',
    changeId: 'change-2',
    from: 11,
    to: 15,
    expectedText: 'more',
    replacementText: 'less',
  });
  state.exactTextBatchApplyResult = {
    status: 'applied',
    applied: true,
    changes: [
      { changeId: 'change-1', status: 'applied' },
      { changeId: 'change-2', status: 'applied' },
    ],
  };

  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.exactTextPreview.ops.length, 2);
  assert.equal(viewModel.exactTextPreview.ops.every((op) => op.applyState === 'applied'), true);
  assert.equal(viewModel.exactTextPreview.batchAction.applyState, 'applied');
  assert.equal(viewModel.exactTextPreview.batchAction.applyDisabled, true);
  assert.equal((markup.match(/>применено<\/button>/g) || []).length, 3);
});

test('review surface ui: non-single exact preview renders controlled batch action without per-op enablement', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createReadyExactOnlyReviewSurfaceState();
  state.exactTextPlanPreview.plan.applyOps.push({
    opId: 'rbop-2',
    sceneId: 'scene-1',
    changeId: 'change-2',
    from: 11,
    to: 15,
    expectedText: 'more',
    replacementText: 'less',
  });

  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(helpers.REVIEW_SURFACE_EXACT_TEXT_APPLY_BATCH_COMMAND_ID, 'cmd.project.review.applyExactTextChangesBatch');
  assert.equal(viewModel.exactTextPreview.ops.length, 2);
  assert.equal(viewModel.exactTextPreview.ops.every((op) => op.applyState === 'blocked'), true);
  assert.equal(viewModel.exactTextPreview.batchAction.applyState, 'ready');
  assert.equal(viewModel.exactTextPreview.batchAction.applyDisabled, false);
  assert.equal(
    JSON.stringify(viewModel.exactTextPreview.batchAction.changeIds),
    JSON.stringify(['change-1', 'change-2']),
  );
  assert.ok(markup.includes('REVIEW_SURFACE_SINGLE_EXACT_CHANGE_REQUIRED'));
  assert.ok(markup.includes('data-review-apply-exact-batch'));
  assert.ok(markup.includes('data-change-ids="change-1,change-2"'));
  assert.ok(markup.includes('>Применить все</button>'));
  assert.equal((markup.match(/data-review-apply-exact-change/g) || []).length, 2);
  assert.equal((markup.match(/disabled aria-disabled="true"/g) || []).length, 2);
  assert.equal(
    JSON.stringify(helpers.reviewSurfaceBuildExactTextApplyBatchPayload('request-1', ['change-1', 'change-2'])),
    JSON.stringify({ requestId: 'request-1', changeIds: ['change-1', 'change-2'] }),
  );
});

test('review surface ui: W4 lanes expose source mode lifecycle full identities and bounded display diff', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createW4ReviewSurfaceState();
  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.sourceMode, 'MIXED');
  assert.equal(viewModel.lifecycleState, 'RETURN_ANALYZED');
  assert.equal(viewModel.identity.returnArtifactSha256, 'a'.repeat(64));
  assert.equal(viewModel.identity.manifestDigest, 'b'.repeat(64));
  assert.equal(viewModel.identity.parserProfileDigest, 'sha256:' + 'c'.repeat(64));
  assert.equal(viewModel.identity.analysisDigest, 'sha256:' + 'd'.repeat(64));
  assert.equal(viewModel.lanes.map((lane) => lane.laneId).join(','), 'exact,manual,comments');
  assert.equal(viewModel.lanes.find((lane) => lane.laneId === 'manual').state, 'manual');
  assert.equal(viewModel.lanes.find((lane) => lane.laneId === 'comments').count, 1);
  assert.equal(viewModel.exactTextPreview.ops[0].displayDiff.some((token) => token.kind === 'removed'), true);
  assert.equal(viewModel.exactTextPreview.ops[0].displayDiff.some((token) => token.kind === 'added'), true);
  assert.ok(markup.includes('MIXED: правки и drift'));
  assert.ok(markup.includes('RETURN_ANALYZED'));
  assert.ok(markup.includes('a'.repeat(64)));
  assert.ok(markup.includes('sha256:' + 'd'.repeat(64)));
  assert.ok(markup.includes('data-review-display-diff="bounded"'));
  assert.equal(markup.includes('data-project-id'), false);
  assert.equal(markup.includes('data-scene-path'), false);
  assert.equal(markup.includes('data-apply-ops'), false);
});

test('review surface ui: W4 comment lane and redacted report stay separate from text apply authority', () => {
  const helpers = loadReviewSurfaceHelpers();
  const viewModel = helpers.buildReviewSurfaceViewModel(createW4ReviewSurfaceState());
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.commentLane.length, 1);
  assert.equal(viewModel.commentLane[0].threadId, 'thread-w4-1');
  assert.equal(viewModel.commentLane[0].body, 'Comment body stays independent.');
  assert.equal(viewModel.commentLane[0].replies, 1);
  assert.equal(viewModel.commentLane[0].outcome, 'ORPHAN');
  assert.equal(viewModel.commentLane[0].reasonCodes.includes('RTK_COMMENT_ORPHAN'), true);
  assert.equal(viewModel.packageRewriteReport.reportId, 'e'.repeat(64));
  assert.equal(viewModel.packageRewriteReport.changedBlocks[0].originalDigest, 'sha256:' + 'f'.repeat(64));
  assert.equal(viewModel.packageRewriteReport.changedBlocks[0].originalExcerpt.length <= 80, true);
  assert.equal(viewModel.packageRewriteReport.canWriteManuscript, false);
  assert.equal(viewModel.packageRewriteReport.canApply, false);
  assert.ok(markup.includes('Comment body stays independent.'));
  assert.ok(markup.includes('RTK_COMMENT_ORPHAN'));
  assert.ok(markup.includes('Package Rewrite Report'));
  assert.ok(markup.includes('redacted'));
  assert.equal(markup.includes('data-review-apply-exact-change="'), false);
});

test('review surface ui: exact apply requires a named change id before enabling action', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createReadyExactOnlyReviewSurfaceState();
  state.exactTextPlanPreview.plan.applyOps[0].changeId = '';

  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.exactTextPreview.ops.length, 1);
  assert.equal(viewModel.exactTextPreview.ops[0].applyState, 'blocked');
  assert.equal(viewModel.exactTextPreview.ops[0].applyDisabled, true);
  assert.ok(markup.includes('REVIEW_SURFACE_EXACT_CHANGE_ID_REQUIRED'));
  assert.ok(markup.includes('disabled aria-disabled="true"'));
});

test('review surface ui: mixed structural review blocks visible exact apply before main write path', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createReviewSurfaceState();

  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.exactTextPreview.ops.length, 1);
  assert.equal(viewModel.exactTextPreview.ops[0].applyState, 'blocked');
  assert.equal(viewModel.exactTextPreview.ops[0].applyDisabled, true);
  assert.ok(markup.includes('REVIEW_SURFACE_STRUCTURAL_REVIEW_BLOCKS_EXACT_APPLY'));
  assert.ok(markup.includes('disabled aria-disabled="true"'));
});

test('review surface ui: mixed comment review blocks controlled batch action before main write path', () => {
  const helpers = loadReviewSurfaceHelpers();
  const state = createReadyExactOnlyReviewSurfaceState();
  state.revisionSession.reviewGraph.commentThreads = [
    {
      threadId: 'thread-1',
      messages: [{ body: 'Keep comment visible.' }],
    },
  ];
  state.commentSurvivalPreview = {
    totalThreads: 1,
    totalPlacements: 0,
    preservedThreads: [
      {
        threadId: 'thread-1',
        messages: [{ body: 'Keep comment visible.' }],
      },
    ],
    placementResults: [],
    diagnostics: [],
  };
  state.exactTextPlanPreview.plan.applyOps.push({
    opId: 'rbop-2',
    sceneId: 'scene-1',
    changeId: 'change-2',
    from: 11,
    to: 15,
    expectedText: 'more',
    replacementText: 'less',
  });

  const viewModel = helpers.buildReviewSurfaceViewModel(state);
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.exactTextPreview.batchAction.applyState, 'blocked');
  assert.equal(viewModel.exactTextPreview.batchAction.applyDisabled, true);
  assert.equal(
    viewModel.exactTextPreview.batchAction.applyReason,
    'REVIEW_SURFACE_COMMENT_REVIEW_BLOCKS_EXACT_BATCH_APPLY',
  );
  assert.ok(markup.includes('data-review-apply-exact-batch'));
  assert.ok(markup.includes('REVIEW_SURFACE_COMMENT_REVIEW_BLOCKS_EXACT_BATCH_APPLY'));
  assert.equal((markup.match(/disabled aria-disabled="true"/g) || []).length, 3);
});

test('review surface ui: exact apply click sends intent-only payload and adopts main review surface', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: true,
    value: {
      ok: true,
      applied: true,
      reviewSurface: {
        receipt: {
          changeId: 'change-1',
          writeStatus: 'applied',
        },
      },
    },
  });

  await harness.click();

  assert.equal(harness.bridgeCalls.length, 1);
  assert.equal(harness.bridgeCalls[0].commandId, 'cmd.project.review.applyExactTextChange');
  assert.equal(
    JSON.stringify(Object.keys(harness.bridgeCalls[0].payload).sort()),
    JSON.stringify(['changeId', 'requestId']),
  );
  assert.equal(harness.bridgeCalls[0].payload.changeId, 'change-1');
  assert.equal(harness.bridgeCalls[0].payload.requestId.startsWith('review-exact-apply-change-1-'), true);
  assert.equal(harness.getTransientState(), null);
  assert.equal(harness.stateCalls.length, 1);
  assert.equal(harness.stateCalls[0].nextState.receipt.changeId, 'change-1');
  assert.equal(harness.stateCalls[0].nextState.receipt.writeStatus, 'applied');
});

test('review surface ui: batch exact apply click sends intent-only ids and adopts main review surface', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: true,
    value: {
      ok: true,
      batch: true,
      applied: true,
      reviewSurface: {
        exactTextAppliedChangeIds: ['change-1', 'change-2'],
        exactTextBatchApplyResult: {
          status: 'applied',
          applied: true,
          changes: [
            { changeId: 'change-1', status: 'applied' },
            { changeId: 'change-2', status: 'applied' },
          ],
        },
      },
    },
  });

  await harness.clickBatch();

  assert.equal(harness.bridgeCalls.length, 1);
  assert.equal(harness.bridgeCalls[0].commandId, 'cmd.project.review.applyExactTextChangesBatch');
  assert.equal(
    JSON.stringify(Object.keys(harness.bridgeCalls[0].payload).sort()),
    JSON.stringify(['changeIds', 'requestId']),
  );
  assert.equal(
    JSON.stringify(harness.bridgeCalls[0].payload.changeIds),
    JSON.stringify(['change-1', 'change-2']),
  );
  assert.equal(harness.bridgeCalls[0].payload.requestId.startsWith('review-exact-batch-apply-change-1-change-2-'), true);
  assert.equal(harness.getTransientState(), null);
  assert.equal(harness.stateCalls.length, 1);
  assert.deepEqual(harness.stateCalls[0].nextState.exactTextAppliedChangeIds, ['change-1', 'change-2']);
  assert.equal(harness.stateCalls[0].nextState.exactTextBatchApplyResult.applied, true);
});

test('review surface ui: disabled applied button does not send repeat apply command', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: false,
    value: {
      ok: false,
      error: {
        reason: 'REVIEW_EXACT_TEXT_APPLY_ALREADY_APPLIED',
      },
    },
  });
  harness.fakeButton.disabled = true;

  await harness.click();

  assert.equal(harness.bridgeCalls.length, 0);
  assert.equal(harness.stateCalls.length, 0);
  assert.equal(harness.getTransientState(), null);
});

test('review surface ui: exact apply click failure stays local and does not invent receipt truth', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: false,
    reason: 'COMMAND_EXECUTION_FAILED',
    value: {
      ok: false,
      error: {
        reason: 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED',
      },
    },
  });

  await harness.click();

  assert.equal(harness.bridgeCalls.length, 1);
  assert.equal(harness.stateCalls.length, 0);
  assert.equal(harness.getTransientState().state, 'blocked');
  assert.equal(harness.getTransientState().changeId, 'change-1');
  assert.equal(harness.getTransientState().reason, 'REVIEW_EXACT_TEXT_APPLY_DIRTY_EDITOR_BLOCKED');
  assert.equal(harness.getRenderCount() >= 2, true);
});

test('review surface ui: stale no-match exact apply response is blocked instead of transient failed', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: false,
    value: {
      ok: false,
      error: {
        reason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH',
      },
    },
  });

  await harness.click();

  assert.equal(harness.bridgeCalls.length, 1);
  assert.equal(harness.stateCalls.length, 0);
  assert.equal(harness.getTransientState().state, 'blocked');
  assert.equal(harness.getTransientState().reason, 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH');
});

test('review surface ui: transient exact apply failure remains failed instead of blocked', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: false,
    value: {
      ok: false,
      error: {
        reason: 'REVIEW_SURFACE_TRANSPORT_TIMEOUT',
      },
    },
  });

  await harness.click();

  assert.equal(harness.bridgeCalls.length, 1);
  assert.equal(harness.stateCalls.length, 0);
  assert.equal(harness.getTransientState().state, 'failed');
  assert.equal(harness.getTransientState().reason, 'REVIEW_SURFACE_TRANSPORT_TIMEOUT');
});

test('review surface ui: reconciled crash outcome renders one operationId-only safe reload action', () => {
  const helpers = loadReviewSurfaceHelpers();
  const viewModel = helpers.buildReviewSurfaceViewModel({
    exactTextApplyReconciliation: {
      schemaVersion: 'revision-bridge.exact-text-apply-reconciliation-set.v1',
      items: [{
        operationId: 'op_reconcile_1',
        outcome: 'applied_receipt_missing',
        ambiguous: true,
        sceneId: 'scene-1',
        sceneRelativePath: 'roman/scene.md',
        recoveryVerified: true,
        snapshotAvailable: true,
        safeActions: ['RELOAD_CANONICAL', 'DELETE_SCENE'],
        reconciledAt: '2026-07-12T12:00:00.000Z',
      }],
      errors: [],
    },
  });
  const markup = helpers.renderReviewSurfaceMarkup(viewModel);

  assert.equal(viewModel.status, 'ready');
  assert.equal(viewModel.reconciliation.items.length, 1);
  assert.deepEqual(viewModel.reconciliation.items[0].safeActions, ['RELOAD_CANONICAL']);
  assert.ok(markup.includes('Восстановление Apply'));
  assert.ok(markup.includes('Запись применена без отчета'));
  assert.ok(markup.includes('data-review-reload-reconciled-scene'));
  assert.ok(markup.includes('data-operation-id="op_reconcile_1"'));
  assert.equal(markup.includes('DELETE_SCENE'), false);
});

test('review surface ui: reconciliation reload sends only requestId and operationId', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: true,
    value: {
      ok: true,
      reloaded: true,
      reviewSurface: {},
    },
  });

  await harness.clickReload();

  assert.equal(harness.bridgeCalls.length, 1);
  assert.equal(harness.bridgeCalls[0].commandId, 'cmd.project.review.reloadReconciledScene');
  assert.equal(
    JSON.stringify(Object.keys(harness.bridgeCalls[0].payload).sort()),
    JSON.stringify(['operationId', 'requestId']),
  );
  assert.equal(harness.bridgeCalls[0].payload.operationId, 'op_reconcile_1');
  assert.equal(harness.stateCalls.length, 1);
  assert.equal(harness.getTransientState(), null);
});

test('review surface ui: cancel operation is command-routed and carries only opaque operation id', async () => {
  const helpers = loadReviewSurfaceHelpers();
  const harness = loadReviewSurfaceClickHarness({
    ok: true,
    value: {
      ok: true,
    },
  });

  await harness.clickCancel();

  assert.equal(helpers.REVIEW_SURFACE_CANCEL_OPERATION_COMMAND_ID, 'cmd.project.review.cancelOperation');
  assert.equal(harness.bridgeCalls.length, 1);
  assert.equal(harness.dispatchCalls.length, 0);
  assert.equal(harness.bridgeCalls[0].commandId, 'cmd.project.review.cancelOperation');
  assert.equal(
    JSON.stringify(Object.keys(harness.bridgeCalls[0].payload).sort()),
    JSON.stringify(['operationId']),
  );
  assert.equal(harness.bridgeCalls[0].payload.operationId, 'review-operation-1');
  assert.equal(harness.getTransientState(), null);
  assert.equal(harness.statusCalls.includes('Review operation cancelled'), true);
});

test('review surface ui: applied-without-receipt response remains ambiguous instead of failed', async () => {
  const harness = loadReviewSurfaceClickHarness({
    ok: false,
    value: {
      ok: false,
      error: {
        reason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_APPLIED_RECEIPT_MISSING',
      },
      reviewSurface: {
        exactTextApplyReconciliation: {
          items: [{
            operationId: 'op_reconcile_1',
            outcome: 'applied_receipt_missing',
          }],
        },
      },
    },
  });

  await harness.click();

  assert.equal(harness.getTransientState().state, 'ambiguous');
  assert.equal(harness.stateCalls.length, 1);
  assert.equal(harness.stateCalls[0].options.preserveExactApplyState, true);
});

test('review surface ui: empty and error states stay deterministic', () => {
  const helpers = loadReviewSurfaceHelpers();
  const first = helpers.buildReviewSurfaceViewModel({});
  const second = helpers.buildReviewSurfaceViewModel({});
  const emptyMarkup = helpers.renderReviewSurfaceMarkup(first);
  const errorMarkup = helpers.renderReviewSurfaceMarkup(helpers.buildReviewSurfaceViewModel({
    ok: false,
    code: 'REVIEW_SURFACE_REJECTED',
    detail: 'Rejected payload.',
  }));

  assert.deepEqual(first, second);
  assert.equal(first.status, 'empty');
  assert.ok(emptyMarkup.includes('Нет импортированных элементов проверки.'));
  assert.ok(emptyMarkup.includes('Нет точного текстового предпросмотра.'));
  assert.ok(errorMarkup.includes('Поверхность проверки недоступна'));
  assert.ok(errorMarkup.includes('Rejected payload.'));
  assert.ok(errorMarkup.includes('REVIEW_SURFACE_REJECTED'));
});
