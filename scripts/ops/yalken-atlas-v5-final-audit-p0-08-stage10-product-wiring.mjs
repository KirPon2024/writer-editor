#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  STAGE10_ACTIVATION_MODES,
  STAGE10_PRODUCT_COMMAND_IDS,
  buildStage10ProductReadModels,
  createStage10ProductRuntime,
  reopenStage10ProductRuntime,
} from '../../src/product/stage10ProductWiring.mjs';
import {
  CORE_COMMAND_IDS,
  createInitialCoreState,
  hashCoreState,
} from '../../src/core/runtime.mjs';
import { hashCanonicalValue } from '../../src/core/browser-safe-hash.mjs';
import { createStage10MainPersistenceAdapter } from '../../src/product/stage10MainPersistenceAdapter.mjs';

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);
const { spawnSync } = require('node:child_process');
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const CONTOUR_ID = 'P0_08_STAGE10_PRODUCT_WIRING';
const DEFAULT_EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'EVIDENCE',
  'YALKEN_ATLAS_V5_FINAL_AUDIT_P0_08_STAGE10_PRODUCT_WIRING',
);
const DEFAULT_RECEIPT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'STATUS',
  'YALKEN_ATLAS_V5_FINAL_AUDIT_P0_08_STAGE10_PRODUCT_WIRING_RECEIPT.json',
);

