const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const MODULE_PATH = 'src/io/revisionBridge/exactTextMinSafeWrite.mjs';
const JOURNAL_MODULE_PATH = 'src/io/revisionBridge/exactTextApplyJournal.mjs';
const MARKDOWN_INDEX_PATH = 'src/io/markdown/index.mjs';
const MARKDOWN_ATOMIC_WRITE_PATH = 'src/io/markdown/atomicWriteFile.mjs';
const CRASH_RECONCILIATION_TEST_PATH =
  'test/contracts/revision-bridge-exact-text-apply-crash-reconciliation.contract.test.js';
const CRASH_RECONCILIATION_FIXTURE_PATH =
  'test/fixtures/revision-bridge-exact-text-apply-crash-child.mjs';
const CRASH_RECONCILIATION_UI_E2E_TEST_PATH =
  'test/unit/sector-m-review-bridge-crash-reconciliation-ui-e2e-smoke.mjs';
const CANONICAL_REVIEW_UI_E2E_TEST_PATH =
  'test/unit/sector-m-review-bridge-canonical-ui-e2e-smoke.mjs';
const CRASH_RECONCILIATION_STATUS_PATH =
  'docs/OPS/STATUS/REVIEW_BRIDGE_APPLY_CRASH_RECONCILIATION_001_STATUS.json';
const C03_MODULE_PATH = 'src/io/revisionBridge/index.mjs';
const C03_TEST_PATH = 'test/contracts/revision-bridge-exact-text-apply-plan-no-disk.contract.test.js';
const TEST_PATH = 'test/contracts/revision-bridge-exact-text-min-safe-write.contract.test.js';
const P0_TEST_PATH = 'test/contracts/revision-bridge-p0-safety-kernel.contract.test.js';
const RB10_TEST_PATH = 'test/contracts/revision-bridge-inline-range-anchor-contract.contract.test.js';
const RB11_TEST_PATH = 'test/contracts/revision-bridge-anchor-confidence-engine-contract.contract.test.js';
const C05_TEST_PATH = 'test/contracts/revision-bridge-comment-survival.contract.test.js';
const C06_TEST_PATH = 'test/contracts/revision-bridge-minimal-block-id.contract.test.js';
const GOVERNANCE_APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const SECTOR_M_SCOPE_MAP_PATH = 'scripts/ops/sector-m-scope-map.json';
const STATUS_PACKET_PATH = 'docs/OPS/STATUS/REVIEW_BRIDGE_SINGLE_EXACT_TEXT_SAFE_APPLY_ENABLEMENT_001_R2_STATUS_V1.json';
const MAIN_PATH = 'src/main.js';
const MARKDOWN_EXPORT_GUARD_TEST_PATH = 'test/contracts/export-contour-02-markdown-text-hardening.contract.test.js';
const REVIEW_MUTATE_PORT_TEST_PATH = 'test/contracts/revision-bridge-review-mutate-port.contract.test.js';
const WORKSPACE_QUERY_BRIDGE_TEST_PATH = 'test/unit/sector-m-preload-workspace-query-bridge.test.js';
const REVIEW_SURFACE_UI_TEST_PATH = 'test/unit/sector-m-review-surface-ui.test.js';
const PRELOAD_UI_COMMAND_BRIDGE_TEST_PATH = 'test/unit/sector-m-preload-ui-command-bridge.test.js';
const RENDERER_EDITOR_PATH = 'src/renderer/editor.js';
const RENDERER_EDITOR_BUNDLE_PATH = 'src/renderer/editor.bundle.js';
const CONTROLLED_MULTI_STATUS_PACKET_PATH =
  'docs/OPS/STATUS/REVIEW_BRIDGE_CONTROLLED_MULTI_EXACT_APPLY_001_R2_STATUS_V1.json';
const G0C_TEST_PATH = 'test/contracts/rtk-g0c-exact-safety.contract.test.js';
const G0C_RECEIPT_PATH = 'docs/OPS/RTK/G0C_EXISTING_EXACT_SAFETY_RECEIPT.json';
const RTK_C04_BLOCK_WRITER_BINDING_MODULE_PATH =
  'src/io/revisionBridge/reviewTransportBlockExactWriterBindingV2.mjs';
const RTK_C04_BLOCK_WRITER_BINDING_TEST_PATH =
  'test/contracts/rtk-word-saturation-c04-block-writer-binding.contract.test.js';
const RTK_C04_BLOCK_WRITER_BINDING_RECEIPT_PATH =
  'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C04_BLOCK_WRITER_BINDING_RECEIPT.json';
