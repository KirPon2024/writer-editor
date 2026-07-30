import { createHash } from 'node:crypto';
import { createConflictEnvelope } from './conflictEnvelope.mjs';

const ACTOR_IDENTITY_SCHEMA_VERSION = 'collab-actor-identity.v1';
const CAUSAL_ORDERING_REPORT_SCHEMA_VERSION = 'collab-causal-ordering.report.v1';
const OFFLINE_QUEUE_PACKET_SCHEMA_VERSION = 'collab-offline-queue.packet.v1';
const LOCAL_MULTI_SESSION_RECOVERY_REPORT_SCHEMA_VERSION = 'collab-local-multi-session-recovery.report.v1';
const TRANSPORT_NEUTRAL_EXCHANGE_PACKET_SCHEMA_VERSION = 'collab-transport-neutral-operation-exchange.packet.v1';
const LOCAL_FIXTURE_EXCHANGE_ADAPTER_REPORT_SCHEMA_VERSION = 'collab-local-fixture-exchange-adapter.report.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalSerialize(value) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (valueType === 'boolean') return value ? 'true' : 'false';
  if (valueType === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  if (valueType === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`).join(',')}}`;
  }
  return 'null';
}

function hashCanonical(value) {
  return createHash('sha256').update(Buffer.from(canonicalSerialize(value), 'utf8')).digest('hex');
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSeq(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function normalizeDependencies(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))].sort();
}

function normalizeOptionalPayloadHash(event) {
  const explicit = normalizeString(event.payloadHash);
  if (explicit) return explicit;
  return `sha256:${hashCanonical({
    commandId: event.commandId,
    content: event.content,
    payload: isPlainObject(event.payload) || Array.isArray(event.payload) ? event.payload : null,
  })}`;
}

function actorError(reason, details = {}) {
  return createConflictEnvelope({
    code: 'E_COLLAB_ACTOR_IDENTITY_INVALID',
    op: 'collab.actorIdentity',
    reason,
    details,
  });
}

function causalError(code, reason, event = {}) {
  return createConflictEnvelope({
    code,
    op: 'collab.causalOrdering',
    reason,
    details: {
      opId: event.opId,
      authorId: event.actorId || event.authorId,
      ts: event.ts,
      commandId: event.commandId,
    },
  });
}

function offlineQueueError(code, reason, event = {}) {
  return createConflictEnvelope({
    code,
    op: 'collab.offlineQueue',
    reason,
    details: {
      opId: event.opId,
      authorId: event.actorId || event.authorId,
      ts: event.ts,
      commandId: event.commandId,
    },
  });
}

function transportExchangeError(code, reason, details = {}) {
  return createConflictEnvelope({
    code,
    op: 'collab.transportNeutralExchange',
    reason,
    details,
  });
}

function normalizeEvent(event) {
  const src = isPlainObject(event) ? event : {};
  return {
    opId: typeof src.opId === 'string' ? src.opId.trim() : '',
    authorId: typeof src.authorId === 'string' ? src.authorId.trim() : '',
    ts: typeof src.ts === 'string' ? src.ts.trim() : '',
    commandId: typeof src.commandId === 'string' ? src.commandId.trim() : '',
    baseVersion: Number.isInteger(src.baseVersion) ? src.baseVersion : null,
    nextVersion: Number.isInteger(src.nextVersion) ? src.nextVersion : null,
    content: typeof src.content === 'string' ? src.content : '',
  };
}

function normalizeState(state) {
  const src = isPlainObject(state) ? state : {};
  return {
    version: Number.isInteger(src.version) ? src.version : 0,
    content: typeof src.content === 'string' ? src.content : '',
    lastOpId: typeof src.lastOpId === 'string' ? src.lastOpId : '',
  };
}

function normalizeCausalEvent(event = {}) {
  const src = isPlainObject(event) ? event : {};
  return {
    opId: normalizeString(src.opId),
    actorId: normalizeString(src.actorId || src.authorId),
    sessionId: normalizeString(src.sessionId),
    seq: normalizeSeq(src.seq),
    ts: normalizeString(src.ts),
    commandId: normalizeString(src.commandId),
    payloadHash: normalizeString(src.payloadHash),
    dependsOn: normalizeDependencies(src.dependsOn || src.deps),
  };
}