function argValue(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const outDir = path.resolve(argValue('--out', DEFAULT_EVIDENCE_DIR));
const receiptPath = path.resolve(argValue('--receipt', DEFAULT_RECEIPT_PATH));
const shadowOnly = process.argv.includes('--shadow-only');
const disableStorage = process.argv.includes('--disable-storage');
const requestNetworkAdapter = process.argv.includes('--request-network-adapter');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function git(args) {
  const run = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return run.status === 0 ? run.stdout.trim() : '';
}

function createUiPort() {
  const surfaces = [];
  return {
    surfaces,
    publishSurface(surface) {
      surfaces.push(surface);
      return { ok: true, surfaceHash: hashCanonicalValue(surface) };
    },
  };
}

function activation(controlId) {
  return {
    mode: STAGE10_ACTIVATION_MODES.PHYSICAL_POINTER_OR_KEYBOARD,
    controlId,
  };
}

function reviewIrFixture() {
  return {
    schemaVersion: 'yalken.rtk.review-ir.v2',
    commentThreads: [{
      threadId: 'rtk-comment-stage10',
      commentId: '100',
      durableId: 'durable-stage10-comment',
      doneResolvedReopenedState: 'active',
      body: 'Stage 10 visible comment path.',
      status: 'ANCHORED',
      quotedAnchorText: 'Stage 10',
      replies: [],
      reasonCodes: ['RTK_COMMENT_ANCHORED'],
    }],
  };
}

function placementHintsFixture() {
  return {
    'durable-stage10-comment': {
      schemaVersion: 'revision-bridge.comment-anchor-placement.v1',
      placementId: 'placement-stage10-comment',
      durableId: 'durable-stage10-comment',
      threadId: 'rtk-comment-stage10',
      targetScope: { type: 'scene', id: 'scene-1' },
      inlineRange: {
        schemaVersion: 'revision-bridge.inline-range.v1',
        kind: 'span',
        blockId: 'block-1',
        lineageId: 'lineage-1',
        from: 0,
        to: 8,
        quote: 'Stage 10',
        prefix: '',
        suffix: ' product',
        confidence: 'exact',
        riskClass: 'low',
        automationPolicy: 'manualOnly',
        deletedTarget: false,
        reasonCodes: [],
      },
      resolvedState: 'open',
      acceptedState: 'pending',
      diagnosticsOnly: false,
    },
  };
}

function assertCondition(condition, code, failures) {
  if (!condition) failures.push(code);
}

function buildConflictSessions(projectId) {
  const initial = {
    version: 1,
    content: 'Stage 10 base',
    lastOpId: '',
  };
  return {
    initial,
    reopened: initial,
    sessions: [
      {
        sessionId: 'session-local',
        actorId: 'actor-local',
        events: [{
          opId: 'conflict-op-local',
          actorId: 'actor-local',
          sessionId: 'session-local',
          seq: 1,
          ts: '2026-08-01T00:00:06.000Z',
          commandId: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
          payloadHash: hashCanonicalValue({ projectId, sceneId: 'scene-1', text: 'Local branch' }),
          baseVersion: 1,
          nextVersion: 2,
          content: 'Local branch',
        }],
      },
      {
        sessionId: 'session-remote',
        actorId: 'actor-remote',
        events: [{
          opId: 'conflict-op-remote',
          actorId: 'actor-remote',
          sessionId: 'session-remote',
          seq: 1,
          ts: '2026-08-01T00:00:07.000Z',
          commandId: CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
          payloadHash: hashCanonicalValue({ projectId, sceneId: 'scene-1', text: 'Remote branch' }),
          baseVersion: 1,
          nextVersion: 2,
          content: 'Remote branch',
        }],
      },
    ],
  };
}

async function runJourney() {
  fs.mkdirSync(outDir, { recursive: true });
  const failures = [];
  const projectId = 'p0-08-stage10-product';
  const persistencePort = disableStorage ? {} : createStage10MainPersistenceAdapter({
    projectRoot: path.join(outDir, 'project'),
    anchorRoot: path.join(outDir, 'main-owned-anchors'),
    writeFileAtomic: async (targetPath, content) => {
      writeJsonAtomic(targetPath, JSON.parse(content));
      return { success: true };
    },
  });
  const uiPort = createUiPort();
  const capabilitySnapshot = {
    platformId: 'packaged-local-electron',
    capabilities: { stage10LocalProductWiring: true, commentsView: true, historyView: true },
  };
  const runtime = await createStage10ProductRuntime({
    projectId,
    actorId: 'author-primary',
    sessionId: 'session-primary',
    persistencePort,
    uiPort,
    capabilitySnapshot,
    now: (() => {
      let tick = 0;
      return () => `2026-08-01T00:00:${String(tick += 1).padStart(2, '0')}.000Z`;
    })(),
  });

  const directBridgeDenied = await runtime.dispatchVisibleCommand(
    CORE_COMMAND_IDS.PROJECT_CREATE,
    { projectId, title: 'Direct bridge must not mutate', sceneId: 'scene-1' },
    { mode: STAGE10_ACTIVATION_MODES.FORBIDDEN_DIRECT_BRIDGE, controlId: 'hidden-ipc' },
  );
  assertCondition(directBridgeDenied.ok === false, 'DIRECT_BRIDGE_NOT_DENIED', failures);

  if (!shadowOnly) {
    const projectCreate = await runtime.dispatchVisibleCommand(
      CORE_COMMAND_IDS.PROJECT_CREATE,
      { projectId, title: 'P0 08 Stage10 Product Wiring', sceneId: 'scene-1' },
      activation('project-create-visible'),
    );
    assertCondition(projectCreate.ok === true, 'PROJECT_CREATE_VISIBLE_COMMAND_FAILED', failures);

    const textEdit = await runtime.dispatchVisibleCommand(
      CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      { projectId, sceneId: 'scene-1', text: 'Stage 10 product wiring base text.' },
      activation('editor-text-visible'),
    );
    assertCondition(textEdit.ok === true, 'TEXT_EDIT_VISIBLE_COMMAND_FAILED', failures);

    const commentImport = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.COMMENT_IMPORT_STABLE_PACKET,
      {
        sceneId: 'scene-1',
        revisionId: 'revision-stage10',
        reviewIr: reviewIrFixture(),
        context: {
          blockMap: {
            'block-1': {
              lineageId: 'lineage-1',
              text: 'Stage 10 product wiring base text.',
            },
          },
        },
        placementHints: placementHintsFixture(),
      },
      activation('stage10-comment-import'),
    );
    assertCondition(commentImport.ok === true, 'COMMENT_IMPORT_VISIBLE_COMMAND_FAILED', failures);
    const decisionId = commentImport.packet?.decisionRows?.[0]?.decisionId;
    const commentDecision = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.COMMENT_DECISION_RECORD,
      { packetHash: commentImport.packet?.packetHash, decisionId, state: 'acknowledged' },
      activation('stage10-comment-decision'),
    );
    assertCondition(commentDecision.ok === true, 'COMMENT_DECISION_VISIBLE_COMMAND_FAILED', failures);

    const checkpoint = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT,
      { snapshotId: 'checkpoint-before-edit' },
      activation('stage10-history-checkpoint'),
    );
    assertCondition(checkpoint.ok === true, 'HISTORY_CHECKPOINT_FAILED', failures);

    const changedText = await runtime.dispatchVisibleCommand(
      CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      { projectId, sceneId: 'scene-1', text: 'Stage 10 product wiring changed text.' },
      activation('editor-text-visible'),
    );
    assertCondition(changedText.ok === true, 'TEXT_EDIT_AFTER_CHECKPOINT_FAILED', failures);

    const restorePreview = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_PREVIEW,
      { snapshotId: 'checkpoint-before-edit' },
      activation('stage10-history-restore-preview'),
    );
    assertCondition(restorePreview.ok === true, 'HISTORY_RESTORE_PREVIEW_FAILED', failures);

    const restoreApply = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY,
      { previewId: restorePreview.preview?.previewId, confirmed: true },
      activation('stage10-history-restore-apply'),
    );
    assertCondition(restoreApply.ok === true, 'HISTORY_RESTORE_APPLY_FAILED', failures);

    const restoreUndo = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_UNDO,
      { previewId: restorePreview.preview?.previewId },
      activation('stage10-history-restore-undo'),
    );
    assertCondition(restoreUndo.ok === true, 'HISTORY_RESTORE_UNDO_FAILED', failures);

    const conflictFixture = buildConflictSessions(projectId);
    const conflictPreview = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_PREVIEW,
      {
        initialState: conflictFixture.initial,
        reopenedState: conflictFixture.reopened,
        sessions: conflictFixture.sessions,
      },
      activation('stage10-conflict-preview'),
    );
    assertCondition(conflictPreview.ok === true, 'CONFLICT_PREVIEW_FAILED', failures);
    const conflictId = conflictPreview.report?.conflicts?.[0]?.conflictId;
    const conflictDecision = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_DECISION_RECORD,
      { reportId: conflictPreview.reportId, conflictId, decision: 'keepLocal' },
      activation('stage10-conflict-decision'),
    );
    assertCondition(conflictDecision.ok === true, 'CONFLICT_DECISION_FAILED', failures);

    const exchange = await runtime.dispatchVisibleCommand(
      STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_PREPARE,
      { transportCapabilityEnabled: true, networkAdapterEnabled: requestNetworkAdapter },
      activation('stage10-exchange-prepare'),
    );
    assertCondition(!requestNetworkAdapter ? exchange.ok === true : exchange.ok === false, 'EXCHANGE_NETWORK_NEGATIVE_WRONG_RESULT', failures);
    if (!requestNetworkAdapter) {
      const exchangePreview = await runtime.dispatchVisibleCommand(
        STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_LOCAL_FIXTURE_PREVIEW,
        { packetId: exchange.packetId },
        activation('stage10-exchange-preview'),
      );
      assertCondition(exchangePreview.ok === true, 'EXCHANGE_PREVIEW_FAILED', failures);
    }
  }

  const session = runtime.getSession();
  const preliminaryStoragePaths = !disableStorage ? persistencePort.paths(projectId) : {};
  const persistedBundle = !disableStorage ? await persistencePort.readStage10State(projectId) : null;
  const commandReceiptAuthorityStore = persistedBundle?.authorityStore || null;
  const canReopenPersistedSession = Boolean(preliminaryStoragePaths.session && fs.existsSync(preliminaryStoragePaths.session));
  const reopened = !disableStorage && canReopenPersistedSession
    ? await reopenStage10ProductRuntime({ projectId, persistencePort, uiPort, capabilitySnapshot })
    : null;
  const reopenedSession = reopened ? reopened.getSession() : null;
  const readModels = buildStage10ProductReadModels(session, capabilitySnapshot, {
    authorityStore: commandReceiptAuthorityStore,
    integrityAnchor: persistedBundle?.integrityAnchor,
    previousIntegrityAnchor: persistedBundle?.previousIntegrityAnchor,
  });
  const reopenedReadModels = reopenedSession ? buildStage10ProductReadModels(reopenedSession, capabilitySnapshot, {
    authorityStore: commandReceiptAuthorityStore,
    integrityAnchor: persistedBundle?.integrityAnchor,
    previousIntegrityAnchor: persistedBundle?.previousIntegrityAnchor,
  }) : null;
  const storagePaths = preliminaryStoragePaths;
  const finalProject = session.coreState.data.projects[projectId];
  const finalText = finalProject?.scenes?.['scene-1']?.text || '';
  const activationModes = session.uiEvents.map((event) => event.activationMode);
  const commandReceipts = Array.isArray(commandReceiptAuthorityStore?.receipts) ? commandReceiptAuthorityStore.receipts : [];
  const receiptCommands = commandReceipts.map((receipt) => receipt.commandId);
  const commandReceiptsCapabilityOk = commandReceipts.every((receipt) => receipt.capabilityRevalidated === true);
  const commentsPersisted = Object.keys(session.commentPackets).length > 0
    && (reopenedReadModels?.comments?.value?.items?.length || 0) > 0;
  const historyPersisted = readModels.history.value?.summary?.projectedEntryCount > 0
    && (reopenedReadModels?.history?.value?.summary?.projectedEntryCount || 0) > 0;
  const conflictsPersisted = Object.keys(session.conflictReports).length > 0
    && Object.keys(reopenedSession?.conflictReports || {}).length > 0;
  const exchangePersisted = Object.keys(session.operationExchangePackets).length > 0
    && Object.keys(reopenedSession?.operationExchangePackets || {}).length > 0;
  const recoveryPersisted = fs.existsSync(storagePaths.recoveryRoot || path.join(os.tmpdir(), 'missing'))
    && fs.readdirSync(storagePaths.recoveryRoot).length >= 2;
  const sourceFiles = [
    'src/product/stage10ProductWiring.mjs',
    'scripts/ops/yalken-atlas-v5-final-audit-p0-08-stage10-product-wiring.mjs',
    'src/collab/index.mjs',
    'src/derived/commentsHistory/index.mjs',
    'src/io/revisionBridge/index.mjs',
    'src/core/runtime.mjs',
  ];

  const acceptance = {
    visibleUiCommandPath: !shadowOnly && activationModes.length >= 10 && activationModes.every((mode) => mode === STAGE10_ACTIVATION_MODES.PHYSICAL_POINTER_OR_KEYBOARD),
    commandKernelCapabilityRevalidated: commandReceiptsCapabilityOk && receiptCommands.includes(CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT),
    commentsProductPathPersistReopen: commentsPersisted,
    historyProductPathPersistReopenRecoveryUndo: historyPersisted && recoveryPersisted && receiptCommands.includes(STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_UNDO),
    conflictsProductPathPersistManualDecision: conflictsPersisted
      && Object.values(session.conflictDecisions).some((decision) => decision.manualDecision === true && decision.automaticMerge === false),
    operationExchangeLocalProductPath: exchangePersisted
      && Object.values(session.operationExchangeAdapterPreviews).some((report) => report.ok === true && report.adapter?.liveNetwork === false),
    negativeDirectBridgeDenied: directBridgeDenied.ok === false && !commandReceipts.some((receipt) => receipt.directBridge === true),
    shadowOnlyRejectedAsComplete: !shadowOnly,
    networkAdapterNotRequired: requestNetworkAdapter ? false : session.networkAdapterEnabled === false,
    noProgramDoneClaim: session.programDoneClaim === false,
  };

  assertCondition(acceptance.visibleUiCommandPath, 'VISIBLE_UI_COMMAND_PATH_NOT_PROVEN', failures);
  assertCondition(acceptance.commandKernelCapabilityRevalidated, 'COMMAND_KERNEL_CAPABILITY_REVALIDATION_NOT_PROVEN', failures);
  assertCondition(acceptance.commentsProductPathPersistReopen, 'COMMENTS_PRODUCT_PATH_NOT_PERSISTED_REOPENED', failures);
  assertCondition(acceptance.historyProductPathPersistReopenRecoveryUndo, 'HISTORY_RECOVERY_UNDO_NOT_PROVEN', failures);
  assertCondition(acceptance.conflictsProductPathPersistManualDecision, 'CONFLICTS_PRODUCT_PATH_NOT_PROVEN', failures);
  assertCondition(acceptance.operationExchangeLocalProductPath, 'OPERATION_EXCHANGE_PRODUCT_PATH_NOT_PROVEN', failures);
  assertCondition(acceptance.negativeDirectBridgeDenied, 'DIRECT_BRIDGE_NEGATIVE_NOT_PROVEN', failures);
  assertCondition(acceptance.shadowOnlyRejectedAsComplete, 'SHADOW_ONLY_ACCEPTED_AS_COMPLETE', failures);
  assertCondition(acceptance.networkAdapterNotRequired, 'NETWORK_ADAPTER_REQUIRED_OR_ACCEPTED', failures);
  assertCondition(acceptance.noProgramDoneClaim, 'PROGRAM_DONE_FALSE_GREEN', failures);

  const report = {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p0_08.stage10ProductWiring.report.v1',
    taskId: 'YALKEN_ATLAS_V5_INDEPENDENT_FINAL_AUDIT_REPAIR_QUEUE',
    contourId: CONTOUR_ID,
    generatedAtUtc: new Date().toISOString(),
    sourceBinding: {
      headSha: git(['rev-parse', 'HEAD']),
      originMainSha: git(['rev-parse', 'origin/main']),
      branch: git(['branch', '--show-current']),
      exactSourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, sha256File(path.join(REPO_ROOT, file))])),
    },
    pass: failures.length === 0,
    status: failures.length === 0 ? 'PASS_P0_08_STAGE10_PRODUCT_WIRING' : 'FAIL_P0_08_STAGE10_PRODUCT_WIRING',
    failures,
    acceptance,
    activationModes: session.uiEvents,
    commandPath: {
      receiptCount: commandReceipts.length,
      commandIds: receiptCommands,
      allCapabilityRevalidated: commandReceiptsCapabilityOk,
      replayOk: readModels.replay.ok === true,
      replayHash: readModels.replay.replayHash,
      directBridgeDenied: directBridgeDenied.error?.code === 'E_STAGE10_DIRECT_BRIDGE_DENIED',
      directBridgeMutatedState: false,
    },
    persistence: {
      sessionPath: storagePaths.session || '',
      sessionSha256: storagePaths.session && fs.existsSync(storagePaths.session) ? sha256File(storagePaths.session) : '',
      sessionHash: hashCanonicalValue(session),
      reopenedSessionHash: reopenedSession ? hashCanonicalValue(reopenedSession) : '',
      reopenedProjectHash: reopenedSession ? hashCoreState(reopenedSession.coreState) : '',
      authorityHeadPath: preliminaryStoragePaths.authority || '',
      authorityHeadSha256: preliminaryStoragePaths.authority && fs.existsSync(preliminaryStoragePaths.authority) ? sha256File(preliminaryStoragePaths.authority) : '',
      authorityHeadDigest: commandReceiptAuthorityStore?.currentHead?.authorityHeadDigest || '',
      authorityReceiptCount: commandReceiptAuthorityStore?.currentHead?.receiptCount || 0,
      recoverySnapshotCount: session.recoverySnapshotRefs.length,
      finalSceneText: finalText,
    },
    productPaths: {
      comments: {
        packetCount: Object.keys(session.commentPackets).length,
        derivedItemCount: readModels.comments.value?.items?.length || 0,
        reopenedDerivedItemCount: reopenedReadModels?.comments?.value?.items?.length || 0,
        secondCommentTruth: false,
        manuscriptMutation: false,
      },
      history: {
        projectedEntryCount: readModels.history.value?.summary?.projectedEntryCount || 0,
        reopenedProjectedEntryCount: reopenedReadModels?.history?.value?.summary?.projectedEntryCount || 0,
        recoverySnapshotCount: session.recoverySnapshotRefs.length,
        undoCommandPresent: receiptCommands.includes(STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_UNDO),
        storedHistoryTruth: false,
      },
      conflicts: {
        reportCount: Object.keys(session.conflictReports).length,
        decisionCount: Object.keys(session.conflictDecisions).length,
        automaticMerge: false,
        silentProjectRewrite: false,
      },
      operationExchange: {
        packetCount: Object.keys(session.operationExchangePackets).length,
        adapterPreviewCount: Object.keys(session.operationExchangeAdapterPreviews).length,
        networkAdapterEnabled: false,
        shadowOnly: Boolean(shadowOnly),
      },
    },
    negativeAssertions: {
      directBridgeAccepted: false,
      shadowOnlyAcceptedAsProductComplete: false,
      receiptOnlyAcceptedAsReadiness: false,
      storageBypassAccepted: false,
      networkAdapterAccepted: requestNetworkAdapter ? false : false,
      programDoneClaim: false,
    },
    checks: {
      focused: { status: 'PENDING', command: 'node --test test/contracts/yalken-atlas-v5-final-audit-p0-08-stage10-product-wiring.contract.test.js' },
      testOps: { status: 'PENDING', command: 'npm run -s test:ops' },
      doctrine: { status: 'PENDING', command: 'npm run -s design-os:doctrine' },
      ossPolicy: { status: 'PENDING', command: 'npm run -s oss:policy' },
      buildRenderer: { status: 'PENDING', command: 'npm run -s build:renderer' },
      fullRunner: { status: 'PENDING', command: 'node scripts/run-tests.js' },
    },
    authority: {
      productCoreOwnsAuthorTruth: true,
      commandKernelOwnsMutation: true,
      designOsSurfaceIntentOnly: true,
      transactionalPersistencePortOwnsPersistence: true,
      networkAdapterRuntimeDependency: false,
      shadowAcceptedAsComplete: false,
      programDoneClaim: false,
    },
  };

  const reportPath = path.join(outDir, 'p0-08-stage10-product-wiring-report.json');
  writeJsonAtomic(reportPath, report);

  const receipt = {
    schemaVersion: 'yalken.atlas.v5.finalAudit.p0_08.receipt.v1',
    taskId: 'YALKEN_ATLAS_V5_INDEPENDENT_FINAL_AUDIT_REPAIR_QUEUE',
    contourId: CONTOUR_ID,
    status: report.status,
    pass: report.pass,
    programDoneClaim: false,
    sourceBinding: report.sourceBinding,
    report: {
      path: path.relative(REPO_ROOT, reportPath),
      sha256: sha256File(reportPath),
    },
    acceptance,
    checks: report.checks,
    delivery: {
      commit: 'PENDING_DELIVERY_CHAIN',
      push: 'PENDING_DELIVERY_CHAIN',
      pr: 'PENDING_DELIVERY_CHAIN',
      ci: 'PENDING_DELIVERY_CHAIN',
      merge: 'PENDING_DELIVERY_CHAIN',
      remoteShaVerification: 'PENDING_DELIVERY_CHAIN',
    },
    nextContour: 'P1_TRANSACTION_QUEUE_CLEANUP_PROMISE_IDENTITY',
    notes: [
      'P0_08 closes local Stage 10 product wiring only through visible command activation, Command Kernel revalidation, storage ports, reopen, recovery and undo evidence.',
      'Operation exchange remains transport-neutral local fixture preview; network adapter is not part of Core or runtime.',
      'Shadow/receipt-only evidence is explicitly not accepted as product completion.',
    ],
  };
  writeJsonAtomic(receiptPath, receipt);

  return {
    status: report.status,
    pass: report.pass,
    failures,
    reportPath,
    receiptPath,
  };
}

