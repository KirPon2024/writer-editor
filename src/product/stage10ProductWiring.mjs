import {
  buildLocalFixtureExchangeAdapterReport,
  buildLocalMultiSessionRecoveryReport,
  buildOperationReplayReport,
  COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION,
  buildTransportNeutralExchangePacket,
  createEmptyEventLog,
  hashEventLog,
  appendEventLogEntry,
  applyCommandWithEventLog,
  applyEventLog,
} from '../collab/index.mjs';
import {
  buildRevisionHistoryProjectionPacket,
  deriveComments,
  deriveHistory,
} from '../derived/commentsHistory/index.mjs';
import { buildStableCommentAnchorPacketFromReviewIr } from '../io/revisionBridge/index.mjs';
import {
  CORE_COMMAND_IDS,
  createInitialCoreState,
  hashCoreState,
  reduceCoreState,
} from '../core/runtime.mjs';
import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';
import { createCoreDomainEventProductPort } from './domainEventPort.mjs';
import {
  STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
  STAGE10_COMMAND_RECEIPT_AUTHORITY_STORE_SCHEMA,
  STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA,
  appendCommandReceiptAuthorityHead,
  createCommandKernelReceiptAuthorityPortFromStore,
  createCommandReceiptAuthorityHeadRef,
  createInitialCommandReceiptAuthorityStore,
  preflightCommandReceiptIdentity,
  validateCommandReceiptAuthorityStore,
} from './stage10CommandReceiptAuthorityHead.mjs';
import {
  STAGE10_INTEGRITY_ANCHOR_SCHEMA,
  createStage10IntegrityAnchor,
  validateStage10IntegrityAnchor,
} from './stage10IntegrityAnchor.mjs';

export const STAGE10_PRODUCT_SESSION_SCHEMA = 'yalken.stage10.localProductSession.v2';
export const STAGE10_PRODUCT_SURFACE_SCHEMA = 'yalken.stage10.localProductSurface.v1';
export {
  STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
  STAGE10_COMMAND_RECEIPT_AUTHORITY_STORE_SCHEMA,
  STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA,
  STAGE10_INTEGRITY_ANCHOR_SCHEMA,
};

export const STAGE10_ACTIVATION_MODES = Object.freeze({
  PHYSICAL_POINTER_OR_KEYBOARD: 'PHYSICAL_POINTER_OR_KEYBOARD',
  DOM_VISIBLE_CONTROL_LISTENER_FALLBACK: 'DOM_VISIBLE_CONTROL_LISTENER_FALLBACK',
  FORBIDDEN_DIRECT_BRIDGE: 'FORBIDDEN_DIRECT_BRIDGE',
});

export const STAGE10_PRODUCT_COMMAND_IDS = Object.freeze({
  COMMENT_IMPORT_STABLE_PACKET: 'cmd.comments.importStablePacket',
  COMMENT_DECISION_RECORD: 'cmd.comments.decision.record',
  HISTORY_CREATE_CHECKPOINT: 'cmd.project.history.createCheckpoint',
  HISTORY_RESTORE_PREVIEW: 'cmd.project.history.restorePreview',
  HISTORY_RESTORE_APPLY: 'cmd.project.history.restoreApply',
  HISTORY_RESTORE_UNDO: 'cmd.project.history.restoreUndo',
  CONFLICT_PREVIEW: 'cmd.collab.conflict.preview',
  CONFLICT_DECISION_RECORD: 'cmd.collab.conflict.decision.record',
  OPERATION_EXCHANGE_PREPARE: 'cmd.collab.operationExchange.prepare',
  OPERATION_EXCHANGE_LOCAL_FIXTURE_PREVIEW: 'cmd.collab.operationExchange.localFixturePreview',
  COLLAB_EVENT_LOG_APPLY: 'cmd.collab.eventLog.apply',
});