function causalEventValid(event) {
  return Boolean(event.opId && event.actorId && event.seq > 0 && event.ts && event.commandId);
}

function sortCausalEvents(left, right) {
  return left.actorId.localeCompare(right.actorId)
    || left.seq - right.seq
    || left.ts.localeCompare(right.ts)
    || left.opId.localeCompare(right.opId);
}

function buildReport(base) {
  return {
    ...base,
    reportHash: hashCanonical(base),
  };
}

function buildQueuePacket(base) {
  return {
    ...base,
    queueHash: hashCanonical(base),
  };
}

function buildMultiSessionRecoveryReport(base) {
  return {
    ...base,
    recoveryHash: hashCanonical(base),
  };
}

function buildExchangePacket(base) {
  return {
    ...base,
    exchangeHash: hashCanonical(base),
  };
}

function buildLocalFixtureAdapterReport(base) {
  return {
    ...base,
    adapterReportHash: hashCanonical(base),
  };
}

function normalizeSession(input = {}, index = 0) {
  const source = isPlainObject(input) ? input : {};
  const actorEnvelope = isPlainObject(source.actorEnvelope) ? source.actorEnvelope : {};
  const actorId = normalizeString(source.actorId || source.authorId || actorEnvelope.actorId) || `local-actor-${index + 1}`;
  const sessionId = normalizeString(source.sessionId || actorEnvelope.sessionId) || `local-session-${index + 1}`;
  const events = Array.isArray(source.events) ? source.events : [];
  return {
    actorId,
    sessionId,
    actorEnvelope,
    events,
  };
}

function normalizeMultiSessionEvent(input = {}, session = {}, index = 0) {
  const source = isPlainObject(input) ? input : {};
  const merged = normalizeEvent({
    ...source,
    authorId: source.authorId || source.actorId || session.actorId,
  });
  const actorId = normalizeString(source.actorId || merged.authorId || session.actorId);
  const sessionId = normalizeString(source.sessionId || session.sessionId);
  return {
    ...merged,
    actorId,
    authorId: actorId,
    sessionId,
    seq: normalizeSeq(source.seq) || index + 1,
    payloadHash: normalizeOptionalPayloadHash({ ...source, commandId: merged.commandId }),
    dependsOn: normalizeDependencies(source.dependsOn || source.deps),
    sourceIndex: index,
  };
}

function sortMultiSessionEvents(left, right) {
  return left.ts.localeCompare(right.ts)
    || left.actorId.localeCompare(right.actorId)
    || left.sessionId.localeCompare(right.sessionId)
    || left.opId.localeCompare(right.opId)
    || left.sourceIndex - right.sourceIndex;
}

function eventRef(event) {
  return {
    opId: event.opId,
    actorId: event.actorId,
    sessionId: event.sessionId,
    seq: event.seq,
    ts: event.ts,
    commandId: event.commandId,
    payloadHash: event.payloadHash,
    dependsOn: event.dependsOn,
  };
}

function manualConflictDecisionRoute(conflictId, event) {
  return {
    routeId: `manual-conflict-decision:${conflictId}`,
    routeKind: 'MANUAL_PREVIEW_REQUIRED',
    previewRequired: true,
    commandKernelApplyRequired: true,
    capabilityRevalidationRequired: true,
    dispatchIntentOnly: true,
    automaticMerge: false,
    silentProjectRewrite: false,
    destructiveRecovery: false,
    decisionStates: [
      'keepLocalWithReceipt',
      'acceptRemoteAsManualRevision',
      'keepBothAsManualRevision',
      'rejectRemoteWithReceipt',
    ],
    eventRef: {
      opId: event.opId,
      actorId: event.actorId,
      sessionId: event.sessionId,
      commandId: event.commandId,
    },
  };
}

function normalizeRecoverySnapshots(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => isPlainObject(item))
    .map((item, index) => ({
      snapshotId: normalizeString(item.snapshotId || item.id) || `snapshot-${index + 1}`,
      sessionId: normalizeString(item.sessionId),
      stateHash: normalizeString(item.stateHash),
      eventLogHash: normalizeString(item.eventLogHash),
      createdAtUtc: normalizeString(item.createdAtUtc || item.ts),
      readableRecovery: item.readableRecovery !== false,
      destructiveRewrite: false,
    }));
}