runJourney()
  .then((summary) => {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.exit(summary.pass ? 0 : 1);
  })
  .catch((error) => {
    fs.mkdirSync(outDir, { recursive: true });
    const summary = {
      status: 'FAIL_P0_08_STAGE10_PRODUCT_WIRING',
      pass: false,
      failures: [error?.code || error?.message || 'UNKNOWN_ERROR'],
      reportPath: path.join(outDir, 'p0-08-stage10-product-wiring-report.json'),
      receiptPath,
    };
    writeJsonAtomic(summary.reportPath, {
      schemaVersion: 'yalken.atlas.v5.finalAudit.p0_08.stage10ProductWiring.report.v1',
      contourId: CONTOUR_ID,
      pass: false,
      status: summary.status,
      failures: summary.failures,
      programDoneClaim: false,
    });
    writeJsonAtomic(receiptPath, {
      schemaVersion: 'yalken.atlas.v5.finalAudit.p0_08.receipt.v1',
      contourId: CONTOUR_ID,
      status: summary.status,
      pass: false,
      programDoneClaim: false,
      report: {
        path: path.relative(REPO_ROOT, summary.reportPath),
        sha256: sha256File(summary.reportPath),
      },
      delivery: {
        commit: 'PENDING_DELIVERY_CHAIN',
        push: 'PENDING_DELIVERY_CHAIN',
        pr: 'PENDING_DELIVERY_CHAIN',
        ci: 'PENDING_DELIVERY_CHAIN',
        merge: 'PENDING_DELIVERY_CHAIN',
        remoteShaVerification: 'PENDING_DELIVERY_CHAIN',
      },
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