const DEFAULT_STAGE10_COMMANDS = Object.freeze([
  ...Object.values(CORE_COMMAND_IDS),
  ...Object.values(STAGE10_PRODUCT_COMMAND_IDS),
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) {
    deepFreeze(item);
  }
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedError(code, op, reason, details) {
  const error = { code, op, reason };
  if (isPlainObject(details)) error.details = cloneJson(details);
  return error;
}

function createDefaultSession(input = {}) {
  const projectId = normalizeString(input.projectId) || 'stage10-project';
  const eventLog = createEmptyEventLog();
  const authorityStore = createInitialCommandReceiptAuthorityStore({ projectId, eventLog });
  return {
    schemaVersion: STAGE10_PRODUCT_SESSION_SCHEMA,
    projectId,
    actorId: normalizeString(input.actorId) || 'local-author',
    sessionId: normalizeString(input.sessionId) || 'stage10-local-session',
    coreState: isPlainObject(input.initialCoreState) ? cloneJson(input.initialCoreState) : createInitialCoreState(),
    eventLog,
    commandReceiptAuthorityHeadRef: createCommandReceiptAuthorityHeadRef(authorityStore.currentHead),
    commentPackets: {},
    commentDecisions: {},
    historyCheckpoints: {},
    historyRestorePreviews: {},
    historyRestoreUndoSnapshots: {},
    conflictReports: {},
    conflictDecisions: {},
    operationExchangePackets: {},
    operationExchangeAdapterPreviews: {},
    collabApplyReports: {},
    uiEvents: [],
    recoverySnapshotRefs: [],
    shadowOnly: false,
    shadowAcceptedAsComplete: false,
    programDoneClaim: false,
    networkAdapterEnabled: false,
  };
}

function normalizeSession(input = {}, options = {}) {
  const session = isPlainObject(input) && input.schemaVersion === STAGE10_PRODUCT_SESSION_SCHEMA
    ? cloneJson(input)
    : createDefaultSession(input);
  const normalized = {
    ...createDefaultSession(session),
    ...session,
    coreState: isPlainObject(session.coreState) ? session.coreState : createInitialCoreState(),
    eventLog: isPlainObject(session.eventLog) ? session.eventLog : createEmptyEventLog(),
    commandReceiptAuthorityHeadRef: isPlainObject(session.commandReceiptAuthorityHeadRef)
      ? session.commandReceiptAuthorityHeadRef
      : null,
    commentPackets: isPlainObject(session.commentPackets) ? session.commentPackets : {},
    commentDecisions: isPlainObject(session.commentDecisions) ? session.commentDecisions : {},
    historyCheckpoints: isPlainObject(session.historyCheckpoints) ? session.historyCheckpoints : {},
    historyRestorePreviews: isPlainObject(session.historyRestorePreviews) ? session.historyRestorePreviews : {},
    historyRestoreUndoSnapshots: isPlainObject(session.historyRestoreUndoSnapshots) ? session.historyRestoreUndoSnapshots : {},
    conflictReports: isPlainObject(session.conflictReports) ? session.conflictReports : {},
    conflictDecisions: isPlainObject(session.conflictDecisions) ? session.conflictDecisions : {},
    operationExchangePackets: isPlainObject(session.operationExchangePackets) ? session.operationExchangePackets : {},
    operationExchangeAdapterPreviews: isPlainObject(session.operationExchangeAdapterPreviews)
      ? session.operationExchangeAdapterPreviews
      : {},
    collabApplyReports: isPlainObject(session.collabApplyReports) ? session.collabApplyReports : {},
    uiEvents: Array.isArray(session.uiEvents) ? session.uiEvents : [],
    recoverySnapshotRefs: Array.isArray(session.recoverySnapshotRefs) ? session.recoverySnapshotRefs : [],
  };
  delete normalized.commandReceiptAuthority;
  delete normalized.commandReceipts;
  if (options.requireReceiptAuthority === true && !normalized.commandReceiptAuthorityHeadRef) {
    throw typedError(
      'E_STAGE10_RECEIPT_AUTHORITY_HEAD_MISSING',
      'stage10.commandReceiptAuthorityHead',
      'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_MISSING',
    );
  }
  return normalized;
}

function buildVisibleControls() {
  return [
    { controlId: 'stage10-comment-import', commandId: STAGE10_PRODUCT_COMMAND_IDS.COMMENT_IMPORT_STABLE_PACKET },
    { controlId: 'stage10-comment-decision', commandId: STAGE10_PRODUCT_COMMAND_IDS.COMMENT_DECISION_RECORD },
    { controlId: 'stage10-history-checkpoint', commandId: STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT },
    { controlId: 'stage10-history-restore-preview', commandId: STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_PREVIEW },
    { controlId: 'stage10-history-restore-apply', commandId: STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY },
    { controlId: 'stage10-history-restore-undo', commandId: STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_UNDO },
    { controlId: 'stage10-conflict-preview', commandId: STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_PREVIEW },
    { controlId: 'stage10-conflict-decision', commandId: STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_DECISION_RECORD },
    { controlId: 'stage10-exchange-prepare', commandId: STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_PREPARE },
    { controlId: 'stage10-exchange-preview', commandId: STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_LOCAL_FIXTURE_PREVIEW },
    { controlId: 'stage10-collab-apply-event-log', commandId: STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY },
  ];
}

function buildSurface(session) {
  return {
    schemaVersion: STAGE10_PRODUCT_SURFACE_SCHEMA,
    projectId: session.projectId,
    controls: buildVisibleControls(),
    derivedViews: {
      commentsReady: Object.keys(session.commentPackets).length > 0,
      historyReady: session.eventLog.events.length > 0,
      conflictsReady: Object.keys(session.conflictReports).length > 0,
      operationExchangeReady: Object.keys(session.operationExchangePackets).length > 0,
    },
    authority: {
      visibleUiIntentOnly: true,
      commandKernelDispatchRequired: true,
      transactionalPersistencePortRequired: true,
      projectTruthOwnedByCore: true,
      commentTruthDuplicated: false,
      operationLogTruthDuplicated: false,
      networkAdapterEnabled: false,
    },
  };
}

function normalizeActivation(commandId, activation = {}) {
  const mode = normalizeString(activation.mode);
  const controlId = normalizeString(activation.controlId);
  return {
    mode,
    controlId,
    commandId,
    visibleControl: mode === STAGE10_ACTIVATION_MODES.PHYSICAL_POINTER_OR_KEYBOARD
      || mode === STAGE10_ACTIVATION_MODES.DOM_VISIBLE_CONTROL_LISTENER_FALLBACK,
    forbiddenDirectBridge: mode === STAGE10_ACTIVATION_MODES.FORBIDDEN_DIRECT_BRIDGE,
  };
}

function capabilityEnabled(capabilitySnapshot, commandId) {
  const capabilities = isPlainObject(capabilitySnapshot?.capabilities) ? capabilitySnapshot.capabilities : {};
  if (capabilities.stage10LocalProductWiring === false) return false;
  if (capabilities[commandId] === false) return false;
  if (Array.isArray(capabilitySnapshot?.disabledCommands) && capabilitySnapshot.disabledCommands.includes(commandId)) {
    return false;
  }
  return true;
}

function createReceipt({ session, commandId, opId, ts, status, activation, preStateHash, postStateHash, storageWritten, details }) {
  const detailEnvelope = isPlainObject(details) ? cloneJson(details) : {};
  const domainEvents = Array.isArray(detailEnvelope.domainEvents) ? cloneJson(detailEnvelope.domainEvents) : [];
  const domainEventDigest = normalizeString(detailEnvelope.domainEventDigest);
  const receiptDetails = cloneJson(detailEnvelope);
  delete receiptDetails.domainEvents;
  return deepFreeze({
    schemaVersion: COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION,
    receiptId: opId,
    operationId: opId,
    commandId,
    status,
    appliedAt: ts,
    actorId: session.actorId,
    sessionId: session.sessionId,
    preStateHash,
    postStateHash,
    capabilityRevalidated: true,
    activationMode: activation.mode,
    controlId: activation.controlId,
    visibleUiCommand: activation.visibleControl === true,
    directBridge: false,
    storageWritten: storageWritten === true,
    domainEventDigest,
    domainEventCount: domainEvents.length,
    details: receiptDetails,
  });
}

function createCommandKernelReceiptAuthorityPort(authorityStore, session) {
  return createCommandKernelReceiptAuthorityPortFromStore(authorityStore, {
    projectId: session.projectId,
    eventLog: session.eventLog,
    sessionRef: session.commandReceiptAuthorityHeadRef,
    requireSessionRef: true,
  });
}

function nextOpId(authorityStore, commandId) {
  const shortCommand = commandId.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `stage10:${String((authorityStore?.currentHead?.receiptCount || 0) + 1).padStart(4, '0')}:${shortCommand}`;
}

function ensurePersistencePort(persistencePort) {
  if (
    !isPlainObject(persistencePort)
    || typeof persistencePort.readStage10State !== 'function'
    || typeof persistencePort.commitStage10State !== 'function'
    || typeof persistencePort.writeRecoverySnapshot !== 'function'
    || typeof persistencePort.readRecoverySnapshot !== 'function'
  ) {
    throw typedError(
      'E_STAGE10_STORAGE_PORT_REQUIRED',
      'stage10.productWiring.createRuntime',
      'STAGE10_TRANSACTIONAL_PERSISTENCE_PORT_REQUIRED',
    );
  }
}

async function maybeAwait(value) {
  return value && typeof value.then === 'function' ? await value : value;
}

function validatePersistedBundle(bundleInput, projectId) {
  if (!isPlainObject(bundleInput)) {
    throw typedError('E_STAGE10_PERSISTED_BUNDLE_MISSING', 'stage10.productWiring.reopen', 'STAGE10_PERSISTED_BUNDLE_REQUIRED');
  }
  const session = normalizeSession(bundleInput.session, { requireReceiptAuthority: true });
  if (session.projectId !== projectId) {
    throw typedError('E_STAGE10_PERSISTED_PROJECT_MISMATCH', 'stage10.productWiring.reopen', 'STAGE10_PERSISTED_PROJECT_MISMATCH');
  }
  const verified = validateCommandReceiptAuthorityStore(bundleInput.authorityStore, {
    projectId: session.projectId,
    eventLog: session.eventLog,
    sessionRef: session.commandReceiptAuthorityHeadRef,
    requireSessionRef: true,
  });
  if (!verified.ok) throw verified.error;
  session.commandReceiptAuthorityHeadRef = verified.headRef;
  const anchor = validateStage10IntegrityAnchor(bundleInput.integrityAnchor, {
    projectId: session.projectId,
    session,
    authorityStore: verified.store,
    previousAnchor: bundleInput.previousIntegrityAnchor,
  });
  if (!anchor.ok) throw anchor.error;
  const replay = buildOperationReplayReport({
    projectId: session.projectId,
    eventLog: session.eventLog,
    domainEventPort: createCoreDomainEventProductPort(),
    commandReceiptAuthorityPort: createCommandKernelReceiptAuthorityPort(verified.store, session),
    initialStateHash: session.eventLog.events[0]?.preStateHash || hashCoreState(createInitialCoreState()),
    expectedFinalStateHash: hashCoreState(session.coreState),
    requireCommandKernelReceipt: true,
    requireCapabilityRevalidation: true,
  });
  if (!replay.ok) {
    throw typedError(
      'E_STAGE10_REOPEN_REPLAY_INVALID',
      'stage10.productWiring.reopen',
      replay.rejected[0]?.reason || 'STAGE10_REOPEN_REPLAY_INVALID',
      { replayHash: replay.replayHash },
    );
  }
  return {
    session,
    authorityStore: verified.store,
    integrityAnchor: anchor.anchor,
    previousIntegrityAnchor: isPlainObject(bundleInput.previousIntegrityAnchor)
      ? deepFreeze(cloneJson(bundleInput.previousIntegrityAnchor))
      : null,
    replay,
  };
}

function prepareCommandReceiptExternal({ session, authorityState, receipt }) {
  const nextStore = appendCommandReceiptAuthorityHead({
    store: authorityState.store,
    projectId: session.projectId,
    eventLog: session.eventLog,
    receipt,
  });
  session.commandReceiptAuthorityHeadRef = createCommandReceiptAuthorityHeadRef(nextStore.currentHead);
  return nextStore;
}

async function commitCommandState({ session, authorityState, persistencePort, receipt, reason }) {
  const nextStore = prepareCommandReceiptExternal({ session, authorityState, receipt });
  const nextAnchor = createStage10IntegrityAnchor({
    projectId: session.projectId,
    session,
    authorityStore: nextStore,
    previousAnchor: authorityState.integrityAnchor,
  });
  const committed = await maybeAwait(persistencePort.commitStage10State(
    session.projectId,
    {
      session: cloneJson(session),
      authorityStore: cloneJson(nextStore),
      integrityAnchor: cloneJson(nextAnchor),
    },
    {
      reason,
      expectedPreviousIntegrityAnchorDigest: authorityState.integrityAnchor.integrityAnchorDigest,
    },
  ));
  if (committed?.ok !== true || committed.storageWritten !== true || committed.readbackVerified !== true) {
    throw typedError('E_STAGE10_TRANSACTION_COMMIT_FAILED', 'stage10.productWiring.commit', 'STAGE10_TRANSACTION_COMMIT_NOT_ACKNOWLEDGED');
  }
  const verified = validatePersistedBundle(committed.bundle, session.projectId);
  authorityState.store = verified.authorityStore;
  authorityState.integrityAnchor = verified.integrityAnchor;
  authorityState.previousIntegrityAnchor = verified.previousIntegrityAnchor;
  return verified;
}

async function writeRecoverySnapshot(session, persistencePort, snapshotId, reason) {
  const snapshot = {
    schemaVersion: 'yalken.stage10.recoverySnapshot.v1',
    snapshotId,
    reason,
    sessionId: session.sessionId,
    projectId: session.projectId,
    stateHash: hashCoreState(session.coreState),
    eventLogHash: hashEventLog(session.eventLog),
    session: cloneJson(session),
  };
  const writeResult = await maybeAwait(persistencePort.writeRecoverySnapshot(session.projectId, snapshotId, snapshot, { reason }));
  if (writeResult?.ok !== true || writeResult.readbackVerified !== true) {
    throw typedError('E_STAGE10_RECOVERY_WRITE_FAILED', 'stage10.productWiring.recovery', 'RECOVERY_SNAPSHOT_WRITE_NOT_ACKNOWLEDGED');
  }
  const readback = await maybeAwait(persistencePort.readRecoverySnapshot(session.projectId, snapshotId));
  if (hashCanonicalValue(readback) !== hashCanonicalValue(snapshot)) {
    throw typedError('E_STAGE10_RECOVERY_READBACK_MISMATCH', 'stage10.productWiring.recovery', 'RECOVERY_SNAPSHOT_READBACK_MISMATCH');
  }
  const ref = {
    snapshotId,
    sessionId: session.sessionId,
    stateHash: snapshot.stateHash,
    eventLogHash: snapshot.eventLogHash,
    createdAtUtc: new Date(0).toISOString(),
    readableRecovery: true,
    destructiveRewrite: false,
  };
  session.recoverySnapshotRefs.push(ref);
  return { snapshot, ref };
}

function deriveViews(session, capabilitySnapshot, authorityStore) {
  const latestPacket = Object.values(session.commentPackets).at(-1) || null;
  const comments = deriveComments({
    coreState: session.coreState,
    params: {
      projectId: session.projectId,
      filter: 'all',
      stableCommentAnchorPacket: latestPacket,
    },
    capabilitySnapshot,
  });
  const historyPacket = buildRevisionHistoryProjectionPacket({
    projectId: session.projectId,
    eventLog: session.eventLog,
    commandReceipts: Array.isArray(authorityStore?.receipts) ? authorityStore.receipts : [],
    authorTruthRefs: [{
      refId: `core-state:${session.projectId}`,
      truthDomain: 'productCore.authorTruth',
      sourceHash: hashCoreState(session.coreState),
      valueIncluded: false,
    }],
  });
  const history = deriveHistory({
    coreState: session.coreState,
    params: {
      projectId: session.projectId,
      filter: 'all',
      historyProjectionPacket: historyPacket,
    },
    capabilitySnapshot,
  });
  return { comments, history, historyPacket };
}

function assertVisibleCommand(commandId, activation) {
  if (activation.forbiddenDirectBridge) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_DIRECT_BRIDGE_DENIED',
        commandId,
        'FORBIDDEN_DIRECT_BRIDGE',
        { activationMode: activation.mode },
      ),
    };
  }
  if (!activation.visibleControl) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_VISIBLE_CONTROL_REQUIRED',
        commandId,
        'VISIBLE_UI_CONTROL_ACTIVATION_REQUIRED',
        { activationMode: activation.mode },
      ),
    };
  }
  return { ok: true };
}