function normalizeExchangeEvent(event = {}, index = 0) {
  const src = isPlainObject(event) ? event : {};
  const causalEvent = normalizeCausalEvent(src);
  const ref = {
    opId: causalEvent.opId,
    actorId: causalEvent.actorId,
    sessionId: causalEvent.sessionId,
    seq: causalEvent.seq,
    ts: causalEvent.ts,
    commandId: causalEvent.commandId,
    payloadHash: causalEvent.payloadHash,
    dependsOn: causalEvent.dependsOn,
  };
  return {
    ...ref,
    sourceOrdinal: index,
    eventHash: hashCanonical(ref),
  };
}

function exchangeEventValid(event) {
  return Boolean(
    event.opId
    && event.actorId
    && event.seq > 0
    && event.ts
    && event.commandId
    && event.payloadHash
  );
}

function exchangeEventRef(event) {
  return {
    opId: event.opId,
    actorId: event.actorId,
    sessionId: event.sessionId,
    seq: event.seq,
    ts: event.ts,
    commandId: event.commandId,
    payloadHash: event.payloadHash,
    dependsOn: event.dependsOn,
    eventHash: event.eventHash,
  };
}

function stripExchangeHash(packet = {}) {
  const { exchangeHash, ...packetBase } = isPlainObject(packet) ? packet : {};
  return packetBase;
}

export function buildActorIdentityEnvelope(input = {}) {
  const actorId = normalizeString(input.actorId || input.authorId);
  const sessionId = normalizeString(input.sessionId);
  const displayName = normalizeString(input.displayName);
  if (!actorId || !sessionId) {
    return {
      ok: false,
      envelope: null,
      error: actorError('ACTOR_ID_AND_SESSION_REQUIRED', {
        authorId: actorId,
        opId: normalizeString(input.opId) || 'actor-identity',
        ts: normalizeString(input.ts),
        commandId: 'collab.actorIdentity',
      }),
    };
  }

  const envelopeBase = {
    schemaVersion: ACTOR_IDENTITY_SCHEMA_VERSION,
    actorId,
    sessionId,
    displayName,
    identityKind: 'local',
    accountIdentity: false,
    remotePresence: false,
    networkIdentity: false,
  };
  const actorHash = hashCanonical(envelopeBase);
  return {
    ok: true,
    envelope: {
      ...envelopeBase,
      actorHash,
      stableActorKey: actorHash,
    },
  };
}

export function buildCausalOrderingReport(input = {}) {
  const events = Array.isArray(input.events) ? input.events.map((event) => normalizeCausalEvent(event)) : [];
  const rejected = [];
  const valid = [];
  const seenOpIds = new Set();

  for (const event of events) {
    if (!causalEventValid(event)) {
      rejected.push(causalError('E_COLLAB_CAUSAL_EVENT_INVALID', 'EVENT_FIELDS_REQUIRED', event));
      continue;
    }
    if (seenOpIds.has(event.opId)) {
      rejected.push(causalError('E_COLLAB_CAUSAL_OP_DUPLICATE', 'OP_ID_DUPLICATE', event));
      continue;
    }
    seenOpIds.add(event.opId);
    valid.push(event);
  }

  const ordered = [...valid].sort(sortCausalEvents);
  const knownOps = new Set(valid.map((event) => event.opId));
  const lastSeqByActor = new Map();
  const ready = [];
  const buffered = [];

  for (const event of ordered) {
    const previousSeq = lastSeqByActor.get(event.actorId) || 0;
    const missingDependencies = event.dependsOn.filter((opId) => !knownOps.has(opId));
    const expectedSeq = previousSeq + 1;
    const stepBase = {
      opId: event.opId,
      actorId: event.actorId,
      sessionId: event.sessionId,
      seq: event.seq,
      ts: event.ts,
      commandId: event.commandId,
      payloadHash: event.payloadHash,
      dependsOn: event.dependsOn,
      causalKey: `${event.actorId}:${String(event.seq).padStart(12, '0')}`,
    };

    if (event.seq !== expectedSeq) {
      buffered.push({
        ...stepBase,
        state: 'buffered',
        reason: 'PER_ACTOR_FIFO_GAP',
        expectedSeq,
      });
      continue;
    }

    if (missingDependencies.length > 0) {
      buffered.push({
        ...stepBase,
        state: 'buffered',
        reason: 'DEPENDENCY_NOT_AVAILABLE',
        missingDependencies,
      });
      continue;
    }

    ready.push({
      ...stepBase,
      state: 'ready',
    });
    lastSeqByActor.set(event.actorId, event.seq);
  }

  return buildReport({
    schemaVersion: CAUSAL_ORDERING_REPORT_SCHEMA_VERSION,
    ok: rejected.length === 0,
    queueModel: 'PER_ACTOR_FIFO',
    orderingKey: '(actorId,seq)',
    conflictPolicy: 'BUFFER',
    ready,
    buffered,
    rejected,
    summary: {
      inputCount: events.length,
      readyCount: ready.length,
      bufferedCount: buffered.length,
      rejectedCount: rejected.length,
    },
    authority: {
      localOnly: true,
      accountIdentity: false,
      remotePresence: false,
      networkQueueTransport: false,
      coreTransportDependency: false,
      secondQueueTruth: false,
    },
  });
}

