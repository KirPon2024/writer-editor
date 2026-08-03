import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';
import { hashCoreState } from '../core/runtime.mjs';
import {
  COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
  hashEventLog,
} from '../collab/eventLog.mjs';
import {
  STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
  STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA,
  authorityHeadDigest,
  receiptRootDigest,
} from './stage10CommandReceiptAuthorityHead.mjs';

export const STAGE10_RECOVERY_SNAPSHOT_SCHEMA = 'yalken.stage10.recoverySnapshot.v2';
export const STAGE10_RECOVERY_PROVENANCE_SCHEMA = 'yalken.stage10.recoveryProvenance.v1';
const STAGE10_RECOVERY_AUTHORITY_BINDING_SCHEMA = 'yalken.stage10.recoveryAuthorityBinding.v1';
const STAGE10_RECOVERY_SNAPSHOT_PROVENANCE_SCHEMA = 'yalken.stage10.recoverySnapshotProvenance.v1';
const STAGE10_RECOVERY_PROVENANCE_KINDS = new Set([
  'CANONICAL_PROJECT_TRUTH_COMPENSATION',
  'HISTORY_RESTORE_COMPENSATION',
  'HISTORY_RESTORE_UNDO_COMPENSATION',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : -1;
}

function normalizeRevisionIdentity(value) {
  const normalized = Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : normalizeString(value);
  return normalized.length <= 256 && !/[\u0000-\u001F\u007F]/u.test(normalized) ? normalized : '';
}

function isDigest(value) {
  return /^(?:sha256:)?[a-f0-9]{64}$/u.test(normalizeString(value));
}

function isCanonicalUtcTimestamp(value) {
  const normalized = normalizeString(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(normalized)) return false;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalized;
}

function typedError(code, reason, details = {}) {
  return {
    code,
    op: 'stage10.recovery',
    reason,
    details: isPlainObject(details) ? cloneJson(details) : {},
  };
}

function fail(code, reason, details) {
  return { ok: false, error: typedError(code, reason, details) };
}

function withoutDigest(value, digestField) {
  const next = cloneJson(value);
  delete next[digestField];
  return next;
}

function eventLogIsPrefix(prefixInput, completeInput) {
  const prefix = Array.isArray(prefixInput?.events) ? prefixInput.events : null;
  const complete = Array.isArray(completeInput?.events) ? completeInput.events : null;
  if (!prefix || !complete || prefix.length > complete.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (hashCanonicalValue(prefix[index]) !== hashCanonicalValue(complete[index])) return false;
  }
  return true;
}

function snapshotAuthority(authorityStore) {
  const head = isPlainObject(authorityStore?.currentHead) ? authorityStore.currentHead : {};
  return {
    schemaVersion: STAGE10_RECOVERY_AUTHORITY_BINDING_SCHEMA,
    authorityHeadDigest: normalizeString(head.authorityHeadDigest),
    authorityGeneration: nonNegativeInteger(head.authorityGeneration),
    receiptCount: nonNegativeInteger(head.receiptCount),
    eventLogDigest: normalizeString(head.eventLogDigest),
  };
}

function recoveryProvenanceForSnapshot({ session, authorityStore, integrityAnchor }) {
  const eventLogDigest = hashEventLog(session.eventLog);
  const stateHash = hashCoreState(session.coreState);
  const authority = snapshotAuthority(authorityStore);
  const provenance = {
    schemaVersion: STAGE10_RECOVERY_SNAPSHOT_PROVENANCE_SCHEMA,
    projectId: normalizeString(session.projectId),
    lifecycleId: normalizeString(session.lifecycleId),
    sessionSchemaVersion: normalizeString(session.schemaVersion),
    eventLogDigest,
    stateHash,
    authorityHeadDigest: authority.authorityHeadDigest,
    integrityAnchorDigest: normalizeString(integrityAnchor?.integrityAnchorDigest),
    immutable: true,
  };
  return {
    ...provenance,
    provenanceDigest: hashCanonicalValue(provenance),
  };
}

export function createStage10RecoverySnapshot(input = {}) {
  const session = isPlainObject(input.session) ? cloneJson(input.session) : null;
  if (!session || !normalizeString(session.projectId) || !normalizeString(session.lifecycleId)) {
    throw typedError('E_STAGE10_RECOVERY_SESSION_INVALID', 'RECOVERY_SESSION_PROJECT_LIFECYCLE_REQUIRED');
  }
  const currentRevision = Array.isArray(session.eventLog?.events) ? session.eventLog.events.length : -1;
  if (currentRevision < 0) {
    throw typedError('E_STAGE10_RECOVERY_SESSION_INVALID', 'RECOVERY_SESSION_EVENT_LOG_REQUIRED');
  }
  const snapshot = {
    schemaVersion: STAGE10_RECOVERY_SNAPSHOT_SCHEMA,
    snapshotId: normalizeString(input.snapshotId),
    snapshotKind: normalizeString(input.snapshotKind) || 'CHECKPOINT',
    reason: normalizeString(input.reason),
    projectId: normalizeString(session.projectId),
    lifecycleId: normalizeString(session.lifecycleId),
    currentRevision,
    priorRevision: currentRevision > 0 ? currentRevision - 1 : 0,
    createdAtUtc: normalizeString(input.createdAtUtc),
    authority: snapshotAuthority(input.authorityStore),
    provenance: recoveryProvenanceForSnapshot({
      session,
      authorityStore: input.authorityStore,
      integrityAnchor: input.integrityAnchor,
    }),
    session,
  };
  if (!snapshot.snapshotId || !isCanonicalUtcTimestamp(snapshot.createdAtUtc)) {
    throw typedError('E_STAGE10_RECOVERY_IDENTITY_INVALID', 'RECOVERY_SNAPSHOT_ID_AND_TIME_REQUIRED');
  }
  return Object.freeze({
    ...snapshot,
    snapshotDigest: hashCanonicalValue(snapshot),
  });
}

export function validateStage10RecoverySnapshot(snapshotInput, options = {}) {
  if (!isPlainObject(snapshotInput)) {
    return fail('E_STAGE10_RECOVERY_SNAPSHOT_MALFORMED', 'RECOVERY_SNAPSHOT_OBJECT_REQUIRED');
  }
  const snapshot = cloneJson(snapshotInput);
  if (snapshot.schemaVersion !== STAGE10_RECOVERY_SNAPSHOT_SCHEMA) {
    return fail(
      'E_STAGE10_RECOVERY_SCHEMA_UNSUPPORTED',
      'RECOVERY_SNAPSHOT_SCHEMA_UNSUPPORTED',
      { schemaVersion: normalizeString(snapshot.schemaVersion) },
    );
  }
  const projectId = normalizeString(options.projectId) || normalizeString(snapshot.projectId);
  const lifecycleId = normalizeString(options.lifecycleId) || normalizeString(snapshot.lifecycleId);
  if (!projectId || normalizeString(snapshot.projectId) !== projectId) {
    return fail('E_STAGE10_RECOVERY_PROJECT_MISMATCH', 'RECOVERY_SNAPSHOT_PROJECT_MISMATCH');
  }
  if (!lifecycleId || normalizeString(snapshot.lifecycleId) !== lifecycleId) {
    return fail('E_STAGE10_RECOVERY_LIFECYCLE_MISMATCH', 'RECOVERY_SNAPSHOT_LIFECYCLE_MISMATCH');
  }
  if (
    !normalizeString(snapshot.snapshotId)
    || snapshot.snapshotKind !== 'CHECKPOINT'
    || !isCanonicalUtcTimestamp(snapshot.createdAtUtc)
  ) {
    return fail('E_STAGE10_RECOVERY_IDENTITY_INVALID', 'RECOVERY_SNAPSHOT_ID_AND_TIME_REQUIRED');
  }
  const currentRevision = nonNegativeInteger(snapshot.currentRevision);
  const priorRevision = nonNegativeInteger(snapshot.priorRevision);
  if (currentRevision < 0 || priorRevision !== (currentRevision > 0 ? currentRevision - 1 : 0)) {
    return fail('E_STAGE10_RECOVERY_REVISION_INVALID', 'RECOVERY_SNAPSHOT_REVISION_CHAIN_INVALID');
  }
  if (!isPlainObject(snapshot.session) || !isPlainObject(snapshot.authority) || !isPlainObject(snapshot.provenance)) {
    return fail('E_STAGE10_RECOVERY_SNAPSHOT_MALFORMED', 'RECOVERY_SNAPSHOT_BINDINGS_REQUIRED');
  }
  if (
    normalizeString(snapshot.session.projectId) !== projectId
    || normalizeString(snapshot.session.lifecycleId) !== lifecycleId
    || !Array.isArray(snapshot.session.eventLog?.events)
    || snapshot.session.eventLog.events.length !== currentRevision
  ) {
    return fail('E_STAGE10_RECOVERY_SESSION_BINDING_INVALID', 'RECOVERY_SNAPSHOT_SESSION_BINDING_INVALID');
  }
  const sessionHeadRef = snapshot.session.commandReceiptAuthorityHeadRef;
  if (
    !isPlainObject(sessionHeadRef)
    || snapshot.authority.schemaVersion !== STAGE10_RECOVERY_AUTHORITY_BINDING_SCHEMA
    || sessionHeadRef.schemaVersion !== STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA
    || sessionHeadRef.authorityKind !== COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND
    || sessionHeadRef.authorityVersion !== 2
    || normalizeString(sessionHeadRef.projectId) !== projectId
    || !isDigest(sessionHeadRef.receiptRootDigest)
    || !isDigest(sessionHeadRef.eventLogDigest)
    || !isDigest(sessionHeadRef.authorityHeadDigest)
    || normalizeString(snapshot.authority.authorityHeadDigest) !== normalizeString(sessionHeadRef.authorityHeadDigest)
    || nonNegativeInteger(snapshot.authority.authorityGeneration) !== nonNegativeInteger(sessionHeadRef.authorityGeneration)
    || nonNegativeInteger(snapshot.authority.receiptCount) !== nonNegativeInteger(sessionHeadRef.receiptCount)
    || normalizeString(snapshot.authority.eventLogDigest) !== hashEventLog(snapshot.session.eventLog)
    || normalizeString(sessionHeadRef.authorityHeadDigest) !== authorityHeadDigest({
      ...sessionHeadRef,
      schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
    })
  ) {
    return fail('E_STAGE10_RECOVERY_AUTHORITY_BINDING_INVALID', 'RECOVERY_SNAPSHOT_AUTHORITY_BINDING_INVALID');
  }
  const provenance = snapshot.provenance;
  if (
    provenance.schemaVersion !== STAGE10_RECOVERY_SNAPSHOT_PROVENANCE_SCHEMA
    || normalizeString(provenance.projectId) !== projectId
    || normalizeString(provenance.lifecycleId) !== lifecycleId
    || normalizeString(provenance.sessionSchemaVersion) !== normalizeString(snapshot.session.schemaVersion)
    || normalizeString(provenance.eventLogDigest) !== hashEventLog(snapshot.session.eventLog)
    || normalizeString(provenance.stateHash) !== hashCoreState(snapshot.session.coreState)
    || normalizeString(provenance.authorityHeadDigest) !== normalizeString(snapshot.authority.authorityHeadDigest)
    || !isDigest(provenance.integrityAnchorDigest)
    || provenance.immutable !== true
    || normalizeString(provenance.provenanceDigest) !== hashCanonicalValue(withoutDigest(provenance, 'provenanceDigest'))
  ) {
    return fail('E_STAGE10_RECOVERY_PROVENANCE_INVALID', 'RECOVERY_SNAPSHOT_PROVENANCE_INVALID');
  }
  if (normalizeString(snapshot.snapshotDigest) !== hashCanonicalValue(withoutDigest(snapshot, 'snapshotDigest'))) {
    return fail('E_STAGE10_RECOVERY_DIGEST_INVALID', 'RECOVERY_SNAPSHOT_DIGEST_INVALID');
  }

  const currentSession = isPlainObject(options.currentSession) ? options.currentSession : null;
  const currentAuthorityStore = isPlainObject(options.currentAuthorityStore) ? options.currentAuthorityStore : null;
  const currentIntegrityAnchor = isPlainObject(options.currentIntegrityAnchor) ? options.currentIntegrityAnchor : null;
  if (
    options.requireCurrent === true
    && (!currentSession || !currentAuthorityStore || !currentIntegrityAnchor)
  ) {
    return fail('E_STAGE10_RECOVERY_CURRENT_BINDINGS_REQUIRED', 'RECOVERY_CURRENT_BINDINGS_REQUIRED');
  }
  if (currentSession) {
    const liveRevision = Array.isArray(currentSession.eventLog?.events) ? currentSession.eventLog.events.length : -1;
    if (
      normalizeString(currentSession.projectId) !== projectId
      || normalizeString(currentSession.lifecycleId) !== lifecycleId
      || liveRevision < 0
    ) {
      return fail('E_STAGE10_RECOVERY_CURRENT_SESSION_INVALID', 'RECOVERY_CURRENT_SESSION_INVALID');
    }
    if (currentRevision > liveRevision) {
      return fail('E_STAGE10_RECOVERY_ROLLBACK_OR_FUTURE', 'RECOVERY_SNAPSHOT_REVISION_AHEAD_OF_CURRENT');
    }
    if (options.requireCurrent === true && currentRevision !== liveRevision) {
      return fail('E_STAGE10_RECOVERY_STALE', 'RECOVERY_SNAPSHOT_STALE_FOR_WRITE');
    }
    if (!eventLogIsPrefix(snapshot.session.eventLog, currentSession.eventLog)) {
      return fail('E_STAGE10_RECOVERY_FORKED', 'RECOVERY_SNAPSHOT_EVENT_ANCESTRY_INVALID');
    }
  }

  if (currentAuthorityStore) {
    const live = snapshotAuthority(currentAuthorityStore);
    const liveReceipts = Array.isArray(currentAuthorityStore.receipts) ? currentAuthorityStore.receipts : [];
    const snapshotReceiptCount = nonNegativeInteger(snapshot.authority.receiptCount);
    const expectedSnapshotReceiptRoot = snapshotReceiptCount <= liveReceipts.length
      ? receiptRootDigest(liveReceipts.slice(0, snapshotReceiptCount))
      : '';
    if (
      normalizeString(currentAuthorityStore.projectId) !== projectId
      || snapshotReceiptCount > liveReceipts.length
      || normalizeString(sessionHeadRef.receiptRootDigest) !== expectedSnapshotReceiptRoot
    ) {
      return fail('E_STAGE10_RECOVERY_AUTHORITY_ANCESTRY_INVALID', 'RECOVERY_SNAPSHOT_AUTHORITY_ANCESTRY_INVALID');
    }
    if (
      nonNegativeInteger(snapshot.authority.authorityGeneration) > live.authorityGeneration
      || nonNegativeInteger(snapshot.authority.receiptCount) > live.receiptCount
    ) {
      return fail('E_STAGE10_RECOVERY_AUTHORITY_ROLLBACK', 'RECOVERY_SNAPSHOT_AUTHORITY_AHEAD_OF_CURRENT');
    }
    if (
      options.requireCurrent === true
      && (
        normalizeString(snapshot.authority.authorityHeadDigest) !== live.authorityHeadDigest
        || nonNegativeInteger(snapshot.authority.authorityGeneration) !== live.authorityGeneration
        || nonNegativeInteger(snapshot.authority.receiptCount) !== live.receiptCount
      )
    ) {
      return fail('E_STAGE10_RECOVERY_AUTHORITY_STALE', 'RECOVERY_SNAPSHOT_AUTHORITY_STALE_FOR_WRITE');
    }
  }

  if (
    options.requireCurrent === true
    && (
      !isDigest(currentIntegrityAnchor.integrityAnchorDigest)
      || normalizeString(provenance.integrityAnchorDigest) !== normalizeString(currentIntegrityAnchor.integrityAnchorDigest)
    )
  ) {
    return fail('E_STAGE10_RECOVERY_INTEGRITY_ANCHOR_STALE', 'RECOVERY_SNAPSHOT_INTEGRITY_ANCHOR_STALE_FOR_WRITE');
  }

  return { ok: true, snapshot: Object.freeze(snapshot) };
}

export function createStage10RecoveryProvenance(input = {}) {
  const projectId = normalizeString(input.projectId);
  const lifecycleId = normalizeString(input.lifecycleId);
  const coreState = isPlainObject(input.coreState) ? cloneJson(input.coreState) : null;
  const currentRevision = nonNegativeInteger(input.currentRevision);
  const authorityHeadDigest = normalizeString(input.authorityHeadDigest);
  const sourceHash = normalizeString(input.sourceHash);
  const sourceRevision = normalizeRevisionIdentity(input.sourceRevision);
  const provenanceKind = normalizeString(input.provenanceKind) || 'CANONICAL_PROJECT_TRUTH_COMPENSATION';
  if (
    !projectId
    || !lifecycleId
    || !coreState
    || currentRevision < 0
    || !isDigest(authorityHeadDigest)
    || !isDigest(sourceHash)
    || !sourceRevision
    || !STAGE10_RECOVERY_PROVENANCE_KINDS.has(provenanceKind)
  ) {
    throw typedError('E_STAGE10_RECOVERY_PROVENANCE_INPUT_INVALID', 'RECOVERY_PROVENANCE_BINDINGS_REQUIRED');
  }
  const provenance = {
    schemaVersion: STAGE10_RECOVERY_PROVENANCE_SCHEMA,
    provenanceKind,
    projectId,
    lifecycleId,
    currentRevision,
    priorRevision: currentRevision > 0 ? currentRevision - 1 : 0,
    authorityHeadDigest,
    sourceRevision,
    sourceHash,
    stateHash: hashCoreState(coreState),
    coreState,
    immutable: true,
  };
  return Object.freeze({
    ...provenance,
    provenanceDigest: hashCanonicalValue(provenance),
  });
}

export function validateStage10RecoveryProvenance(provenanceInput, options = {}) {
  if (!isPlainObject(provenanceInput)) {
    return fail('E_STAGE10_RECOVERY_PROVENANCE_MALFORMED', 'RECOVERY_PROVENANCE_OBJECT_REQUIRED');
  }
  const provenance = cloneJson(provenanceInput);
  if (provenance.schemaVersion !== STAGE10_RECOVERY_PROVENANCE_SCHEMA) {
    return fail('E_STAGE10_RECOVERY_PROVENANCE_SCHEMA_UNSUPPORTED', 'RECOVERY_PROVENANCE_SCHEMA_UNSUPPORTED');
  }
  const projectId = normalizeString(options.projectId) || normalizeString(provenance.projectId);
  const lifecycleId = normalizeString(options.lifecycleId) || normalizeString(provenance.lifecycleId);
  const currentRevision = nonNegativeInteger(provenance.currentRevision);
  if (
    !projectId
    || !lifecycleId
    || normalizeString(provenance.projectId) !== projectId
    || normalizeString(provenance.lifecycleId) !== lifecycleId
    || currentRevision < 0
    || nonNegativeInteger(provenance.priorRevision) !== (currentRevision > 0 ? currentRevision - 1 : 0)
    || !STAGE10_RECOVERY_PROVENANCE_KINDS.has(normalizeString(provenance.provenanceKind))
    || !isDigest(provenance.authorityHeadDigest)
    || !isDigest(provenance.sourceHash)
    || !normalizeRevisionIdentity(provenance.sourceRevision)
    || !isPlainObject(provenance.coreState)
    || normalizeString(provenance.stateHash) !== hashCoreState(provenance.coreState)
    || provenance.immutable !== true
    || normalizeString(provenance.provenanceDigest) !== hashCanonicalValue(withoutDigest(provenance, 'provenanceDigest'))
  ) {
    return fail('E_STAGE10_RECOVERY_PROVENANCE_INVALID', 'RECOVERY_PROVENANCE_BINDING_INVALID');
  }
  if (Number.isSafeInteger(options.currentRevision) && currentRevision !== options.currentRevision) {
    return fail('E_STAGE10_RECOVERY_PROVENANCE_STALE', 'RECOVERY_PROVENANCE_REVISION_STALE');
  }
  if (
    normalizeString(options.authorityHeadDigest)
    && normalizeString(options.authorityHeadDigest) !== normalizeString(provenance.authorityHeadDigest)
  ) {
    return fail('E_STAGE10_RECOVERY_PROVENANCE_AUTHORITY_MISMATCH', 'RECOVERY_PROVENANCE_AUTHORITY_MISMATCH');
  }
  return { ok: true, provenance: Object.freeze(provenance) };
}