const RTK_C05_BLOCK_RANGE_AUTHORITY_MODULE_PATH =
  'src/io/revisionBridge/reviewTransportBlockRangeAuthorityV2.mjs';
const RTK_C05_BLOCK_RANGE_WRITER_TEST_PATH =
  'test/contracts/rtk-word-saturation-c05-block-range-writer.contract.test.js';
const RTK_C05_BLOCK_RANGE_WRITER_RECEIPT_PATH =
  'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C05_BLOCK_RANGE_WRITER_RECEIPT.json';
const ALLOWLIST = [
  MODULE_PATH,
  JOURNAL_MODULE_PATH,
  MARKDOWN_INDEX_PATH,
  MARKDOWN_ATOMIC_WRITE_PATH,
  CRASH_RECONCILIATION_TEST_PATH,
  CRASH_RECONCILIATION_FIXTURE_PATH,
  CRASH_RECONCILIATION_UI_E2E_TEST_PATH,
  CANONICAL_REVIEW_UI_E2E_TEST_PATH,
  CRASH_RECONCILIATION_STATUS_PATH,
  MAIN_PATH,
  C03_MODULE_PATH,
  C03_TEST_PATH,
  TEST_PATH,
  P0_TEST_PATH,
  RB10_TEST_PATH,
  RB11_TEST_PATH,
  C05_TEST_PATH,
  C06_TEST_PATH,
  GOVERNANCE_APPROVALS_PATH,
  SECTOR_M_SCOPE_MAP_PATH,
  STATUS_PACKET_PATH,
  MARKDOWN_EXPORT_GUARD_TEST_PATH,
  REVIEW_MUTATE_PORT_TEST_PATH,
  WORKSPACE_QUERY_BRIDGE_TEST_PATH,
  REVIEW_SURFACE_UI_TEST_PATH,
  PRELOAD_UI_COMMAND_BRIDGE_TEST_PATH,
  RENDERER_EDITOR_PATH,
  RENDERER_EDITOR_BUNDLE_PATH,
  CONTROLLED_MULTI_STATUS_PACKET_PATH,
  G0C_TEST_PATH,
  G0C_RECEIPT_PATH,
  RTK_C04_BLOCK_WRITER_BINDING_MODULE_PATH,
  RTK_C04_BLOCK_WRITER_BINDING_TEST_PATH,
  RTK_C04_BLOCK_WRITER_BINDING_RECEIPT_PATH,
  RTK_C05_BLOCK_RANGE_AUTHORITY_MODULE_PATH,
  RTK_C05_BLOCK_RANGE_WRITER_TEST_PATH,
  RTK_C05_BLOCK_RANGE_WRITER_RECEIPT_PATH,
];
const TOLERATED_NEIGHBOR_REVIEW_BRIDGE_TEST_PATHS = Object.freeze([
  'test/contracts/review-bridge-first-useful-release-gate.contract.test.js',
  'test/contracts/revision-bridge-docx-review-local-file-entry-command-surface.contract.test.js',
  'test/contracts/revision-bridge-docx-review-preview-session-command-surface.contract.test.js',
]);
const TOLERATED_NEIGHBOR_REVIEW_BRIDGE_TRUTH_REPAIR_PATHS = Object.freeze([
  'docs/CONTEXT.md',
  'docs/HANDOFF.md',
  'docs/WORKLOG.md',
  'docs/OPS/STATUS/REVIEW_BRIDGE_FIRST_USEFUL_RELEASE_TRUTH_REPAIR_001_STATUS.json',
]);

async function loadC04() {
  return import(pathToFileURL(path.join(process.cwd(), MODULE_PATH)).href);
}

async function loadC03() {
  return import(pathToFileURL(path.join(process.cwd(), C03_MODULE_PATH)).href);
}

function tmpScene(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-c04-min-safe-write-'));
  const scenePath = path.join(dir, 'scene.md');
  fs.writeFileSync(scenePath, text, 'utf8');
  return { dir, scenePath };
}