export function buildOfflineQueuePacket(input = {}) {
  const actor = isPlainObject(input.actorEnvelope) ? input.actorEnvelope : {};
  const actorId = normalizeString(actor.actorId || input.actorId || input.authorId);
  const sessionId = normalizeString(actor.sessionId || input.sessionId);
  const capabilityEnabled = input.capabilityEnabled !== false;
  const events = Array.isArray(input.events) ? input.events.map((event) => normalizeCausalEvent(event)) : [];
  const rejected = [];
  const entries = [];

  for (const event of events) {
    if (!causalEventValid(event) || !event.payloadHash) {
      rejected.push(offlineQueueError('E_COLLAB_OFFLINE_QUEUE_EVENT_INVALID', 'EVENT_FIELDS_AND_PAYLOAD_HASH_REQUIRED', event));
      continue;
    }
    entries.push({
      opId: event.opId,
      actorId: event.actorId || actorId,
      sessionId: event.sessionId || sessionId,
      seq: event.seq,
      ts: event.ts,
      commandId: event.commandId,
      payloadHash: event.payloadHash,
      dependsOn: event.dependsOn,
      causalKey: `${event.actorId || actorId}:${String(event.seq).padStart(12, '0')}`,
      queueState: capabilityEnabled ? 'readyLocal' : 'heldLocal',
      dispatchable: capabilityEnabled,
    });
  }

  return buildQueuePacket({
    schemaVersion: OFFLINE_QUEUE_PACKET_SCHEMA_VERSION,
    ok: rejected.length === 0,
    actorRef: {
      actorId,
      sessionId,
      actorHash: normalizeString(actor.actorHash),
      identityKind: 'local',
      accountIdentity: false,
      remotePresence: false,
    },
    capability: {
      collabEnabled: capabilityEnabled,
      disabledNonBlocking: capabilityEnabled === false,
      authoringBlocked: false,
    },
    entries,
    rejected,
    summary: {
      queuedCount: entries.length,
      rejectedCount: rejected.length,
    },
    authority: {
      localOnly: true,
      networkDispatch: false,
      networkQueueTransport: false,
      coreTransportDependency: false,
      secondQueueTruth: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
    },
  });
}