function assertCommandCapability(commandId, capabilitySnapshot) {
  if (!capabilityEnabled(capabilitySnapshot, commandId)) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_CAPABILITY_DENIED',
        commandId,
        'COMMAND_CAPABILITY_REVALIDATION_FAILED',
      ),
    };
  }
  return { ok: true };
}

function isCoreCommand(commandId) {
  return Object.values(CORE_COMMAND_IDS).includes(commandId);
}

function updateCommentDecisionRows(packet, payload) {
  const decisionId = normalizeString(payload.decisionId);
  const decisionState = normalizeString(payload.state) || 'acknowledged';
  const rows = packet.decisionRows.map((row) => (
    row.decisionId === decisionId
      ? {
          ...row,
          state: decisionState,
          productCommandRecorded: true,
          mutationAuthority: 'command-kernel-reviewed-comment-decision',
          canAutoApply: false,
          canWriteManuscript: false,
        }
      : row
  ));
  const next = {
    ...packet,
    decisionRows: rows,
  };
  return {
    ...next,
    packetHash: `sha256:${hashCanonicalValue({
      projectId: next.projectId,
      sceneId: next.sceneId,
      revisionId: next.revisionId,
      anchorRecords: next.anchorRecords,
      decisionRows: next.decisionRows,
      survivalPreviewHash: next.survivalPreviewHash,
    })}`,
  };
}