function readText(scenePath) {
  return fs.readFileSync(scenePath, 'utf8');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function backupIdFromSnapshotPath(snapshotPath) {
  const match = path.basename(String(snapshotPath || '')).match(/\.bak\.(\d{13})$/u);
  return match ? match[1] : '';
}

function validProjectSnapshot({
  projectId = 'project-1',
  baselineHash = 'baseline-1',
  sceneId = 'scene-1',
  sceneText = 'Alpha beta gamma.',
} = {}) {
  return {
    projectId,
    baselineHash,
    scenes: [
      {
        sceneId,
        text: sceneText,
      },
    ],
  };
}

function validRevisionSession({
  projectId = 'project-1',
  sessionId = 'session-1',
  baselineHash = 'baseline-1',
  status = 'open',
  quote = 'beta',
  replacementText = 'delta',
  targetScope = { type: 'scene', id: 'scene-1' },
  textChanges,
  structuralChanges = [],
  commentThreads = [],
  commentPlacements = [],
} = {}) {
  return {
    projectId,
    sessionId,
    baselineHash,
    status,
    reviewGraph: {
      commentThreads,
      commentPlacements,
      textChanges: textChanges || [
        {
          changeId: 'change-1',
          targetScope,
          match: { kind: 'exact', quote, prefix: '', suffix: '' },
          replacementText,
          createdAt: '2026-05-14T08:00:00.000Z',
        },
      ],
      structuralChanges,
      diagnosticItems: [],
      decisionStates: [],
    },
  };
}

async function readyInput({ sceneText = 'Alpha beta gamma.', revisionSession, projectSnapshot, scenePath } = {}) {
  const c03 = await loadC03();
  const snapshot = projectSnapshot || validProjectSnapshot({ sceneText });
  const session = revisionSession || validRevisionSession();
  const preview = c03.buildExactTextApplyPlanNoDiskPreview({
    projectSnapshot: snapshot,
    revisionSession: session,
  });
  assert.equal(preview.status, 'ready');
  return {
    projectRoot: path.dirname(scenePath),
    projectSnapshot: snapshot,
    revisionSession: session,
    planPreview: preview,
    scenePath,
    scenePathBySceneId: {
      'scene-1': scenePath,
    },
  };
}

function readyBatchInput({ sceneText = 'Alpha beta gamma omega.', revisionSession, projectSnapshot, scenePath } = {}) {
  const sceneId = 'scene-1';
  const textChanges = [
    {
      changeId: 'change-1',
      targetScope: { type: 'scene', id: sceneId },
      match: { kind: 'exact', quote: 'beta', prefix: '', suffix: '' },
      replacementText: 'delta',
      createdAt: '2026-05-14T08:00:00.000Z',
    },
    {
      changeId: 'change-2',
      targetScope: { type: 'scene', id: sceneId },
      match: { kind: 'exact', quote: 'omega', prefix: '', suffix: '' },
      replacementText: 'sigma',
      createdAt: '2026-05-14T08:01:00.000Z',
    },
  ];
  const session = revisionSession || validRevisionSession({ textChanges });
  const snapshot = projectSnapshot || validProjectSnapshot({ sceneId, sceneText });
  return {
    projectRoot: path.dirname(scenePath),
    projectSnapshot: snapshot,
    revisionSession: session,
    reviewItems: session.reviewGraph.textChanges,
    scenePath,
    scenePathBySceneId: {
      [sceneId]: scenePath,
    },
  };
}

function changedFilesFromGitStatus(statusText) {
  return statusText
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.slice(3).replace(/^"|"$/gu, ''));
}

function changedFilesOutsideAllowlist(changedFiles) {
  const allowed = new Set([
    ...ALLOWLIST,
    ...TOLERATED_NEIGHBOR_REVIEW_BRIDGE_TEST_PATHS,
    ...TOLERATED_NEIGHBOR_REVIEW_BRIDGE_TRUTH_REPAIR_PATHS,
  ]);
  return changedFiles.filter((filePath) => !allowed.has(filePath));
}

function assertTruthfulRecoveryEvidence(recovery, expectedText, { readable = true } = {}) {
  assert.equal(recovery.snapshotCreated, true);
  assert.equal(typeof recovery.snapshotPath, 'string');
  assert.equal(recovery.snapshotPath.length > 0, true);
  assert.equal(recovery.recoveryAction, 'OPEN_SNAPSHOT_OR_ABORT');
  assert.equal(recovery.snapshotReadable, readable);
  assert.equal(recovery.snapshotHashMatchesInput, readable);
  assert.equal(fs.existsSync(recovery.snapshotPath), readable);
  if (readable) {
    assert.equal(fs.readFileSync(recovery.snapshotPath, 'utf8'), expectedText);
  }
}