export function buildLocalMultiSessionRecoveryReport(input = {}) {
  const projectId = normalizeString(input.projectId);
  const initialState = normalizeState(input.initialState || input.baseState);
  const sessions = Array.isArray(input.sessions)
    ? input.sessions.map((session, index) => normalizeSession(session, index))
    : [];
  const normalizedSessions = sessions.map((session, index) => {
    const actor = buildActorIdentityEnvelope({
      actorId: session.actorId,
      sessionId: session.sessionId,
      displayName: session.actorEnvelope.displayName,
    });
    const events = session.events.map((event, eventIndex) => normalizeMultiSessionEvent(event, session, eventIndex));
    const offlineQueue = buildOfflineQueuePacket({
      actorEnvelope: actor.ok ? actor.envelope : session.actorEnvelope,
      capabilityEnabled: false,
      events,
    });
    return {
      sessionId: session.sessionId,
      actorId: session.actorId,
      actorHash: actor.ok ? actor.envelope.actorHash : '',
      actorIdentityOk: actor.ok === true,
      events,
      offlineQueue,
      sourceOrdinal: index,
    };
  });
  const orderedEvents = normalizedSessions
    .flatMap((session) => session.events.map((event) => ({ ...event, sourceSessionId: session.sessionId })))
    .sort(sortMultiSessionEvents);
  const recoverySnapshots = normalizeRecoverySnapshots(input.recoverySnapshots);
  const invalidEvents = [];
  const applied = [];
  const noop = [];
  const conflicts = [];

  let state = initialState;
  const initialStateHash = hashCanonical(initialState);

  for (const event of orderedEvents) {
    const missingFields = [];
    if (!event.opId) missingFields.push('opId');
    if (!event.actorId) missingFields.push('actorId');
    if (!event.ts) missingFields.push('ts');
    if (!event.commandId) missingFields.push('commandId');
    if (event.baseVersion === null) missingFields.push('baseVersion');
    if (event.nextVersion === null) missingFields.push('nextVersion');
    if (missingFields.length > 0) {
      invalidEvents.push({
        envelope: createConflictEnvelope({
          code: 'E_COLLAB_MULTI_SESSION_EVENT_INVALID',
          op: 'collab.localMultiSessionRecovery',
          reason: 'EVENT_FIELDS_REQUIRED',
          details: {
            opId: event.opId,
            authorId: event.actorId,
            ts: event.ts,
            commandId: event.commandId,
          },
        }),
        missingFields,
      });
      continue;
    }

    const preReplayStateHash = hashCanonical(state);
    const merged = mergeRemoteEvent({ localState: state, remoteEvent: event });
    const ref = eventRef(event);
    if (merged.verdict === 'applied') {
      state = merged.state;
      applied.push({
        ...ref,
        replayVerdict: 'applied',
        preReplayStateHash,
        postReplayStateHash: hashCanonical(state),
      });
      continue;
    }

    if (merged.verdict === 'noop') {
      noop.push({
        ...ref,
        replayVerdict: 'noop',
        retainedStateHash: preReplayStateHash,
      });
      continue;
    }

    const envelope = merged.envelope || createConflictEnvelope({
      code: 'E_COLLAB_MULTI_SESSION_CONFLICT',
      op: 'collab.localMultiSessionRecovery',
      reason: 'CONFLICT_DETECTED',
      details: {
        opId: event.opId,
        authorId: event.actorId,
        ts: event.ts,
        commandId: event.commandId,
      },
    });
    const conflictBase = {
      schemaVersion: 'collab-local-conflict-envelope.v1',
      envelope,
      eventRef: ref,
      retainedLocalStateHash: preReplayStateHash,
      rejectedRemoteStateHash: hashCanonical({
        version: event.nextVersion,
        content: event.content,
        lastOpId: event.opId,
      }),
      automaticMerge: false,
      silentProjectRewrite: false,
      destructiveRecovery: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
    };
    const conflictId = `conflict:${hashCanonical(conflictBase).slice(0, 24)}`;
    conflicts.push({
      conflictId,
      ...conflictBase,
      manualDecisionRoute: manualConflictDecisionRoute(conflictId, event),
      rollbackProof: {
        rollbackAction: 'ROLLBACK_TO_PRE_CONFLICT_STATE',
        rollbackStateHash: preReplayStateHash,
        reopenRequired: true,
        authorDataLoss: false,
        destructiveRecovery: false,
      },
    });
  }

  const finalStateHash = hashCanonical(state);
  const reopenedState = input.reopenedState ? normalizeState(input.reopenedState) : null;
  const reopenedStateHash = reopenedState ? hashCanonical(reopenedState) : '';
  const reopenProof = {
    proofKind: 'LOCAL_REOPEN_HASH_MATCH',
    required: true,
    provided: Boolean(reopenedState),
    expectedStateHash: finalStateHash,
    actualStateHash: reopenedStateHash,
    matches: reopenedState ? reopenedStateHash === finalStateHash : false,
    projectTruthMutation: false,
    manuscriptMutation: false,
  };
  const queuePackets = normalizedSessions.map((session) => ({
    sessionId: session.sessionId,
    actorId: session.actorId,
    queueHash: session.offlineQueue.queueHash,
    heldLocalCount: session.offlineQueue.entries.filter((entry) => entry.queueState === 'heldLocal').length,
    dispatchableCount: session.offlineQueue.entries.filter((entry) => entry.dispatchable === true).length,
    disabledNonBlocking: session.offlineQueue.capability.disabledNonBlocking,
    authoringBlocked: session.offlineQueue.capability.authoringBlocked,
    networkDispatch: session.offlineQueue.authority.networkDispatch,
  }));
  const offlineRecoveryProof = {
    schemaVersion: 'collab-offline-recovery.proof.v1',
    localOnly: true,
    networkRequired: false,
    networkDispatch: false,
    replayFromQueueSupported: true,
    queuePackets,
    recoverySnapshotRefs: recoverySnapshots,
    authorDataLoss: false,
    destructiveRecovery: false,
    projectRewrite: false,
  };
  const reportBase = {
    schemaVersion: LOCAL_MULTI_SESSION_RECOVERY_REPORT_SCHEMA_VERSION,
    ok: invalidEvents.length === 0 && reopenProof.matches,
    projectId,
    initialStateHash,
    finalStateHash,
    sessions: normalizedSessions.map((session) => ({
      sessionId: session.sessionId,
      actorId: session.actorId,
      actorHash: session.actorHash,
      actorIdentityOk: session.actorIdentityOk,
      eventCount: session.events.length,
      offlineQueueHash: session.offlineQueue.queueHash,
    })),
    applied,
    noop,
    conflicts,
    invalidEvents,
    rollbackReopenProof: {
      rollbackTargets: conflicts.map((conflict) => ({
        conflictId: conflict.conflictId,
        rollbackStateHash: conflict.rollbackProof.rollbackStateHash,
        reopenRequired: conflict.rollbackProof.reopenRequired,
      })),
      reopenProof,
      rollbackAvailable: true,
      authorDataLoss: false,
      destructiveRecovery: false,
      silentProjectRewrite: false,
    },
    offlineRecoveryProof,
    summary: {
      sessionCount: normalizedSessions.length,
      inputEventCount: orderedEvents.length,
      appliedCount: applied.length,
      noopCount: noop.length,
      conflictCount: conflicts.length,
      invalidEventCount: invalidEvents.length,
      manualDecisionRequiredCount: conflicts.length,
      rollbackProofCount: conflicts.length,
      recoverySnapshotRefCount: recoverySnapshots.length,
    },
    authority: {
      localOnly: true,
      manualDecisionRequired: conflicts.length > 0,
      automaticMerge: false,
      networkCollaboration: false,
      networkDispatch: false,
      destructiveRecovery: false,
      silentProjectRewrite: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      uiMutation: false,
      secondOperationLogTruth: false,
      secondCommentTruth: false,
    },
  };

  return buildMultiSessionRecoveryReport(reportBase);
}