async function dispatchCoreCommand({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const preStateHash = hashCoreState(session.coreState);
  const applied = applyCommandWithEventLog({
    eventLog: session.eventLog,
    currentState: session.coreState,
    currentStateHash: preStateHash,
    domainEventPort: createCoreDomainEventProductPort(),
    commandId,
    payload,
    opId,
    ts,
    actorId: session.actorId,
    applyCommand: (state, command) => reduceCoreState(state, command),
  });
  if (!applied.ok) return applied;

  session.coreState = applied.state;
  session.eventLog = applied.eventLog;
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'APPLIED',
    activation,
    preStateHash,
    postStateHash: applied.stateHash,
    storageWritten: true,
    details: {
      eventLogHash: applied.eventLogHash,
      domainEvents: applied.domainEvents,
      domainEventDigest: applied.domainEventDigest,
      projectTruthMutation: true,
      commandKernel: true,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, receipt, session: cloneJson(session) };
}

async function dispatchCommentImport({ session, persistencePort, authorityState, capabilitySnapshot, commandId, payload, activation, opId, ts }) {
  const packet = buildStableCommentAnchorPacketFromReviewIr({
    projectId: session.projectId,
    sceneId: normalizeString(payload.sceneId) || 'scene-1',
    revisionId: normalizeString(payload.revisionId) || opId,
    reviewIr: payload.reviewIr,
    context: payload.context,
    placementHints: payload.placementHints,
  });
  const preStateHash = hashCoreState(session.coreState);
  session.commentPackets[packet.packetHash] = packet;
  const views = deriveViews(session, capabilitySnapshot, authorityState.store);
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: packet.status === 'ready' ? 'APPLIED' : 'DIAGNOSTICS',
    activation,
    preStateHash,
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: {
      packetHash: packet.packetHash,
      commentItemCount: views.comments.value?.items?.length || 0,
      projectTruthMutation: false,
      manuscriptMutation: false,
      commentTruthDuplicated: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, packet, views, receipt, session: cloneJson(session) };
}

async function dispatchCommentDecision({ session, persistencePort, authorityState, capabilitySnapshot, commandId, payload, activation, opId, ts }) {
  const packetHash = normalizeString(payload.packetHash) || Object.keys(session.commentPackets).at(-1);
  const packet = session.commentPackets[packetHash];
  if (!packet) {
    return {
      ok: false,
      error: typedError('E_STAGE10_COMMENT_PACKET_NOT_FOUND', commandId, 'COMMENT_PACKET_NOT_FOUND', { packetHash }),
    };
  }
  const nextPacket = updateCommentDecisionRows(packet, payload);
  delete session.commentPackets[packetHash];
  session.commentPackets[nextPacket.packetHash] = nextPacket;
  const decisionId = normalizeString(payload.decisionId);
  session.commentDecisions[decisionId] = {
    decisionId,
    packetHash: nextPacket.packetHash,
    state: normalizeString(payload.state) || 'acknowledged',
    commandReceiptId: opId,
    automaticApply: false,
    manuscriptMutation: false,
  };
  const views = deriveViews(session, capabilitySnapshot, authorityState.store);
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'APPLIED',
    activation,
    preStateHash: hashCoreState(session.coreState),
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: {
      packetHash: nextPacket.packetHash,
      decisionId,
      commentItemCount: views.comments.value?.items?.length || 0,
      commentTruthDuplicated: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, packet: nextPacket, views, receipt, session: cloneJson(session) };
}

async function dispatchHistoryCheckpoint({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const snapshotId = normalizeString(payload.snapshotId) || `history-checkpoint-${opId}`;
  const { ref } = await writeRecoverySnapshot(session, persistencePort, snapshotId, commandId);
  session.historyCheckpoints[snapshotId] = {
    snapshotId,
    createdByCommandReceiptId: opId,
    stateHash: ref.stateHash,
    eventLogHash: ref.eventLogHash,
  };
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'APPLIED',
    activation,
    preStateHash: ref.stateHash,
    postStateHash: ref.stateHash,
    storageWritten: true,
    details: {
      snapshotId,
      readableRecovery: true,
      projectTruthMutation: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, snapshotRef: ref, receipt, session: cloneJson(session) };
}

async function dispatchHistoryRestorePreview({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const snapshotId = normalizeString(payload.snapshotId);
  const snapshot = await maybeAwait(persistencePort.readRecoverySnapshot(session.projectId, snapshotId));
  if (!isPlainObject(snapshot) || !isPlainObject(snapshot.session)) {
    return {
      ok: false,
      error: typedError('E_STAGE10_HISTORY_SNAPSHOT_NOT_FOUND', commandId, 'HISTORY_SNAPSHOT_NOT_FOUND', { snapshotId }),
    };
  }
  const previewId = `history-restore-preview:${hashCanonicalValue({ opId, snapshotId }).slice(0, 24)}`;
  const currentStateHash = hashCoreState(session.coreState);
  const targetStateHash = hashCoreState(snapshot.session.coreState);
  session.historyRestorePreviews[previewId] = {
    previewId,
    snapshotId,
    currentStateHash,
    targetStateHash,
    requiresConfirmation: true,
    mutationApplied: false,
  };
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'PREVIEW_READY',
    activation,
    preStateHash: currentStateHash,
    postStateHash: currentStateHash,
    storageWritten: true,
    details: {
      previewId,
      snapshotId,
      requiresConfirmation: true,
      mutationApplied: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, preview: session.historyRestorePreviews[previewId], receipt, session: cloneJson(session) };
}

async function dispatchHistoryRestoreApply({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const previewId = normalizeString(payload.previewId);
  const preview = session.historyRestorePreviews[previewId];
  if (!preview || payload.confirmed !== true) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_HISTORY_RESTORE_CONFIRMATION_REQUIRED',
        commandId,
        'RESTORE_PREVIEW_CONFIRMATION_REQUIRED',
        { previewId },
      ),
    };
  }
  const currentStateHash = hashCoreState(session.coreState);
  if (currentStateHash !== preview.currentStateHash) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_HISTORY_RESTORE_REVISION_CONFLICT',
        commandId,
        'CURRENT_STATE_HASH_DRIFTED_AFTER_PREVIEW',
        { previewId, expected: preview.currentStateHash, actual: currentStateHash },
      ),
    };
  }
  const undoSnapshotId = `history-restore-undo-${hashCanonicalValue({ opId, currentStateHash }).slice(0, 16)}`;
  await writeRecoverySnapshot(session, persistencePort, undoSnapshotId, 'cmd.project.history.restoreApply.preimage');
  const targetSnapshot = await maybeAwait(persistencePort.readRecoverySnapshot(session.projectId, preview.snapshotId));
  const restoredSession = normalizeSession(targetSnapshot.session);
  session.historyRestoreUndoSnapshots[previewId] = { previewId, snapshotId: undoSnapshotId };
  session.coreState = cloneJson(restoredSession.coreState);
  session.eventLog = cloneJson(restoredSession.eventLog);
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'APPLIED',
    activation,
    preStateHash: currentStateHash,
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: {
      previewId,
      snapshotId: preview.snapshotId,
      undoSnapshotId,
      restoreApplied: true,
      authorDataLoss: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, receipt, session: cloneJson(session) };
}

