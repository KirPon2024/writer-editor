const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function readReceipt(basename) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs', 'OPS', 'STATUS', basename), 'utf8'));
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

test('E10 C00: Stage 09 acceptance hands off to Stage 10, not final Program DoD', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_STAGE_09_ACCEPTANCE_RECEIPT.json');

  assert.equal(receipt.contourId, 'E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_AND_STAGE_09_ACCEPTANCE');
  assert.equal(receipt.runtimeFacts.stage09AcceptanceProofExists, true);
  assert.equal(receipt.runtimeFacts.handoffToStage10, true);
  assert.equal(receipt.runtimeFacts.finalProgramDoDClaim, false);
  assert.equal(receipt.runtimeFacts.releaseReadinessClaim, false);
  assert.equal(receipt.nextContour, 'E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION');
});

test('E10 C00: compilation receipt binds Stage 10 scope to a bounded linear queue', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION_RECEIPT.json');

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION');
  assert.equal(receipt.programStage, 'E10_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOURS');
  assert.equal(receipt.baseSha, '515f282b754e0c6df70df8a6b9a046405d78d6a7');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.stage09AcceptanceExists, true);
  assert.equal(receipt.runtimeFacts.stage09HandoffTarget, 'E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION');
  assert.equal(receipt.runtimeFacts.stage09FinalProgramDoDClaim, false);
  assert.equal(receipt.runtimeFacts.commentsHistoryDerivedViewsExist, true);
  assert.equal(receipt.runtimeFacts.collabEventLogExists, true);
  assert.equal(receipt.runtimeFacts.collabApplyPipelineExists, true);
  assert.equal(receipt.runtimeFacts.rtkWordLatestSemanticB03Exists, true);
  assert.equal(receipt.runtimeFacts.secondOperationLogTruth, false);
  assert.equal(receipt.runtimeFacts.secondCommentTruth, false);
  assert.equal(receipt.runtimeFacts.transportTruthInCore, false);
  assert.equal(receipt.runtimeFacts.networkAdapterActive, false);
  assert.equal(receipt.runtimeFacts.crdtCoreAdopted, false);

  assert.deepEqual(receipt.compiledQueue.map((row) => row.contourId), [
    'E10_C01_STABLE_COMMENT_ANCHORS_AND_DECISION_SURVIVAL',
    'E10_C02_REVISION_HISTORY_PROJECTION_AND_AUTHOR_TRUTH_SEPARATION',
    'E10_C03_OPERATION_REPLAY_OVER_EXISTING_COMMAND_EVENT_LOG',
    'E10_C04_ACTOR_IDENTITY_CAUSAL_ORDERING_AND_OFFLINE_QUEUE',
    'E10_C05_LOCAL_MULTI_SESSION_RECOVERY_AND_CONFLICT_ENVELOPES',
    'E10_C06_TRANSPORT_NEUTRAL_OPERATION_EXCHANGE_BOUNDARY',
    'E10_C07_STAGE_10_ACCEPTANCE_AND_HANDOFF_TO_PLATFORM_CERTIFICATION',
  ]);

  for (const row of receipt.compiledQueue) {
    assert.ok(row.userOutcome);
    assert.ok(Array.isArray(row.scopeIn) && row.scopeIn.length > 0);
    assert.ok(Array.isArray(row.scopeOut));
    assert.ok(Array.isArray(row.expectedWriteSet) && row.expectedWriteSet.length > 0);
    assert.ok(Array.isArray(row.designRoute) && row.designRoute.length > 0);
    assert.ok(!row.contourId.includes('EFINAL'));
  }
  assert.equal(receipt.nextContour, 'E10_C01_STABLE_COMMENT_ANCHORS_AND_DECISION_SURVIVAL');
});