export function buildTransportNeutralExchangePacket(input = {}) {
  const projectId = normalizeString(input.projectId);
  const events = Array.isArray(input.events) ? input.events.map((event, index) => normalizeExchangeEvent(event, index)) : [];
  const orderedEvents = [...events].sort(sortCausalEvents);
  const transportCapabilityEnabled = input.transportCapabilityEnabled === true;
  const requestedAdapterKind = normalizeString(input.adapterKind) || 'localFixture';
  const networkAdapterRequested = input.networkAdapterEnabled === true || requestedAdapterKind === 'network';
  const rejected = [];
  const entries = [];

  if (networkAdapterRequested) {
    rejected.push(transportExchangeError(
      'E_COLLAB_TRANSPORT_NETWORK_ADAPTER_DISABLED',
      'NETWORK_ADAPTER_NOT_ACTIVE_IN_STAGE_10',
      {
        adapterKind: requestedAdapterKind,
        networkAdapterRequested: true,
      },
    ));
  }

  for (const event of orderedEvents) {
    if (!exchangeEventValid(event)) {
      rejected.push(transportExchangeError(
        'E_COLLAB_TRANSPORT_EXCHANGE_EVENT_INVALID',
        'EVENT_FIELDS_AND_PAYLOAD_HASH_REQUIRED',
        {
          opId: event.opId,
          actorId: event.actorId,
          ts: event.ts,
          commandId: event.commandId,
          sourceOrdinal: event.sourceOrdinal,
        },
      ));
      continue;
    }

    entries.push({
      ...exchangeEventRef(event),
      exchangeState: transportCapabilityEnabled && !networkAdapterRequested ? 'readyLocalFixture' : 'heldLocalFixture',
      localFixtureExchangeable: transportCapabilityEnabled && !networkAdapterRequested,
      networkDispatchable: false,
      sourceOrdinal: event.sourceOrdinal,
    });
  }

  return buildExchangePacket({
    schemaVersion: TRANSPORT_NEUTRAL_EXCHANGE_PACKET_SCHEMA_VERSION,
    ok: rejected.length === 0,
    packetKind: 'operationExchange',
    packetVersion: 1,
    projectId,
    transport: {
      adapterKind: 'localFixture',
      transportNeutral: true,
      localFixtureAdapter: true,
      freeReversibleAdapter: true,
      liveNetwork: false,
      networkAdapterEnabled: false,
      accountSync: false,
      cloudSync: false,
      runtimeDownload: false,
      transportSourceOfTruth: false,
      crdtCoreAdopted: false,
      yjsRuntimeDependency: false,
    },
    capability: {
      transportEnabled: transportCapabilityEnabled,
      disabledNonBlocking: transportCapabilityEnabled === false,
      authoringBlocked: false,
      explicitActivationRequired: true,
      networkAdapterEnabled: false,
    },
    entries,
    rejected,
    summary: {
      inputCount: events.length,
      exchangeableCount: entries.filter((entry) => entry.localFixtureExchangeable).length,
      heldLocalCount: entries.filter((entry) => entry.exchangeState === 'heldLocalFixture').length,
      rejectedCount: rejected.length,
    },
    authority: {
      localOnly: true,
      transportNeutral: true,
      usesExistingOperationLogTruth: true,
      transportSourceOfTruth: false,
      networkAdapter: false,
      networkDispatch: false,
      accountIdentity: false,
      cloudSync: false,
      remotePresence: false,
      coreTransportDependency: false,
      crdtCoreAdopted: false,
      yjsRuntimeDependency: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      uiMutation: false,
      secondOperationLogTruth: false,
      secondCommentTruth: false,
    },
  });
}

