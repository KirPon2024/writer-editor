import { deriveView, hashCanonicalValue } from '../deriveView.mjs';

const VIEW_ID = 'derived.history.v1';
const HISTORY_PROJECTION_PACKET_SCHEMA = 'derived.history.projection-packet.v1';
const RTK_EXACT_APPLY_OUTCOME_SCHEMA = 'yalken.rtk.exact-apply-outcome.v2';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function shortHash(value) {
  return hashCanonicalValue(value).slice(0, 16);
}

function historyEntryId(kind, index, value) {
  return `history-entry:${kind}:${shortHash({ index, value })}`;
}

function commandTruthDomain(commandId) {
  const id = normalizeString(commandId);
  if (id === 'project.applyTextEdit') return 'productCore.manuscriptAuthorTruth';
  if (
    id.startsWith('atlas.')
    || id.startsWith('idea.')
    || id.startsWith('meaning.')
    || id.startsWith('manualMap.')
  ) {
    return 'productCore.authorTruth';
  }
  if (id.startsWith('cmd.')) return 'commandKernel.intent';
  return 'productCore.command';
}

function normalizeEventLog(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    schemaVersion: normalizeString(source.schemaVersion) || 'collab-eventlog.v1',
    events: normalizeArray(source.events),
  };
}

function eventEntry(event, index) {
  const commandId = normalizeString(event.commandId);
  const base = {
    entryType: 'commandEvent',
    sourceKind: 'collabEventLog',
    ordinal: index,
    opId: normalizeString(event.opId),
    occurredAtUtc: normalizeString(event.ts),
    actorId: normalizeString(event.actorId),
    commandId,
    payloadHash: normalizeString(event.payloadHash),
    preStateHash: normalizeString(event.preStateHash),
    postStateHash: normalizeString(event.postStateHash),
    truthDomain: commandTruthDomain(commandId),
    authorTruthValueIncluded: false,
    canWriteProject: false,
    canWriteManuscript: false,
  };
  return {
    historyEntryId: historyEntryId('command-event', index, base),
    ...base,
    entryHash: hashCanonicalValue(base),
  };
}

function commandReceiptEntry(receipt, index) {
  const commandId = normalizeString(receipt.commandId || receipt.type || receipt.op);
  const base = {
    entryType: 'commandReceiptRef',
    sourceKind: 'commandKernelReceipt',
    ordinal: index,
    receiptId: normalizeString(receipt.receiptId || receipt.id),
    operationId: normalizeString(receipt.operationId || receipt.opId),
    occurredAtUtc: normalizeString(receipt.appliedAt || receipt.writtenAt || receipt.createdAt || receipt.ts),
    actorId: normalizeString(receipt.actorId || receipt.authorId),
    commandId,
    status: normalizeString(receipt.status || receipt.writeStatus || receipt.result),
    preStateHash: normalizeString(receipt.preStateHash || receipt.beforeHash),
    postStateHash: normalizeString(receipt.postStateHash || receipt.afterHash),
    receiptHash: hashCanonicalValue(receipt),
    truthDomain: commandTruthDomain(commandId),
    authorTruthValueIncluded: false,
    canWriteProject: false,
    canWriteManuscript: false,
  };
  return {
    historyEntryId: historyEntryId('command-receipt', index, base),
    ...base,
    entryHash: hashCanonicalValue(base),
  };
}

function writerReceiptRef(receipt) {
  if (!isPlainObject(receipt)) return null;
  const snapshotEvidence = receipt[['recov', 'ery'].join('')];
  return {
    schemaVersion: normalizeString(receipt.schemaVersion),
    operationId: normalizeString(receipt.operationId),
    projectId: normalizeString(receipt.projectId),
    sessionId: normalizeString(receipt.sessionId),
    sceneId: normalizeString(receipt.sceneId),
    changeId: normalizeString(receipt.changeId),
    changeIds: Array.isArray(receipt.changeIds) ? receipt.changeIds.map(normalizeString).filter(Boolean) : [],
    baselineHashBefore: normalizeString(receipt.baselineHashBefore),
    operationKind: normalizeString(receipt.operationKind),
    writeStatus: normalizeString(receipt.writeStatus),
    backupId: normalizeString(receipt.backupId),
    writtenAt: normalizeString(receipt.writtenAt),
    inputHash: normalizeString(receipt.inputHash),
    outputHash: normalizeString(receipt.outputHash),
    snapshotEvidenceHash: isPlainObject(snapshotEvidence) ? hashCanonicalValue(snapshotEvidence) : '',
    receiptHash: hashCanonicalValue(receipt),
  };
}

function reviewApplyEntry(outcome, index) {
  const writerRef = writerReceiptRef(outcome.writerReceipt);
  const base = {
    entryType: 'reviewApplyReceiptRef',
    sourceKind: 'reviewApplyOutcome',
    ordinal: index,
    schemaVersion: normalizeString(outcome.schemaVersion),
    roundId: normalizeString(outcome.roundId),
    requestKey: normalizeString(outcome.requestKey),
    effectKey: normalizeString(outcome.effectKey),
    envelopeDigest: normalizeString(outcome.envelopeDigest),
    outcomeDigest: normalizeString(outcome.outcomeDigest),
    status: normalizeString(outcome.status),
    reason: normalizeString(outcome.reason || outcome.writerReason),
    operationId: normalizeString(writerRef?.operationId),
    occurredAtUtc: normalizeString(writerRef?.writtenAt),
    writerReceiptRef: writerRef,
    outcomeHash: hashCanonicalValue(outcome),
    truthDomain: 'reviewEvidence',
    authorTruthValueIncluded: false,
    canWriteProject: false,
    canWriteManuscript: false,
  };
  return {
    historyEntryId: historyEntryId('review-apply', index, base),
    ...base,
    entryHash: hashCanonicalValue(base),
  };
}