test('E10 C00: compiled queue covers anchors, history, replay, causal ordering, recovery, exchange, and acceptance gates', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION_RECEIPT.json');
  const allScope = receipt.compiledQueue.flatMap((row) => [...row.scopeIn, ...row.scopeOut, ...row.designRoute]);
  const requiredPhrases = [
    'stable comment anchor packet',
    'decision row identity',
    'RTK modern comment graph reuse',
    'history projection packet',
    'no second history store proof',
    'existing collab event log reuse',
    'state hash replay proof',
    'actor identity envelope',
    'causal ordering report',
    'offline queue packet',
    'local multi-session replay fixture',
    'conflict envelope schema',
    'transport-neutral exchange packet',
    'network adapter disabled proof',
    'Stage 10 acceptance proof',
    'handoff to Stage 11',
  ];
  for (const phrase of requiredPhrases) {
    assert.ok(allScope.some((item) => item.includes(phrase)), phrase);
  }

  assert.ok(receipt.stageScopeBinding.acceptance.includes('CRDT or transport never becomes Product Core'));
  assert.ok(receipt.stageScopeBinding.acceptance.includes('offline single-user mode remains fully usable'));
  assert.ok(receipt.stageScopeBinding.acceptance.includes('history is a derived projection, not a second source of truth'));
  assert.ok(receipt.stageScopeBinding.acceptance.includes('network transport remains a separately activated adapter'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('second operation log truth'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('second comment truth'));
  assert.ok(receipt.stageScopeBinding.scopeOut.includes('final Program DoD'));
  assert.equal(receipt.handoffBinding.previousContour, 'E09_C05_SAVED_VIEWS_BATCH_OPERATIONS_AND_STAGE_09_ACCEPTANCE');
  assert.equal(receipt.handoffBinding.finalProgramDoDClaim, false);
});

test('E10 C00: factual runtime probes reuse existing comments/history and collab surfaces', async () => {
  const commentsHistory = await loadModule(path.join('src', 'derived', 'commentsHistory', 'index.mjs'));
  const collab = await loadModule(path.join('src', 'collab', 'index.mjs'));

  assert.equal(typeof commentsHistory.deriveComments, 'function');
  assert.equal(typeof commentsHistory.deriveHistory, 'function');
  assert.equal(commentsHistory.COMMENTS_VIEW_ID, 'derived.comments.v1');
  assert.equal(commentsHistory.HISTORY_VIEW_ID, 'derived.history.v1');
  assert.equal(typeof collab.createEmptyEventLog, 'function');
  assert.equal(typeof collab.appendEventLogEntry, 'function');
  assert.equal(typeof collab.replayEventLog, 'function');
  assert.equal(typeof collab.applyEventLog, 'function');
  assert.equal(typeof collab.createConflictEnvelope, 'function');

  const emptyLog = collab.createEmptyEventLog();
  assert.equal(emptyLog.schemaVersion, 'collab-eventlog.v1');
  assert.deepEqual(emptyLog.events, []);

  assert.equal(fileExists('test/contracts/comments-history-no-second-sot.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/comments-history-recovery-safe.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/collab-no-network-wiring.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/collab-eventlog-no-network-wiring.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/collab-apply-no-network-wiring.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/rtk-word-latest-semantic-b00.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/rtk-word-latest-semantic-b01-signed-locator.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/rtk-word-latest-semantic-b02-package-parser.contract.test.js'), true);
  assert.equal(fileExists('test/contracts/rtk-word-latest-semantic-b03-modern-comments.contract.test.js'), true);
});

test('E10 C00: validation receipt cannot claim false green before evidence exists', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION_RECEIPT.json');
  for (const row of receipt.validation) {
    const summary = String(row.summary || '').toLowerCase();
    assert.ok(['PENDING', 'NOT_RUN', 'PASS'].includes(row.result), row.command);
    assert.ok(row.result !== 'PASS' || !summary.includes('pending'), row.command);
    assert.ok(row.result !== 'PASS' || !summary.includes('not_run'), row.command);
  }
});

test('E10 C00: compilation receipt and contract sources stay local and non-runtime', () => {
  const sources = [
    'docs/OPS/STATUS/YALKEN_ATLAS_V5_E10_C00_STAGE_10_COMMENTS_HISTORY_COLLAB_CONTOUR_COMPILATION_RECEIPT.json',
    'test/contracts/yalken-atlas-v5-e10-c00-stage-10-comments-history-collab-contour-compilation.contract.test.js',
  ].map((relativePath) => [path.basename(relativePath), readSource(relativePath)]);
  const forbiddenPatterns = [
    /networkAdapterActive["']?\\s*:\\s*true/u,
    /transportTruthInCore["']?\\s*:\\s*true/u,
    /secondOperationLogTruth["']?\\s*:\\s*true/u,
    /secondCommentTruth["']?\\s*:\\s*true/u,
    /crdtCoreAdopted["']?\\s*:\\s*true/u,
    /networkMutation:\\s*true/u,
    /runtimeDownload:\\s*true/u,
    /dynamicExecutablePlugin:\\s*true/u,
    /releaseReadinessClaim:\\s*true/u,
    /projectTruthMutation:\\s*true/u,
    /manuscriptMutation:\\s*true/u,
    /storageMutation:\\s*true/u,
    /rendererMutation:\\s*true/u,
    /readyForFinalProgramDoD:\\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