export function buildLocalFixtureExchangeAdapterReport(input = {}) {
  const packet = isPlainObject(input.packet)
    ? input.packet
    : buildTransportNeutralExchangePacket(input);
  const entries = Array.isArray(packet.entries) ? packet.entries.map((entry) => exchangeEventRef(normalizeExchangeEvent(entry))) : [];
  const expectedExchangeHash = normalizeString(input.expectedExchangeHash || packet.exchangeHash);
  const actualExchangeHash = normalizeString(packet.exchangeHash);
  const recomputedExchangeHash = hashCanonical(stripExchangeHash(packet));
  const packetHashMatches = Boolean(
    actualExchangeHash
    && actualExchangeHash === recomputedExchangeHash
    && (!expectedExchangeHash || expectedExchangeHash === actualExchangeHash)
  );
  const rejected = [];

  if (packet.schemaVersion !== TRANSPORT_NEUTRAL_EXCHANGE_PACKET_SCHEMA_VERSION) {
    rejected.push(transportExchangeError(
      'E_COLLAB_LOCAL_FIXTURE_PACKET_SCHEMA_INVALID',
      'TRANSPORT_NEUTRAL_PACKET_SCHEMA_REQUIRED',
      { schemaVersion: normalizeString(packet.schemaVersion) },
    ));
  }

  if (!packetHashMatches) {
    rejected.push(transportExchangeError(
      'E_COLLAB_LOCAL_FIXTURE_PACKET_HASH_MISMATCH',
      'EXCHANGE_PACKET_HASH_MISMATCH',
      {
        expectedExchangeHash,
        actualExchangeHash,
        recomputedExchangeHash,
      },
    ));
  }

  if (packet.transport?.networkAdapterEnabled === true || packet.authority?.networkAdapter === true) {
    rejected.push(transportExchangeError(
      'E_COLLAB_LOCAL_FIXTURE_NETWORK_PACKET_REJECTED',
      'NETWORK_PACKET_NOT_ACCEPTED_BY_LOCAL_FIXTURE',
      { actualExchangeHash },
    ));
  }

  return buildLocalFixtureAdapterReport({
    schemaVersion: LOCAL_FIXTURE_EXCHANGE_ADAPTER_REPORT_SCHEMA_VERSION,
    ok: packet.ok === true && rejected.length === 0,
    adapter: {
      adapterKind: 'localFixture',
      localOnly: true,
      free: true,
      reversible: true,
      readsPacketOnly: true,
      writesRuntime: false,
      liveNetwork: false,
      networkDispatch: false,
      accountSync: false,
      cloudSync: false,
      storageMutation: false,
      uiMutation: false,
    },
    packetRef: {
      schemaVersion: normalizeString(packet.schemaVersion),
      exchangeHash: actualExchangeHash,
      expectedExchangeHash,
      recomputedExchangeHash,
      packetHashMatches,
      entryCount: entries.length,
    },
    previewRows: entries.map((entry) => ({
      ...entry,
      previewOnly: true,
      payloadCopied: false,
    })),
    applyRoute: {
      routeKind: 'COMMAND_KERNEL_PREVIEW_REQUIRED',
      previewRequired: true,
      commandKernelApplyRequired: true,
      capabilityRevalidationRequired: true,
      dispatchIntentOnly: true,
      automaticApply: false,
      transportApplyAuthority: false,
    },
    rejected: [
      ...(Array.isArray(packet.rejected) ? packet.rejected : []),
      ...rejected,
    ],
    summary: {
      previewCount: entries.length,
      appliedCount: 0,
      rejectedCount: (Array.isArray(packet.rejected) ? packet.rejected.length : 0) + rejected.length,
      transportCapabilityEnabled: packet.capability?.transportEnabled === true,
      authoringBlocked: false,
    },
    authority: {
      localOnly: true,
      transportNeutral: true,
      transportSourceOfTruth: false,
      networkAdapter: false,
      networkDispatch: false,
      accountIdentity: false,
      cloudSync: false,
      remotePresence: false,
      coreTransportDependency: false,
      crdtCoreAdopted: false,
      yjsRuntimeDependency: false,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      uiMutation: false,
      secondOperationLogTruth: false,
      secondCommentTruth: false,
    },
  });
}