function assertTruthfulReceipt(receipt, scenePath, expectedText, originalText = 'Alpha beta gamma.') {
  assert.equal(receipt.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_APPLIED');
  assert.equal(receipt.baselineHashBefore, 'baseline-1');
  assert.equal(receipt.operationKind, 'replaceExactText');
  assert.equal(receipt.writeStatus, 'applied');
  assert.equal(receipt.backupId, backupIdFromSnapshotPath(receipt.recovery.snapshotPath));
  assert.match(receipt.writtenAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.equal(receipt.bytesWritten, Buffer.byteLength(expectedText, 'utf8'));
  assert.equal(receipt.outputHash, sha256Text(expectedText));
  assert.equal(readText(scenePath), expectedText);
  assertTruthfulRecoveryEvidence(receipt.recovery, originalText);
}

function assertTruthfulBatchReceipt(receipt, scenePath, expectedText, originalText = 'Alpha beta gamma omega.') {
  assert.equal(receipt.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_APPLIED');
  assert.equal(receipt.baselineHashBefore, 'baseline-1');
  assert.equal(receipt.operationKind, 'replaceExactTextBatch');
  assert.equal(receipt.writeStatus, 'applied');
  assert.deepEqual(receipt.changeIds, ['change-1', 'change-2']);
  assert.equal(receipt.backupId, backupIdFromSnapshotPath(receipt.recovery.snapshotPath));
  assert.match(receipt.writtenAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.equal(receipt.bytesWritten, Buffer.byteLength(expectedText, 'utf8'));
  assert.equal(receipt.outputHash, sha256Text(expectedText));
  assert.equal(readText(scenePath), expectedText);
  assertTruthfulRecoveryEvidence(receipt.recovery, originalText);
}

test('C04 exact text min safe write applies one replacement and returns receipt with recovery evidence', async () => {
  const c04 = await loadC04();
  const { scenePath } = tmpScene('Alpha beta gamma.');
  const input = await readyInput({ scenePath });

  const result = await c04.applyExactTextMinSafeWrite(input, { now: () => 1700000000000 });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'applied');
  assert.equal(result.applied, true);
  assert.equal(readText(scenePath), 'Alpha delta gamma.');
  assert.equal(result.receipt.schemaVersion, c04.REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_RECEIPT_SCHEMA);
  assert.equal(result.receipt.projectId, 'project-1');
  assert.equal(result.receipt.sessionId, 'session-1');
  assert.equal(result.receipt.sceneId, 'scene-1');
  assert.equal(result.receipt.changeId, 'change-1');
  assert.equal(result.receipt.baselineHashBefore, 'baseline-1');
  assert.equal(result.receipt.operationKind, 'replaceExactText');
  assert.equal(result.receipt.writeStatus, 'applied');
  assert.equal(result.receipt.backupId, backupIdFromSnapshotPath(result.receipt.recovery.snapshotPath));
  assert.equal(result.receipt.writtenAt, new Date(1700000000000).toISOString());
  assert.equal(result.receipt.bytesWritten, Buffer.byteLength('Alpha delta gamma.', 'utf8'));
  assert.equal(result.receipt.transactionId.startsWith('tx_'), true);
  assert.equal(result.receipt.recovery.snapshotCreated, true);
  assert.equal(typeof result.receipt.recovery.snapshotPath, 'string');
  assert.equal(fs.existsSync(result.receipt.recovery.snapshotPath), true);
  assert.equal(result.receipt.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_APPLIED');
  assert.match(result.receipt.inputHash, /^[a-f0-9]{64}$/u);
  assert.match(result.receipt.outputHash, /^[a-f0-9]{64}$/u);
});

test('C04 batch exact text min safe write applies same-scene replacements all-or-none', async () => {
  const c04 = await loadC04();
  const { scenePath } = tmpScene('Alpha beta gamma omega.');
  const input = readyBatchInput({ scenePath });

  const result = await c04.applyExactTextBatchMinSafeWrite(input, { now: () => 1700000010000 });

  assert.equal(result.ok, true);
  assert.equal(result.type, 'revisionBridge.exactTextBatchMinSafeWrite');
  assert.equal(result.status, 'applied');
  assert.equal(result.applied, true);
  assert.equal(result.receipt.schemaVersion, c04.REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_RECEIPT_SCHEMA);
  assert.equal(result.receipt.projectId, 'project-1');
  assert.equal(result.receipt.sessionId, 'session-1');
  assert.equal(result.receipt.sceneId, 'scene-1');
  assert.deepEqual(result.receipt.changeIds, ['change-1', 'change-2']);
  assert.deepEqual(result.changes.map((change) => change.status), ['applied', 'applied']);
  assert.deepEqual(result.operations.map((operation) => operation.changeId), ['change-1', 'change-2']);
  assertTruthfulBatchReceipt(result.receipt, scenePath, 'Alpha delta gamma sigma.');
});

test('R8 batch crash windows distinguish applied-without-receipt from durable receipt completion', async () => {
  const c04 = await loadC04();
  const firstScene = tmpScene('Alpha beta gamma omega.');
  const ambiguousResult = await c04.applyExactTextBatchMinSafeWrite(
    readyBatchInput({ scenePath: firstScene.scenePath }),
    {
      operationId: 'op_batch_after_rename',
      afterRenameBeforeReceipt: () => {
        throw new Error('forced batch crash after rename');
      },
    },
  );
  assert.equal(ambiguousResult.status, 'ambiguous');
  assert.equal(ambiguousResult.reconciliation.outcome, 'applied_receipt_missing');
  assert.equal(readText(firstScene.scenePath), 'Alpha delta gamma sigma.');

  const secondScene = tmpScene('Alpha beta gamma omega.');
  const receiptResult = await c04.applyExactTextBatchMinSafeWrite(
    readyBatchInput({ scenePath: secondScene.scenePath }),
    {
      operationId: 'op_batch_after_receipt',
      afterReceiptWritten: () => {
        throw new Error('forced batch crash after durable receipt');
      },
    },
  );
  assert.equal(receiptResult.status, 'applied');
  assert.equal(receiptResult.reconciledAfterReceiptWrite, true);
  assert.equal(receiptResult.reconciliation.outcome, 'applied_receipt_present');
  assert.equal(readText(secondScene.scenePath), 'Alpha delta gamma sigma.');
});

test('C04 batch exact text min safe write blocks stale member with zero writes', async () => {
  const c04 = await loadC04();
  const { scenePath } = tmpScene('Alpha beta gamma omega.');
  const input = readyBatchInput({ scenePath });
  input.reviewItems[1].match.quote = 'missing';

  const result = await c04.applyExactTextBatchMinSafeWrite(input, { now: () => 1700000011000 });

  assert.equal(result.status, 'blocked');
  assert.equal(result.applied, false);
  assert.equal(result.receipt, null);
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_CURRENT_NO_MATCH');
  assert.equal(result.reasons[0].changeId, 'change-2');
  assert.equal(readText(scenePath), 'Alpha beta gamma omega.');
});

test('C04 batch exact text min safe write blocks cross-scene requests with zero writes', async () => {
  const c04 = await loadC04();
  const { scenePath } = tmpScene('Alpha beta gamma omega.');
  const input = readyBatchInput({ scenePath });
  input.reviewItems[1].targetScope = { type: 'scene', id: 'scene-2' };

  const result = await c04.applyExactTextBatchMinSafeWrite(input);

  assert.equal(result.status, 'blocked');
  assert.equal(result.applied, false);
  assert.equal(result.receipt, null);
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_BATCH_MIN_SAFE_WRITE_SINGLE_SCENE_REQUIRED');
  assert.equal(readText(scenePath), 'Alpha beta gamma omega.');
});

test('C04 inherited C03 block matrix performs zero writes', async () => {
  const c04 = await loadC04();
  const cases = [
    [
      'wrong project',
      validProjectSnapshot({ projectId: 'project-a' }),
      validRevisionSession({ projectId: 'project-b' }),
    ],
    [
      'stale',
      validProjectSnapshot({ baselineHash: 'baseline-a' }),
      validRevisionSession({ baselineHash: 'baseline-b' }),
    ],
    [
      'closed',
      validProjectSnapshot(),
      validRevisionSession({ status: 'closed' }),
    ],
    [
      'duplicate',
      validProjectSnapshot({ sceneText: 'Alpha beta beta.' }),
      validRevisionSession(),
    ],
    [
      'no match',
      validProjectSnapshot({ sceneText: 'Alpha omega gamma.' }),
      validRevisionSession(),
    ],
    [
      'structural',
      validProjectSnapshot(),
      validRevisionSession({
        structuralChanges: [{ structuralChangeId: 'structural-1', kind: 'split-scene' }],
      }),
    ],
    [
      'comment-only',
      validProjectSnapshot(),
      validRevisionSession({
        textChanges: [],
        commentThreads: [{ threadId: 'thread-1', messages: [] }],
      }),
    ],
    [
      'reviewItem mismatch',
      validProjectSnapshot(),
      validRevisionSession(),
      {
        changeId: 'other-change',
        targetScope: { type: 'scene', id: 'scene-1' },
        match: { kind: 'exact', quote: 'beta', prefix: '', suffix: '' },
        replacementText: 'delta',
      },
    ],
  ];

  for (const [label, projectSnapshot, revisionSession, reviewItem] of cases) {
    const { scenePath } = tmpScene(projectSnapshot.scenes[0].text);
    const result = await c04.applyExactTextMinSafeWrite({
      projectRoot: path.dirname(scenePath),
      projectSnapshot,
      revisionSession,
      reviewItem,
      planPreview: { plan: { canApply: false, noDisk: true, safeWriteCandidate: false, applyOps: [] } },
      scenePath,
      scenePathBySceneId: {
        'scene-1': scenePath,
      },
    });

    assert.equal(result.status, 'blocked', label);
    assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_NOT_READY', label);
    assert.equal(readText(scenePath), projectSnapshot.scenes[0].text, label);
  }
});

test('C04 blocks provided plan mismatch and current drift with zero writes', async () => {
  const c04 = await loadC04();
  const { scenePath } = tmpScene('Alpha beta gamma.');
  const input = await readyInput({ scenePath });

  const mismatched = JSON.parse(JSON.stringify(input));
  mismatched.planPreview.plan.applyOps[0].expectedText = 'gamma';
  const mismatchResult = await c04.applyExactTextMinSafeWrite(mismatched);

  assert.equal(mismatchResult.status, 'blocked');
  assert.equal(mismatchResult.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_MISMATCH');
  assert.equal(readText(scenePath), 'Alpha beta gamma.');

  const replacementMismatch = JSON.parse(JSON.stringify(input));
  replacementMismatch.planPreview.plan.applyOps[0].replacementText = 'epsilon';
  const replacementMismatchResult = await c04.applyExactTextMinSafeWrite(replacementMismatch);

  assert.equal(replacementMismatchResult.status, 'blocked');
  assert.equal(replacementMismatchResult.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_MISMATCH');
  assert.equal(readText(scenePath), 'Alpha beta gamma.');

  fs.writeFileSync(scenePath, 'Alpha beta gamma. local edit', 'utf8');
  const driftResult = await c04.applyExactTextMinSafeWrite(input);

  assert.equal(driftResult.status, 'blocked');
  assert.equal(driftResult.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_CURRENT_DRIFT');
  assert.equal(readText(scenePath), 'Alpha beta gamma. local edit');
});

test('C04 preserves whitespace byte-exactly and allows single-space replacement from provided op', async () => {
  const c04 = await loadC04();
  const sceneText = '  Alpha beta  \nOmega\n';
  const { scenePath } = tmpScene(sceneText);
  const input = await readyInput({
    sceneText,
    scenePath,
    revisionSession: validRevisionSession({ replacementText: ' ' }),
  });

  const result = await c04.applyExactTextMinSafeWrite(input, { now: () => 1700000001000 });

  assert.equal(result.status, 'applied');
  assert.equal(readText(scenePath), '  Alpha    \nOmega\n');
  assert.equal(result.receipt.bytesWritten, Buffer.byteLength('  Alpha    \nOmega\n', 'utf8'));
});

test('C04 current duplicate and no match are inherited from rebuilt C03 with zero writes', async () => {
  const c04 = await loadC04();

  for (const [label, sceneText, expectedReason] of [
    ['duplicate', 'Alpha beta beta.', 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_DUPLICATE_MATCH'],
    ['no match', 'Alpha omega gamma.', 'REVISION_BRIDGE_EXACT_TEXT_APPLY_PLAN_NO_MATCH'],
  ]) {
    const { scenePath } = tmpScene(sceneText);
    const result = await c04.applyExactTextMinSafeWrite({
      projectRoot: path.dirname(scenePath),
      projectSnapshot: validProjectSnapshot({ sceneText }),
      revisionSession: validRevisionSession(),
      planPreview: { plan: { canApply: false, noDisk: true, safeWriteCandidate: false, applyOps: [] } },
      scenePath,
      scenePathBySceneId: {
        'scene-1': scenePath,
      },
    });

    assert.equal(result.status, 'blocked', label);
    assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_PLAN_NOT_READY', label);
    assert.equal(result.reasons[0].rebuiltReasons.some((reason) => reason.code === expectedReason), true, label);
    assert.equal(readText(scenePath), sceneText, label);
  }
});

test('C04 blocks unbound or out-of-project scene paths with zero writes', async () => {
  const c04 = await loadC04();
  const { scenePath } = tmpScene('Alpha beta gamma.');
  const input = await readyInput({ scenePath });

  const unbound = JSON.parse(JSON.stringify(input));
  unbound.scenePathBySceneId = {};
  const unboundResult = await c04.applyExactTextMinSafeWrite(unbound);
  assert.equal(unboundResult.status, 'blocked');
  assert.equal(unboundResult.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_SCENE_PATH_BINDING_MISMATCH');
  assert.equal(readText(scenePath), 'Alpha beta gamma.');

  const outside = JSON.parse(JSON.stringify(input));
  outside.projectRoot = path.join(path.dirname(scenePath), 'other-root');
  const outsideResult = await c04.applyExactTextMinSafeWrite(outside);
  assert.equal(outsideResult.status, 'blocked');
  assert.equal(outsideResult.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_SCENE_PATH_OUTSIDE_PROJECT');
  assert.equal(readText(scenePath), 'Alpha beta gamma.');
});

test('C04 failed beforeRename preserves target and returns no applied receipt with recovery evidence', async () => {
  const c04 = await loadC04();
  const { scenePath } = tmpScene('Alpha beta gamma.');
  const input = await readyInput({ scenePath });

  const result = await c04.applyExactTextMinSafeWrite(input, {
    now: () => 1700000002000,
    beforeRename: () => {
      throw new Error('forced beforeRename failure');
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.applied, false);
  assert.equal(result.receipt, null);
  assert.equal(result.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_WRITE_FAILED');
  assert.equal(readText(scenePath), 'Alpha beta gamma.');
  assert.equal(result.reasons[0].recovery.snapshotCreated, true);
  assert.equal(typeof result.reasons[0].recovery.snapshotPath, 'string');
});

test('C07 failure matrix keeps target, recovery, receipt, and second run truthful', async () => {
  const c04 = await loadC04();
  const beforeText = 'Alpha beta gamma.';
  const afterText = 'Alpha delta gamma.';
  const cases = [
    {
      label: 'BEFORE_WRITE',
      options: {
        now: () => 1700000003000,
        beforeWrite: () => {
          throw new Error('forced BEFORE_WRITE failure');
        },
      },
      firstText: beforeText,
      recoveryReadable: true,
      second: 'applied',
      firstStatus: 'failed',
      publicReason: 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_WRITE_FAILED',
      reconciliationOutcome: 'not_applied',
    },
    {
      label: 'BEFORE_RENAME',
      options: {
        now: () => 1700000004000,
        beforeRename: () => {
          throw new Error('forced BEFORE_RENAME failure');
        },
      },
      firstText: beforeText,
      recoveryReadable: true,
      second: 'applied',
      firstStatus: 'failed',
      publicReason: 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_WRITE_FAILED',
      reconciliationOutcome: 'not_applied',
    },
    {
      label: 'AFTER_RENAME_BEFORE_RECEIPT',
      options: {
        now: () => 1700000005000,
        afterRenameBeforeReceipt: () => {
          throw new Error('forced AFTER_RENAME_BEFORE_RECEIPT failure');
        },
      },
      firstText: afterText,
      recoveryReadable: true,
      second: 'blocked',
      firstStatus: 'ambiguous',
      publicReason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_APPLIED_RECEIPT_MISSING',
      reconciliationOutcome: 'applied_receipt_missing',
    },
    {
      label: 'BAD_RECEIPT',
      options: {
        now: () => 1700000006000,
        afterReceipt: (receipt) => ({
          ...receipt,
          outputHash: '0'.repeat(64),
        }),
      },
      firstText: afterText,
      recoveryReadable: true,
      second: 'blocked',
      firstStatus: 'ambiguous',
      publicReason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_APPLIED_RECEIPT_MISSING',
      reconciliationOutcome: 'applied_receipt_missing',
      receiptFailure: 'receipt outputHash does not match output',
    },
    {
      label: 'BAD_RECOVERY',
      options: {
        now: () => 1700000007000,
        afterRenameBeforeReceipt: ({ recovery }) => {
          fs.unlinkSync(recovery.snapshotPath);
        },
      },
      firstText: afterText,
      recoveryReadable: false,
      second: 'blocked',
      firstStatus: 'ambiguous',
      publicReason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_RECONCILIATION_CONFLICT',
      reconciliationOutcome: 'conflict',
      receiptFailure: 'receipt recovery snapshot is not readable',
    },
    {
      label: 'BAD_RECOVERY_RECEIPT_PATH',
      options: {
        now: () => 1700000007100,
        afterReceipt: (receipt) => ({
          ...receipt,
          recovery: {
            ...receipt.recovery,
            snapshotPath: `${receipt.recovery.snapshotPath}.missing`,
          },
        }),
      },
      firstText: afterText,
      recoveryReadable: true,
      second: 'blocked',
      firstStatus: 'ambiguous',
      publicReason: 'REVISION_BRIDGE_EXACT_TEXT_APPLY_APPLIED_RECEIPT_MISSING',
      reconciliationOutcome: 'applied_receipt_missing',
      receiptFailure: 'receipt recovery snapshot is not readable',
    },
  ];

  for (const testCase of cases) {
    const { scenePath } = tmpScene(beforeText);
    const input = await readyInput({ scenePath });

    const first = await c04.applyExactTextMinSafeWrite(input, testCase.options);

    assert.equal(first.status, testCase.firstStatus, testCase.label);
    assert.equal(first.applied, false, testCase.label);
    assert.equal(first.receipt, null, testCase.label);
    assert.equal(first.reason, testCase.publicReason, testCase.label);
    assert.equal(first.reconciliation.outcome, testCase.reconciliationOutcome, testCase.label);
    assert.equal(readText(scenePath), testCase.firstText, testCase.label);
    assertTruthfulRecoveryEvidence(first.reasons[0].recovery, beforeText, {
      readable: testCase.recoveryReadable,
    });
    if (testCase.receiptFailure) {
      assert.equal(first.reasons[0].receiptFailures.includes(testCase.receiptFailure), true, testCase.label);
    }

    const second = await c04.applyExactTextMinSafeWrite(input, { now: () => 1700000008000 });

    if (testCase.second === 'applied') {
      assert.equal(second.status, 'applied', `${testCase.label} SECOND_RUN_AFTER_FAILURE`);
      assert.equal(second.applied, true, `${testCase.label} SECOND_RUN_AFTER_FAILURE`);
      assertTruthfulReceipt(second.receipt, scenePath, afterText);
    } else {
      assert.equal(second.status, 'blocked', `${testCase.label} SECOND_RUN_AFTER_FAILURE`);
      assert.equal(second.reason, 'REVISION_BRIDGE_EXACT_TEXT_MIN_SAFE_WRITE_CURRENT_DRIFT', `${testCase.label} SECOND_RUN_AFTER_FAILURE`);
      assert.equal(second.receipt, null, `${testCase.label} SECOND_RUN_AFTER_FAILURE`);
      assert.equal(readText(scenePath), afterText, `${testCase.label} SECOND_RUN_AFTER_FAILURE`);
    }
  }
});

test('C04 core stays isolated while the approved review apply command may call it from main', () => {
  const forbiddenChanged = [
    'src/preload.js',
    'package.json',
    'package-lock.json',
  ];

  for (const filePath of forbiddenChanged) {
    const headText = execFileSync('git', ['show', `HEAD:${filePath}`], { encoding: 'utf8' });
    assert.equal(fs.readFileSync(filePath, 'utf8'), headText, `${filePath} changed from HEAD`);
  }

  const moduleText = fs.readFileSync(MODULE_PATH, 'utf8');
  assert.equal(moduleText.includes('main.js'), false);
  assert.equal(moduleText.includes('preload'), false);
  assert.equal(moduleText.includes('docx'), false);
  assert.equal(moduleText.includes('ipcMain'), false);
  assert.equal(moduleText.includes('ipcRenderer'), false);

  const mainText = fs.readFileSync(MAIN_PATH, 'utf8');
  assert.equal(mainText.includes('loadExactTextMinSafeWriteModule'), true);
  assert.equal(mainText.includes('cmd.project.review.applyExactTextChange'), true);
  assert.equal(mainText.includes('applyExactTextMinSafeWrite'), true);
  assert.equal(mainText.includes('requestEditorSnapshot'), true);
  const applyContextStart = mainText.indexOf('async function buildReviewExactTextApplyInputFromMainState');
  const applyContextEnd = mainText.indexOf('function mapMarkdownErrorCode', applyContextStart);
  assert.ok(applyContextStart > -1 && applyContextEnd > applyContextStart, 'approved main apply context must be bounded');
  const applyContext = mainText.slice(applyContextStart, applyContextEnd);
  assert.equal(applyContext.includes('requestEditorSnapshot'), false);
  assert.equal(applyContext.includes('buildDerivedReviewSurfacePayload'), false);
  assert.equal(applyContext.includes('fs.readFile(currentFilePath, \'utf8\')'), true);
});

test('C04 changed files stay inside the task allowlist', () => {
  const changedFiles = changedFilesFromGitStatus(
    execFileSync('git', ['status', '--porcelain', '-uall'], { encoding: 'utf8' }),
  );

  assert.deepEqual(changedFilesOutsideAllowlist(changedFiles), []);
});