async function dispatchHistoryRestoreUndo({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const previewId = normalizeString(payload.previewId);
  const undo = session.historyRestoreUndoSnapshots[previewId];
  if (!undo) {
    return {
      ok: false,
      error: typedError('E_STAGE10_HISTORY_UNDO_SNAPSHOT_NOT_FOUND', commandId, 'UNDO_SNAPSHOT_NOT_FOUND', { previewId }),
    };
  }
  const currentStateHash = hashCoreState(session.coreState);
  const undoSnapshot = await maybeAwait(persistencePort.readRecoverySnapshot(session.projectId, undo.snapshotId));
  const restoredSession = normalizeSession(undoSnapshot.session);
  session.coreState = cloneJson(restoredSession.coreState);
  session.eventLog = cloneJson(restoredSession.eventLog);
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'APPLIED',
    activation,
    preStateHash: currentStateHash,
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: {
      previewId,
      undoSnapshotId: undo.snapshotId,
      undoApplied: true,
      authorDataLoss: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, receipt, session: cloneJson(session) };
}

async function dispatchConflictPreview({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const report = buildLocalMultiSessionRecoveryReport({
    projectId: session.projectId,
    initialState: payload.initialState || session.coreState,
    reopenedState: payload.reopenedState || session.coreState,
    recoverySnapshots: session.recoverySnapshotRefs,
    sessions: payload.sessions,
  });
  const reportId = `conflict-report:${hashCanonicalValue(report).slice(0, 24)}`;
  session.conflictReports[reportId] = report;
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: report.ok ? 'PREVIEW_READY' : 'PREVIEW_DIAGNOSTICS',
    activation,
    preStateHash: hashCoreState(session.coreState),
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: {
      reportId,
      conflictCount: report.summary?.conflictCount || 0,
      automaticMerge: false,
      silentProjectRewrite: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, reportId, report, receipt, session: cloneJson(session) };
}

async function dispatchConflictDecision({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const reportId = normalizeString(payload.reportId);
  const conflictId = normalizeString(payload.conflictId);
  const report = session.conflictReports[reportId];
  const conflict = report?.conflicts?.find((item) => item.conflictId === conflictId);
  if (!conflict || normalizeString(payload.decision) === 'autoMerge') {
    return {
      ok: false,
      error: typedError('E_STAGE10_CONFLICT_MANUAL_DECISION_REQUIRED', commandId, 'MANUAL_CONFLICT_DECISION_REQUIRED', {
        reportId,
        conflictId,
      }),
    };
  }
  session.conflictDecisions[conflictId] = {
    conflictId,
    reportId,
    decision: normalizeString(payload.decision) || 'keepLocal',
    commandReceiptId: opId,
    manualDecision: true,
    automaticMerge: false,
    silentProjectRewrite: false,
    projectTruthMutation: false,
  };
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'APPLIED',
    activation,
    preStateHash: hashCoreState(session.coreState),
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: cloneJson(session.conflictDecisions[conflictId]),
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: true, decision: session.conflictDecisions[conflictId], receipt, session: cloneJson(session) };
}

async function dispatchExchangePrepare({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const events = session.eventLog.events.map((event, index) => ({
    opId: event.opId,
    actorId: event.actorId,
    sessionId: session.sessionId,
    seq: index + 1,
    ts: event.ts,
    commandId: event.commandId,
    payloadHash: event.payloadHash,
    domainEventDigest: event.domainEventDigest || '',
    domainEventCount: Array.isArray(event.domainEvents) ? event.domainEvents.length : 0,
    dependsOn: index === 0 ? [] : [session.eventLog.events[index - 1].opId],
  }));
  const packet = buildTransportNeutralExchangePacket({
    projectId: session.projectId,
    events,
    transportCapabilityEnabled: payload.transportCapabilityEnabled !== false,
    adapterKind: normalizeString(payload.adapterKind) || 'localFixture',
    networkAdapterEnabled: payload.networkAdapterEnabled === true,
  });
  const packetId = `exchange-packet:${hashCanonicalValue(packet).slice(0, 24)}`;
  if (!packet.ok) {
    return {
      ok: false,
      packetId,
      packet,
      error: typedError(
        'E_STAGE10_OPERATION_EXCHANGE_REJECTED',
        commandId,
        packet.reason || 'OPERATION_EXCHANGE_REJECTED',
        { networkAdapterEnabled: payload.networkAdapterEnabled === true },
      ),
    };
  }
  session.operationExchangePackets[packetId] = packet;
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'PREVIEW_READY',
    activation,
    preStateHash: hashCoreState(session.coreState),
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: {
      packetId,
      exchangeHash: packet.exchangeHash,
      entryCount: packet.entries.length,
      networkAdapterEnabled: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: packet.ok, packetId, packet, receipt, session: cloneJson(session) };
}

async function dispatchExchangePreview({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const packetId = normalizeString(payload.packetId) || Object.keys(session.operationExchangePackets).at(-1);
  const packet = session.operationExchangePackets[packetId];
  const report = buildLocalFixtureExchangeAdapterReport({
    packet,
    expectedExchangeHash: packet?.exchangeHash,
  });
  const reportId = `exchange-preview:${hashCanonicalValue(report).slice(0, 24)}`;
  session.operationExchangeAdapterPreviews[reportId] = report;
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: report.ok ? 'PREVIEW_READY' : 'PREVIEW_DIAGNOSTICS',
    activation,
    preStateHash: hashCoreState(session.coreState),
    postStateHash: hashCoreState(session.coreState),
    storageWritten: true,
    details: {
      reportId,
      packetId,
      appliedCount: report.summary?.appliedCount || 0,
      networkDispatch: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return { ok: report.ok, reportId, report, receipt, session: cloneJson(session) };
}

async function dispatchCollabApplyEventLog({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts }) {
  const preStateHash = hashCoreState(session.coreState);
  const domainEventPort = createCoreDomainEventProductPort();
  const report = applyEventLog({
    coreState: session.coreState,
    events: Array.isArray(payload.events) ? payload.events : [],
    initialStateHash: preStateHash,
    domainEventPort,
    hashState: (state) => hashCoreState(state),
    applyCommand: (state, command) => reduceCoreState(state, command),
  });
  const reportId = `collab-apply:${hashCanonicalValue({ opId, stateHash: report.stateHash }).slice(0, 24)}`;
  if (report.rejected.length > 0) {
    return {
      ok: false,
      report,
      error: typedError(
        'E_STAGE10_COLLAB_APPLY_REJECTED',
        commandId,
        'COLLAB_EVENT_LOG_APPLY_REJECTED',
        { reportId, rejectedCount: report.rejected.length },
      ),
    };
  }

  const provenance = appendEventLogEntry({
    eventLog: session.eventLog,
    entry: {
      opId,
      ts,
      actorId: session.actorId,
      commandId,
      payloadHash: hashCanonicalValue(Array.isArray(payload.events) ? payload.events : []),
      preStateHash,
      postStateHash: report.stateHash,
      domainEvents: report.domainEvents,
      domainEventDigest: report.domainEventDigest,
    },
    domainEventPort,
  });
  if (!provenance.ok) {
    return { ok: false, error: provenance.error };
  }
  session.coreState = cloneJson(report.nextState);
  session.eventLog = provenance.eventLog;
  session.collabApplyReports[reportId] = {
    schemaVersion: 'yalken.stage10.collabApply.reportRef.v1',
    reportId,
    appliedCount: report.appliedCount,
    rejectedCount: report.rejected.length,
    stateHash: report.stateHash,
    domainEventDigest: report.domainEventDigest,
    networkDispatch: false,
    secondJournal: false,
  };
  const receipt = createReceipt({
    session,
    commandId,
    opId,
    ts,
    status: 'APPLIED',
    activation,
    preStateHash,
    postStateHash: report.stateHash,
    storageWritten: true,
    details: {
      reportId,
      appliedCount: report.appliedCount,
      rejectedCount: report.rejected.length,
      domainEvents: report.domainEvents,
      domainEventDigest: report.domainEventDigest,
      projectTruthMutation: true,
      networkDispatch: false,
      secondJournal: false,
    },
  });
  await commitCommandState({ session, authorityState, persistencePort, receipt, reason: commandId });
  return {
    ok: true,
    reportId,
    report: cloneJson(session.collabApplyReports[reportId]),
    receipt,
    session: cloneJson(session),
  };
}

export function buildStage10ProductReadModels(sessionInput, capabilitySnapshot = {}, options = {}) {
  const session = normalizeSession(sessionInput);
  const authorityStore = options.authorityStore;
  const verified = validateCommandReceiptAuthorityStore(authorityStore, {
    projectId: session.projectId,
    eventLog: session.eventLog,
    sessionRef: session.commandReceiptAuthorityHeadRef,
    requireSessionRef: true,
  });
  if (!verified.ok) throw verified.error;
  const anchor = validateStage10IntegrityAnchor(options.integrityAnchor, {
    projectId: session.projectId,
    session,
    authorityStore: verified.store,
    previousAnchor: options.previousIntegrityAnchor,
  });
  if (!anchor.ok) throw anchor.error;
  const views = deriveViews(session, capabilitySnapshot, verified.store);
  const replay = buildOperationReplayReport({
    projectId: session.projectId,
    eventLog: session.eventLog,
    domainEventPort: createCoreDomainEventProductPort(),
    commandReceiptAuthorityPort: createCommandKernelReceiptAuthorityPort(verified.store, session),
    initialStateHash: session.eventLog.events[0]?.preStateHash || hashCoreState(createInitialCoreState()),
    expectedFinalStateHash: hashCoreState(session.coreState),
    requireCommandKernelReceipt: true,
    requireCapabilityRevalidation: true,
  });
  return {
    surface: buildSurface(session),
    comments: views.comments,
    history: views.history,
    historyPacket: views.historyPacket,
    replay,
  };
}

export async function createStage10ProductRuntime(input = {}) {
  const persistencePort = input.persistencePort;
  ensurePersistencePort(persistencePort);
  const capabilitySnapshot = isPlainObject(input.capabilitySnapshot) ? cloneJson(input.capabilitySnapshot) : {
    platformId: 'local',
    capabilities: { stage10LocalProductWiring: true },
  };
  const uiPort = isPlainObject(input.uiPort) ? input.uiPort : {};
  const now = typeof input.now === 'function' ? input.now : () => new Date().toISOString();
  const projectId = normalizeString(input.projectId);
  if (!projectId) {
    throw typedError('E_STAGE10_PROJECT_ID_REQUIRED', 'stage10.productWiring.createRuntime', 'PROJECT_ID_REQUIRED');
  }
  const persisted = await maybeAwait(persistencePort.readStage10State(projectId));
  let verifiedBundle;
  if (persisted) {
    verifiedBundle = validatePersistedBundle(persisted, projectId);
  } else {
    if (input.requireExistingState === true) {
      throw typedError('E_STAGE10_PERSISTED_BUNDLE_MISSING', 'stage10.productWiring.reopen', 'STAGE10_PERSISTED_BUNDLE_REQUIRED');
    }
    const initialSession = normalizeSession(createDefaultSession({ ...input, projectId }));
    const initialStore = createInitialCommandReceiptAuthorityStore({
      projectId,
      eventLog: initialSession.eventLog,
    });
    initialSession.commandReceiptAuthorityHeadRef = createCommandReceiptAuthorityHeadRef(initialStore.currentHead);
    const initialAnchor = createStage10IntegrityAnchor({
      projectId,
      session: initialSession,
      authorityStore: initialStore,
    });
    const committed = await maybeAwait(persistencePort.commitStage10State(
      projectId,
      {
        session: initialSession,
        authorityStore: initialStore,
        integrityAnchor: initialAnchor,
      },
      {
        reason: 'stage10.initial-state',
        expectedPreviousIntegrityAnchorDigest: '',
      },
    ));
    if (committed?.ok !== true || committed.storageWritten !== true || committed.readbackVerified !== true) {
      throw typedError('E_STAGE10_INITIAL_PERSISTENCE_FAILED', 'stage10.productWiring.createRuntime', 'STAGE10_INITIAL_PERSISTENCE_NOT_ACKNOWLEDGED');
    }
    verifiedBundle = validatePersistedBundle(committed.bundle, projectId);
  }
  let session = verifiedBundle.session;
  const authorityState = {
    store: verifiedBundle.authorityStore,
    integrityAnchor: verifiedBundle.integrityAnchor,
    previousIntegrityAnchor: verifiedBundle.previousIntegrityAnchor,
  };
  let transactionFailed = false;

  async function publishSurface() {
    const surface = buildSurface(session);
    if (typeof uiPort.publishSurface === 'function') await maybeAwait(uiPort.publishSurface(surface));
    return surface;
  }

  await publishSurface();

  async function dispatchVisibleCommand(commandIdInput, payloadInput = {}, activationInput = {}) {
    if (transactionFailed) {
      throw typedError('E_STAGE10_RUNTIME_REOPEN_REQUIRED', 'stage10.productWiring.dispatch', 'FAILED_TRANSACTION_REQUIRES_FRESH_REOPEN');
    }
    const commandId = normalizeString(commandIdInput);
    const activation = normalizeActivation(commandId, activationInput);
    const visible = assertVisibleCommand(commandId, activation);
    if (!visible.ok) return visible;
    const capability = assertCommandCapability(commandId, capabilitySnapshot);
    if (!capability.ok) return capability;
    if (!DEFAULT_STAGE10_COMMANDS.includes(commandId)) {
      return {
        ok: false,
        error: typedError('E_STAGE10_COMMAND_NOT_REGISTERED', commandId, 'COMMAND_NOT_REGISTERED'),
      };
    }

    const payload = isPlainObject(payloadInput) ? cloneJson(payloadInput) : {};
    const opId = normalizeString(payload.opId) || nextOpId(authorityState.store, commandId);
    const identityPreflight = preflightCommandReceiptIdentity({
      store: authorityState.store,
      projectId: session.projectId,
      eventLog: session.eventLog,
      operationId: opId,
      receiptId: opId,
    });
    if (!identityPreflight.ok) return identityPreflight;
    const ts = normalizeString(payload.ts) || now();
    const sessionBefore = cloneJson(session);
    const authorityBefore = authorityState.store;
    const anchorBefore = authorityState.integrityAnchor;
    const previousAnchorBefore = authorityState.previousIntegrityAnchor;
    session.uiEvents = [...session.uiEvents.slice(-63), {
      opId,
      commandId,
      activationMode: activation.mode,
      controlId: activation.controlId,
      visibleControl: activation.visibleControl,
      directBridge: false,
    }];

    let result;
    try {
      if (isCoreCommand(commandId)) {
        result = await dispatchCoreCommand({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.COMMENT_IMPORT_STABLE_PACKET) {
        result = await dispatchCommentImport({ session, persistencePort, authorityState, capabilitySnapshot, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.COMMENT_DECISION_RECORD) {
        result = await dispatchCommentDecision({ session, persistencePort, authorityState, capabilitySnapshot, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.HISTORY_CREATE_CHECKPOINT) {
        result = await dispatchHistoryCheckpoint({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_PREVIEW) {
        result = await dispatchHistoryRestorePreview({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_APPLY) {
        result = await dispatchHistoryRestoreApply({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.HISTORY_RESTORE_UNDO) {
        result = await dispatchHistoryRestoreUndo({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_PREVIEW) {
        result = await dispatchConflictPreview({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.CONFLICT_DECISION_RECORD) {
        result = await dispatchConflictDecision({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_PREPARE) {
        result = await dispatchExchangePrepare({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.OPERATION_EXCHANGE_LOCAL_FIXTURE_PREVIEW) {
        result = await dispatchExchangePreview({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      } else if (commandId === STAGE10_PRODUCT_COMMAND_IDS.COLLAB_EVENT_LOG_APPLY) {
        result = await dispatchCollabApplyEventLog({ session, persistencePort, authorityState, commandId, payload, activation, opId, ts });
      }
    } catch (error) {
      session = sessionBefore;
      authorityState.store = authorityBefore;
      authorityState.integrityAnchor = anchorBefore;
      authorityState.previousIntegrityAnchor = previousAnchorBefore;
      transactionFailed = true;
      throw error;
    }
    if (!result?.ok) {
      session = sessionBefore;
      authorityState.store = authorityBefore;
      authorityState.integrityAnchor = anchorBefore;
      authorityState.previousIntegrityAnchor = previousAnchorBefore;
      return result;
    }

    await publishSurface();
    return result;
  }

  return {
    dispatchVisibleCommand,
    getSession: () => cloneJson(session),
    getReadModels: () => buildStage10ProductReadModels(session, capabilitySnapshot, {
      authorityStore: authorityState.store,
      integrityAnchor: authorityState.integrityAnchor,
      previousIntegrityAnchor: authorityState.previousIntegrityAnchor,
    }),
    getCommandReceiptAuthorityHead: () => cloneJson(authorityState.store.currentHead),
    getIntegrityAnchor: () => cloneJson(authorityState.integrityAnchor),
    getVisibleSurface: () => buildSurface(session),
  };
}

export async function reopenStage10ProductRuntime(input = {}) {
  const projectId = normalizeString(input.projectId);
  return createStage10ProductRuntime({
    ...input,
    projectId,
    requireExistingState: true,
  });
}