export function mergeRemoteEvent(input = {}) {
  const localState = normalizeState(input.localState);
  const remoteEvent = normalizeEvent(input.remoteEvent);
  const detailBase = {
    opId: remoteEvent.opId || 'unknown-op',
    authorId: remoteEvent.authorId || 'unknown-author',
    ts: remoteEvent.ts || 'unknown-ts',
    commandId: remoteEvent.commandId || 'unknown-command',
  };

  if (!remoteEvent.opId || !remoteEvent.authorId || !remoteEvent.ts || !remoteEvent.commandId) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_EVENT_INVALID',
        op: 'collab.merge',
        reason: 'EVENT_FIELDS_REQUIRED',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.baseVersion === null || remoteEvent.nextVersion === null) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_EVENT_INVALID',
        op: 'collab.merge',
        reason: 'EVENT_VERSION_REQUIRED',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.baseVersion !== localState.version) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_BASE_VERSION_MISMATCH',
        op: 'collab.merge',
        reason: 'BASE_VERSION_CONFLICT',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.nextVersion <= localState.version) {
    return {
      verdict: 'rejected',
      state: localState,
      envelope: createConflictEnvelope({
        code: 'E_COLLAB_NEXT_VERSION_INVALID',
        op: 'collab.merge',
        reason: 'NEXT_VERSION_NOT_MONOTONIC',
        details: detailBase,
      }),
    };
  }

  if (remoteEvent.opId === localState.lastOpId) {
    return {
      verdict: 'noop',
      state: localState,
      envelope: null,
    };
  }

  return {
    verdict: 'applied',
    state: {
      version: remoteEvent.nextVersion,
      content: remoteEvent.content,
      lastOpId: remoteEvent.opId,
    },
    envelope: null,
  };
}