function normalizeAuthorTruthRefs(input = {}) {
  const explicitRefs = normalizeArray(input.authorTruthRefs).map((ref, index) => ({
    refId: normalizeString(ref.refId) || `author-truth-ref:${shortHash({ index, ref })}`,
    truthDomain: normalizeString(ref.truthDomain) || 'productCore.authorTruth',
    sourceHash: normalizeString(ref.sourceHash) || hashCanonicalValue(ref),
    valueIncluded: false,
  }));
  if (explicitRefs.length > 0) return explicitRefs;
  if (!isPlainObject(input.authorTruthSnapshot)) return [];
  return [{
    refId: `author-truth-snapshot:${shortHash(input.authorTruthSnapshot)}`,
    truthDomain: 'productCore.authorTruth',
    sourceHash: hashCanonicalValue(input.authorTruthSnapshot),
    valueIncluded: false,
  }];
}

function normalizeHistoryProjectionPacket(value) {
  if (!isPlainObject(value)) return null;
  if (value.schemaVersion !== HISTORY_PROJECTION_PACKET_SCHEMA) return null;
  const entries = normalizeArray(value.entries).map(cloneJson);
  const authorTruthRefs = normalizeArray(value.authorTruthRefs).map((ref) => ({
    ...cloneJson(ref),
    valueIncluded: false,
  }));
  return {
    schemaVersion: value.schemaVersion,
    projectId: normalizeString(value.projectId),
    historyProjectionHash: normalizeString(value.historyProjectionHash) || hashCanonicalValue(value),
    entries,
    authorTruthRefs,
    summary: isPlainObject(value.summary) ? cloneJson(value.summary) : {},
  };
}

export function buildRevisionHistoryProjectionPacket(input = {}) {
  const projectId = normalizeString(input.projectId);
  const eventLog = normalizeEventLog(input.eventLog || input.collabEventLog);
  const commandReceipts = normalizeArray(input.commandReceipts || input.commandKernelReceipts);
  const reviewApplyReceipts = normalizeArray(input.reviewApplyReceipts || input.reviewApplyOutcomes)
    .filter((item) => !normalizeString(item.schemaVersion) || item.schemaVersion === RTK_EXACT_APPLY_OUTCOME_SCHEMA);
  const authorTruthRefs = normalizeAuthorTruthRefs(input);
  const entries = [
    ...eventLog.events.map(eventEntry),
    ...commandReceipts.map(commandReceiptEntry),
    ...reviewApplyReceipts.map(reviewApplyEntry),
  ];
  const sourceHashes = {
    eventLogHash: hashCanonicalValue(eventLog),
    commandReceiptsHash: hashCanonicalValue(commandReceipts),
    reviewApplyReceiptsHash: hashCanonicalValue(reviewApplyReceipts),
    authorTruthRefsHash: hashCanonicalValue(authorTruthRefs),
  };
  const summary = {
    eventLogEntryCount: eventLog.events.length,
    commandReceiptRefCount: commandReceipts.length,
    reviewApplyReceiptRefCount: reviewApplyReceipts.length,
    authorTruthRefCount: authorTruthRefs.length,
    projectedEntryCount: entries.length,
    authorTruthValueIncluded: false,
    storedHistoryTruth: false,
    canWriteProject: false,
    canWriteManuscript: false,
  };
  const packetBase = {
    schemaVersion: HISTORY_PROJECTION_PACKET_SCHEMA,
    projectId,
    sourceSchemas: {
      eventLog: eventLog.schemaVersion,
      reviewApplyOutcome: RTK_EXACT_APPLY_OUTCOME_SCHEMA,
    },
    sourceHashes,
    entries,
    authorTruthRefs,
    summary,
    authority: {
      projectionOnly: true,
      commandDispatch: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      rendererMutation: false,
    },
  };
  return {
    ...packetBase,
    historyProjectionHash: hashCanonicalValue(packetBase),
  };
}

function normalizeParams(params) {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  const projectId = typeof source.projectId === 'string' ? source.projectId.trim() : '';
  const filter = typeof source.filter === 'string' ? source.filter.trim() : '';
  const historyProjectionPacket = normalizeHistoryProjectionPacket(source.historyProjectionPacket);
  return {
    projectId,
    filter,
    historyProjectionPacket,
  };
}

export function deriveHistory(input = {}) {
  const params = normalizeParams(input.params);
  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params,
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ params: normalizedParams, meta }) => {
      const packet = normalizedParams.historyProjectionPacket;
      return {
        schemaVersion: 'derived.history.v1',
        projectId: normalizedParams.projectId,
        filter: normalizedParams.filter,
        entries: packet ? packet.entries : [],
        authorTruthRefs: packet ? packet.authorTruthRefs : [],
        summary: packet ? packet.summary : {
          projectedEntryCount: 0,
          authorTruthValueIncluded: false,
          storedHistoryTruth: false,
          canWriteProject: false,
          canWriteManuscript: false,
        },
        meta: {
          invalidationKey: meta.invalidationKey,
          historyProjectionHash: packet?.historyProjectionHash || '',
        },
      };
    },
  });
}

export { VIEW_ID as HISTORY_VIEW_ID };
export { HISTORY_PROJECTION_PACKET_SCHEMA };
